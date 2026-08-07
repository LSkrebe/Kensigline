/**
 * Rolling retention — keep documents/bars meaningful for the product, drop older junk.
 *
 * Default window = BACKFILL_MAX_AGE_DAYS (hard-capped at 2 years).
 * Exception: research docs that still carry business_drivers for Analyse may be kept
 * up to RETENTION_ANALYSE_EXTRA_DAYS past the main window (default 0 — same 2y).
 */
import { db } from "../core/db.js";
import { backfillMaxAgeDays } from "../shared/ingest-policy.js";

function envInt(key: string, fallback: number, min: number, max: number): number {
  const n = Number(process.env[key] ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export function retentionMaxAgeDays(): number {
  return backfillMaxAgeDays();
}

/** Extra days past main window for research rows that have Analyse drivers (default 0). */
export function retentionAnalyseExtraDays(): number {
  return envInt("RETENTION_ANALYSE_EXTRA_DAYS", 0, 0, 365);
}

export type RetentionPurgeResult = {
  documents: number;
  bars: number;
  queue: number;
  cluster_snapshots: number;
  feed_ticker_latest: number;
  feed_market_latest: number;
};

/**
 * Delete content older than the retention window.
 * Activity date = COALESCE(feed_at, event_at, parsed_at).
 */
export async function runRetentionPurgeOnce(opts?: {
  batchSize?: number;
}): Promise<RetentionPurgeResult> {
  const batch = Math.max(50, Math.min(5_000, opts?.batchSize ?? 1_000));
  const maxAge = retentionMaxAgeDays();
  const analyseExtra = retentionAnalyseExtraDays();
  const analyseAge = maxAge + analyseExtra;

  const out: RetentionPurgeResult = {
    documents: 0,
    bars: 0,
    queue: 0,
    cluster_snapshots: 0,
    feed_ticker_latest: 0,
    feed_market_latest: 0,
  };

  // Documents: purge old rows. Keep research+business_drivers a bit longer only if extra > 0.
  for (;;) {
    const rows = await db.query<{ id: string }>(
      `
      DELETE FROM documents
      WHERE id IN (
        SELECT id
        FROM documents
        WHERE COALESCE(published_at, event_at, feed_at, parsed_at) < now() - ($1 || ' days')::interval
          AND NOT (
            feed_kind = 'research'
            AND $2::int > 0
            AND data ? 'business_drivers'
            AND jsonb_typeof(data->'business_drivers') = 'array'
            AND jsonb_array_length(data->'business_drivers') > 0
            AND COALESCE(published_at, event_at, feed_at, parsed_at) >= now() - ($3 || ' days')::interval
          )
        ORDER BY COALESCE(published_at, event_at, feed_at, parsed_at) ASC NULLS FIRST
        LIMIT $4
      )
      RETURNING id
      `,
      [String(maxAge), analyseExtra, String(analyseAge), batch],
    );
    out.documents += rows.length;
    if (rows.length < batch) break;
  }

  // Orphan feed index rows (in case FK was missing historically).
  const ft = await db.query<{ n: string }>(
    `
    WITH d AS (
      DELETE FROM feed_ticker_latest f
      WHERE NOT EXISTS (SELECT 1 FROM documents d WHERE d.id = f.document_id)
         OR f.feed_at < now() - ($1 || ' days')::interval
      RETURNING 1
    )
    SELECT count(*)::text AS n FROM d
    `,
    [String(maxAge)],
  );
  out.feed_ticker_latest = Number(ft[0]?.n ?? 0) || 0;

  const fm = await db.query<{ n: string }>(
    `
    WITH d AS (
      DELETE FROM feed_market_latest f
      WHERE NOT EXISTS (SELECT 1 FROM documents d WHERE d.id = f.document_id)
         OR f.feed_at < now() - ($1 || ' days')::interval
      RETURNING 1
    )
    SELECT count(*)::text AS n FROM d
    `,
    [String(maxAge)],
  );
  out.feed_market_latest = Number(fm[0]?.n ?? 0) || 0;

  const cs = await db.query<{ n: string }>(
    `
    WITH d AS (
      DELETE FROM feed_cluster_snapshot
      WHERE updated_at < now() - ($1 || ' days')::interval
      RETURNING 1
    )
    SELECT count(*)::text AS n FROM d
    `,
    [String(maxAge)],
  );
  out.cluster_snapshots = Number(cs[0]?.n ?? 0) || 0;

  // Price bars: keep chart history within the same window (enough for 1Y–2Y charts).
  const bars = await db.query<{ n: string }>(
    `
    WITH d AS (
      DELETE FROM bars
      WHERE day < (current_date - ($1 || ' days')::interval)::date
      RETURNING 1
    )
    SELECT count(*)::text AS n FROM d
    `,
    [String(maxAge)],
  );
  out.bars = Number(bars[0]?.n ?? 0) || 0;

  // Queue clutter: drop old terminal rows (parsed/dead) past retention.
  const q = await db.query<{ n: string }>(
    `
    WITH d AS (
      DELETE FROM document_queue
      WHERE status IN ('parsed', 'dead')
        AND updated_at < now() - ($1 || ' days')::interval
      RETURNING 1
    )
    SELECT count(*)::text AS n FROM d
    `,
    [String(maxAge)],
  );
  out.queue = Number(q[0]?.n ?? 0) || 0;

  // Refresh bars meta after bar deletes.
  await db.query(
    `
    DELETE FROM bars_ticker_meta b
    WHERE NOT EXISTS (SELECT 1 FROM bars x WHERE x.ticker = b.ticker)
    `,
  ).catch(() => {});

  return out;
}

export function startRetentionWorker(): { stop(): void } {
  if (String(process.env.RETENTION_ENABLED ?? "1").trim() === "0") {
    return { stop() {} };
  }

  const intervalMs = envInt("RETENTION_INTERVAL_MS", 6 * 60 * 60_000, 60_000, 24 * 60 * 60_000);
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const tick = async () => {
    if (stopped) return;
    try {
      const r = await runRetentionPurgeOnce();
      const touched =
        r.documents + r.bars + r.queue + r.cluster_snapshots + r.feed_ticker_latest + r.feed_market_latest;
      if (touched > 0) {
        console.info("[retention] purged", JSON.stringify({ maxAgeDays: retentionMaxAgeDays(), ...r }));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[retention] purge failed", msg);
    }
    if (!stopped) timer = setTimeout(() => void tick(), intervalMs);
  };

  // First run after short delay so boot isn't blocked.
  timer = setTimeout(() => void tick(), 45_000);

  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
