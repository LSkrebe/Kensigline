import { db } from "./db.js";
import { loadTickerSecBundle, type TickerSecBundle } from "./sec.js";
import { getDailyCloseBars } from "./bars.js";
import { isPlausibleCompanyDisplayName } from "../research/feed-display.js";
import { formatUsdCompact } from "../shared/money.js";

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

/** Polygon ADR overviews often omit sic_description — infer a short industry label. */
function inferIndustryFromText(text: string | null | undefined): string | null {
  const d = String(text ?? "").toLowerCase();
  if (!d) return null;
  if (/semiconductor|chip foundry|wafer|integrated circuit|fabless/.test(d)) return "Semiconductors";
  if (/biotechnolog|biopharma|pharmaceutical|drug develop/.test(d)) return "Biotechnology";
  if (/\bsaas\b|software|cloud computing|cybersecurity/.test(d)) return "Software";
  if (/\bbank(ing)?\b|financial services|asset management/.test(d)) return "Banks";
  if (/oil|petroleum|natural gas|exploration and production/.test(d)) return "Energy";
  if (/e-?commerce|retail(er)?\b/.test(d)) return "Retail";
  if (/automotiv|electric vehicle|\bev\b/.test(d)) return "Auto Manufacturers";
  if (/telecom|wireless|5g network/.test(d)) return "Telecom";
  return null;
}

/** Prefer corporate domicile cues over listing locale for foreign ADRs. */
function inferCountryFromPolygon(r: any): string | null {
  if (r?.address?.country != null) return String(r.address.country);
  const blob = `${r?.name ?? ""} ${r?.description ?? ""}`;
  if (/\btaiwan\b/i.test(blob)) return "TW";
  if (/\bnetherlands\b|\bdutch\b/i.test(blob)) return "NL";
  if (/\bunited kingdom\b|\bbritain\b/i.test(blob)) return "GB";
  if (/\bjapan\b/i.test(blob)) return "JP";
  if (/\bgermany\b/i.test(blob)) return "DE";
  if (/\bswitzerland\b/i.test(blob)) return "CH";
  if (/\bireland\b/i.test(blob)) return "IE";
  if (/\bcanada\b/i.test(blob)) return "CA";
  if (/\bchina\b|\bprc\b/i.test(blob)) return "CN";
  if (r?.locale != null) return String(r.locale);
  return null;
}

function industryFromPolygon(r: any): string | null {
  if (r?.sic_description != null) return String(r.sic_description);
  if (r?.industry != null) return String(r.industry);
  return inferIndustryFromText(r?.description) ?? inferIndustryFromText(r?.name);
}

async function fetchPolygonTickerOverview(ticker: string, opts?: { rateLimit?: boolean }) {
  const apiKey = mustEnv("POLYGON_API_KEY");
  if (opts?.rateLimit !== false) await polygonRateLimit();
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

async function loadCompanyDbRow(ticker: string) {
  return db.one<{
    name: string | null;
    industry: string | null;
    country: string | null;
    mcap: string | null;
    earnings_date: string | null;
  }>(
    `
    SELECT name, industry, country, mcap, earnings_date::text AS earnings_date
    FROM companies
    WHERE upper(trim(ticker)) = $1
    LIMIT 1
    `,
    [ticker],
  );
}

async function getLatestCloseDbOnly(ticker: string): Promise<number | null> {
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
  return null;
}

/** Fast company tile for Investigate — DB cache + latest bar close; one Polygon call only when uncached. */
export async function getCompanySnapshot(opts: { ticker: string }) {
  const ticker = String(opts.ticker ?? "").trim().toUpperCase();
  if (!ticker) throw new Error("ticker_required");

  const cached = await loadCompanyDbRow(ticker);
  const latestClose = await getLatestCloseDbOnly(ticker);

  let name: string | null = cached?.name ?? null;
  let industry: string | null = cached?.industry ?? null;
  let country: string | null = cached?.country ?? null;
  let earnings_date: string | null = cached?.earnings_date ?? null;
  let mcap: string | null = cached?.mcap != null ? String(cached.mcap) : null;

  // Fill gaps even when a name is cached — otherwise dossier meta stays "—".
  if (!name || !industry || !country) {
    const r = await withTimeout(fetchPolygonTickerOverview(ticker, { rateLimit: false }), 2_500);
    if (r) {
      name = r?.name ? String(r.name) : name;
      industry = industryFromPolygon(r) ?? industry;
      country = inferCountryFromPolygon(r) ?? country;
    }
  }

  return {
    ticker,
    name,
    industry,
    country,
    earnings_date,
    shares_outstanding: null,
    latest_close: latestClose,
    mcap,
  };
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
  try {
    await getDailyCloseBars({ ticker, fromDay, toDay });
  } catch {
    return null;
  }
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

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  try {
    return await Promise.race([
      p,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
    ]);
  } catch {
    return null;
  }
}

export async function getCompanyPanelData(opts: {
  ticker: string;
  secBundle?: TickerSecBundle | null;
  /** When true, never block on Polygon/Yahoo — DB + SEC only (API request path). */
  dbFirst?: boolean;
}) {
  const ticker = String(opts.ticker ?? "").trim().toUpperCase();
  if (!ticker) throw new Error("ticker_required");
  const dbFirst = Boolean(opts.dbFirst);

  const cached = await loadCompanyDbRow(ticker);

  let name: string | null = cached?.name ?? null;
  let industry: string | null = cached?.industry ?? null;
  let country: string | null = cached?.country ?? null;
  let earnings_date: string | null = cached?.earnings_date ?? null;

  if (!dbFirst || !name || !industry || !country) {
    const poly = await withTimeout(
      fetchPolygonTickerOverview(ticker, { rateLimit: !dbFirst }),
      dbFirst ? 2_500 : 4_000,
    );
    if (poly) {
      name = poly.name ? String(poly.name) : name;
      industry = industryFromPolygon(poly) ?? industry;
      country = inferCountryFromPolygon(poly) ?? country;
    }
  }

  let sharesOutstanding: number | null = null;
  try {
    const sec = opts.secBundle !== undefined ? opts.secBundle : await loadTickerSecBundle(ticker);
    if (sec) {
      sharesOutstanding = pickSharesOutstanding(sec.facts);
      if (!name && sec.title) name = String(sec.title);
    }
  } catch {
    // best-effort
  }

  const latestClose = dbFirst ? await getLatestCloseDbOnly(ticker) : await getLatestClose(ticker);
  const mcapNum =
    latestClose != null && sharesOutstanding != null ? Number(latestClose) * Number(sharesOutstanding) : null;
  let mcap =
    mcapNum != null && Number.isFinite(mcapNum)
      ? `${formatUsdCompact(mcapNum)} USD`
      : cached?.mcap != null
        ? String(cached.mcap)
        : null;

  if (!dbFirst || !earnings_date) {
    const polyEarn = await withTimeout(fetchPolygonBenzingaNextEarningsDate(ticker), dbFirst ? 900 : 4_000);
    if (polyEarn) earnings_date = polyEarn;
    if (!earnings_date && !dbFirst) {
      earnings_date = await fetchYahooNextEarningsDate(ticker);
    }
  }

  const shouldPersist =
    Boolean(name) &&
    (!dbFirst ||
      industry !== (cached?.industry ?? null) ||
      country !== (cached?.country ?? null) ||
      mcap !== (cached?.mcap != null ? String(cached.mcap) : null) ||
      earnings_date !== (cached?.earnings_date ?? null));

  if (shouldPersist) {
    try {
      const existing = await db.one<{ id: string }>(
        `SELECT id FROM companies WHERE upper(trim(ticker)) = $1 LIMIT 1`,
        [ticker],
      );
      if (existing?.id) {
        // Never rename into another row's unique name — only fill missing profile fields.
        await db.query(
          `
          UPDATE companies
          SET industry = COALESCE($2, industry),
              country = COALESCE($3, country),
              mcap = COALESCE($4, mcap),
              earnings_date = COALESCE($5::date, earnings_date),
              updated_at = now()
          WHERE id = $1
          `,
          [existing.id, industry, country, mcap, earnings_date],
        );
      } else {
        await db.query(
          `
          INSERT INTO companies (name, ticker, industry, country, mcap, earnings_date, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6::date, now())
          ON CONFLICT (name) DO UPDATE
            SET ticker = COALESCE(EXCLUDED.ticker, companies.ticker),
                industry = COALESCE(EXCLUDED.industry, companies.industry),
                country = COALESCE(EXCLUDED.country, companies.country),
                mcap = COALESCE(EXCLUDED.mcap, companies.mcap),
                earnings_date = COALESCE(EXCLUDED.earnings_date, companies.earnings_date),
                updated_at = now()
          `,
          [name, ticker, industry, country, mcap, earnings_date],
        );
      }
    } catch {
      // Cache write is best-effort — never fail the company panel on unique conflicts.
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

/** Best-effort cache when ingest learns a ticker's legal name (e.g. SEC submissions). */
export async function upsertCompanyNameForTicker(ticker: string, name: string) {
  const t = String(ticker ?? "").trim().toUpperCase();
  const n = String(name ?? "").trim();
  if (!t || !n || !isPlausibleCompanyDisplayName(n, t)) return;

  const existing = await db.one<{ id: string; name: string | null }>(
    `SELECT id, name FROM companies WHERE upper(trim(ticker)) = $1 LIMIT 1`,
    [t],
  );
  if (existing?.id) {
    const cur = String(existing.name ?? "").trim();
    const curIsTicker = !cur || cur.toUpperCase() === t;
    const curPoisoned = cur && !isPlausibleCompanyDisplayName(cur, t);
    if (curIsTicker || curPoisoned) {
      await db.query(`UPDATE companies SET name = $2, updated_at = now() WHERE id = $1`, [existing.id, n]);
    }
    return;
  }

  await db.query(
    `
    INSERT INTO companies (name, ticker, updated_at)
    VALUES ($1, $2, now())
    ON CONFLICT (name) DO UPDATE
      SET ticker = COALESCE(EXCLUDED.ticker, companies.ticker),
          updated_at = now()
    `,
    [n, t],
  );
}

/** Reset PTR worksheet blobs cached as company names; prefer SEC title when available. */
export async function repairPoisonedCompanyNames(): Promise<number> {
  const { getSecTickerTitleMap } = await import("./sec.js");
  const { resolveResearchFeedCompanyName } = await import("../research/feed-display.js");
  const rows = await db.query<{ id: string; ticker: string; name: string | null }>(
    `SELECT id, ticker, name FROM companies WHERE name IS NOT NULL AND trim(ticker) <> ''`,
  );
  const secTitles = await getSecTickerTitleMap();
  let repaired = 0;
  for (const row of rows) {
    const t = String(row.ticker ?? "").trim().toUpperCase();
    const cur = String(row.name ?? "").trim();
    if (!t || !cur) continue;
    const fix = resolveResearchFeedCompanyName(t, cur, secTitles.get(t) ?? null);
    if (fix === cur) continue;
    await db.query(`UPDATE companies SET name = $2, updated_at = now() WHERE id = $1`, [row.id, fix]);
    repaired++;
  }
  return repaired;
}

