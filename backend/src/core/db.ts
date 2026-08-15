import { AsyncLocalStorage } from "node:async_hooks";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

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
const apiPoolMax = Math.max(2, Math.min(16, Number(process.env.DATABASE_POOL_MAX ?? 8) || 8));
/** Background ingest / parse / outcomes — capped independently. */
const workerPoolMax = Math.max(
  1,
  Math.min(20, Number(process.env.DATABASE_WORKER_POOL_MAX ?? 8) || 8),
);
/**
 * Max concurrent worker-lane SQL checkouts.
 * Parse loops can be numerous (HTTP/SEC in parallel); only this many hit Postgres at once.
 */
const workerQueryConcurrency = Math.max(
  1,
  Math.min(20, Number(process.env.WORKER_QUERY_CONCURRENCY ?? 6) || 6),
);

const DEFAULT_WORKER_TIMEOUT_MS = Math.max(
  1_000,
  Math.min(120_000, Number(process.env.DATABASE_WORKER_STATEMENT_TIMEOUT_MS ?? 25_000) || 25_000),
);

function makePool(max: number, label: string): Pool {
  const p = new Pool({
    connectionString: databaseUrl,
    ssl: sslOption(databaseUrl!),
    max,
    connectionTimeoutMillis: connectTimeoutMs,
    idleTimeoutMillis: idleTimeoutMs,
    allowExitOnIdle: false,
  });
  p.on("error", (err) => {
    console.error(`[db:${label}] idle client error`, err instanceof Error ? err.message : err);
  });
  return p;
}

const apiPool = makePool(apiPoolMax, "api");
const workerPool = makePool(workerPoolMax, "worker");

console.info(
  `[db] apiPoolMax=${apiPoolMax} workerPoolMax=${workerPoolMax} workerQueryConcurrency=${workerQueryConcurrency} workerStatementTimeoutMs=${DEFAULT_WORKER_TIMEOUT_MS}`,
);

type DbLane = "api" | "worker";
const dbLane = new AsyncLocalStorage<DbLane>();

let workerQueriesInFlight = 0;
const workerQueryWaiters: Array<() => void> = [];

async function acquireWorkerQuerySlot(): Promise<void> {
  if (workerQueriesInFlight < workerQueryConcurrency) {
    workerQueriesInFlight += 1;
    return;
  }
  // Slot is transferred by releaseWorkerQuerySlot (inFlight unchanged).
  await new Promise<void>((resolve) => workerQueryWaiters.push(resolve));
}

function releaseWorkerQuerySlot(): void {
  const next = workerQueryWaiters.shift();
  if (next) {
    next();
    return;
  }
  workerQueriesInFlight = Math.max(0, workerQueriesInFlight - 1);
}

async function withWorkerQuerySlot<T>(fn: () => Promise<T>): Promise<T> {
  if (dbLane.getStore() !== "worker") return fn();
  await acquireWorkerQuerySlot();
  try {
    return await fn();
  } finally {
    releaseWorkerQuerySlot();
  }
}

/**
 * Run background work on the worker pool.
 * HTTP/SEC inside may run wide; SQL is gated by WORKER_QUERY_CONCURRENCY.
 */
export async function runWithWorkerDb<T>(fn: () => Promise<T> | T): Promise<T> {
  return await dbLane.run("worker", fn);
}

/** Alias kept for call sites that switched during the throttle era. */
export async function withWorkerLane<T>(fn: () => Promise<T> | T): Promise<T> {
  return runWithWorkerDb(fn);
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
  return withWorkerQuerySlot(async () => {
    const client = await activePool().connect();
    try {
      const ms = Math.max(500, Math.floor(timeoutMs));
      await client.query(`SET LOCAL statement_timeout = ${ms}`);
      return await fn(client);
    } finally {
      client.release();
    }
  });
}

export const db = {
  async query<T = any>(text: string, params: any[] = []): Promise<T[]> {
    return withClientTimeout(DEFAULT_WORKER_TIMEOUT_MS, async (client) => {
      const r = await client.query(text, params);
      return r.rows as T[];
    });
  },
  async one<T = any>(text: string, params: any[] = []): Promise<T | null> {
    const rows = await db.query<T>(text, params);
    return rows[0] ?? null;
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
