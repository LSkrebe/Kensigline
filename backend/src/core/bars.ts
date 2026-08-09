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

function daysBetweenIso(a: string, b: string): number {
  const da = parseIsoDayToUtcDate(a);
  const db_ = parseIsoDayToUtcDate(b);
  if (!da || !db_) return Number.POSITIVE_INFINITY;
  return Math.abs(db_.getTime() - da.getTime()) / (24 * 3600 * 1000);
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
  const minMs = Math.max(100, Number(process.env.YAHOO_MIN_INTERVAL_MS ?? 350));
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
    out.push({ day: isoDayUTC(new Date(t)), close: c });
  }
  return out;
}

async function fetchYahooDailyCloses(
  ticker: string,
  fromDay: string,
  toDay: string,
  timeoutMs = 8_000,
): Promise<BarRow[]> {
  const from = parseIsoDayToUtcDate(fromDay);
  const to = parseIsoDayToUtcDate(toDay);
  if (!from || !to) throw new Error("yahoo_bad_date_range");

  const period1 = Math.floor(from.getTime() / 1000);
  const period2 = Math.floor((to.getTime() + 36 * 3600 * 1000) / 1000);

  await yahooRateLimit();
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}` +
    `?interval=1d&period1=${period1}&period2=${period2}`;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), Math.max(500, timeoutMs));
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json,text/plain,*/*" },
      signal: ac.signal,
    });
    const txt = await res.text().catch(() => "");
    if (!res.ok) {
      if (res.status === 404 || res.status === 400) return [];
      throw new Error(`yahoo_fetch_failed ${res.status} ${txt.slice(0, 200)}`);
    }

    const json = JSON.parse(txt) as any;
    if (json?.chart?.error?.code === "Not Found") return [];
    const r0 = json?.chart?.result?.[0];
    if (!r0) return [];
    const ts = Array.isArray(r0?.timestamp) ? r0.timestamp : [];
    const closes = r0?.indicators?.quote?.[0]?.close;
    const closeArr = Array.isArray(closes) ? closes : [];

    const out: BarRow[] = [];
    for (let i = 0; i < ts.length; i++) {
      const sec = Number(ts[i]);
      const c = Number(closeArr[i]);
      if (!Number.isFinite(sec) || !Number.isFinite(c)) continue;
      out.push({ day: isoDayUTC(new Date(sec * 1000)), close: c });
    }
    return out;
  } finally {
    clearTimeout(timer);
  }
}

async function ensureBarsTickerMetaTable(): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS bars_ticker_meta (
      ticker text PRIMARY KEY,
      last_bar_day date NOT NULL,
      bar_count int NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS bars_ticker_meta_last_day_idx
      ON bars_ticker_meta (last_bar_day DESC)
  `);
}

let barsMetaReady: Promise<void> | null = null;
function readyBarsMeta(): Promise<void> {
  if (!barsMetaReady) barsMetaReady = ensureBarsTickerMetaTable().catch((err) => {
    barsMetaReady = null;
    throw err;
  });
  return barsMetaReady;
}

async function upsertBars(ticker: string, rows: BarRow[]) {
  if (!rows.length) return;
  await readyBarsMeta();
  const chunkSize = 200;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const values: unknown[] = [];
    const placeholders: string[] = [];
    for (let j = 0; j < chunk.length; j++) {
      const r = chunk[j]!;
      const base = j * 3;
      placeholders.push(`($${base + 1}, $${base + 2}::date, $${base + 3})`);
      values.push(ticker, r.day, r.close);
    }
    await db.query(
      `
      INSERT INTO bars (ticker, day, close)
      VALUES ${placeholders.join(", ")}
      ON CONFLICT (ticker, day) DO UPDATE SET close = EXCLUDED.close
      `,
      values,
    );
  }

  await db.query(
    `
    INSERT INTO bars_ticker_meta (ticker, last_bar_day, bar_count, updated_at)
    SELECT $1, max(day)::date, count(*)::int, now()
    FROM bars
    WHERE ticker = $1
    ON CONFLICT (ticker) DO UPDATE SET
      last_bar_day = EXCLUDED.last_bar_day,
      bar_count = EXCLUDED.bar_count,
      updated_at = now()
    `,
    [ticker],
  );
}

function cacheIsFreshEnough(cached: Array<{ day: string }>, toDay: string): boolean {
  if (cached.length < 20) return false;
  const last = cached[cached.length - 1]?.day;
  if (!last) return false;
  return daysBetweenIso(last, toDay) <= 4;
}

/** True when cache spans the requested window (not just a fresh trailing stub). */
function cacheCoversRequestedRange(
  cached: Array<{ day: string }>,
  fromDay: string,
  toDay: string,
): boolean {
  if (!cacheIsFreshEnough(cached, toDay)) return false;
  const first = cached[0]?.day;
  if (!first) return false;
  // Leading gap: we only have a recent stub (e.g. 3 weeks) while the chart asked for a year.
  if (daysBetweenIso(fromDay, first) > 14) return false;
  const windowDays = daysBetweenIso(fromDay, toDay);
  if (windowDays > 60 && cached.length < Math.floor(windowDays * 0.35)) return false;
  return true;
}

const backgroundRefresh = new Set<string>();

async function fetchAndStoreBars(
  ticker: string,
  fromDay: string,
  toDay: string,
  prefer: "yahoo" | "polygon",
): Promise<{ rows: BarRow[]; source: "polygon" | "yahoo" | "none" }> {
  let fetched: BarRow[] = [];
  let source: "polygon" | "yahoo" | "none" = "none";

  const tryYahoo = async (timeoutMs: number) => {
    fetched = await fetchYahooDailyCloses(ticker, fromDay, toDay, timeoutMs);
    if (fetched.length) source = "yahoo";
  };
  const tryPolygon = async () => {
    fetched = await fetchPolygonDailyCloses(ticker, fromDay, toDay);
    source = "polygon";
  };

  if (prefer === "yahoo") {
    try {
      await tryYahoo(2_500);
    } catch {
      /* fall through */
    }
    if (!fetched.length) {
      try {
        await tryPolygon();
      } catch {
        try {
          await tryYahoo(6_000);
        } catch {
          fetched = [];
          source = "none";
        }
      }
    }
  } else {
    try {
      await tryPolygon();
    } catch {
      try {
        await tryYahoo(6_000);
      } catch {
        fetched = [];
        source = "none";
      }
    }
  }

  if (fetched.length) await upsertBars(ticker, fetched);
  return { rows: fetched, source };
}

function scheduleBackgroundBarsRefresh(ticker: string, fromDay: string, toDay: string) {
  if (backgroundRefresh.has(ticker)) return;
  backgroundRefresh.add(ticker);
  void fetchAndStoreBars(ticker, fromDay, toDay, "yahoo")
    .catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[bars] background refresh", ticker, msg);
    })
    .finally(() => backgroundRefresh.delete(ticker));
}

async function readBarsRange(ticker: string, fromDay: string, toDay: string) {
  return db.query<{ day: string; close: number }>(
    `
    SELECT day::text as day, close
    FROM bars
    WHERE ticker = $1 AND day >= $2::date AND day <= $3::date
    ORDER BY day ASC
    `,
    [ticker, fromDay, toDay],
  );
}

/**
 * Chart/API path: return DB bars immediately when history covers the window.
 * A fresh-but-short stub (common after content wipes) must re-fetch the full range
 * or timeframe chips cannot zoom the price line.
 */
export async function getDailyCloseBars(opts: {
  ticker: string;
  fromDay: string;
  toDay: string;
  forceRefresh?: boolean;
}) {
  const ticker = String(opts.ticker ?? "").trim().toUpperCase();
  const fromDay = String(opts.fromDay ?? "").trim();
  const toDay = String(opts.toDay ?? "").trim();
  if (!ticker) throw new Error("ticker_required");

  const cached = await readBarsRange(ticker, fromDay, toDay);

  if (opts.forceRefresh) {
    const { source } = await fetchAndStoreBars(ticker, fromDay, toDay, "polygon");
    const rows = await readBarsRange(ticker, fromDay, toDay);
    return { ticker, source: rows.length ? source : "none", items: rows };
  }

  const covers = cached.length > 0 && cacheCoversRequestedRange(cached, fromDay, toDay);
  if (covers) {
    return { ticker, source: "cache" as const, items: cached };
  }

  // Never block the interactive chart on Yahoo/Polygon. Serve whatever we have and refresh async.
  scheduleBackgroundBarsRefresh(ticker, fromDay, toDay);
  if (cached.length > 0) {
    return { ticker, source: "cache" as const, items: cached };
  }
  return { ticker, source: "none" as const, items: [] };
}
