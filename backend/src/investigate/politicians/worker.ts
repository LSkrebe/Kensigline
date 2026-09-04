import { db } from "../../core/db.js";
import { listHousePtrPdfsWithRetry } from "../../core/house.js";
import { listOge278tPdfsWithRetry } from "../../core/oge.js";
import { listSenatePtrReportsWithRetry } from "../../core/senate.js";
import { QUEUE_SOURCES } from "../../pipelines/registry.js";
import {
  politiciansLiveOgeLookbackDays,
  politiciansLiveSenateLookbackDays,
} from "../../shared/ingest-policy.js";
import { runPoliticiansHistoricalBackfill } from "./backfill.js";
import { startPipelineWorker } from "../../shared/worker.js";
import { parseNextPoliticiansQueueItem } from "./pipeline.js";

export function startPoliticiansWorker() {
  const maxPerPoll = Math.max(10, Math.min(2000, Number(process.env.POLITICIANS_MAX_PER_POLL ?? 400)));
  const senateLookbackDays = politiciansLiveSenateLookbackDays();
  const ogeLookbackDays = politiciansLiveOgeLookbackDays();

  return startPipelineWorker({
    name: "investigate/politicians",
    envPrefix: "POLITICIANS",
    backfillPipelineId: "politicians",
    sourceTypes: [...QUEUE_SOURCES.investigatePoliticians],
    defaults: {
      enqueueEveryMs: 180_000,
      parsePollMs: 3_000,
      parseThrottleMs: 200,
      parseConcurrency: 4,
      backfillIntervalMs: 120_000,
    },
    enqueue: async () => {
      const year = new Date().getFullYear();
      const houseYears = [year, year - 1];
      const houseLists = await Promise.all(
        houseYears.map((filingYear) => listHousePtrPdfsWithRetry({ filingYear, max: maxPerPoll })),
      );
      const houseRows = houseLists.flat();
      const [senateRows, ogeRows] = await Promise.all([
        listSenatePtrReportsWithRetry({ max: maxPerPoll, lookbackDays: senateLookbackDays }),
        listOge278tPdfsWithRetry({ max: maxPerPoll, lookbackDays: ogeLookbackDays }),
      ]);

      let houseEnq = 0;
      for (const r of houseRows) {
        try {
          await db.query(
            `INSERT INTO document_queue (url, source_type, status, priority, updated_at)
             VALUES ($1, 'house_ptr', 'ready_to_parse', 5, now())
             ON CONFLICT (url, source_type) DO NOTHING`,
            [r.pdf_url],
          );
          houseEnq++;
        } catch {
          // ignore
        }
      }

      let senateEnq = 0;
      for (const r of senateRows) {
        try {
          await db.query(
            `INSERT INTO document_queue (url, source_type, status, priority, updated_at)
             VALUES ($1, 'senate_ptr', 'ready_to_parse', 5, now())
             ON CONFLICT (url, source_type) DO NOTHING`,
            [r.view_url],
          );
          senateEnq++;
        } catch {
          // ignore
        }
      }

      let ogeEnq = 0;
      for (const r of ogeRows) {
        try {
          await db.query(
            `INSERT INTO document_queue (url, source_type, status, priority, updated_at)
             VALUES ($1, 'oge_278t', 'ready_to_parse', 5, now())
             ON CONFLICT (url, source_type) DO NOTHING`,
            [r.pdf_url],
          );
          ogeEnq++;
        } catch {
          // ignore
        }
      }

      console.log(
        `politicians_enqueue years=${houseYears.join(",")} house_discovered=${houseRows.length} house_attempted=${houseEnq} senate_discovered=${senateRows.length} senate_attempted=${senateEnq} oge_discovered=${ogeRows.length} oge_attempted=${ogeEnq}`,
      );
    },
    enqueueBackfill: async () => {
      await runPoliticiansHistoricalBackfill("investigate/politicians");
    },
    parseNext: async () => {
      const r = await parseNextPoliticiansQueueItem();
      if (r.processed === false && r.reason === "no_work") return { processed: false, reason: "no_work" };
      return { processed: true };
    },
  });
}
