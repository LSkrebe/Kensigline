import { db } from "../../core/db.js";
import { listHousePtrPdfsWithRetry } from "../../core/house.js";
import { listOge278tPdfsFromOffsetWithRetry } from "../../core/oge.js";
import { listSenatePtrReportsWithRetry, openSenateSession } from "../../core/senate.js";
import {
  backfillMaxAgeDays,
  effectiveBackfillMinDate,
  politiciansBackfillSenateWindowDays,
  politiciansLiveSenateLookbackDays,
  QUEUE_PRIORITY_BACKFILL_INDEX,
} from "../../shared/ingest-policy.js";
import { getIngestCursor, setIngestCursor } from "../../shared/ingest-cursor.js";

function backfillEnabled(): boolean {
  return String(process.env.BACKFILL_ENABLED ?? "1").trim() !== "0";
}

function parseIsoDate(s: string | null): Date | null {
  const raw = String(s ?? "").trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** PTR backfill within BACKFILL_MAX_AGE_DAYS — House filing years + Senate date windows + OGE PAS pages. */
export async function runPoliticiansHistoricalBackfill(pipeline: string): Promise<{ enqueued: number }> {
  if (!backfillEnabled()) return { enqueued: 0 };

  // Once every stream has hit the age floor for the *current* window, idle.
  // Value is the age-days setting so expanding BACKFILL_MAX_AGE_DAYS auto-resumes.
  const ageDays = backfillMaxAgeDays();
  if ((await getIngestCursor(pipeline, "historical_done")) === String(ageDays)) {
    return { enqueued: 0 };
  }

  let enqueued = 0;
  const maxPerBatch = Math.max(10, Math.min(500, Number(process.env.BACKFILL_POLITICIANS_MAX_PER_BATCH ?? 120)));
  const senateWindowDays = politiciansBackfillSenateWindowDays();
  const minDate = effectiveBackfillMinDate();
  const minHouseYear = minDate.getUTCFullYear();
  const currentYear = new Date().getUTCFullYear();

  const houseYearRaw = await getIngestCursor(pipeline, "house_year");
  let houseYear = houseYearRaw ? Number(houseYearRaw) : currentYear - 1;
  if (!Number.isFinite(houseYear)) houseYear = currentYear - 1;

  if (houseYear >= minHouseYear) {
    try {
      const rows = await listHousePtrPdfsWithRetry({ filingYear: houseYear, max: maxPerBatch });
      let houseEnq = 0;
      for (const r of rows) {
        const ins = await db.one<{ id: string }>(
          `
          INSERT INTO document_queue (url, source_type, status, priority, updated_at)
          VALUES ($1, 'house_ptr', 'ready_to_parse', $2, now())
          ON CONFLICT (url, source_type) DO NOTHING
          RETURNING id
          `,
          [r.pdf_url, QUEUE_PRIORITY_BACKFILL_INDEX],
        );
        if (ins?.id) {
          houseEnq += 1;
          enqueued += 1;
        }
      }
      console.log(`[${pipeline}] backfill house year=${houseYear} discovered=${rows.length} enqueued=${houseEnq}`);
    } catch (e) {
      console.error(`[${pipeline}] backfill house year=${houseYear} failed`, e);
    }
    houseYear -= 1;
    await setIngestCursor(pipeline, "house_year", String(houseYear));
  }
  const houseDone = houseYear < minHouseYear;

  const senateEndRaw = await getIngestCursor(pipeline, "senate_window_end");
  let senateEnd = parseIsoDate(senateEndRaw);
  if (!senateEnd) {
    const liveLookback = politiciansLiveSenateLookbackDays();
    senateEnd = new Date();
    senateEnd.setUTCDate(senateEnd.getUTCDate() - liveLookback - 1);
  }
  senateEnd.setUTCHours(0, 0, 0, 0);
  const senateStart = new Date(senateEnd);
  senateStart.setUTCDate(senateStart.getUTCDate() - senateWindowDays);

  let senateDone = false;
  if (senateEnd.getTime() >= minDate.getTime()) {
    try {
      const session = await openSenateSession();
      const listings = await listSenatePtrReportsWithRetry({
        max: maxPerBatch,
        lookbackDays: senateWindowDays,
        endDate: senateEnd,
        session,
      });
      let senateEnq = 0;
      for (const r of listings) {
        const ins = await db.one<{ id: string }>(
          `
          INSERT INTO document_queue (url, source_type, status, priority, updated_at)
          VALUES ($1, 'senate_ptr', 'ready_to_parse', $2, now())
          ON CONFLICT (url, source_type) DO NOTHING
          RETURNING id
          `,
          [r.view_url, QUEUE_PRIORITY_BACKFILL_INDEX],
        );
        if (ins?.id) {
          senateEnq += 1;
          enqueued += 1;
        }
      }
      console.log(
        `[${pipeline}] backfill senate window_end=${isoDate(senateEnd)} discovered=${listings.length} enqueued=${senateEnq}`,
      );
    } catch (e) {
      console.error(`[${pipeline}] backfill senate window_end=${isoDate(senateEnd)} failed`, e);
    }

    const nextEnd = new Date(senateStart);
    nextEnd.setUTCDate(nextEnd.getUTCDate() - 1);
    await setIngestCursor(pipeline, "senate_window_end", isoDate(nextEnd));
  } else {
    senateDone = true;
  }

  const ogeStartRaw = await getIngestCursor(pipeline, "oge_api_start");
  let ogeStart = ogeStartRaw != null && ogeStartRaw !== "" ? Number(ogeStartRaw) : 0;
  if (!Number.isFinite(ogeStart) || ogeStart < 0) ogeStart = 0;
  const ogeDoneRaw = await getIngestCursor(pipeline, "oge_backfill_done");
  let ogeDone = ogeDoneRaw === "1";
  if (!ogeDone) {
    try {
      const page = await listOge278tPdfsFromOffsetWithRetry({
        start: ogeStart,
        max: maxPerBatch,
        minDocDate: minDate,
      });
      let ogeEnq = 0;
      for (const r of page.listings) {
        const ins = await db.one<{ id: string }>(
          `
          INSERT INTO document_queue (url, source_type, status, priority, updated_at)
          VALUES ($1, 'oge_278t', 'ready_to_parse', $2, now())
          ON CONFLICT (url, source_type) DO NOTHING
          RETURNING id
          `,
          [r.pdf_url, QUEUE_PRIORITY_BACKFILL_INDEX],
        );
        if (ins?.id) {
          ogeEnq += 1;
          enqueued += 1;
        }
      }
      console.log(
        `[${pipeline}] backfill oge start=${ogeStart} next=${page.nextStart} discovered=${page.listings.length} enqueued=${ogeEnq} done=${page.done}`,
      );
      if (page.done) {
        ogeDone = true;
        await setIngestCursor(pipeline, "oge_backfill_done", "1");
      } else {
        await setIngestCursor(pipeline, "oge_api_start", String(page.nextStart));
      }
    } catch (e) {
      console.error(`[${pipeline}] backfill oge start=${ogeStart} failed`, e);
    }
  }

  if (houseDone && senateDone && ogeDone) {
    await setIngestCursor(pipeline, "historical_done", String(ageDays));
    console.log(
      `[${pipeline}] historical backfill complete (age floor ${ageDays}d); idle until reset`,
    );
  }

  return { enqueued };
}
