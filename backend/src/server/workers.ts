import { startResearchWorker } from "../research/worker.js";
import { startInsiderWorker } from "../investigate/insider/worker.js";
import { startPoliticiansWorker } from "../investigate/politicians/worker.js";
import { startInstitutionsWorker } from "../investigate/institutions/worker.js";
import { startOutcomesWorker } from "../core/outcomes-worker.js";
import { runOutcomesRecomputeOnce } from "../core/outcomes-worker.js";
import { startAlertsWorker } from "../alerts/worker.js";
import { startContextAlertsWorker } from "../alerts/context-alerts-worker.js";
import { startPoliticianCommitteeRefreshWorker } from "../politicians/committees.js";
import { startBarsRefreshWorker } from "../core/bars-worker.js";
import { startRetentionWorker, runRetentionPurgeOnce } from "../core/retention.js";

export type Stoppable = { stop(): void };

/** All background workers — add new pipelines here. */
export function startAllWorkers(): Stoppable[] {
  const workers: Stoppable[] = [
    startInsiderWorker(),
    startOutcomesWorker(),
    startPoliticiansWorker(),
    startInstitutionsWorker(),
    startResearchWorker(),
    startAlertsWorker(),
    startContextAlertsWorker(),
    startPoliticianCommitteeRefreshWorker(),
    startBarsRefreshWorker(),
    startRetentionWorker(),
  ];

  if (String(process.env.OUTCOMES_RECOMPUTE_ON_START ?? "1").trim() !== "0") {
    void runOutcomesRecomputeOnce().catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[outcomes] startup recompute skipped:", msg);
    });
  }

  if (String(process.env.RETENTION_PURGE_ON_START ?? "0").trim() === "1") {
    void runRetentionPurgeOnce()
      .then((r) => {
        const touched =
          r.documents + r.bars + r.queue + r.cluster_snapshots + r.feed_ticker_latest + r.feed_market_latest;
        if (touched > 0) console.info("[retention] startup purge", JSON.stringify(r));
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[retention] startup purge skipped:", msg);
      });
  }

  return workers;
}

export function stopAllWorkers(workers: Stoppable[]) {
  for (const w of workers) w.stop();
}
