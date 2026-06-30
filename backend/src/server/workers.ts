import { startResearchWorker } from "../research/worker.js";
import { startInsiderWorker } from "../investigate/insider/worker.js";
import { startPoliticiansWorker } from "../investigate/politicians/worker.js";
import { startInstitutionsWorker } from "../investigate/institutions/worker.js";
import { startOutcomesWorker } from "../core/outcomes-worker.js";
import { runOutcomesRecomputeOnce } from "../core/outcomes-worker.js";
import { startAlertsWorker } from "../alerts/worker.js";
import { startTickerAlertsWorker } from "../alerts/ticker-worker.js";

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
    startTickerAlertsWorker(),
  ];

  if (String(process.env.OUTCOMES_RECOMPUTE_ON_START ?? "1").trim() !== "0") {
    void runOutcomesRecomputeOnce().catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[outcomes] startup recompute skipped:", msg);
    });
  }

  return workers;
}

export function stopAllWorkers(workers: Stoppable[]) {
  for (const w of workers) w.stop();
}
