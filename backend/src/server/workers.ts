import { startResearchWorker } from "../research/worker.js";
import { startInsiderWorker } from "../investigate/insider/worker.js";
import { startPoliticiansWorker } from "../investigate/politicians/worker.js";
import { startInstitutionsWorker } from "../investigate/institutions/worker.js";
import { startOutcomesWorker } from "../core/outcomes-worker.js";
import { runOutcomesRecomputeOnce } from "../core/outcomes-worker.js";
import { startPoliticianCommitteeRefreshWorker } from "../politicians/committees.js";
import { startBarsRefreshWorker } from "../core/bars-worker.js";
import { startRetentionWorker, runRetentionPurgeOnce } from "../core/retention.js";
import { runWithWorkerDb } from "../core/db.js";
import { bootstrapBackfillCapacity, startBackfillCapacityAllocator } from "../shared/backfill-capacity.js";

export type Stoppable = { stop(): void };

function envEnabled(key: string, defaultOn = true): boolean {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return defaultOn;
  const v = String(raw).trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "off";
}

/** All background workers — add new pipelines here. */
export async function startAllWorkers(): Promise<Stoppable[]> {
  await bootstrapBackfillCapacity();
  const workers: Stoppable[] = [];

  workers.push(startBackfillCapacityAllocator());

  if (envEnabled("INSIDER_WORKER_ENABLED", true)) workers.push(startInsiderWorker());
  if (envEnabled("OUTCOMES_WORKER_ENABLED", true)) workers.push(startOutcomesWorker());
  if (envEnabled("POLITICIANS_WORKER_ENABLED", true)) workers.push(startPoliticiansWorker());
  if (envEnabled("INSTITUTIONS_WORKER_ENABLED", true)) workers.push(startInstitutionsWorker());
  if (envEnabled("RESEARCH_WORKER_ENABLED", true)) workers.push(startResearchWorker());
  if (envEnabled("POLITICIAN_COMMITTEES_WORKER_ENABLED", true)) {
    workers.push(startPoliticianCommitteeRefreshWorker());
  }
  // bars-worker self-gates on BARS_REFRESH_ENABLED
  workers.push(startBarsRefreshWorker());
  if (envEnabled("RETENTION_WORKER_ENABLED", true)) workers.push(startRetentionWorker());

  console.info(
    `[workers] started=${workers.length} institutions=${envEnabled("INSTITUTIONS_WORKER_ENABLED", true)} outcomes=${envEnabled("OUTCOMES_WORKER_ENABLED", true)}`,
  );

  // Default off: startup recompute was pinning the DB pool and crashing the API under memory spikes.
  if (String(process.env.OUTCOMES_RECOMPUTE_ON_START ?? "0").trim() === "1") {
    void runWithWorkerDb(() => runOutcomesRecomputeOnce()).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[outcomes] startup recompute skipped:", msg);
    });
  }

  if (String(process.env.RETENTION_PURGE_ON_START ?? "0").trim() === "1") {
    void runWithWorkerDb(() => runRetentionPurgeOnce())
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
