import { db } from "../../core/db.js";
import { listHousePtrPdfsWithRetry } from "../../core/house.js";
import { listSenatePtrReportsWithRetry, openSenateSession } from "../../core/senate.js";
import { getIngestCursor, setIngestCursor } from "../../shared/ingest-cursor.js";

function backfillEnabled(): boolean {
  return String(process.env.BACKFILL_ENABLED ?? "1").trim() !== "0";
}

function minHouseYear(): number {
  const y = Number(process.env.BACKFILL_HOUSE_MIN_YEAR ?? 2012);
  return Number.isFinite(y) ? Math.max(2008, Math.min(2100, y)) : 2012;
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

/** Walk House PTR filing years and Senate PTR date windows when idle. */
export async function runPoliticiansHistoricalBackfill(pipeline: string): Promise<{ enqueued: number }> {
  if (!backfillEnabled()) return { enqueued: 0 };

  let enqueued = 0;
  const maxPerBatch = Math.max(10, Math.min(500, Number(process.env.BACKFILL_POLITICIANS_MAX_PER_BATCH ?? 200)));
  const senateWindowDays = Math.max(30, Math.min(365, Number(process.env.BACKFILL_SENATE_WINDOW_DAYS ?? 90)));

  const houseYearRaw = await getIngestCursor(pipeline, "house_year");
  let houseYear = houseYearRaw ? Number(houseYearRaw) : new Date().getFullYear() - 1;
  if (!Number.isFinite(houseYear)) houseYear = new Date().getFullYear() - 1;

  if (houseYear >= minHouseYear()) {
    try {
      const rows = await listHousePtrPdfsWithRetry({ filingYear: houseYear, max: maxPerBatch });
      for (const r of rows) {
        const ins = await db.one<{ id: string }>(
          `
          INSERT INTO document_queue (url, source_type, status, priority, updated_at)
          VALUES ($1, 'house_ptr', 'ready_to_parse', 0, now())
          ON CONFLICT (url, source_type) DO NOTHING
          RETURNING id
          `,
          [r.pdf_url],
        );
        if (ins?.id) enqueued += 1;
      }
      console.log(`[${pipeline}] backfill house year=${houseYear} discovered=${rows.length} enqueued=${enqueued}`);
    } catch (e) {
      console.error(`[${pipeline}] backfill house year=${houseYear} failed`, e);
    }
    await setIngestCursor(pipeline, "house_year", String(houseYear - 1));
  }

  const senateEndRaw = await getIngestCursor(pipeline, "senate_window_end");
  let senateEnd = parseIsoDate(senateEndRaw);
  if (!senateEnd) {
    const liveLookback = Math.max(90, Math.min(730, Number(process.env.POLITICIANS_SENATE_LOOKBACK_DAYS ?? 365)));
    senateEnd = new Date();
    senateEnd.setUTCDate(senateEnd.getUTCDate() - liveLookback - 1);
  }
  senateEnd.setUTCHours(0, 0, 0, 0);
  const senateStart = new Date(senateEnd);
  senateStart.setUTCDate(senateStart.getUTCDate() - senateWindowDays);

  const minSenate = parseIsoDate(String(process.env.BACKFILL_SENATE_MIN_DATE ?? "2012-01-01")) ?? new Date(Date.UTC(2012, 0, 1));
  if (senateEnd.getTime() >= minSenate.getTime()) {
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
          VALUES ($1, 'senate_ptr', 'ready_to_parse', 0, now())
          ON CONFLICT (url, source_type) DO NOTHING
          RETURNING id
          `,
          [r.view_url],
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
  }

  return { enqueued };
}
