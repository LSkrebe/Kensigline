import { db, runWithWorkerDbBackfill, workerDbLoad } from "../core/db.js";
import { ingestMode, ingestModeSummary } from "./ingest-mode.js";

export type QueueStatusCount = { status: string; count: number; capped: boolean };

const TRACKED_STATUSES = [
  "ready_to_parse",
  "parsing",
  "parsed",
  "dead",
  "failed",
  "queued",
] as const;

function envInt(name: string, fallback: number, min: number, max: number): number {
  const n = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

const COUNT_CAP = 10_001;
const INGEST_SNAP_TTL_MS = envInt("INGEST_HEALTH_CACHE_MS", 60_000, 5_000, 300_000);
const INGEST_FRESH_WAIT_MS = envInt("INGEST_HEALTH_WAIT_MS", 8_000, 2_000, 30_000);

type IngestSnap = {
  source_type: string;
  mode: ReturnType<typeof ingestMode>;
  mode_summary: string;
  worker_db: ReturnType<typeof workerDbLoad>;
  queue: QueueStatusCount[];
  backlog_ready: number | null;
  in_flight_parsing: number | null;
  at: string;
  degraded?: boolean;
  refresh_error?: string;
};

let ingestSnapCache: { sourceType: string; at: number; snap: IngestSnap } | null = null;
let ingestWarmerStarted = false;

/** Uses backfill worker slots + session pool — keeps transaction-mode API pool for users. */
async function countAllStatuses(sourceType: string): Promise<QueueStatusCount[]> {
  return runWithWorkerDbBackfill(async () => {
    const rows = await db.query<{ status: string; count: number; capped: boolean }>(
      `
      SELECT
        s.status,
        coalesce(sub.n, 0)::int AS count,
        coalesce(sub.n, 0) >= $3 AS capped
      FROM unnest($2::text[]) AS s(status)
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS n
        FROM (
          SELECT 1
          FROM document_queue
          WHERE source_type = $1
            AND status = s.status::document_queue_status
          LIMIT $3
        ) t
      ) sub ON true
      `,
      [sourceType, [...TRACKED_STATUSES], COUNT_CAP],
    );
    return rows.map((r) => ({
      status: r.status,
      count: Number(r.count) || 0,
      capped: Boolean(r.capped),
    }));
  });
}

async function buildIngestQueueSnapshot(sourceType = "sec_13f") {
  const all = await countAllStatuses(sourceType);
  const counts = all.filter(
    (c) => c.count > 0 || c.status === "ready_to_parse" || c.status === "parsing",
  );
  const ready = counts.find((c) => c.status === "ready_to_parse")?.count ?? 0;
  const parsing = counts.find((c) => c.status === "parsing")?.count ?? 0;
  return {
    source_type: sourceType,
    mode: ingestMode(),
    mode_summary: ingestModeSummary(),
    worker_db: workerDbLoad(),
    queue: counts,
    backlog_ready: ready,
    in_flight_parsing: parsing,
    at: new Date().toISOString(),
  };
}

function degradedIngestSnapshot(sourceType: string, reason: string) {
  return {
    source_type: sourceType,
    mode: ingestMode(),
    mode_summary: ingestModeSummary(),
    worker_db: workerDbLoad(),
    queue: [] as QueueStatusCount[],
    backlog_ready: null as number | null,
    in_flight_parsing: null as number | null,
    degraded: true,
    refresh_error: reason,
    at: new Date().toISOString(),
  };
}

async function buildIngestQueueSnapshotWithTimeout(sourceType: string, waitMs: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      buildIngestQueueSnapshot(sourceType),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("ingest_health_wait_timeout")), waitMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Background refresh when the API pool has idle slots — does not touch worker parse slots. */
export function startIngestHealthCacheWarmer(sourceType = "sec_13f") {
  if (ingestWarmerStarted) return;
  ingestWarmerStarted = true;
  const intervalMs = Math.max(15_000, Math.floor(INGEST_SNAP_TTL_MS / 2));
  setInterval(() => {
    void buildIngestQueueSnapshot(sourceType)
      .then((snap) => {
        ingestSnapCache = { sourceType, at: Date.now(), snap };
      })
      .catch(() => {});
  }, intervalMs).unref();
}

export async function getIngestQueueSnapshot(sourceType = "sec_13f", opts?: { bypassCache?: boolean }) {
  const now = Date.now();
  if (
    !opts?.bypassCache &&
    ingestSnapCache &&
    ingestSnapCache.sourceType === sourceType &&
    now - ingestSnapCache.at < INGEST_SNAP_TTL_MS
  ) {
    return {
      ...ingestSnapCache.snap,
      cached: true,
      stale: false,
      cache_age_ms: now - ingestSnapCache.at,
    };
  }

  try {
    const snap = await buildIngestQueueSnapshotWithTimeout(sourceType, INGEST_FRESH_WAIT_MS);
    ingestSnapCache = { sourceType, at: now, snap };
    return { ...snap, cached: false, stale: false, cache_age_ms: 0 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (ingestSnapCache && ingestSnapCache.sourceType === sourceType) {
      return {
        ...ingestSnapCache.snap,
        cached: true,
        stale: true,
        cache_age_ms: now - ingestSnapCache.at,
        refresh_error: msg,
        worker_db: workerDbLoad(),
        at: new Date().toISOString(),
      };
    }
    const snap = degradedIngestSnapshot(sourceType, msg);
    ingestSnapCache = { sourceType, at: now, snap };
    return {
      ...snap,
      cached: false,
      stale: true,
      cache_age_ms: 0,
    };
  }
}
