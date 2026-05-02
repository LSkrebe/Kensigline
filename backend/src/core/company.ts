import { db } from "./db.js";
import { fetchSecJson, resolveCikForTicker } from "./sec.js";
import { getDailyCloseBars } from "./bars.js";

function mustEnv(name: string) {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`${name} is required`);
  return v;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

let lastPolygonAt = 0;
async function polygonRateLimit() {
  const minMs = Math.max(500, Number(process.env.POLYGON_MIN_INTERVAL_MS ?? 12_500));
  const now = Date.now();
  const wait = lastPolygonAt ? Math.max(0, minMs - (now - lastPolygonAt)) : 0;
  if (wait > 0) await sleep(wait);
  lastPolygonAt = Date.now();
}

let lastYahooAt = 0;
async function yahooRateLimit() {
  const minMs = Math.max(150, Number(process.env.YAHOO_MIN_INTERVAL_MS ?? 500));
  const now = Date.now();
  const wait = lastYahooAt ? Math.max(0, minMs - (now - lastYahooAt)) : 0;
  if (wait > 0) await sleep(wait);
  lastYahooAt = Date.now();
}

function isoDayUTC(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function formatUsdCompact(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000_000) return `${sign}$${(abs / 1_000_000_000_000).toFixed(2)}T`;
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${Math.round(abs)}`;
}

async function fetchPolygonTickerOverview(ticker: string) {
  const apiKey = mustEnv("POLYGON_API_KEY");
  await polygonRateLimit();
  const url = `https://api.polygon.io/v3/reference/tickers/${encodeURIComponent(ticker)}?apiKey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  const txt = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`polygon_ticker_failed ${res.status} ${txt.slice(0, 200)}`);
  const json = JSON.parse(txt) as any;
  return json?.results ?? null;
}

async function fetchYahooNextEarningsDate(ticker: string): Promise<string | null> {
  // Undocumented endpoint; best-effort only.
  await yahooRateLimit();
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
    ticker,
  )}?modules=calendarEvents`;
  const res = await fetch(url, { headers: { accept: "application/json,text/plain,*/*" } });
  const txt = await res.text().catch(() => "");
  if (!res.ok) return null;
  try {
    const json = JSON.parse(txt) as any;
    const r0 = json?.quoteSummary?.result?.[0];
    const raw = r0?.calendarEvents?.earnings?.earningsDate?.[0]?.raw;
    const sec = Number(raw);
    if (!Number.isFinite(sec) || sec <= 0) return null;
    return isoDayUTC(new Date(sec * 1000));
  } catch {
    return null;
  }
}

async function fetchPolygonBenzingaNextEarningsDate(ticker: string): Promise<string | null> {
  // Requires Benzinga partner entitlement on Polygon/Massive. Best-effort: return null on 401/403.
  const apiKey = mustEnv("POLYGON_API_KEY");
  const now = new Date();
  const gte = isoDayUTC(now);
  const to = new Date(now);
  to.setUTCDate(to.getUTCDate() + 120);
  const lte = isoDayUTC(to);

  await polygonRateLimit();
  const url =
    `https://api.polygon.io/benzinga/v1/earnings` +
    `?ticker=${encodeURIComponent(ticker)}` +
    `&date.gte=${encodeURIComponent(gte)}` +
    `&date.lte=${encodeURIComponent(lte)}` +
    `&sort=date.asc&limit=50&apiKey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  const txt = await res.text().catch(() => "");
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error(`polygon_earnings_failed ${res.status} ${txt.slice(0, 200)}`);

  const json = JSON.parse(txt) as any;
  const results = Array.isArray(json?.results) ? json.results : [];
  for (const r of results) {
    const day = String(r?.date ?? "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  }
  return null;
}

function pickSharesOutstanding(companyFacts: any): number | null {
  // Prefer the common shares outstanding fact.
  const fact = companyFacts?.facts?.dei?.EntityCommonStockSharesOutstanding;
  const units = fact?.units;
  if (!units || typeof units !== "object") return null;
  const unitKeys = Object.keys(units);
  for (const uk of unitKeys) {
    const arr = units[uk];
    if (!Array.isArray(arr)) continue;
    // Pick latest by "end" or "filed" date.
    const rows = arr
      .map((r: any) => ({
        v: Number(r?.val),
        end: String(r?.end ?? ""),
        filed: String(r?.filed ?? ""),
        fy: Number(r?.fy ?? 0),
        fp: String(r?.fp ?? ""),
        form: String(r?.form ?? ""),
      }))
      .filter((r: any) => Number.isFinite(r.v) && r.v > 0 && r.end);
    if (!rows.length) continue;
    rows.sort((a: any, b: any) => (a.end < b.end ? 1 : a.end > b.end ? -1 : b.filed.localeCompare(a.filed)));
    return rows[0]!.v;
  }
  return null;
}

async function getLatestClose(ticker: string): Promise<number | null> {
  const row = await db.one<{ close: number }>(
    `
    SELECT close
    FROM bars
    WHERE ticker = $1
    ORDER BY day DESC
    LIMIT 1
    `,
    [ticker],
  );
  if (row && Number.isFinite(Number(row.close))) return Number(row.close);

  // Backfill a small window and retry.
  const now = new Date();
  const toDay = isoDayUTC(now);
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - 30);
  const fromDay = isoDayUTC(from);
  await getDailyCloseBars({ ticker, fromDay, toDay });
  const row2 = await db.one<{ close: number }>(
    `
    SELECT close
    FROM bars
    WHERE ticker = $1
    ORDER BY day DESC
    LIMIT 1
    `,
    [ticker],
  );
  if (row2 && Number.isFinite(Number(row2.close))) return Number(row2.close);
  return null;
}

export async function getCompanyPanelData(opts: { ticker: string }) {
  const ticker = String(opts.ticker ?? "").trim().toUpperCase();
  if (!ticker) throw new Error("ticker_required");

  // Profile (industry/country/name) from Polygon if available.
  let name: string | null = null;
  let industry: string | null = null;
  let country: string | null = null;

  try {
    const r = await fetchPolygonTickerOverview(ticker);
    name = r?.name ? String(r.name) : null;
    industry =
      r?.sic_description != null
        ? String(r.sic_description)
        : r?.industry != null
          ? String(r.industry)
          : null;
    country = r?.address?.country != null ? String(r.address.country) : r?.locale != null ? String(r.locale) : null;
  } catch {
    // Leave null; we can still compute MCAP.
  }

  // Shares outstanding from SEC companyfacts.
  let cik: string | null = null;
  let sharesOutstanding: number | null = null;
  try {
    const resolved = await resolveCikForTicker(ticker);
    cik = resolved.cik;
    const facts = await fetchSecJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`);
    sharesOutstanding = pickSharesOutstanding(facts);
    if (!name && resolved.title) name = String(resolved.title);
  } catch {
    // best-effort
  }

  // MCAP = latest close * shares.
  const latestClose = await getLatestClose(ticker);
  const mcapNum =
    latestClose != null && sharesOutstanding != null ? Number(latestClose) * Number(sharesOutstanding) : null;
  const mcap = mcapNum != null && Number.isFinite(mcapNum) ? `${formatUsdCompact(mcapNum)} USD` : null;

  // Earnings date: primary Polygon Benzinga calendar, fallback Yahoo best-effort.
  let earnings_date: string | null = null;
  try {
    earnings_date = await fetchPolygonBenzingaNextEarningsDate(ticker);
  } catch {
    earnings_date = null;
  }
  if (!earnings_date) {
    earnings_date = await fetchYahooNextEarningsDate(ticker);
  }

  // Cache/upsert into companies table when we have at least a name.
  if (name) {
    const existing = await db.one<{ id: string }>(`SELECT id FROM companies WHERE ticker = $1 LIMIT 1`, [ticker]);
    if (existing?.id) {
      await db.query(
        `
        UPDATE companies
        SET name = $2,
            industry = $3,
            country = $4,
            mcap = $5,
            earnings_date = $6::date,
            updated_at = now()
        WHERE id = $1
        `,
        [existing.id, name, industry, country, mcap, earnings_date],
      );
    } else {
      await db.query(
        `
        INSERT INTO companies (name, ticker, industry, country, mcap, earnings_date, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6::date, now())
        ON CONFLICT (name) DO UPDATE
          SET ticker = EXCLUDED.ticker,
              industry = COALESCE(EXCLUDED.industry, companies.industry),
              country = COALESCE(EXCLUDED.country, companies.country),
              mcap = COALESCE(EXCLUDED.mcap, companies.mcap),
              earnings_date = COALESCE(EXCLUDED.earnings_date, companies.earnings_date),
              updated_at = now()
        `,
        [name, ticker, industry, country, mcap, earnings_date],
      );
    }
  }

  return {
    ticker,
    name,
    industry,
    country,
    earnings_date,
    shares_outstanding: sharesOutstanding,
    latest_close: latestClose,
    mcap,
  };
}

