import { enqueueCurrentFilingFeed } from "../../core/sec.js";
import { startPipelineWorker } from "../../shared/worker.js";
import { parseNextPharmaQueueItem } from "./pipeline.js";

export function startClinicalWorker() {
  return startPipelineWorker({
    name: "research/clinical",
    envPrefix: "PHARMA",
    defaults: {
      enqueueEveryMs: 60_000,
      parsePollMs: 6_000,
      parseThrottleMs: 1_200,
      parseConcurrency: 1,
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
    parseNext: async () => {
      const r = await parseNextPharmaQueueItem();
      if (r.processed === false && r.reason === "no_work") return { processed: false, reason: "no_work" };
      return { processed: true };
    },
  });
}
