/**
 * US equity market holidays — seeded NYSE calendar + Polygon refresh.
 * Polygon `/v1/marketstatus/upcoming` is forward-looking only; the seed covers
 * the viewed month (past + near future) so Labor Day etc. still render.
 */

export type MarketHolidayStatus = "closed" | "early-close";

export type MarketHoliday = {
  date: string;
  name: string;
  status: MarketHolidayStatus;
  source: "seed" | "polygon";
};

type HolidayCache = {
  at: number;
  byDate: Map<string, MarketHoliday>;
};

const REFRESH_MS = Math.max(
  60 * 60_000,
  Number(process.env.MARKET_HOLIDAYS_REFRESH_MS ?? 12 * 60 * 60_000) || 12 * 60 * 60_000,
);

let cache: HolidayCache | null = null;
let refreshInflight: Promise<void> | null = null;
let lastPolygonAt = 0;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, Math.max(0, ms)));
}

function isoDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): string {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const firstDow = first.getUTCDay();
  const delta = (weekday - firstDow + 7) % 7;
  const day = 1 + delta + (n - 1) * 7;
  return isoDate(year, month, day);
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): string {
  const last = new Date(Date.UTC(year, month, 0));
  const lastDow = last.getUTCDay();
  const delta = (lastDow - weekday + 7) % 7;
  return isoDate(year, month, last.getUTCDate() - delta);
}

/** Observed weekday for fixed-date holidays (Sat→Fri, Sun→Mon). */
function observedFixed(year: number, month: number, day: number): string {
  const dt = new Date(Date.UTC(year, month - 1, day));
  const dow = dt.getUTCDay();
  if (dow === 6) {
    const prev = new Date(dt);
    prev.setUTCDate(prev.getUTCDate() - 1);
    return isoDate(prev.getUTCFullYear(), prev.getUTCMonth() + 1, prev.getUTCDate());
  }
  if (dow === 0) {
    const next = new Date(dt);
    next.setUTCDate(next.getUTCDate() + 1);
    return isoDate(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
  }
  return isoDate(year, month, day);
}

/** Anonymous Gregorian algorithm → Easter Sunday (UTC). */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function goodFriday(year: number): string {
  const easter = easterSunday(year);
  easter.setUTCDate(easter.getUTCDate() - 2);
  return isoDate(easter.getUTCFullYear(), easter.getUTCMonth() + 1, easter.getUTCDate());
}

function thanksgiving(year: number): string {
  return nthWeekdayOfMonth(year, 11, 4, 4);
}

function seedYear(year: number): MarketHoliday[] {
  const out: MarketHoliday[] = [];
  const push = (date: string, name: string, status: MarketHolidayStatus = "closed") => {
    out.push({ date, name, status, source: "seed" });
  };

  push(observedFixed(year, 1, 1), "New Year's Day");
  push(nthWeekdayOfMonth(year, 1, 1, 3), "Martin Luther King Jr. Day");
  push(nthWeekdayOfMonth(year, 2, 1, 3), "Washington's Birthday");
  push(goodFriday(year), "Good Friday");
  push(lastWeekdayOfMonth(year, 5, 1), "Memorial Day");
  push(observedFixed(year, 6, 19), "Juneteenth National Independence Day");
  push(observedFixed(year, 7, 4), "Independence Day");
  push(nthWeekdayOfMonth(year, 9, 1, 1), "Labor Day");
  const tg = thanksgiving(year);
  push(tg, "Thanksgiving Day");
  push(observedFixed(year, 12, 25), "Christmas Day");

  // Common early closes (weekdays only).
  const jul3 = new Date(Date.UTC(year, 6, 3));
  if (jul3.getUTCDay() >= 1 && jul3.getUTCDay() <= 5) {
    push(isoDate(year, 7, 3), "Independence Day Eve", "early-close");
  }
  const tgDate = new Date(`${tg}T12:00:00Z`);
  const blackFri = new Date(tgDate);
  blackFri.setUTCDate(blackFri.getUTCDate() + 1);
  push(
    isoDate(blackFri.getUTCFullYear(), blackFri.getUTCMonth() + 1, blackFri.getUTCDate()),
    "Day after Thanksgiving",
    "early-close",
  );
  const eve = new Date(Date.UTC(year, 11, 24));
  if (eve.getUTCDay() >= 1 && eve.getUTCDay() <= 5) {
    push(isoDate(year, 12, 24), "Christmas Eve", "early-close");
  }

  return out;
}

function buildSeedMap(centerYear: number): Map<string, MarketHoliday> {
  const map = new Map<string, MarketHoliday>();
  for (const y of [centerYear - 1, centerYear, centerYear + 1, centerYear + 2]) {
    for (const h of seedYear(y)) {
      const prev = map.get(h.date);
      // Prefer closed over early-close if both somehow collide.
      if (!prev || (prev.status === "early-close" && h.status === "closed")) {
        map.set(h.date, h);
      }
    }
  }
  return map;
}

function normalizeStatus(raw: string): MarketHolidayStatus | null {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "closed") return "closed";
  if (s === "early-close" || s === "early_close" || s === "earlyclose") return "early-close";
  return null;
}

async function polygonRateLimit() {
  const minMs = Math.max(500, Number(process.env.POLYGON_MIN_INTERVAL_MS ?? 12_500));
  const now = Date.now();
  const wait = lastPolygonAt ? Math.max(0, minMs - (now - lastPolygonAt)) : 0;
  if (wait > 0) await sleep(wait);
  lastPolygonAt = Date.now();
}

async function fetchPolygonUpcoming(): Promise<MarketHoliday[]> {
  const apiKey = String(process.env.POLYGON_API_KEY ?? "").trim();
  if (!apiKey) return [];

  await polygonRateLimit();
  const url = `https://api.polygon.io/v1/marketstatus/upcoming?apiKey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`polygon_holidays_failed ${res.status} ${txt.slice(0, 160)}`);
  }
  const raw = (await res.json()) as unknown;
  const rows = Array.isArray(raw) ? raw : [];
  const byDate = new Map<string, MarketHoliday>();

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const exchange = String(r.exchange ?? "")
      .trim()
      .toUpperCase();
    // Prefer primary US equity venues; skip OTC duplicates.
    if (exchange && exchange !== "NYSE" && exchange !== "NASDAQ") continue;
    const date = String(r.date ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const status = normalizeStatus(String(r.status ?? ""));
    if (!status) continue;
    const name = String(r.name ?? "Market holiday").trim() || "Market holiday";
    const next: MarketHoliday = { date, name, status, source: "polygon" };
    const prev = byDate.get(date);
    if (!prev || (prev.status === "early-close" && status === "closed") || prev.source !== "polygon") {
      byDate.set(date, next);
    }
  }

  return [...byDate.values()];
}

function ensureSeedCache(): HolidayCache {
  if (cache) return cache;
  const year = new Date().getUTCFullYear();
  cache = { at: 0, byDate: buildSeedMap(year) };
  return cache;
}

async function refreshFromPolygon(): Promise<void> {
  if (refreshInflight) return refreshInflight;
  refreshInflight = (async () => {
    try {
      const rows = await fetchPolygonUpcoming();
      const base = ensureSeedCache();
      for (const h of rows) {
        base.byDate.set(h.date, h);
      }
      base.at = Date.now();
      cache = base;
      if (rows.length) {
        console.log(`[market-holidays] polygon_refreshed n=${rows.length}`);
      }
    } catch (e) {
      console.warn("[market-holidays] polygon_refresh_failed", e instanceof Error ? e.message : e);
      ensureSeedCache();
    } finally {
      refreshInflight = null;
    }
  })();
  return refreshInflight;
}

/** Holidays for a calendar month (YYYY-MM days). Triggers background Polygon refresh when stale. */
export async function getMarketHolidaysForMonth(year: number, month: number): Promise<MarketHoliday[]> {
  const base = ensureSeedCache();
  if (Date.now() - base.at >= REFRESH_MS) {
    void refreshFromPolygon();
  } else if (![...base.byDate.values()].some((h) => h.source === "polygon")) {
    // First boot: kick a refresh without blocking the response.
    void refreshFromPolygon();
  }

  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  return [...base.byDate.values()]
    .filter((h) => h.date.startsWith(prefix))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Warm Polygon holidays once workers/API start (non-blocking). */
export function prefetchMarketHolidays(): void {
  void refreshFromPolygon();
}
