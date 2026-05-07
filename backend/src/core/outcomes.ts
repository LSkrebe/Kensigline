import { db } from "./db.js";
import { getDailyCloseBars } from "./bars.js";

type Horizon = 21 | 63 | 252;

function isoDayUTC(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function addDaysUtc(d: Date, n: number) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

function mean(xs: number[]) {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function median(xs: number[]) {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid]! : (a[mid - 1]! + a[mid]!) / 2;
}

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

function fmtRet(r: number | null) {
  if (r == null || !Number.isFinite(r)) return "—";
  const sign = r >= 0 ? "+" : "";
  return `${sign}${pct(r)}`;
}

function clampInt(n: unknown, min: number, max: number, fallback: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

async function ensureBarsForEventWindows(ticker: string, eventDays: string[], maxH: Horizon) {
  if (!eventDays.length) return;
  // Backfill from earliest event day to +~(maxH trading days) buffer in calendar days.
  // 252 trading days ~ 365 calendar days; add slack.
  const daysSorted = [...eventDays].sort();
  const minDay = daysSorted[0]!;
  const maxDay = daysSorted[daysSorted.length - 1]!;
  const from = new Date(`${minDay}T00:00:00Z`);
  const to = addDaysUtc(new Date(`${maxDay}T00:00:00Z`), maxH === 252 ? 420 : maxH === 63 ? 120 : 60);
  await getDailyCloseBars({ ticker, fromDay: isoDayUTC(from), toDay: isoDayUTC(to) });
}

async function loadBarsMap(ticker: string) {
  const rows = await db.query<{ day: string; close: number }>(
    `
    SELECT day::text as day, close
    FROM bars
    WHERE ticker = $1
    ORDER BY day ASC
    `,
    [ticker],
  );
  const days: string[] = [];
  const closes: number[] = [];
  const idx = new Map<string, number>();
  for (const r of rows) {
    const d = String(r.day);
    const c = Number(r.close);
    if (!d || !Number.isFinite(c)) continue;
    idx.set(d, days.length);
    days.push(d);
    closes.push(c);
  }
  return { days, closes, idx };
}

function nextTradingIndex(days: string[], eventDay: string) {
  // Find first day >= eventDay (bars only include trading days).
  // days is sorted asc.
  let lo = 0;
  let hi = days.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const d = days[mid]!;
    if (d >= eventDay) {
      ans = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return ans;
}

function computeForwardReturn(closes: number[], baseIdx: number, horizon: Horizon) {
  const j = baseIdx + horizon;
  if (baseIdx < 0 || j >= closes.length) return null;
  const c0 = closes[baseIdx]!;
  const c1 = closes[j]!;
  if (!Number.isFinite(c0) || !Number.isFinite(c1) || c0 <= 0) return null;
  return c1 / c0 - 1;
}

async function getOrCreateGlobalCompanyId() {
  const existing = await db.one<{ id: string }>(`SELECT id FROM companies WHERE name = '__GLOBAL__' LIMIT 1`);
  if (existing?.id) return existing.id;
  const inserted = await db.one<{ id: string }>(
    `
    INSERT INTO companies (name, updated_at)
    VALUES ('__GLOBAL__', now())
    RETURNING id
    `,
  );
  if (!inserted?.id) throw new Error("global_company_create_failed");
  return inserted.id;
}

export async function recomputeInsiderOutcomes(opts?: { lookbackDays?: number; maxTickers?: number }) {
  const lookbackDays = clampInt(opts?.lookbackDays, 30, 730, 365);
  const maxTickers = clampInt(opts?.maxTickers, 10, 5000, 500);
  const asOf = isoDayUTC(new Date());

  // Build universe: tickers that have insider docs in the last N days.
  const tickers = await db.query<{ ticker: string }>(
    `
    SELECT DISTINCT ticker
    FROM document_parsed
    WHERE feed_kind = 'insider'
      AND ticker IS NOT NULL
      AND feed_at IS NOT NULL
      AND feed_at >= now() - ($1 || ' days')::interval
    ORDER BY ticker ASC
    LIMIT $2
    `,
    [String(lookbackDays), maxTickers],
  );

  const r21: number[] = [];
  const r63: number[] = [];
  const r252: number[] = [];

  let samples = 0;

  for (const t0 of tickers) {
    const ticker = String(t0.ticker ?? "").trim().toUpperCase();
    if (!ticker) continue;

    const events = await db.query<{ day: string }>(
      `
      SELECT DISTINCT date_trunc('day', feed_at)::date::text as day
      FROM document_parsed
      WHERE feed_kind='insider'
        AND ticker = $1
        AND feed_at IS NOT NULL
        AND feed_at >= now() - ($2 || ' days')::interval
      ORDER BY day ASC
      `,
      [ticker, String(lookbackDays)],
    );
    const eventDays = events.map((e) => String(e.day)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    if (!eventDays.length) continue;

    await ensureBarsForEventWindows(ticker, eventDays, 252);
    const bars = await loadBarsMap(ticker);
    if (bars.days.length < 260) continue;

    for (const day of eventDays) {
      const baseIdx = nextTradingIndex(bars.days, day);
      if (baseIdx < 0) continue;

      const a = computeForwardReturn(bars.closes, baseIdx, 21);
      const b = computeForwardReturn(bars.closes, baseIdx, 63);
      const c = computeForwardReturn(bars.closes, baseIdx, 252);
      if (a == null || b == null || c == null) continue;

      r21.push(a);
      r63.push(b);
      r252.push(c);
      samples += 1;
    }
  }

  const avg21 = mean(r21);
  const avg63 = mean(r63);
  const avg252 = mean(r252);
  const med21 = median(r21);
  const winRate21 = r21.length ? r21.filter((x) => x > 0).length / r21.length : null;

  const data = {
    mode: "insider",
    as_of_date: asOf,
    avgReturn21: avg21,
    avgReturn63: avg63,
    avgReturn252: avg252,
    winRate21,
    avgReturn21d63d252d: `${fmtRet(avg21)} / ${fmtRet(avg63)} / ${fmtRet(avg252)}`,
    medianReturn: fmtRet(med21),
    winRate: winRate21 == null ? "—" : pct(winRate21),
    sampleSize: String(samples),
    // Conditioning will come later; keep stable fields for the panel.
    conditioningRole: "—",
    conditioningTxn: "Buy (P)",
    conditioningSizePct: "—",
  };

  const globalCompanyId = await getOrCreateGlobalCompanyId();
  await db.query(
    `
    INSERT INTO outcomes (company_id, mode, as_of_date, data)
    VALUES ($1, $2, $3::date, $4::jsonb)
    ON CONFLICT (company_id, mode, as_of_date)
    DO UPDATE SET data = EXCLUDED.data, created_at = now()
    `,
    [globalCompanyId, "insider", asOf, data],
  );

  return { ok: true, as_of_date: asOf, samples };
}

export async function getLatestOutcomes(mode: string) {
  const m = String(mode ?? "").trim().toLowerCase();
  if (m !== "insider" && m !== "pharma" && m !== "politicians" && m !== "bosha") throw new Error("mode_not_supported_yet");
  const globalCompanyId = await getOrCreateGlobalCompanyId();
  const row = await db.one<{ as_of_date: string; data: any }>(
    `
    SELECT as_of_date::text as as_of_date, data
    FROM outcomes
    WHERE company_id = $1 AND mode = $2
    ORDER BY as_of_date DESC
    LIMIT 1
    `,
    [globalCompanyId, m],
  );
  return row ?? null;
}

export async function recomputePharmaOutcomes(opts?: { lookbackDays?: number; maxTickers?: number }) {
  const lookbackDays = clampInt(opts?.lookbackDays, 30, 730, 365);
  const maxTickers = clampInt(opts?.maxTickers, 10, 5000, 500);
  const asOf = isoDayUTC(new Date());

  const events = await db.query<{ ticker: string; day: string; program_phase: string | null; data: any }>(
    `
    SELECT ticker,
           date_trunc('day', feed_at)::date::text as day,
           program_phase,
           data
    FROM document_parsed
    WHERE feed_kind='pharma'
      AND ticker IS NOT NULL
      AND feed_at IS NOT NULL
      AND feed_at >= now() - ($1 || ' days')::interval
    ORDER BY feed_at DESC
    LIMIT 5000
    `,
    [String(lookbackDays)],
  );

  const byTicker = new Map<string, Array<{ day: string; phase: string | null; eventType: string }>>();
  for (const e of events) {
    const t = String(e.ticker ?? "").trim().toUpperCase();
    if (!t) continue;
    const eventType = String(e.data?.event_type ?? e.data?.eventType ?? "").trim().toUpperCase();
    const phase = e.program_phase ? String(e.program_phase) : null;
    const day = String(e.day ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const arr = byTicker.get(t) ?? [];
    arr.push({ day, phase, eventType });
    byTicker.set(t, arr);
  }

  const ph2: number[] = [];
  const ph3: number[] = [];
  const all21: number[] = [];

  for (const [ticker, evs] of byTicker.entries()) {
    const days = evs.map((e) => e.day);
    await ensureBarsForEventWindows(ticker, days, 63);
    const bars = await loadBarsMap(ticker);
    if (bars.days.length < 80) continue;

    for (const ev of evs) {
      const baseIdx = nextTradingIndex(bars.days, ev.day);
      if (baseIdx < 0) continue;
      const r21 = computeForwardReturn(bars.closes, baseIdx, 21);
      if (r21 == null) continue;
      all21.push(r21);
      const p = String(ev.phase ?? "").toUpperCase();
      const isResult = ev.eventType === "RESULT" || ev.eventType === "READOUT" || ev.eventType === "ENDPOINT MISS";
      if (isResult && p.includes("III")) ph3.push(r21);
      if (isResult && (p.includes("II") || p.includes("I/II") || p.includes("II/III"))) ph2.push(r21);
    }
  }

  const avgPh3 = mean(ph3);
  const avgPh2 = mean(ph2);
  const med = median(all21);
  const largeDrops = all21.length ? all21.filter((x) => x <= -0.3).length / all21.length : null;
  const avg21 = mean(all21);
  const winRate21 = all21.length ? all21.filter((x) => x > 0).length / all21.length : null;

  const data = {
    mode: "pharma",
    as_of_date: asOf,
    avgReturn21: avg21,
    winRate21,
    avgAfterPh3Failure: fmtRet(avgPh3),
    avgAfterPh2Miss: fmtRet(avgPh2),
    medianReturn: fmtRet(med),
    pctLargeDropsOver30: largeDrops == null ? "—" : pct(largeDrops),
    sampleSize: String(all21.length),
    conditioningIndication: "—",
    conditioningCoSize: "—",
  };

  const globalCompanyId = await getOrCreateGlobalCompanyId();
  await db.query(
    `
    INSERT INTO outcomes (company_id, mode, as_of_date, data)
    VALUES ($1, $2, $3::date, $4::jsonb)
    ON CONFLICT (company_id, mode, as_of_date)
    DO UPDATE SET data = EXCLUDED.data, created_at = now()
    `,
    [globalCompanyId, "pharma", asOf, data],
  );

  return { ok: true, as_of_date: asOf, samples: all21.length };
}

export async function recomputePoliticiansOutcomes(opts?: { lookbackDays?: number; maxTickers?: number }) {
  const lookbackDays = clampInt(opts?.lookbackDays, 30, 730, 365);
  const maxTickers = clampInt(opts?.maxTickers, 10, 5000, 500);
  const asOf = isoDayUTC(new Date());

  const tickers = await db.query<{ ticker: string }>(
    `
    SELECT DISTINCT ticker
    FROM document_parsed
    WHERE feed_kind = 'politicians'
      AND ticker IS NOT NULL
      AND feed_at IS NOT NULL
      AND feed_at >= now() - ($1 || ' days')::interval
    ORDER BY ticker ASC
    LIMIT $2
    `,
    [String(lookbackDays), maxTickers],
  );

  const r21: number[] = [];
  const r63: number[] = [];
  const r252: number[] = [];
  let samples = 0;

  for (const t0 of tickers) {
    const ticker = String(t0.ticker ?? "").trim().toUpperCase();
    if (!ticker) continue;

    const events = await db.query<{ day: string }>(
      `
      SELECT DISTINCT date_trunc('day', feed_at)::date::text as day
      FROM document_parsed
      WHERE feed_kind='politicians'
        AND ticker = $1
        AND feed_at IS NOT NULL
        AND feed_at >= now() - ($2 || ' days')::interval
      ORDER BY day ASC
      `,
      [ticker, String(lookbackDays)],
    );
    const eventDays = events.map((e) => String(e.day)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    if (!eventDays.length) continue;

    await ensureBarsForEventWindows(ticker, eventDays, 252);
    const bars = await loadBarsMap(ticker);
    if (bars.days.length < 260) continue;

    for (const day of eventDays) {
      const baseIdx = nextTradingIndex(bars.days, day);
      if (baseIdx < 0) continue;
      const a = computeForwardReturn(bars.closes, baseIdx, 21);
      const b = computeForwardReturn(bars.closes, baseIdx, 63);
      const c = computeForwardReturn(bars.closes, baseIdx, 252);
      if (a == null || b == null || c == null) continue;
      r21.push(a);
      r63.push(b);
      r252.push(c);
      samples += 1;
    }
  }

  const avg21 = mean(r21);
  const avg63 = mean(r63);
  const avg252 = mean(r252);
  const med21 = median(r21);
  const winRate21 = r21.length ? r21.filter((x) => x > 0).length / r21.length : null;

  const data = {
    mode: "politicians",
    as_of_date: asOf,
    avgReturn21: avg21,
    avgReturn63: avg63,
    avgReturn252: avg252,
    winRate21,
    avgReturn21d63d252d: `${fmtRet(avg21)} / ${fmtRet(avg63)} / ${fmtRet(avg252)}`,
    medianReturn: fmtRet(med21),
    winRate: winRate21 == null ? "—" : pct(winRate21),
    sampleSize: String(samples),
    conditioningPolitician: "—",
    conditioningTxn: "—",
  };

  const globalCompanyId = await getOrCreateGlobalCompanyId();
  await db.query(
    `
    INSERT INTO outcomes (company_id, mode, as_of_date, data)
    VALUES ($1, $2, $3::date, $4::jsonb)
    ON CONFLICT (company_id, mode, as_of_date)
    DO UPDATE SET data = EXCLUDED.data, created_at = now()
    `,
    [globalCompanyId, "politicians", asOf, data],
  );

  return { ok: true, as_of_date: asOf, samples };
}

export async function recomputeBoshaOutcomes(opts?: { lookbackDays?: number; maxTickers?: number }) {
  const lookbackDays = clampInt(opts?.lookbackDays, 30, 730, 365);
  const maxTickers = clampInt(opts?.maxTickers, 10, 5000, 500);
  const asOf = isoDayUTC(new Date());

  const tickers = await db.query<{ ticker: string }>(
    `
    SELECT DISTINCT ticker
    FROM bosha_events
    WHERE ticker IS NOT NULL
      AND created_at >= now() - ($1 || ' days')::interval
    ORDER BY ticker ASC
    LIMIT $2
    `,
    [String(lookbackDays), maxTickers],
  );

  const r21: number[] = [];
  const r63: number[] = [];
  const r252: number[] = [];
  let samples = 0;

  for (const t0 of tickers) {
    const ticker = String(t0.ticker ?? "").trim().toUpperCase();
    if (!ticker) continue;

    const events = await db.query<{ day: string }>(
      `
      SELECT DISTINCT date_trunc('day', COALESCE(event_at, created_at))::date::text as day
      FROM bosha_events
      WHERE ticker = $1
        AND created_at >= now() - ($2 || ' days')::interval
      ORDER BY day ASC
      `,
      [ticker, String(lookbackDays)],
    );
    const eventDays = events.map((e) => String(e.day)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    if (!eventDays.length) continue;

    await ensureBarsForEventWindows(ticker, eventDays, 252);
    const bars = await loadBarsMap(ticker);
    if (bars.days.length < 260) continue;

    for (const day of eventDays) {
      const baseIdx = nextTradingIndex(bars.days, day);
      if (baseIdx < 0) continue;
      const a = computeForwardReturn(bars.closes, baseIdx, 21);
      const b = computeForwardReturn(bars.closes, baseIdx, 63);
      const c = computeForwardReturn(bars.closes, baseIdx, 252);
      if (a == null || b == null || c == null) continue;
      r21.push(a);
      r63.push(b);
      r252.push(c);
      samples += 1;
    }
  }

  const avg21 = mean(r21);
  const avg63 = mean(r63);
  const avg252 = mean(r252);
  const med21 = median(r21);
  const winRate21 = r21.length ? r21.filter((x) => x > 0).length / r21.length : null;

  const data = {
    mode: "bosha",
    as_of_date: asOf,
    avgReturn21: avg21,
    avgReturn63: avg63,
    avgReturn252: avg252,
    winRate21,
    avgReturn21d63d252d: `${fmtRet(avg21)} / ${fmtRet(avg63)} / ${fmtRet(avg252)}`,
    medianReturn: fmtRet(med21),
    winRate: winRate21 == null ? "—" : pct(winRate21),
    sampleSize: String(samples),
  };

  const globalCompanyId = await getOrCreateGlobalCompanyId();
  await db.query(
    `
    INSERT INTO outcomes (company_id, mode, as_of_date, data)
    VALUES ($1, $2, $3::date, $4::jsonb)
    ON CONFLICT (company_id, mode, as_of_date)
    DO UPDATE SET data = EXCLUDED.data, created_at = now()
    `,
    [globalCompanyId, "bosha", asOf, data],
  );

  return { ok: true, as_of_date: asOf, samples };
}

