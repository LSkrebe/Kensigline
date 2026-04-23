import { db } from "./db.js";

type BarRow = { day: string; close: number };

function mustEnv(name: string) {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`${name} is required`);
  return v;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isoDayUTC(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function parseIsoDayToUtcDate(isoDay: string) {
  const m = String(isoDay ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
}

let lastPolygonAt = 0;
async function polygonRateLimit() {
  // Polygon free tier is very tight (commonly ~5 req/min). Keep a safe default.
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

async function fetchPolygonDailyCloses(ticker: string, fromDay: string, toDay: string): Promise<BarRow[]> {
  const apiKey = mustEnv("POLYGON_API_KEY");
  await polygonRateLimit();
  const url =
    `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(ticker)}` +
    `/range/1/day/${fromDay}/${toDay}?adjusted=true&sort=asc&limit=50000&apiKey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  const txt = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`polygon_fetch_failed ${res.status} ${txt.slice(0, 200)}`);
  }
  const json = JSON.parse(txt) as any;
  const results = Array.isArray(json?.results) ? json.results : [];
  const out: BarRow[] = [];
  for (const r of results) {
    const t = Number(r?.t);
    const c = Number(r?.c);
    if (!Number.isFinite(t) || !Number.isFinite(c)) continue;
    const day = isoDayUTC(new Date(t));
    out.push({ day, close: c });
  }
  return out;
}

async function fetchYahooDailyCloses(ticker: string, fromDay: string, toDay: string): Promise<BarRow[]> {
  const from = parseIsoDayToUtcDate(fromDay);
  const to = parseIsoDayToUtcDate(toDay);
  if (!from || !to) throw new Error("yahoo_bad_date_range");

  // period2 is exclusive-ish; add a bit of slack.
  const period1 = Math.floor(from.getTime() / 1000);
  const period2 = Math.floor((to.getTime() + 36 * 3600 * 1000) / 1000);

  await yahooRateLimit();
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}` +
    `?interval=1d&period1=${period1}&period2=${period2}`;

  const res = await fetch(url, { headers: { accept: "application/json,text/plain,*/*" } });
  const txt = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`yahoo_fetch_failed ${res.status} ${txt.slice(0, 200)}`);

  const json = JSON.parse(txt) as any;
  const r0 = json?.chart?.result?.[0];
  const ts = Array.isArray(r0?.timestamp) ? r0.timestamp : [];
  const closes = r0?.indicators?.quote?.[0]?.close;
  const closeArr = Array.isArray(closes) ? closes : [];

  const out: BarRow[] = [];
  for (let i = 0; i < ts.length; i++) {
    const sec = Number(ts[i]);
    const c = Number(closeArr[i]);
    if (!Number.isFinite(sec) || !Number.isFinite(c)) continue;
    const day = isoDayUTC(new Date(sec * 1000));
    out.push({ day, close: c });
  }
  return out;
}

async function upsertBars(ticker: string, rows: BarRow[]) {
  for (const r of rows) {
    await db.query(
      `
      INSERT INTO bars (ticker, day, close)
      VALUES ($1, $2::date, $3)
      ON CONFLICT (ticker, day) DO UPDATE SET close = EXCLUDED.close
      `,
      [ticker, r.day, r.close],
    );
  }
}

export async function getDailyCloseBars(opts: { ticker: string; fromDay: string; toDay: string }) {
  const ticker = String(opts.ticker ?? "").trim().toUpperCase();
  const fromDay = String(opts.fromDay ?? "").trim();
  const toDay = String(opts.toDay ?? "").trim();
  if (!ticker) throw new Error("ticker_required");

  const cached = await db.query<{ day: string; close: number }>(
    `
    SELECT day::text as day, close
    FROM bars
    WHERE ticker = $1 AND day >= $2::date AND day <= $3::date
    ORDER BY day ASC
    `,
    [ticker, fromDay, toDay],
  );

  // Simple heuristic: if we already have "enough" rows, just return them.
  if (cached.length >= 40) return { ticker, source: "cache" as const, items: cached };

  let fetched: BarRow[] = [];
  let source: "polygon" | "yahoo" | "none" = "none";
  try {
    fetched = await fetchPolygonDailyCloses(ticker, fromDay, toDay);
    source = "polygon";
  } catch {
    fetched = await fetchYahooDailyCloses(ticker, fromDay, toDay);
    source = "yahoo";
  }

  if (fetched.length) {
    await upsertBars(ticker, fetched);
  }

  const rows = await db.query<{ day: string; close: number }>(
    `
    SELECT day::text as day, close
    FROM bars
    WHERE ticker = $1 AND day >= $2::date AND day <= $3::date
    ORDER BY day ASC
    `,
    [ticker, fromDay, toDay],
  );

  return { ticker, source, items: rows };
}

