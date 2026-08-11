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

/** Only one SEC daily backfill across all pipelines — parallel day-walks stampede the pooler. */
let globalBackfillBusy = false;

async function withGlobalBackfillLock<T>(fn: () => Promise<T>): Promise<T | { ran: false; enqueued: 0; skipped_existing: 0 }> {
  if (globalBackfillBusy) return { ran: false, enqueued: 0, skipped_existing: 0 };
  globalBackfillBusy = true;
  try {
    return await fn();
  } finally {
    globalBackfillBusy = false;
  }
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
 * When the parse queue is low, walk SEC daily master.idx backwards and enqueue.
 * Walks multiple already-done days per call so skip-heavy history does not starve parsers.
 * Does not advance the cursor when a form day was truncated by limit — prevents holes.
 */
export async function runSecDailyIndexBackfill(opts: {
  pipeline: string;
  cursorKey?: string;
  forms: SecDailyFormSpec[];
  limitPerForm?: number;
}): Promise<{ ran: boolean; day?: string; enqueued: number; skipped_existing: number; truncated?: boolean }> {
  if (!backfillEnabled() || !opts.forms.length) return { ran: false, enqueued: 0, skipped_existing: 0 };

  return withGlobalBackfillLock(async () => {
    const cursorKey = opts.cursorKey ?? "sec_daily";
    const configured = Number(opts.limitPerForm ?? backfillSecLimitPerForm());
    const limitPerForm = Number.isFinite(configured) ? Math.max(0, Math.min(50_000, Math.floor(configured))) : 0;
    const maxDays = Math.max(1, Math.min(14, Number(process.env.BACKFILL_DAYS_PER_TICK ?? 5) || 5));
    const targetEnqueue = Math.max(50, Math.min(5_000, Number(process.env.BACKFILL_TARGET_ENQUEUE ?? 400) || 400));

    let day = parseYyyymmdd((await getIngestCursor(opts.pipeline, cursorKey)) ?? "");
    if (!day) {
      day = prevUtcDay(new Date());
      day.setUTCHours(0, 0, 0, 0);
    }

    const minDate = effectiveBackfillMinDate();
    let totalEnqueued = 0;
    let totalSkipped = 0;
    let lastDayLabel = "";
    let truncated = false;
    let daysWalked = 0;

    for (let i = 0; i < maxDays; i++) {
      if (day.getTime() < minDate.getTime()) break;
      if (totalEnqueued >= targetEnqueue) break;

      const dayLabel = yyyymmdd(day);
      lastDayLabel = dayLabel;
      let enqueued = 0;
      let skipped_existing = 0;
      let foundAnyIndex = false;
      truncated = false;

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
          // Only real per-day caps hold the cursor — never benign races/dupes.
          if (r.truncated) truncated = true;
        } catch (e: any) {
          const code = String(e?.code ?? "");
          const msg = String(e?.message ?? e);
          // Unique / already-queued must not freeze the historical walk.
          if (code === "23505" || /duplicate key|unique constraint/i.test(msg)) {
            console.warn(
              `[${opts.pipeline}] backfill_day_dup form=${spec.form} day=${dayLabel} (skip, cursor ok)`,
            );
            continue;
          }
          console.error(`[${opts.pipeline}] backfill_day_failed form=${spec.form} day=${dayLabel}`, e);
          // Hold cursor on real failures (timeouts, unknown) so we retry the day — no holes.
          truncated = true;
        }
      }

      totalEnqueued += enqueued;
      totalSkipped += skipped_existing;
      daysWalked += 1;

      if (truncated) {
        console.warn(
          `[${opts.pipeline}] backfill day=${dayLabel} truncated enqueued=${enqueued} skipped=${skipped_existing} (cursor held)`,
        );
        break;
      }

      const nextDay = prevUtcDay(day);
      await setIngestCursor(opts.pipeline, cursorKey, yyyymmdd(nextDay));
      if (enqueued > 0 || foundAnyIndex) {
        console.log(
          `[${opts.pipeline}] backfill day=${dayLabel} enqueued=${enqueued} skipped=${skipped_existing} next=${yyyymmdd(nextDay)}`,
        );
      }
      day = nextDay;
    }

    if (daysWalked > 0) {
      console.log(
        `[${opts.pipeline}] backfill_tick days=${daysWalked} enqueued=${totalEnqueued} skipped=${totalSkipped} target=${targetEnqueue}`,
      );
    }

    return {
      ran: daysWalked > 0,
      ...(lastDayLabel ? { day: lastDayLabel } : {}),
      enqueued: totalEnqueued,
      skipped_existing: totalSkipped,
      truncated,
    };
  });
}
