import {startDisclosureHistoryWorker} from '../core/disclosure-history-worker.js';
import {startDailyMarketWorker} from '../core/disclosure-bulk-prices.js';
import { startInsiderWorker } from "../investigate/insider/worker.js";
import { startPoliticiansWorker } from "../investigate/politicians/worker.js";
import { startInstitutionsWorker } from "../investigate/institutions/worker.js";
import {
  bootstrapBackfillCapacity,
  startBackfillCapacityAllocator,
} from "../shared/backfill-capacity.js";
import { startDisclosurePriceWorker } from "../core/disclosure-prices.js";
export type Stoppable = { stop(): void };
export async function startAllWorkers(): Promise<Stoppable[]> {
  // Only the three disclosure pipelines belong to the product runtime.
  process.env.AI_RUNTIME_ENABLED = "0";
  process.env.RESEARCH_WORKER_ENABLED = "0";
  process.env.INSTITUTIONS_LLM_FALLBACK = "0";
  await bootstrapBackfillCapacity();
  const workers: Stoppable[] = [
    startBackfillCapacityAllocator(),
    startDisclosurePriceWorker(),
    startDailyMarketWorker(),
    startDisclosureHistoryWorker(),
  ];
  if (process.env.INSIDER_WORKER_ENABLED !== "0")
    workers.push(startInsiderWorker());
  if (process.env.POLITICIANS_WORKER_ENABLED !== "0")
    workers.push(startPoliticiansWorker());
  if (process.env.INSTITUTIONS_WORKER_ENABLED !== "0")
    workers.push(startInstitutionsWorker());
  console.info(`[workers] disclosure pipelines started=${workers.length - 1}`);
  return workers;
}
export function stopAllWorkers(workers: Stoppable[]) {
  for (const worker of workers) worker.stop();
}
