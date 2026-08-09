import { enqueueFilingsFromDailyIndexDay } from "../core/sec.js";
import { effectiveBackfillMinDate, backfillSecLimitPerForm } from "./ingest-policy.js";
import { getIngestCursor, setIngestCursor } from "./ingest-cursor.js";

export type SecDailyFormSpec = {
  form: string;
  sourceType: string;
  priority?: number;
};

function backfillEnabled(): boolean {
  return String(process.env.BACKFILL_ENABLED ?? "1").trim() !== "0";
}

function yyyymmdd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${dd}`;
}

function parseYyyymmdd(s: string): Date | null {
  const raw = String(s ?? "").trim();
  if (!/^\d{8}$/.test(raw)) return null;
  const y = Number(raw.slice(0, 4));
  const m = Number(raw.slice(4, 6));
  const d = Number(raw.slice(6, 8));
  const dt = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function prevUtcDay(d: Date): Date {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() - 1);
  return out;
}

/**
 * When the parse queue is idle, walk SEC daily master.idx backwards one calendar day
 * and enqueue filings for the configured form types.
 *
 * Does not advance the cursor when a form day was truncated by limit — prevents holes.
 */
export async function runSecDailyIndexBackfill(opts: {
  pipeline: string;
  cursorKey?: string;
  forms: SecDailyFormSpec[];
  limitPerForm?: number;
}): Promise<{ ran: boolean; day?: string; enqueued: number; skipped_existing: number; truncated?: boolean }> {
  if (!backfillEnabled() || !opts.forms.length) return { ran: false, enqueued: 0, skipped_existing: 0 };

  const cursorKey = opts.cursorKey ?? "sec_daily";
  // 0 = full day (no holes). Positive = max new inserts per form; day held until complete.
  const configured = Number(opts.limitPerForm ?? backfillSecLimitPerForm());
  const limitPerForm = Number.isFinite(configured) ? Math.max(0, Math.min(50_000, Math.floor(configured))) : 0;

  let day = parseYyyymmdd((await getIngestCursor(opts.pipeline, cursorKey)) ?? "");
  if (!day) {
    day = prevUtcDay(new Date());
    day.setUTCHours(0, 0, 0, 0);
  }

  const minDate = effectiveBackfillMinDate();
  if (day.getTime() < minDate.getTime()) {
    return { ran: false, enqueued: 0, skipped_existing: 0 };
  }

  const dayLabel = yyyymmdd(day);
  let enqueued = 0;
  let skipped_existing = 0;
  let foundAnyIndex = false;
  let truncated = false;

  for (const spec of opts.forms) {
    try {
      const r = await enqueueFilingsFromDailyIndexDay({
        dayUtc: day,
        form: spec.form,
        sourceType: spec.sourceType,
        priority: spec.priority ?? 1,
        limit: limitPerForm,
      });
      foundAnyIndex = foundAnyIndex || r.found > 0 || r.index_missing === false;
      enqueued += r.enqueued;
      skipped_existing += r.skipped_existing;
      if (r.truncated) truncated = true;
    } catch (e) {
      console.error(`[${opts.pipeline}] backfill_day_failed form=${spec.form} day=${dayLabel}`, e);
      // Hold the day on hard failure so we don't silently skip a calendar day.
      truncated = true;
    }
  }

  if (!truncated) {
    const nextDay = prevUtcDay(day);
    await setIngestCursor(opts.pipeline, cursorKey, yyyymmdd(nextDay));
    if (enqueued > 0 || foundAnyIndex) {
      console.log(
        `[${opts.pipeline}] backfill day=${dayLabel} enqueued=${enqueued} skipped=${skipped_existing} next=${yyyymmdd(nextDay)}`,
      );
    }
  } else {
    console.warn(
      `[${opts.pipeline}] backfill day=${dayLabel} truncated enqueued=${enqueued} skipped=${skipped_existing} (cursor held)`,
    );
  }

  return { ran: true, day: dayLabel, enqueued, skipped_existing, truncated };
}
