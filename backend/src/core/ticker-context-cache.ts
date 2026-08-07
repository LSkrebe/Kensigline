import { db } from "./db.js";
import { getCompanyPanelData } from "./company.js";
import { loadTickerSecBundle } from "./sec.js";
import { getMarketFundamentalsForTicker, type MarketFundamentals } from "../research/market/fundamentals.js";

type CacheRow = {
  ticker: string;
  company_json: Record<string, unknown>;
  fundamentals_json: MarketFundamentals | null;
  documents_watermark: string | null;
  computed_at: string;
};

const inflight = new Map<string, Promise<void>>();
const refreshTimers = new Map<string, ReturnType<typeof setTimeout>>();

function normalizeTicker(ticker: string): string {
  return String(ticker ?? "").trim().toUpperCase();
}

async function ensureCacheTable(): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS ticker_context_cache (
      ticker text PRIMARY KEY,
      company_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      fundamentals_json jsonb,
      documents_watermark timestamptz,
      computed_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

export async function getDocumentsWatermarkForTicker(ticker: string): Promise<string | null> {
  const t = normalizeTicker(ticker);
  if (!t) return null;
  const row = await db.one<{ watermark: string | null }>(
    `
    SELECT max(parsed_at)::text AS watermark
    FROM documents
    WHERE ticker_norm = $1
    `,
    [t],
  );
  return row?.watermark ?? null;
}

async function readCacheRow(ticker: string): Promise<CacheRow | null> {
  await ensureCacheTable();
  return db.one<CacheRow>(
    `
    SELECT
      ticker,
      company_json,
      fundamentals_json,
      documents_watermark::text,
      computed_at::text
    FROM ticker_context_cache
    WHERE ticker = $1
    LIMIT 1
    `,
    [ticker],
  );
}

function cacheIsFresh(row: CacheRow | null, watermark: string | null): boolean {
  if (!row?.computed_at) return false;
  const cached = row.documents_watermark ? String(row.documents_watermark) : null;
  const current = watermark ? String(watermark) : null;
  return cached === current;
}

async function upsertCacheRow(args: {
  ticker: string;
  company: Record<string, unknown>;
  fundamentals: MarketFundamentals | null;
  watermark: string | null;
}): Promise<void> {
  await ensureCacheTable();
  await db.query(
    `
    INSERT INTO ticker_context_cache (
      ticker, company_json, fundamentals_json, documents_watermark, computed_at
    )
    VALUES ($1, $2::jsonb, $3::jsonb, $4::timestamptz, now())
    ON CONFLICT (ticker) DO UPDATE SET
      company_json = EXCLUDED.company_json,
      fundamentals_json = EXCLUDED.fundamentals_json,
      documents_watermark = EXCLUDED.documents_watermark,
      computed_at = now()
    `,
    [
      args.ticker,
      JSON.stringify(args.company),
      args.fundamentals ? JSON.stringify(args.fundamentals) : null,
      args.watermark,
    ],
  );
}

export async function computeTickerContextCache(tickerInput: string): Promise<void> {
  const ticker = normalizeTicker(tickerInput);
  if (!ticker) return;

  const secBundle = await loadTickerSecBundle(ticker);
  const watermark = await getDocumentsWatermarkForTicker(ticker);

  const [company, fundamentals] = await Promise.all([
    getCompanyPanelData({ ticker, secBundle }),
    getMarketFundamentalsForTicker({ ticker, secBundle }).catch(() => null),
  ]);

  await upsertCacheRow({
    ticker,
    company,
    fundamentals,
    watermark,
  });
}

async function getOrComputeCache(ticker: string): Promise<CacheRow | null> {
  const watermark = await getDocumentsWatermarkForTicker(ticker);
  const cached = await readCacheRow(ticker);
  if (cacheIsFresh(cached, watermark)) return cached;

  // Stale-while-revalidate: never block the API on Polygon/Yahoo for a warm panel.
  if (cached?.company_json && Object.keys(cached.company_json).length > 0) {
    let job = inflight.get(ticker);
    if (!job) {
      job = computeTickerContextCache(ticker)
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn("[ticker-context-cache] compute failed", ticker, msg);
        })
        .finally(() => {
          inflight.delete(ticker);
        });
      inflight.set(ticker, job);
    }
    return cached;
  }

  let job = inflight.get(ticker);
  if (!job) {
    job = computeTickerContextCache(ticker)
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[ticker-context-cache] compute failed", ticker, msg);
      })
      .finally(() => {
        inflight.delete(ticker);
      });
    inflight.set(ticker, job);
  }
  // Cold miss: wait briefly; if still computing, fall through to snapshot-ish empty.
  await Promise.race([job, new Promise((r) => setTimeout(r, 2_500))]);
  return readCacheRow(ticker);
}

export async function getCompanyFullCached(opts: { ticker: string }): Promise<Record<string, unknown>> {
  const ticker = normalizeTicker(opts.ticker);
  if (!ticker) throw new Error("ticker_required");

  const row = await getOrComputeCache(ticker);
  if (row?.company_json && typeof row.company_json === "object") {
    return {
      ...row.company_json,
      fundamentals: row.fundamentals_json ?? null,
    };
  }

  // Last resort cold path — still prefer not to sit on Polygon forever.
  const secBundle = await loadTickerSecBundle(ticker);
  const company = await getCompanyPanelData({ ticker, secBundle });
  void getMarketFundamentalsForTicker({ ticker, secBundle })
    .then((fundamentals) =>
      upsertCacheRow({
        ticker,
        company,
        fundamentals,
        watermark: null,
      }),
    )
    .catch(() => {});
  return { ...company, fundamentals: null };
}

export async function invalidateTickerContextCache(tickerInput: string): Promise<void> {
  const ticker = normalizeTicker(tickerInput);
  if (!ticker) return;
  await ensureCacheTable();
  await db.query(`DELETE FROM ticker_context_cache WHERE ticker = $1`, [ticker]);
  scheduleTickerContextRefresh(ticker);
}

function readRefreshDebounceMs(): number {
  return Math.max(5_000, Number(process.env.TICKER_CONTEXT_REFRESH_DEBOUNCE_MS ?? 30_000));
}

/** Background refresh after ingest so the next panel open is warm. */
export function scheduleTickerContextRefresh(tickerInput: string): void {
  const ticker = normalizeTicker(tickerInput);
  if (!ticker) return;

  const prev = refreshTimers.get(ticker);
  if (prev) clearTimeout(prev);

  refreshTimers.set(
    ticker,
    setTimeout(() => {
      refreshTimers.delete(ticker);
      void computeTickerContextCache(ticker).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[ticker-context-cache] background refresh failed", ticker, msg);
      });
    }, readRefreshDebounceMs()),
  );
}
