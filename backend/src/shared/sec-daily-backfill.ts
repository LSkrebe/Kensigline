import { AsyncLocalStorage } from "node:async_hooks";
import { enqueueFilingsFromDailyIndexDay } from "../core/sec.js";
import { effectiveBackfillMinDate, backfillSecLimitPerForm } from "./ingest-policy.js";
import { getIngestCursor, setIngestCursor } from "./ingest-cursor.js";

export type SecDailyFormSpec = {
  form: string;
  sourceType: string;
  priority?: number;
};

export type BackfillTickMode = { walkOnly: boolean; walkTrickle?: number; gapFillLimit?: number };

const backfillTickStore = new AsyncLocalStorage<BackfillTickMode>();

function getBackfillTickMode(): BackfillTickMode {
  return backfillTickStore.getStore() ?? { walkOnly: false };
}

/** Set walk-only vs enqueue mode for one backfill tick (queue between low/high water). */
export function runWithBackfillTickMode<T>(mode: BackfillTickMode, fn: () => T): T {
  return backfillTickStore.run(mode, fn);
}

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

/** Max new enqueues per tick when queue is above low water (walk-only with trickle). 0 = scan-only. */
function walkTrickleCap(): number {
  return Math.max(0, Math.min(500, Number(process.env.BACKFILL_WALK_TRICKLE ?? 50) || 50));
}

function isBenignUniqueError(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  const code = String(e?.code ?? "");
  const msg = String(e?.message ?? err);
  return code === "23505" || /duplicate key|unique constraint/i.test(msg);
}

import { isPoolBlipError } from "./queue.js";

/**
 * When the parse queue is low, walk SEC daily master.idx backwards and enqueue.
 *
 * Progress is tracked as:
 * - `sec_daily` → current day (YYYYMMDD)
 * - `sec_daily_form` → next form index within that day (0..forms.length)
 *
 * So a pooler blip on Form 5 does not re-scan Form 4 for the same day forever,
 * and unique races never freeze the walk.
 */
export async function runSecDailyIndexBackfill(opts: {
  pipeline: string;
  cursorKey?: string;
  forms: SecDailyFormSpec[];
  limitPerForm?: number;
}): Promise<{ ran: boolean; day?: string; enqueued: number; skipped_existing: number; truncated?: boolean }> {
  if (!backfillEnabled() || !opts.forms.length) return { ran: false, enqueued: 0, skipped_existing: 0 };

  return withGlobalBackfillLock(async () => {
    const { walkOnly } = getBackfillTickMode();
    const cursorKey = opts.cursorKey ?? "sec_daily";
    const formCursorKey = `${cursorKey}_form`;
    const chunkCursorKey = `${formCursorKey}_chunk`;
    const configured = Number(opts.limitPerForm ?? backfillSecLimitPerForm());
    const limitPerForm = Number.isFinite(configured) ? Math.max(0, Math.min(50_000, Math.floor(configured))) : 0;
    const maxDays = walkOnly
      ? Math.max(1, Math.min(14, Number(process.env.BACKFILL_DAYS_PER_TICK_WALK ?? 6) || 6))
      : Math.max(1, Math.min(14, Number(process.env.BACKFILL_DAYS_PER_TICK ?? 5) || 5));
    const targetEnqueue = Math.max(50, Math.min(5_000, Number(process.env.BACKFILL_TARGET_ENQUEUE ?? 400) || 400));
    const walkTrickle = walkOnly ? (getBackfillTickMode().walkTrickle ?? walkTrickleCap()) : 0;
    const gapFillLimit = walkOnly ? (getBackfillTickMode().gapFillLimit ?? 0) : 0;
    const tickTarget = walkOnly ? (walkTrickle > 0 ? walkTrickle : gapFillLimit) : targetEnqueue;
    // Cap forms per tick so one pipeline cannot hold the global lock across a huge multi-form day.
    const maxFormsPerTick = Math.max(
      1,
      Math.min(opts.forms.length, Number(process.env.BACKFILL_FORMS_PER_TICK ?? opts.forms.length) || opts.forms.length),
    );

    let day = parseYyyymmdd((await getIngestCursor(opts.pipeline, cursorKey)) ?? "");
    if (!day) {
      day = prevUtcDay(new Date());
      day.setUTCHours(0, 0, 0, 0);
    }

    let formIdx = Number(await getIngestCursor(opts.pipeline, formCursorKey));
    if (!Number.isFinite(formIdx) || formIdx < 0) formIdx = 0;
    if (formIdx > opts.forms.length) formIdx = 0;

    let chunkIdx = Number(await getIngestCursor(opts.pipeline, chunkCursorKey));
    if (!Number.isFinite(chunkIdx) || chunkIdx < 0) chunkIdx = 0;

    const minDate = effectiveBackfillMinDate();
    let totalEnqueued = 0;
    let totalSkipped = 0;
    let lastDayLabel = "";
    let truncated = false;
    let daysWalked = 0;
    let formsThisTick = 0;
    let dayIncomplete = false;

    for (let i = 0; i < maxDays; i++) {
      if (day.getTime() < minDate.getTime()) break;
      if (tickTarget > 0 && totalEnqueued >= tickTarget) break;
      if (formsThisTick >= maxFormsPerTick) break;

      const dayLabel = yyyymmdd(day);
      lastDayLabel = dayLabel;
      let enqueued = 0;
      let skipped_existing = 0;
      let foundAnyIndex = false;
      truncated = false;
      dayIncomplete = false;

      while (formIdx < opts.forms.length) {
        if (formsThisTick >= maxFormsPerTick) {
          // Resume mid-day next tick — cursor held on purpose (progress saved in form idx).
          truncated = true;
          break;
        }

        const spec = opts.forms[formIdx]!;
        formsThisTick += 1;

        try {
          const remaining =
            walkOnly && walkTrickle > 0
              ? Math.max(1, tickTarget - totalEnqueued)
              : walkOnly
                ? 0
                : limitPerForm;
          const r = await enqueueFilingsFromDailyIndexDay({
            dayUtc: day,
            form: spec.form,
            sourceType: spec.sourceType,
            priority: spec.priority ?? 1,
            limit: remaining,
            scanOnly: walkOnly && walkTrickle <= 0,
            startChunkIndex: chunkIdx,
            ...(walkOnly && walkTrickle <= 0 && gapFillLimit > 0 ? { gapFillLimit } : {}),
          });
          foundAnyIndex = foundAnyIndex || r.found > 0 || r.index_missing === false;
          enqueued += r.enqueued;
          skipped_existing += r.skipped_existing;

          if (r.truncated) {
            truncated = true;
            dayIncomplete = true;
            chunkIdx = r.nextChunkIndex;
            await setIngestCursor(opts.pipeline, chunkCursorKey, String(chunkIdx));
            await setIngestCursor(opts.pipeline, formCursorKey, String(formIdx));
            // Walk trickle: finish sibling form same tick so one fat 13F-HR day does not block 13F-HR/A.
            if (
              walkOnly &&
              (walkTrickle > 0 || gapFillLimit > 0) &&
              formIdx + 1 < opts.forms.length &&
              formsThisTick < maxFormsPerTick
            ) {
              formIdx += 1;
              await setIngestCursor(opts.pipeline, formCursorKey, String(formIdx));
              truncated = false;
              continue;
            }
            break;
          }

          formIdx += 1;
          chunkIdx = 0;
          await setIngestCursor(opts.pipeline, chunkCursorKey, "0");
          await setIngestCursor(opts.pipeline, formCursorKey, String(formIdx));
        } catch (e: unknown) {
          if (isBenignUniqueError(e)) {
            console.warn(
              `[${opts.pipeline}] backfill_day_dup form=${spec.form} day=${dayLabel} (skip, cursor ok)`,
            );
            formIdx += 1;
            chunkIdx = 0;
            await setIngestCursor(opts.pipeline, chunkCursorKey, "0");
            await setIngestCursor(opts.pipeline, formCursorKey, String(formIdx));
            continue;
          }
          console.error(`[${opts.pipeline}] backfill_day_failed form=${spec.form} day=${dayLabel}`, e);
          if (isPoolBlipError(e)) throw e;
          // Transient/unknown: retry same form next tick (do not rewind earlier forms).
          truncated = true;
          await setIngestCursor(opts.pipeline, formCursorKey, String(formIdx));
          break;
        }
      }

      totalEnqueued += enqueued;
      totalSkipped += skipped_existing;
      daysWalked += 1;

      if (dayIncomplete || truncated || formIdx < opts.forms.length) {
        console.warn(
          `[${opts.pipeline}] backfill day=${dayLabel} form_idx=${formIdx}/${opts.forms.length} enqueued=${enqueued} skipped=${skipped_existing}${walkOnly ? ` walk_only=1 trickle=${walkTrickle}${gapFillLimit > 0 && walkTrickle <= 0 ? ` gap_fill=${gapFillLimit}` : ""}` : ""} (cursor held)`,
        );
        break;
      }

      const nextDay = prevUtcDay(day);
      formIdx = 0;
      chunkIdx = 0;
      await setIngestCursor(opts.pipeline, chunkCursorKey, "0");
      await setIngestCursor(opts.pipeline, formCursorKey, "0");
      await setIngestCursor(opts.pipeline, cursorKey, yyyymmdd(nextDay));
      if (enqueued > 0 || foundAnyIndex || (walkOnly && skipped_existing > 0)) {
        console.log(
          `[${opts.pipeline}] backfill day=${dayLabel} enqueued=${enqueued} skipped=${skipped_existing}${walkOnly ? ` walk_only=1 trickle=${walkTrickle}${gapFillLimit > 0 && walkTrickle <= 0 ? ` gap_fill=${gapFillLimit}` : ""}` : ""} next=${yyyymmdd(nextDay)}`,
        );
      }
      day = nextDay;
    }

    if (daysWalked > 0) {
      console.log(
        `[${opts.pipeline}] backfill_tick days=${daysWalked} enqueued=${totalEnqueued} skipped=${totalSkipped} target=${tickTarget}${walkOnly ? ` walk_only=1 trickle=${walkTrickle}${gapFillLimit > 0 && walkTrickle <= 0 ? ` gap_fill=${gapFillLimit}` : ""}` : ""}`,
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
