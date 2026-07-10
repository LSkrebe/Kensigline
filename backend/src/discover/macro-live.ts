import type { DiscoverMacroDay, DiscoverMacroEvent, MacroImpact } from "./macro.js";

const YAHOO_VISUALIZATION_URL = "https://query1.finance.yahoo.com/v1/finance/visualization";
const YAHOO_USER_AGENT = "Mozilla/5.0 (compatible; Kensigline/1.0)";

/** Eurozone + major EU economies shown under the EU region chip. */
const EU_COUNTRY_CODES = new Set([
  "AT",
  "BE",
  "CY",
  "DE",
  "EE",
  "ES",
  "EU",
  "FI",
  "FR",
  "GR",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PT",
  "SI",
  "SK",
]);

type YahooEconomicRow = {
  title: string;
  country: string;
  startAt: string;
};

type MacroLiveCache = {
  at: number;
  from: string;
  to: string;
  rows: YahooEconomicRow[];
};

type YahooAuth = { cookie: string; crumb: string };

let liveCache: MacroLiveCache | null = null;
let yahooAuth: YahooAuth | null = null;
let yahooAuthAt = 0;
let lastYahooAt = 0;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function yahooRateLimit() {
  const minMs = Math.max(150, Number(process.env.YAHOO_MIN_INTERVAL_MS ?? 500));
  const now = Date.now();
  const wait = lastYahooAt ? Math.max(0, minMs - (now - lastYahooAt)) : 0;
  if (wait > 0) await sleep(wait);
  lastYahooAt = Date.now();
}

function collectSetCookies(res: Response, jar: string[]) {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  const cookies = headers.getSetCookie?.() ?? [];
  for (const raw of cookies) {
    const pair = String(raw).split(";")[0]?.trim();
    if (pair) jar.push(pair);
  }
}

async function getYahooAuth(): Promise<YahooAuth> {
  const ttl = Math.max(60_000, Number(process.env.MACRO_CALENDAR_YAHOO_AUTH_MS ?? 1_800_000));
  if (yahooAuth && Date.now() - yahooAuthAt < ttl) return yahooAuth;

  await yahooRateLimit();
  const jar: string[] = [];
  const boot = await fetch("https://fc.yahoo.com", {
    headers: { "User-Agent": YAHOO_USER_AGENT },
  });
  collectSetCookies(boot, jar);

  await yahooRateLimit();
  const cookie = jar.join("; ");
  const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "User-Agent": YAHOO_USER_AGENT, Cookie: cookie },
  });
  collectSetCookies(crumbRes, jar);
  const crumb = (await crumbRes.text()).trim();
  if (!crumb || crumb.includes(" ")) throw new Error("yahoo_crumb_failed");

  yahooAuth = { cookie: jar.join("; "), crumb };
  yahooAuthAt = Date.now();
  return yahooAuth;
}

function isoLocalDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isWeekday(d: Date) {
  const day = d.getDay();
  return day >= 1 && day <= 5;
}

function addCalendarDays(d: Date, n: number) {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function nextBusinessDays(limit: number) {
  const out: string[] = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  while (!isWeekday(cursor)) {
    cursor.setDate(cursor.getDate() + 1);
  }

  while (out.length < limit) {
    if (isWeekday(cursor)) out.push(isoLocalDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return out;
}

function mapCountryToRegion(country: string): DiscoverMacroEvent["region"] | null {
  const code = String(country ?? "").trim().toUpperCase();
  if (!code) return null;
  if (code === "US") return "US";
  if (code === "GB" || code === "UK") return "UK";
  if (code === "CN") return "CN";
  if (EU_COUNTRY_CODES.has(code)) return "EU";
  return null;
}

function inferImpact(title: string): MacroImpact {
  const t = String(title ?? "").toLowerCase();
  if (
    /\b(fomc|fed funds|interest rate|rate decision|cpi|pce|nfp|nonfarm|non-farm|payroll|gdp|unemployment rate|ecb|boe|pboc|inflation rate)\b/.test(
      t,
    )
  ) {
    return "high";
  }
  if (
    /\b(retail sales|durable goods|ppi|pmi|jobless|claims|consumer confidence|trade balance|industrial production|housing starts)\b/.test(
      t,
    )
  ) {
    return "medium";
  }
  return "low";
}

function impactRank(impact: MacroImpact) {
  if (impact === "high") return 3;
  if (impact === "medium") return 2;
  return 1;
}

function etParts(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(d)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const year = parts.year;
  const month = parts.month;
  const day = parts.day;
  const hour = parts.hour;
  const minute = parts.minute;
  if (!year || !month || !day || hour == null || minute == null) return null;
  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`,
  };
}

function slugify(text: string) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function parseYahooRows(doc: {
  columns?: Array<{ id?: string }>;
  rows?: unknown[];
}): YahooEconomicRow[] {
  const cols = (doc.columns ?? []).map((c) => String(c.id ?? ""));
  const iTitle = cols.indexOf("econ_release");
  const iCountry = cols.indexOf("country_code");
  const iTime = cols.indexOf("startdatetime");
  if (iTitle < 0 || iCountry < 0 || iTime < 0) return [];

  const out: YahooEconomicRow[] = [];
  for (const row of doc.rows ?? []) {
    if (!Array.isArray(row)) continue;
    const title = String(row[iTitle] ?? "").trim();
    const country = String(row[iCountry] ?? "").trim();
    const startAt = String(row[iTime] ?? "").trim();
    if (!title || !country || !startAt) continue;
    out.push({ title, country, startAt });
  }
  return out;
}

async function fetchYahooEconomicCalendar(from: string, to: string) {
  const cacheMs = Math.max(60_000, Number(process.env.MACRO_CALENDAR_CACHE_MS ?? 3_600_000));
  const now = Date.now();
  if (liveCache && liveCache.from === from && liveCache.to === to && now - liveCache.at < cacheMs) {
    return liveCache.rows;
  }

  const maxPages = Math.max(1, Math.min(10, Number(process.env.MACRO_CALENDAR_YAHOO_MAX_PAGES ?? 4)));
  const auth = await getYahooAuth();
  const rows: YahooEconomicRow[] = [];

  for (let page = 0; page < maxPages; page++) {
    await yahooRateLimit();
    const url = new URL(YAHOO_VISUALIZATION_URL);
    url.searchParams.set("lang", "en-US");
    url.searchParams.set("region", "US");
    url.searchParams.set("crumb", auth.crumb);

    const body = {
      sortType: "ASC",
      entityIdType: "economic_event",
      sortField: "startdatetime",
      includeFields: [
        "econ_release",
        "country_code",
        "startdatetime",
        "consensus_estimate",
        "prior_release_actual",
      ],
      size: 100,
      offset: page * 100,
      query: {
        operator: "AND",
        operands: [
          { operator: "GTE", operands: ["startdatetime", from] },
          { operator: "LTE", operands: ["startdatetime", to] },
        ],
      },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": YAHOO_USER_AGENT,
        Cookie: auth.cookie,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`yahoo_http_${res.status}: ${text.slice(0, 200)}`);

    let json: unknown;
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      throw new Error("yahoo_invalid_response");
    }

    const err = (json as { finance?: { error?: unknown } })?.finance?.error;
    if (err) throw new Error(`yahoo_api_error: ${JSON.stringify(err).slice(0, 200)}`);

    const doc = (json as { finance?: { result?: Array<{ documents?: unknown[] }> } })?.finance?.result?.[0]
      ?.documents?.[0];
    const pageRows = parseYahooRows((doc ?? {}) as { columns?: Array<{ id?: string }>; rows?: unknown[] });
    rows.push(...pageRows);
    if (pageRows.length < 100) break;
  }

  liveCache = { at: now, from, to, rows };
  return rows;
}

function rowsToMacroDays(rows: YahooEconomicRow[], businessDays: string[]): DiscoverMacroDay[] {
  const maxPerDay = Math.max(4, Math.min(24, Number(process.env.MACRO_CALENDAR_MAX_EVENTS_PER_DAY ?? 12)));
  const daySet = new Set(businessDays);
  const byDay = new Map<string, DiscoverMacroEvent[]>();

  for (const row of rows) {
    const region = mapCountryToRegion(row.country);
    if (!region) continue;

    const when = etParts(row.startAt);
    if (!when || !daySet.has(when.date)) continue;

    const impact = inferImpact(row.title);
    const list = byDay.get(when.date) ?? [];
    list.push({
      id: `${when.date}-${row.country.toLowerCase()}-${slugify(row.title)}-${list.length}`,
      time: when.time,
      title: row.title,
      region,
      impact,
    });
    byDay.set(when.date, list);
  }

  return businessDays.map((date) => {
    const events = (byDay.get(date) ?? [])
      .sort((a, b) => {
        const ir = impactRank(b.impact) - impactRank(a.impact);
        if (ir !== 0) return ir;
        return String(a.time).localeCompare(String(b.time));
      })
      .slice(0, maxPerDay);
    return { date, events };
  });
}

function allDaysInMonth(year: number, month: number): string[] {
  const last = new Date(year, month, 0).getDate();
  const out: string[] = [];
  for (let d = 1; d <= last; d++) {
    out.push(isoLocalDate(new Date(year, month - 1, d)));
  }
  return out;
}

/** Live macro week from Yahoo Finance economic-events calendar (no API key). */
export async function loadLiveMacroDays(limit: number): Promise<DiscoverMacroDay[]> {
  const businessDays = nextBusinessDays(limit);
  if (!businessDays.length) return [];

  const from = businessDays[0]!;
  const to = isoLocalDate(addCalendarDays(new Date(`${from}T12:00:00`), Math.max(7, limit * 3)));
  const rows = await fetchYahooEconomicCalendar(from, to);
  return rowsToMacroDays(rows, businessDays);
}

/** Full calendar month from Yahoo (all days incl. weekends; empty cells when quiet). */
export async function loadLiveMacroMonth(year: number, month: number): Promise<DiscoverMacroDay[]> {
  const days = allDaysInMonth(year, month);
  if (!days.length) return [];

  const from = days[0]!;
  const to = days[days.length - 1]!;
  const rows = await fetchYahooEconomicCalendar(from, to);
  return rowsToMacroDays(rows, days);
}
