import { db } from "./db.js";
import { getDailyCloseBars } from "./bars.js";

type PriorityRow = {
  ticker: string;
  priority: number;
  latest_event_at: string | null;
  last_bar_day: string | null;
  bar_count: number;
};

function envInt(name: string, fallback: number, min: number, max: number): number {
  const n = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function isoDayUTC(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return isoDayUTC(d);
}

/**
 * Price-chart bar fetch priority (uses bars_ticker_meta — never GROUP BY bars):
 *  1 = event ticker with no bars yet
 *  2 = event ticker with stale bars
 *  3 = due for light refresh
 * Within each tier: newest feed activity first.
 */
export async function listBarRefreshCandidates(limit = 40): Promise<PriorityRow[]> {
  const cap = Math.max(1, Math.min(200, limit));
  return db.query<PriorityRow>(
    `
    WITH event_tickers AS (
      SELECT ticker_norm AS ticker, max(feed_at) AS latest_event_at
      FROM feed_ticker_latest
      WHERE ticker_norm IS NOT NULL
        AND length(ticker_norm) BETWEEN 1 AND 6
        AND feed_at >= now() - interval '120 days'
      GROUP BY ticker_norm
    )
    SELECT
      e.ticker,
      CASE
        WHEN b.ticker IS NULL OR coalesce(b.bar_count, 0) < 5 THEN 1
        WHEN b.last_bar_day < (CURRENT_DATE - 3) THEN 2
        WHEN b.last_bar_day < CURRENT_DATE THEN 3
        ELSE 4
      END AS priority,
      e.latest_event_at::text AS latest_event_at,
      b.last_bar_day::text AS last_bar_day,
      coalesce(b.bar_count, 0) AS bar_count
    FROM event_tickers e
    LEFT JOIN bars_ticker_meta b ON b.ticker = e.ticker
    WHERE
      b.ticker IS NULL
      OR coalesce(b.bar_count, 0) < 5
      OR b.last_bar_day < CURRENT_DATE
    ORDER BY priority ASC, e.latest_event_at DESC NULLS LAST
    LIMIT $1
    `,
    [cap],
  );
}

export async function refreshBarsForTicker(ticker: string, lookbackDays = 400): Promise<void> {
  const t = String(ticker ?? "").trim().toUpperCase();
  if (!t) return;
  const days = Math.max(30, Math.min(3650, lookbackDays));
  const toDay = isoDayUTC(new Date());
  const fromDay = daysAgoIso(days);
  await getDailyCloseBars({ ticker: t, fromDay, toDay, forceRefresh: true });
}

export async function runBarsRefreshOnce(opts?: { batchSize?: number }): Promise<{ refreshed: number; skipped: number }> {
  const batchSize = opts?.batchSize ?? envInt("BARS_REFRESH_BATCH", 6, 1, 40);
  const lookback = envInt("BARS_REFRESH_LOOKBACK_DAYS", 400, 60, 3650);
  const candidates = await listBarRefreshCandidates(batchSize * 3);
  const selected: PriorityRow[] = [];
  for (const row of candidates) {
    if (selected.length >= batchSize) break;
    if (row.priority <= 2 || selected.filter((s) => s.priority <= 2).length >= batchSize - 1) {
      selected.push(row);
    } else if (row.priority === 3 && selected.length < batchSize) {
      selected.push(row);
    }
  }

  let refreshed = 0;
  let skipped = 0;
  for (const row of selected) {
    try {
      await refreshBarsForTicker(row.ticker, lookback);
      refreshed += 1;
    } catch (err) {
      skipped += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[bars-worker]", row.ticker, msg);
    }
  }
  return { refreshed, skipped };
}

export function startBarsRefreshWorker() {
  if (String(process.env.BARS_REFRESH_ENABLED ?? "1").trim() === "0") {
    return { stop() {} };
  }

  const intervalMs = envInt("BARS_REFRESH_INTERVAL_MS", 45_000, 10_000, 600_000);
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;

  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      const out = await runBarsRefreshOnce();
      if (out.refreshed > 0 || out.skipped > 0) {
        console.log(`[bars-worker] refreshed=${out.refreshed} skipped=${out.skipped}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[bars-worker]", msg);
    } finally {
      running = false;
      if (!stopped) timer = setTimeout(() => void tick(), intervalMs);
    }
  };

  timer = setTimeout(() => void tick(), 8_000);
  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
