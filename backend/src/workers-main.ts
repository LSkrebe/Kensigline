/**
 * Optional workers-only process. Run with WORKERS_ENABLED=1 (default) while the
 * API process sets WORKERS_ENABLED=0 so ingest does not share the API event loop.
 *
 *   node dist/workers-main.js
 */
import "./load-env.js";
import { startAllWorkers, stopAllWorkers } from "./server/workers.js";

const workers = await startAllWorkers();
console.log(`[workers-main] started ${workers.length} workers`);

function shutdown() {
  stopAllWorkers(workers);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
