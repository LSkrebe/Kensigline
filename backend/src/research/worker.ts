import { enqueueResearchSecFilings, enqueueResearchWebFeeds } from "./market/ingest.js";
import { parseNextResearchQueueItem } from "./market/parse.js";
import { researchEnvNum } from "../documents/spec.js";
import { startPipelineWorker } from "../shared/worker.js";

export function startResearchWorker() {
  const pages = Math.max(1, Math.min(20, researchEnvNum("FEED_PAGES", 3)));

  return startPipelineWorker({
    name: "research/market",
    envPrefix: "RESEARCH",
    defaults: {
      enqueueEveryMs: 180_000,
      parsePollMs: 8_000,
      parseThrottleMs: 2_000,
      parseConcurrency: 1,
    },
    enqueue: async () => {
      await enqueueResearchSecFilings({ pages });
      await enqueueResearchWebFeeds();
    },
    parseNext: async () => {
      const r = await parseNextResearchQueueItem();
      if (r.processed === false && r.reason === "no_work") return { processed: false, reason: "no_work" };
      return { processed: true };
    },
  });
}
