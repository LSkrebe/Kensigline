/**
 * Shared ingest/backfill policy — shallow historical depth, live-first priorities.
 */

function envInt(key: string, fallback: number, min: number, max: number): number {
  const n = Number(process.env[key] ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

/**
 * How far back idle backfill may walk (days).
 * Default 365 for light catch-up; raise toward BACKFILL_MIN_DATE (e.g. 5475 ≈ 15y)
 * for curated full-history runs. Hard ceiling ~20y so env typos cannot unbounded-walk.
 */
export function backfillMaxAgeDays(): number {
  return envInt("BACKFILL_MAX_AGE_DAYS", 365, 7, 7300);
}

function parseIsoDateUtc(raw: string): Date | null {
  const s = String(raw ?? "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Earliest UTC calendar day backfill will process (rolling window ∩ BACKFILL_MIN_DATE floor). */
export function effectiveBackfillMinDate(): Date {
  const rolling = new Date();
  rolling.setUTCHours(0, 0, 0, 0);
  const mode = String(process.env.INGEST_MODE ?? "").trim().toLowerCase();
  const ageDays = mode === "live" ? envInt("LIVE_GAP_FILL_DAYS", 14, 3, 30) : backfillMaxAgeDays();
  rolling.setUTCDate(rolling.getUTCDate() - ageDays);

  const configured = parseIsoDateUtc(String(process.env.BACKFILL_MIN_DATE ?? "2012-01-01").trim());
  if (!configured) return rolling;
  // Stop at the more recent bound — never older than the rolling window.
  return configured.getTime() > rolling.getTime() ? configured : rolling;
}

/** True when a filing/event timestamp is outside the retention/backfill window. */
export function isOlderThanRetentionWindow(iso: string | Date | null | undefined): boolean {
  if (iso == null) return false;
  const d = iso instanceof Date ? iso : new Date(String(iso));
  if (Number.isNaN(d.getTime())) return false;
  // Discovery's short live gap-fill window is not a retention rule. Delayed disclosures
  // and deliberately requeued historical filings still belong in the two-year archive.
  const floor=new Date();floor.setUTCHours(0,0,0,0);
  floor.setUTCDate(floor.getUTCDate()-envInt('DISCLOSURE_RETENTION_DAYS',730,365,3650));
  return d.getTime() < floor.getTime();
}

/** Parse queue tiers (higher = parsed first). Live ingest always beats idle backfill. */
export const QUEUE_PRIORITY_LIVE_EARNINGS = 5;
export const QUEUE_PRIORITY_LIVE_SEC = 4;
export const QUEUE_PRIORITY_LIVE_RSS = 3;
/** Backfill rows that may still need structured LLM when BACKFILL_LLM_ENABLED=1. */
export const QUEUE_PRIORITY_BACKFILL_STRUCTURED = 2;
/** Template-only historical index for paper panel. */
export const QUEUE_PRIORITY_BACKFILL_INDEX = 1;

/** Max *new* filings enqueued per form per backfill day. 0 = unlimited (full day, no holes). */
export function backfillSecLimitPerForm(): number {
  return envInt("BACKFILL_SEC_LIMIT_PER_DAY", 0, 0, 50_000);
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

/**
 * Master switch for live research structured LLM (Analyse business_drivers).
 * Default off — template + near-dup reuse only. Set RESEARCH_STRUCTURED_LLM=1 to allow
 * last-resort LLM on 10-Q/10-K/transcripts (still gated by form + reuse).
 */
export function researchStructuredLlmEnabled(): boolean {
  return String(process.env.RESEARCH_STRUCTURED_LLM ?? "0").trim() === "1";
}

/** Live politician Senate PTR lookback (days). */
export function politiciansLiveSenateLookbackDays(): number {
  return envInt("POLITICIANS_SENATE_LOOKBACK_DAYS", 90, 14, 365);
}

/** Live OGE Form 278-T lookback (days) — Level I/II + Trump downloadable PDFs. */
export function politiciansLiveOgeLookbackDays(): number {
  return envInt("POLITICIANS_OGE_LOOKBACK_DAYS", 90, 14, 365);
}

/** Senate PTR backfill window size (days per step). */
export function politiciansBackfillSenateWindowDays(): number {
  return envInt("BACKFILL_SENATE_WINDOW_DAYS", 60, 14, 120);
}

const DEFAULT_STRUCTURED_LLM_SEC_FORMS = new Set(["10-Q", "10-K"]);

function structuredLlmSecForms(): Set<string> {
  const raw = String(process.env.STRUCTURED_LLM_SEC_FORMS ?? "10-Q,10-K")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  return raw.length ? new Set(raw) : DEFAULT_STRUCTURED_LLM_SEC_FORMS;
}

/** Live SEC forms that get structured LLM (drivers / dates) — not display summaries. */
export function secFormNeedsStructuredLlm(formType: string): boolean {
  const f = String(formType ?? "").trim().toUpperCase().replace(/\/A$/, "");
  return structuredLlmSecForms().has(f);
}

/** Whether research ingest should call LLM for structured fields (not prose summaries). */
export function needsStructuredResearchLlm(args: {
  sourceType: string;
  secForm?: string | null;
  priority: number;
}): boolean {
  // Opt-in only — default is zero research LLM spend.
  if (!researchStructuredLlmEnabled()) return false;
  if (isBackfillPriority(args.priority) && !backfillLlmEnabled()) return false;

  const st = String(args.sourceType ?? "").toLowerCase();
  if (st === "research_transcript_rss" || st === "bosha_transcript_rss") return true;
  if (st === "research_sec" || st === "bosha_sec") {
    return secFormNeedsStructuredLlm(args.secForm ?? "");
  }
  return false;
}
