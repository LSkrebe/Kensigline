import { enqueueResearchSecFilings, enqueueResearchWebFeeds } from "./market/ingest.js";
import { parseNextResearchQueueItem } from "./market/parse.js";
import { researchEnv, researchEnvNum } from "../documents/spec.js";
import { QUEUE_SOURCES } from "../pipelines/registry.js";
import { runSecDailyIndexBackfill } from "../shared/sec-daily-backfill.js";
import { startPipelineWorker } from "../shared/worker.js";

function researchSecForms(): string[] {
  return String(
    researchEnv(
      "SEC_FORMS",
      "8-K,10-Q,10-K,6-K,20-F,S-1,S-3,S-4,DEF 14A,424B5,SC 13D,SC 13G",
    ),
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

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
      const forms = researchSecForms();
      await runSecDailyIndexBackfill({
        pipeline: "research/market",
        forms: forms.map((form) => ({ form, sourceType: "research_sec", priority: 1 })),
      });
    },
    parseNext: async () => {
      const r = await parseNextResearchQueueItem();
      if (r.processed === false && r.reason === "no_work") return { processed: false, reason: "no_work" };
      return { processed: true };
    },
  });
}
