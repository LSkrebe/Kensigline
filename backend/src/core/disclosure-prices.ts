import {completedDay} from '../performance/calendar.js';
export {completedDay} from '../performance/calendar.js';
import type http from "node:http";
import { EXPLORE_WATCHLIST_CATALOG } from "../explore/watchlist-catalog.js";
import { db } from "./db.js";
import { sendJson } from "./http.js";

const pending = new Map<string, Promise<void>>();
const failures = new Map<string, number>();
let providerQueue = Promise.resolve();
let lastFetch = 0;
let requestQueue:Promise<unknown>=Promise.resolve();
export function priceProviderFetch(url:URL):Promise<Response>{
 const job=requestQueue.then(async()=>{
  const wait=Math.max(0,20000-(Date.now()-lastFetch));
  if(wait)await new Promise(r=>setTimeout(r,wait));
  lastFetch=Date.now();
  for(let attempt=0;attempt<3;attempt++){
   const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
   if(response.status!==429||attempt===2)return response;
   await response.body?.cancel();
   await new Promise(r=>setTimeout(r,65000));lastFetch=Date.now();
  }
  throw Error('price_rate_limit');
 });
 requestQueue=job.catch(()=>{});return job;
}


async function refresh(ticker: string) {
  // One provider, one complete response: never mix old split bases or data providers.
  const key = process.env.POLYGON_API_KEY?.trim();
  if (!key) throw Error("price_provider_not_configured");
  const to = completedDay();
  const fromDate = new Date(`${to}T00:00:00Z`);
  fromDate.setUTCFullYear(fromDate.getUTCFullYear() - 2);
  const from = fromDate.toISOString().slice(0, 10);
  const url = new URL(
    `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${from}/${to}`,
  );
  url.search = new URLSearchParams({
    adjusted: "true",
    sort: "asc",
    limit: "50000",
    apiKey: key,
  }).toString();
  const response = await priceProviderFetch(url);
  if (!response.ok) throw Error(`price_provider_http_${response.status}`);
  const data = (await response.json()) as any;
  if (data.adjusted !== true) throw Error("price_basis_unconfirmed");
  const bars = (Array.isArray(data.results) ? data.results : [])
    .filter((r: any) => Number.isFinite(r.t) && Number.isFinite(r.c) && r.c > 0)
    .map((r: any) => ({
      day: new Date(r.t).toISOString().slice(0, 10),
      close: r.c,
    }))
    .filter((r: any) => r.day >= from && r.day <= to);
  // Keep the as-traded close beside the adjusted close, from the same provider and date window.
  // This permits comparing a reported execution price without a false return across a split.
  url.searchParams.set("adjusted","false");
  const rawResponse=await priceProviderFetch(url);
  if(!rawResponse.ok) throw Error(`price_provider_raw_http_${rawResponse.status}`);
  const rawData=await rawResponse.json() as any;
  if(rawData.adjusted!==false) throw Error("raw_price_basis_unconfirmed");
  const rawBars=new Map<string,number>((Array.isArray(rawData.results)?rawData.results:[])
    .filter((r:any)=>Number.isFinite(r.t)&&Number.isFinite(r.c)&&r.c>0)
    .map((r:any)=>[new Date(r.t).toISOString().slice(0,10),r.c]));
  for(const b of bars) if(rawBars.has(b.day)) b.unadjustedClose=rawBars.get(b.day);
  if (!bars.length) throw Error("price_history_unavailable");
  await db.queryApi(
    `INSERT INTO disclosure_price_history (ticker,provider,basis,as_of_day,fetched_at,bars)
    VALUES ($1,'polygon','split_adjusted_close',$2::date,now(),$3::jsonb)
    ON CONFLICT(ticker) DO UPDATE SET provider=EXCLUDED.provider,basis=EXCLUDED.basis,
    as_of_day=EXCLUDED.as_of_day,fetched_at=EXCLUDED.fetched_at,bars=EXCLUDED.bars`,
    [ticker, bars.at(-1)!.day, JSON.stringify(bars)],
  );
  // Cached dossier responses contain price-derived values: invalidate them after new closes.
  await db.queryApi("DELETE FROM investor_dossier_cache WHERE payload->'actor'->'performance'->'daily'->>'asOf' IS DISTINCT FROM $1",[bars.at(-1)!.day]);
  failures.delete(ticker);
}

function ingestIsBackfill(): boolean {
  return String(process.env.INGEST_MODE ?? "live").trim().toLowerCase() === "backfill";
}

function pricePendingCap(): number {
  // During backfill, keep the serial Polygon chain tiny so parse workers stay responsive.
  if (ingestIsBackfill()) return Math.max(2, Number(process.env.DISCLOSURE_PRICE_PENDING_MAX_BACKFILL ?? 8) || 8);
  return Math.max(8, Number(process.env.DISCLOSURE_PRICE_PENDING_MAX ?? 40) || 40);
}

export function queueDisclosurePriceRefresh(ticker: string): boolean {
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) return false;
  if (pending.has(ticker)) return true;
  if (
    Date.now() - (failures.get(ticker) ?? 0) <= 15 * 60_000 ||
    pending.size >= pricePendingCap()
  )
    return false;
  const job = providerQueue
    .then(() => refresh(ticker))
    .catch((error) => {
      failures.set(ticker, Date.now());
      console.warn(
        "[disclosure-prices]",
        ticker,
        error instanceof Error ? error.message : "refresh_failed",
      );
    })
    .finally(() => pending.delete(ticker));
  pending.set(ticker, job);
  providerQueue = job;
  return true;
}

export async function handleDisclosurePrices(
  res: http.ServerResponse,
  rawTicker: string | null,
) {
  const ticker = String(rawTicker ?? "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) {
    sendJson(res, 400, { ok: false, error: "invalid_ticker" });
    return;
  }
  const issuer = await db.oneApi(
    "SELECT id FROM issuers WHERE ticker=$1 LIMIT 1",
    [ticker],
  );
  if (!issuer) {
    sendJson(res, 404, { ok: false, error: "unknown_ticker" });
    return;
  }
  const cached = await db.oneApi<any>(
    `SELECT ticker,provider,basis,as_of_day::text,fetched_at::text,bars
    FROM disclosure_price_history WHERE ticker=$1`,
    [ticker],
  );
  const stale =
    !cached || !cached.bars?.at(-1)?.unadjustedClose || cached.as_of_day < completedDay();
  if (stale) queueDisclosurePriceRefresh(ticker);
  if (cached) {
    sendJson(res, 200, {
      ok: true,
      ...cached,
      stale,
      refreshing: pending.has(ticker),
    });
    return;
  }
  sendJson(res, pending.has(ticker) ? 202 : 503, {
    ok: false,
    pending: pending.has(ticker),
    error: pending.has(ticker)
      ? "price_history_loading"
      : "price_history_unavailable",
  });
}

/** Keep histories already used by customers fresh without flooding Polygon during backfill. */
export function startDisclosurePriceWorker() {
  if (String(process.env.DISCLOSURE_PRICE_WORKER_ENABLED ?? "1").trim() === "0") {
    console.info("[disclosure-prices] worker disabled");
    return { stop() {} };
  }
  let busy = false;
  const curatedSlugs = EXPLORE_WATCHLIST_CATALOG.map((e) => e.id);
  const curatedNames = EXPLORE_WATCHLIST_CATALOG.map((e) => e.name);
  const run = async () => {
    if (busy) return;
    busy = true;
    try {
      const backfill = ingestIsBackfill();
      const limit = backfill
        ? Math.max(1, Math.min(20, Number(process.env.DISCLOSURE_PRICE_SWEEP_LIMIT_BACKFILL ?? 6) || 6))
        : Math.max(5, Math.min(40, Number(process.env.DISCLOSURE_PRICE_SWEEP_LIMIT ?? 20) || 20));
      const blocked = [...pending.keys(), ...failures.keys()];
      const rows = backfill
        ? await db.queryApi<{ ticker: string }>(
            `WITH curated AS (
              SELECT f.id FROM filers f
              WHERE f.slug = ANY($3::text[])
                 OR lower(f.display_name) = ANY(SELECT lower(x) FROM unnest($4::text[]) x)
            )
            SELECT i.ticker FROM issuers i
            LEFT JOIN disclosure_price_history p ON p.ticker=i.ticker
            WHERE i.ticker ~ '^[A-Z][A-Z0-9.-]{0,9}$'
              AND i.ticker<>ALL($2::text[])
              AND (p.ticker IS NULL OR p.as_of_day<$1::date OR p.bars->-1->>'unadjustedClose' IS NULL)
              AND (
                i.ticker='SPY'
                OR EXISTS(SELECT 1 FROM politician_transactions t JOIN curated c ON c.id=t.filer_id WHERE t.issuer_id=i.id)
                OR EXISTS(SELECT 1 FROM insider_transactions t JOIN curated c ON c.id=t.filer_id WHERE t.issuer_id=i.id)
                OR EXISTS(SELECT 1 FROM institution_transactions t JOIN curated c ON c.id=t.filer_id WHERE t.issuer_id=i.id)
              )
            ORDER BY (i.ticker='SPY') DESC, p.fetched_at NULLS FIRST, i.ticker
            LIMIT $5`,
            [completedDay(), blocked, curatedSlugs, curatedNames, limit],
          )
        : await db.queryApi<{ ticker: string }>(
            `SELECT i.ticker FROM issuers i LEFT JOIN disclosure_price_history p ON p.ticker=i.ticker
            WHERE i.ticker ~ '^[A-Z][A-Z0-9.-]{0,9}$' AND i.ticker<>ALL($2::text[]) AND
              (p.ticker IS NULL OR p.as_of_day<$1::date OR p.bars->-1->>'unadjustedClose' IS NULL)
            AND (EXISTS(SELECT 1 FROM politician_transactions t WHERE t.issuer_id=i.id)
              OR EXISTS(SELECT 1 FROM insider_transactions t WHERE t.issuer_id=i.id)
              OR EXISTS(SELECT 1 FROM institution_transactions t WHERE t.issuer_id=i.id))
            ORDER BY (i.ticker='SPY') DESC,EXISTS(SELECT 1 FROM politician_transactions t WHERE t.issuer_id=i.id) DESC,p.fetched_at NULLS FIRST,i.ticker LIMIT $3`,
            [completedDay(), blocked, limit],
          );
      for (const row of rows) queueDisclosurePriceRefresh(row.ticker);
    } catch {
      console.warn("[disclosure-prices] refresh sweep failed");
    } finally {
      busy = false;
    }
  };
  const initial = setTimeout(() => void run(), ingestIsBackfill() ? 120_000 : 30_000);
  const timer = setInterval(() => void run(), ingestIsBackfill() ? 10 * 60_000 : 5 * 60_000);
  return {
    stop() {
      clearTimeout(initial);
      clearInterval(timer);
    },
  };
}
