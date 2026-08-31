/**
 * Relabel institution transaction activities (manual run).
 * For full overnight repair use overnight-institution-maintenance.ts instead.
 */
import "../load-env.js";
import { withMaintenanceClient } from "./lib/maintenance-db.js";
import { relabelInstitutionActivities } from "./relabel-institution-activities.js";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  await withMaintenanceClient(async (client) => {
    const result = await relabelInstitutionActivities(client, { dryRun });
    console.log("[backfill-institution-activities] done", result);
  });
}

main().catch((err) => {
  console.error("[backfill-institution-activities] failed", err);
  process.exit(1);
});
