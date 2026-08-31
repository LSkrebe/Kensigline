/**
 * Relabel institution transaction activities (manual run).
 */
import "../load-env.js";
import { createMaintenancePool, prepareMaintenanceClient } from "./lib/maintenance-db.js";
import { relabelInstitutionActivities } from "./relabel-institution-activities.js";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const pool = createMaintenancePool(3);
  const coordinator = await pool.connect();
  try {
    await prepareMaintenanceClient(coordinator);
    const result = await relabelInstitutionActivities(pool, coordinator, { dryRun, parallelism: 3 });
    console.log("[backfill-institution-activities] done", result);
  } finally {
    coordinator.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[backfill-institution-activities] failed", err);
  process.exit(1);
});
