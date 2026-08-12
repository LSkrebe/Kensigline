import { enqueueCurrentFilingFeed } from "../../core/sec.js";
import { QUEUE_SOURCES } from "../../pipelines/registry.js";
import { runSecDailyIndexBackfill } from "../../shared/sec-daily-backfill.js";
import { startPipelineWorker } from "../../shared/worker.js";
import { parseNextInstitutionsQueueItem } from "./pipeline.js";

export function startInstitutionsWorker() {
  const pages = Math.max(1, Math.min(10, Number(process.env.INSTITUTIONS_FEED_PAGES ?? 2)));

  return startPipelineWorker({
    name: "investigate/institutions",
    envPrefix: "INSTITUTIONS",
    backfillPipelineId: "institutions",
    sourceTypes: [...QUEUE_SOURCES.investigateInstitutions],
    defaults: {
      enqueueEveryMs: 300_000,
      parsePollMs: 8_000,
      parseThrottleMs: 2_500,
      parseConcurrency: 1,
      backfillIntervalMs: 90_000,
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
    enqueueBackfill: async () => {
      await runSecDailyIndexBackfill({
        pipeline: "investigate/institutions",
        forms: [
          { form: "13F-HR", sourceType: "sec_13f", priority: 1 },
          { form: "13F-HR/A", sourceType: "sec_13f", priority: 1 },
        ],
      });
    },
    parseNext: async () => {
      const r = await parseNextInstitutionsQueueItem();
      if (r.processed === false && r.reason === "no_work") return { processed: false, reason: "no_work" };
      return { processed: true };
    },
  });
}
