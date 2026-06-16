import { enqueueCurrentFilingFeed } from "../../core/sec.js";
import { QUEUE_SOURCES } from "../../pipelines/registry.js";
import { runSecDailyIndexBackfill } from "../../shared/sec-daily-backfill.js";
import { startPipelineWorker } from "../../shared/worker.js";
import { parseNextPharmaQueueItem } from "./pipeline.js";

export function startClinicalWorker() {
  return startPipelineWorker({
    name: "research/clinical",
    envPrefix: "PHARMA",
    sourceTypes: [...QUEUE_SOURCES.researchClinical],
    defaults: {
      enqueueEveryMs: 60_000,
      parsePollMs: 6_000,
      parseThrottleMs: 1_200,
      parseConcurrency: 1,
      backfillIntervalMs: 60_000,
    },
    enqueue: async () => {
      const pages =
        process.env.PHARMA_CATCHUP === "1"
          ? Math.max(1, Math.min(20, Number(process.env.PHARMA_FEED_PAGES_PER_MIN_CATCHUP ?? 6)))
          : Math.max(1, Math.min(20, Number(process.env.PHARMA_FEED_PAGES_PER_MIN ?? 3)));
      for (const f of ["8-K", "10-Q", "10-K"]) {
        await enqueueCurrentFilingFeed({
          formType: f,
          pages,
          pageSize: 100,
          sourceType: "sec_pharma_filing",
          priority: 5,
        });
      }
    },
    enqueueBackfill: async () => {
      await runSecDailyIndexBackfill({
        pipeline: "research/clinical",
        forms: [
          { form: "8-K", sourceType: "sec_pharma_filing", priority: 1 },
          { form: "10-Q", sourceType: "sec_pharma_filing", priority: 1 },
          { form: "10-K", sourceType: "sec_pharma_filing", priority: 1 },
        ],
      });
    },
    parseNext: async () => {
      const r = await parseNextPharmaQueueItem();
      if (r.processed === false && r.reason === "no_work") return { processed: false, reason: "no_work" };
      return { processed: true };
    },
  });
}
