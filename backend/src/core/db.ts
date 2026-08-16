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

/** Slots reserved for backfill / reclaim — parse cannot consume these. */
const backfillReservedSlots = Math.max(
  1,
  Math.min(
    workerQueryConcurrency - 1,
    Number(process.env.BACKFILL_DB_RESERVED_SLOTS ?? 2) || 2,
  ),
);
const parseSlotMax = workerQueryConcurrency - backfillReservedSlots;

/** 0 = no cap (burst backfill scans). Set DATABASE_WORKER_STATEMENT_TIMEOUT_MS to enable. */
function workerStatementTimeoutMs(): number {
  const raw = Number(process.env.DATABASE_WORKER_STATEMENT_TIMEOUT_MS ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.max(1_000, Math.min(120_000, Math.floor(raw)));
}

const WORKER_TIMEOUT_MS = workerStatementTimeoutMs();

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
  `[db] apiPoolMax=${apiPoolMax} workerPoolMax=${workerPoolMax} workerQueryConcurrency=${workerQueryConcurrency} parseSlotMax=${parseSlotMax} backfillReservedSlots=${backfillReservedSlots} workerStatementTimeoutMs=${WORKER_TIMEOUT_MS || "off"}`,
);

type DbLane = "api" | "worker";
type WorkerSlotKind = "parse" | "backfill";

const dbLane = new AsyncLocalStorage<DbLane>();
const workerSlotKind = new AsyncLocalStorage<WorkerSlotKind>();

let workerQueriesInFlight = 0;
let parseSlotsInFlight = 0;
let backfillSlotsInFlight = 0;
const workerQueryWaiters: Array<() => void> = [];

function canAcquireSlot(kind: WorkerSlotKind): boolean {
  if (workerQueriesInFlight >= workerQueryConcurrency) return false;
  if (kind === "backfill") return backfillSlotsInFlight < backfillReservedSlots;
  return parseSlotsInFlight < parseSlotMax;
}

function tryAcquireSlot(kind: WorkerSlotKind): boolean {
  if (!canAcquireSlot(kind)) return false;
  workerQueriesInFlight += 1;
  if (kind === "backfill") backfillSlotsInFlight += 1;
  else parseSlotsInFlight += 1;
  return true;
}

async function acquireWorkerQuerySlot(): Promise<void> {
  if (dbLane.getStore() !== "worker") return;
  const kind = workerSlotKind.getStore() ?? "parse";
  for (;;) {
    if (tryAcquireSlot(kind)) return;
    await new Promise<void>((resolve) => workerQueryWaiters.push(resolve));
  }
}

function releaseWorkerQuerySlot(): void {
  if (dbLane.getStore() === "worker") {
    const kind = workerSlotKind.getStore() ?? "parse";
    if (kind === "backfill") backfillSlotsInFlight = Math.max(0, backfillSlotsInFlight - 1);
    else parseSlotsInFlight = Math.max(0, parseSlotsInFlight - 1);
    workerQueriesInFlight = Math.max(0, workerQueriesInFlight - 1);
  }
  const waiters = workerQueryWaiters.splice(0);
  for (const w of waiters) w();
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

/** Parse / live enqueue — capped so backfill always keeps reserved slots. */
export async function runWithWorkerDb<T>(fn: () => Promise<T> | T): Promise<T> {
  return await workerSlotKind.run("parse", () => dbLane.run("worker", fn));
}

/** Historical walk, reclaim, capacity refresh — uses reserved backfill slots. */
export async function runWithWorkerDbBackfill<T>(fn: () => Promise<T> | T): Promise<T> {
  return await workerSlotKind.run("backfill", () => dbLane.run("worker", fn));
}

/** Alias kept for call sites that switched during the throttle era. */
export async function withWorkerLane<T>(fn: () => Promise<T> | T): Promise<T> {
  return runWithWorkerDb(fn);
}

export function workerDbLoad(): {
  inFlight: number;
  parseInFlight: number;
  backfillInFlight: number;
  parseSlotMax: number;
  backfillReservedSlots: number;
  slotWaiters: number;
  poolIdle: number;
  poolWaiting: number;
} {
  return {
    inFlight: workerQueriesInFlight,
    parseInFlight: parseSlotsInFlight,
    backfillInFlight: backfillSlotsInFlight,
    parseSlotMax,
    backfillReservedSlots,
    slotWaiters: workerQueryWaiters.length,
    poolIdle: workerPool.idleCount,
    poolWaiting: workerPool.waitingCount,
  };
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
    if (WORKER_TIMEOUT_MS <= 0) {
      return withWorkerQuerySlot(async () => {
        const r = await activePool().query(text, params);
        return r.rows as T[];
      });
    }
    return withClientTimeout(WORKER_TIMEOUT_MS, async (client) => {
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
