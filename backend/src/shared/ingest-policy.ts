/**
 * Shared ingest/backfill policy — shallow historical depth, live-first priorities.
 */

function envInt(key: string, fallback: number, min: number, max: number): number {
  const n = Number(process.env[key] ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

/** How far back idle SEC daily index backfill may walk (days). Default 120 ≈ 4 months. */
export function backfillMaxAgeDays(): number {
  return envInt("BACKFILL_MAX_AGE_DAYS", 120, 30, 365);
}

function parseIsoDateUtc(raw: string): Date | null {
  const s = String(raw ?? "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Earliest UTC calendar day SEC daily backfill will process (rolling floor wins over ancient min date). */
export function effectiveBackfillMinDate(): Date {
  const rolling = new Date();
  rolling.setUTCHours(0, 0, 0, 0);
  rolling.setUTCDate(rolling.getUTCDate() - backfillMaxAgeDays());

  const configured = parseIsoDateUtc(String(process.env.BACKFILL_MIN_DATE ?? "2012-01-01").trim());
  if (!configured) return rolling;
  return configured.getTime() > rolling.getTime() ? configured : rolling;
}

/** Max filings enqueued per form per backfill day (was 800 — too bursty). */
export function backfillSecLimitPerForm(): number {
  return envInt("BACKFILL_SEC_LIMIT_PER_DAY", 200, 20, 2000);
}

/** Queue priorities at or below this are treated as idle backfill (not live). */
export const BACKFILL_PRIORITY_MAX = 2;

export function isBackfillPriority(priority: number): boolean {
  return Number(priority) <= BACKFILL_PRIORITY_MAX;
}

/** When false (default), research SEC backfill uses reuse-only or a minimal stub — no LLM. */
export function backfillLlmEnabled(): boolean {
  return String(process.env.BACKFILL_LLM_ENABLED ?? "0").trim() === "1";
}

/** Live politician Senate PTR lookback (days). */
export function politiciansLiveSenateLookbackDays(): number {
  return envInt("POLITICIANS_SENATE_LOOKBACK_DAYS", 90, 14, 365);
}

/** Senate PTR backfill window size (days per step). */
export function politiciansBackfillSenateWindowDays(): number {
  return envInt("BACKFILL_SENATE_WINDOW_DAYS", 60, 14, 120);
}
