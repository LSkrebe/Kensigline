import { enqueueCurrentFilingFeed } from "../../core/sec.js";
import { startPipelineWorker } from "../../shared/worker.js";
import { parseNextInstitutionsQueueItem } from "./pipeline.js";

export function startInstitutionsWorker() {
  const pages = Math.max(1, Math.min(10, Number(process.env.INSTITUTIONS_FEED_PAGES ?? 2)));

  return startPipelineWorker({
    name: "investigate/institutions",
    envPrefix: "INSTITUTIONS",
    defaults: {
      enqueueEveryMs: 300_000,
      parsePollMs: 8_000,
      parseThrottleMs: 2_500,
      parseConcurrency: 1,
    },
    enqueue: async () => {
      for (const formType of ["13F-HR", "13F-HR/A"]) {
        const r = await enqueueCurrentFilingFeed({
          formType,
          pages,
          pageSize: 100,
          sourceType: "sec_13f",
          priority: 4,
        });
        console.log(`institutions_enqueue_${formType} enqueued=${r.enqueued}`);
      }
    },
    parseNext: async () => {
      const r = await parseNextInstitutionsQueueItem();
      if (r.processed === false && r.reason === "no_work") return { processed: false, reason: "no_work" };
      return { processed: true };
    },
  });
}
