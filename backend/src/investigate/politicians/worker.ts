import { db } from "../../core/db.js";
import { listHousePtrPdfsWithRetry } from "../../core/house.js";
import { startPipelineWorker } from "../../shared/worker.js";
import { parseNextPoliticiansQueueItem } from "./pipeline.js";

export function startPoliticiansWorker() {
  const maxPerPoll = Math.max(10, Math.min(2000, Number(process.env.POLITICIANS_MAX_PER_POLL ?? 400)));

  return startPipelineWorker({
    name: "investigate/politicians",
    envPrefix: "POLITICIANS",
    defaults: {
      enqueueEveryMs: 180_000,
      parsePollMs: 5_000,
      parseThrottleMs: 500,
      parseConcurrency: 2,
    },
    enqueue: async () => {
      const year = new Date().getFullYear();
      const rows = await listHousePtrPdfsWithRetry({ filingYear: year, max: maxPerPoll });
      if (!rows.length) return;
      let enq = 0;
      for (const r of rows) {
        try {
          await db.query(
            `INSERT INTO document_queue (url, source_type, status, priority, updated_at)
             VALUES ($1, 'house_ptr', 'ready_to_parse', 0, now())
             ON CONFLICT (url, source_type) DO NOTHING`,
            [r.pdf_url],
          );
          enq++;
        } catch {
          // ignore
        }
      }
      console.log(`politicians_enqueue year=${year} discovered=${rows.length} attempted=${enq}`);
    },
    parseNext: async () => {
      const r = await parseNextPoliticiansQueueItem();
      if (r.processed === false && r.reason === "no_work") return { processed: false, reason: "no_work" };
      return { processed: true };
    },
  });
}
