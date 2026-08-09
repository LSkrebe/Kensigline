import { AsyncLocalStorage } from "node:async_hooks";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

/**
 * Worker lane URL.
 * - WORKER_DATABASE_URL: explicit override
 * - WORKER_DB_DIRECT=1: db.<project>.supabase.co (best for heavy drain; bypasses pooler)
 * - WORKER_DB_SESSION_POOLER=1: pooler :5432 session mode
 * - else: same as DATABASE_URL (usually transaction pooler :6543)
 */
function resolveWorkerDatabaseUrl(): string {
  const explicit = String(process.env.WORKER_DATABASE_URL ?? "").trim();
  if (explicit) return explicit;

  try {
    const u = new URL(databaseUrl!.replace(/^postgres:/i, "postgresql:"));
    const user = decodeURIComponent(u.username || "");
    const ref = user.includes(".") ? user.split(".").slice(1).join(".") : null;

    if (String(process.env.WORKER_DB_DIRECT ?? "").trim() === "1" && ref) {
      const direct = new URL(u.toString());
      direct.hostname = `db.${ref}.supabase.co`;
      direct.port = "5432";
      direct.username = "postgres";
      return direct.toString();
    }

    if (String(process.env.WORKER_DB_SESSION_POOLER ?? "").trim() === "1") {
      if (u.port === "6543" && u.hostname.toLowerCase().includes("pooler.supabase.com")) {
        u.port = "5432";
        return u.toString();
      }
    }
  } catch {
    /* keep primary */
  }
  return databaseUrl!;
}

const workerDatabaseUrl = resolveWorkerDatabaseUrl();


/** Strict TLS for Supabase in production; relaxed in local dev (macOS pooler cert chain). */
function supabaseRejectUnauthorized(): boolean {
  if (
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "0" ||
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "false"
  ) {
    return false;
  }
  if (
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "1" ||
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true"
  ) {
    return true;
  }
  return process.env.NODE_ENV === "production";
}

/** TLS for Supabase (and optional DATABASE_SSL=1). Local Postgres stays non-SSL unless forced. */
function sslOption(url: string): boolean | { rejectUnauthorized: boolean } | undefined {
  if (process.env.DATABASE_SSL === "0" || process.env.DATABASE_SSL === "false") {
    return undefined;
  }
  if (process.env.DATABASE_SSL === "1" || process.env.DATABASE_SSL === "true") {
    return { rejectUnauthorized: true };
  }
  try {
    const normalized = url.replace(/^postgres:/i, "postgresql:");
    const u = new URL(normalized);
    const host = u.hostname.toLowerCase();
    if (
      host.includes("supabase.co") ||
      host.endsWith("pooler.supabase.com") ||
      host.endsWith(".supabase.com")
    ) {
      const rejectUnauthorized = supabaseRejectUnauthorized();
      return { rejectUnauthorized };
    }
  } catch {
    // ignore malformed URL
  }
  return undefined;
}

const connectTimeoutMs = Math.max(2_000, Number(process.env.DATABASE_CONNECT_TIMEOUT_MS ?? 8_000) || 8_000);
const idleTimeoutMs = Math.max(5_000, Number(process.env.DATABASE_IDLE_TIMEOUT_MS ?? 30_000) || 30_000);

/** Interactive API / billing — kept separate so ingest workers cannot starve sign-in. */
const apiPoolMax = Math.max(2, Math.min(24, Number(process.env.DATABASE_POOL_MAX ?? 8) || 8));
/** Background ingest / parse / outcomes — capped independently. */
const workerPoolMax = Math.max(
  1,
  Math.min(48, Number(process.env.DATABASE_WORKER_POOL_MAX ?? 1) || 1),
);
/**
 * Global cap on concurrent worker jobs that use runWithWorkerDb (enqueue/backfill/reclaim).
 * Parse loops use withWorkerLane + PARSE_GLOBAL_CONCURRENCY instead (HTTP must not hold this gate).
 */
const workerDbConcurrency = Math.max(
  1,
  Math.min(48, Number(process.env.WORKER_DB_CONCURRENCY ?? 1) || 1),
);
const workerDbUnthrottled = String(process.env.WORKER_DB_UNTHROTTLED ?? "").trim() === "1";

function makePool(max: number, label: string, connectionString: string): Pool {
  const p = new Pool({
    connectionString,
    ssl: sslOption(connectionString),
    max,
    connectionTimeoutMillis: connectTimeoutMs,
    idleTimeoutMillis: idleTimeoutMs,
    // Never let idle pool clients alone decide process lifetime (HTTP server must stay up).
    allowExitOnIdle: false,
  });
  p.on("error", (err) => {
    console.error(`[db:${label}] idle client error`, err instanceof Error ? err.message : err);
  });
  return p;
}

const apiPool = makePool(apiPoolMax, "api", databaseUrl!);
const workerPool = makePool(workerPoolMax, "worker", workerDatabaseUrl);

function workerUrlMode(): string {
  try {
    const u = new URL(workerDatabaseUrl.replace(/^postgres:/i, "postgresql:"));
    const host = u.hostname.toLowerCase();
    if (host.startsWith("db.") && host.endsWith(".supabase.co")) return "direct";
    if (u.port === "5432" && host.includes("pooler")) return "session-pooler";
    if (u.port === "6543") return "transaction-pooler";
    return `port-${u.port || "default"}`;
  } catch {
    return "unknown";
  }
}

console.info(
  `[db] apiPoolMax=${apiPoolMax} workerPoolMax=${workerPoolMax} workerDbConcurrency=${workerDbConcurrency} workerUrl=${workerUrlMode()}${
    workerDbUnthrottled ? " parseUnthrottled=1" : ""
  }`,
);

type DbLane = "api" | "worker";
const dbLane = new AsyncLocalStorage<DbLane>();

let workerInFlight = 0;
const workerWaiters: Array<() => void> = [];

async function acquireWorkerSlot(): Promise<void> {
  if (workerInFlight < workerDbConcurrency) {
    workerInFlight += 1;
    return;
  }
  await new Promise<void>((resolve) => {
    workerWaiters.push(resolve);
  });
  workerInFlight += 1;
}

function releaseWorkerSlot(): void {
  workerInFlight = Math.max(0, workerInFlight - 1);
  const next = workerWaiters.shift();
  if (next) next();
}

/** Switch to worker pool without the global concurrency gate (for long parse jobs with HTTP I/O). */
export async function withWorkerLane<T>(fn: () => Promise<T> | T): Promise<T> {
  return await dbLane.run("worker", fn);
}

/** Run background work on the worker pool so API keep-alive connections stay free. */
export async function runWithWorkerDb<T>(fn: () => Promise<T> | T): Promise<T> {
  await acquireWorkerSlot();
  try {
    return await dbLane.run("worker", fn);
  } finally {
    releaseWorkerSlot();
  }
}

function activePool(): Pool {
  return dbLane.getStore() === "worker" ? workerPool : apiPool;
}

/** @deprecated Prefer activePool via db helpers; kept for scripts that import pool directly. */
export const pool = apiPool;

const DEFAULT_API_TIMEOUT_MS = Math.max(
  1_000,
  Math.min(30_000, Number(process.env.DATABASE_API_STATEMENT_TIMEOUT_MS ?? 8_000) || 8_000),
);

async function withClientTimeout<T>(
  timeoutMs: number,
  fn: (client: { query: Pool["query"] }) => Promise<T>,
): Promise<T> {
  const client = await activePool().connect();
  try {
    const ms = Math.max(500, Math.floor(timeoutMs));
    await client.query(`SET LOCAL statement_timeout = ${ms}`);
    return await fn(client);
  } finally {
    client.release();
  }
}

export const db = {
  async query<T = any>(text: string, params: any[] = []): Promise<T[]> {
    const r = await activePool().query(text, params);
    return r.rows as T[];
  },
  async one<T = any>(text: string, params: any[] = []): Promise<T | null> {
    const r = await activePool().query(text, params);
    return (r.rows[0] as T | undefined) ?? null;
  },
  /** API/read path — hard-cap statement time so one slow query cannot pin the pool. */
  async queryApi<T = any>(text: string, params: any[] = [], timeoutMs = DEFAULT_API_TIMEOUT_MS): Promise<T[]> {
    return withClientTimeout(timeoutMs, async (client) => {
      const r = await client.query(text, params);
      return r.rows as T[];
    });
  },
  async oneApi<T = any>(text: string, params: any[] = [], timeoutMs = DEFAULT_API_TIMEOUT_MS): Promise<T | null> {
    const rows = await db.queryApi<T>(text, params, timeoutMs);
    return rows[0] ?? null;
  },
};
