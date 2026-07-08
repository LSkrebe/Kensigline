import {
  backfillPriorityForResearchSecForm,
  enqueueResearchSecFilings,
  enqueueResearchWebFeeds,
  researchSecFormListForBackfill,
  researchSecFormsForBackfill,
} from "./market/ingest.js";
import { parseNextResearchQueueItem } from "./market/parse.js";
import { researchEnvNum } from "../documents/spec.js";
import { QUEUE_SOURCES } from "../pipelines/registry.js";
import { runSecDailyIndexBackfill } from "../shared/sec-daily-backfill.js";
import { startPipelineWorker } from "../shared/worker.js";

export function startResearchWorker() {
  const pages = Math.max(1, Math.min(20, researchEnvNum("FEED_PAGES", 3)));

  return startPipelineWorker({
    name: "research/market",
    envPrefix: "RESEARCH",
    sourceTypes: [...QUEUE_SOURCES.researchMarket],
    defaults: {
      enqueueEveryMs: 180_000,
      parsePollMs: 8_000,
      parseThrottleMs: 2_000,
      parseConcurrency: 1,
      backfillIntervalMs: 90_000,
    },
    enqueue: async () => {
      await enqueueResearchSecFilings({ pages });
      await enqueueResearchWebFeeds();
    },
    enqueueBackfill: async () => {
      const forms = researchSecFormsForBackfill(researchSecFormListForBackfill());
      await runSecDailyIndexBackfill({
        pipeline: "research/market",
        forms: forms.map((form) => ({
          form,
          sourceType: "research_sec",
          priority: backfillPriorityForResearchSecForm(form),
        })),
      });
    },
    parseNext: async () => {
      const r = await parseNextResearchQueueItem();
      if (r.processed === false && r.reason === "no_work") return { processed: false, reason: "no_work" };
      return { processed: true };
    },
  });
}
