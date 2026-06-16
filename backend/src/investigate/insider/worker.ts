import { enqueueCurrentForm4Feed, enqueueCurrentFilingFeed } from "../../core/sec.js";
import { QUEUE_SOURCES } from "../../pipelines/registry.js";
import { runSecDailyIndexBackfill } from "../../shared/sec-daily-backfill.js";
import { startPipelineWorker } from "../../shared/worker.js";
import { parseNextInsiderQueueItem } from "./pipeline.js";

export function startInsiderWorker() {
  return startPipelineWorker({
    name: "investigate/insider",
    envPrefix: "INSIDER",
    sourceTypes: [...QUEUE_SOURCES.investigateInsider],
    defaults: {
      enqueueEveryMs: 60_000,
      parsePollMs: 5_000,
      parseThrottleMs: 750,
      parseConcurrency: 3,
      backfillIntervalMs: 45_000,
    },
    enqueue: async () => {
      const pages =
        process.env.INSIDER_CATCHUP === "1"
          ? Math.max(1, Math.min(20, Number(process.env.INSIDER_FEED_PAGES_PER_MIN_CATCHUP ?? 12)))
          : Math.max(1, Math.min(20, Number(process.env.INSIDER_FEED_PAGES_PER_MIN ?? 7)));
      await enqueueCurrentForm4Feed({ pages, pageSize: 100 });
      await enqueueCurrentFilingFeed({ formType: "3", pages: 1, pageSize: 100, sourceType: "sec_form3", priority: 7 });
      await enqueueCurrentFilingFeed({ formType: "5", pages: 1, pageSize: 100, sourceType: "sec_form5", priority: 7 });
    },
    enqueueBackfill: async () => {
      await runSecDailyIndexBackfill({
        pipeline: "investigate/insider",
        forms: [
          { form: "4", sourceType: "sec_form4", priority: 1 },
          { form: "3", sourceType: "sec_form3", priority: 1 },
          { form: "5", sourceType: "sec_form5", priority: 1 },
        ],
      });
    },
    parseNext: async () => {
      const r = await parseNextInsiderQueueItem();
      if (r.processed === false && r.reason === "no_work") return { processed: false, reason: "no_work" };
      return { processed: true };
    },
  });
}
