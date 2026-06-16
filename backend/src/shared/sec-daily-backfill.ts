import { enqueueFilingsFromDailyIndexDay } from "../core/sec.js";
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

function minBackfillDate(): Date {
  const raw = String(process.env.BACKFILL_MIN_DATE ?? "2012-01-01").trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return new Date(Date.UTC(2012, 0, 1));
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/**
 * When the parse queue is idle, walk SEC daily master.idx backwards one calendar day
 * and enqueue filings for the configured form types.
 */
export async function runSecDailyIndexBackfill(opts: {
  pipeline: string;
  cursorKey?: string;
  forms: SecDailyFormSpec[];
  limitPerForm?: number;
}): Promise<{ ran: boolean; day?: string; enqueued: number; skipped_existing: number }> {
  if (!backfillEnabled() || !opts.forms.length) return { ran: false, enqueued: 0, skipped_existing: 0 };

  const cursorKey = opts.cursorKey ?? "sec_daily";
  const limitPerForm = Math.max(1, Math.min(5000, Number(opts.limitPerForm ?? process.env.BACKFILL_SEC_LIMIT_PER_DAY ?? 800)));

  let day = parseYyyymmdd((await getIngestCursor(opts.pipeline, cursorKey)) ?? "");
  if (!day) {
    day = prevUtcDay(new Date());
    day.setUTCHours(0, 0, 0, 0);
  }

  const minDate = minBackfillDate();
  if (day.getTime() < minDate.getTime()) {
    return { ran: false, enqueued: 0, skipped_existing: 0 };
  }

  const dayLabel = yyyymmdd(day);
  let enqueued = 0;
  let skipped_existing = 0;
  let foundAnyIndex = false;

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
    } catch (e) {
      console.error(`[${opts.pipeline}] backfill_day_failed form=${spec.form} day=${dayLabel}`, e);
    }
  }

  const nextDay = prevUtcDay(day);
  await setIngestCursor(opts.pipeline, cursorKey, yyyymmdd(nextDay));

  if (enqueued > 0 || foundAnyIndex) {
    console.log(
      `[${opts.pipeline}] backfill day=${dayLabel} enqueued=${enqueued} skipped=${skipped_existing} next=${yyyymmdd(nextDay)}`,
    );
  }

  return { ran: true, day: dayLabel, enqueued, skipped_existing };
}
