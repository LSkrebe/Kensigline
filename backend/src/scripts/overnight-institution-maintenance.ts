/**
 * Full institution data repair — run with API stopped (see run-overnight-institution-maintenance.sh).
 *
 *   npx tsx src/scripts/overnight-institution-maintenance.ts
 *   npx tsx src/scripts/overnight-institution-maintenance.ts --dry-run
 *   npx tsx src/scripts/overnight-institution-maintenance.ts --fetch-sec
 */
import "../load-env.js";
import pg from "pg";
import { isPlaceholderInvestorName } from "../research/market/tracked-investors-filter.js";
import { maintenanceDatabaseUrl, withMaintenanceClient } from "./lib/maintenance-db.js";
import {
  countPlaceholderInstitutionTxns,
  repairAllCikNamedFilers,
  repairAllGenericInstitutionGroups,
} from "./repair-institution-filer-names.js";
import { relabelInstitutionActivities } from "./relabel-institution-activities.js";
import { purgePlaceholderInstitutionTransactions } from "./purge-placeholder-institution-data.js";

const dryRun = process.argv.includes("--dry-run");
const fetchSec = process.argv.includes("--fetch-sec");
const skipRelabel = process.argv.includes("--skip-relabel");
const skipPurge = process.argv.includes("--skip-purge");

async function printStats(client: pg.PoolClient, label: string) {
  const top = await client.query<{ name: string; n: string }>(
    `
    SELECT f.display_name AS name, count(*)::text AS n
    FROM institution_transactions t
    JOIN filers f ON f.id = t.filer_id
    GROUP BY f.display_name
    ORDER BY count(*) DESC
    LIMIT 8
    `,
  );
  const placeholder = await countPlaceholderInstitutionTxns(client);
  console.log(`[maintenance] ${label} placeholder_txns=${placeholder}`);
  for (const row of top.rows) {
    const mark = isPlaceholderInvestorName(row.name) ? " (PLACEHOLDER)" : "";
    console.log(`  ${row.name}: ${row.n}${mark}`);
  }
}

async function main() {
  const started = Date.now();
  console.log("[maintenance] start", { dryRun, fetchSec, skipRelabel, skipPurge });

  await withMaintenanceClient(async (client) => {
    await printStats(client, "before");

    console.log("[maintenance] phase=1 repair_generic_institution");
    const generic = await repairAllGenericInstitutionGroups(client, { dryRun, fetchSec, batchSize: 40 });
    console.log("[maintenance] phase=1 done", generic);

    console.log("[maintenance] phase=2 repair_cik_filers");
    const cik = await repairAllCikNamedFilers(client, { dryRun, batchSize: 80 });
    console.log("[maintenance] phase=2 done", cik);

    if (!skipPurge) {
      console.log("[maintenance] phase=3 purge_unrecoverable_placeholder");
      const purged = await purgePlaceholderInstitutionTransactions(client, { dryRun });
      console.log("[maintenance] phase=3 done", purged);
    }

    if (!skipRelabel) {
      console.log("[maintenance] phase=4 relabel_activities");
      const relabeled = await relabelInstitutionActivities(client, { dryRun });
      console.log("[maintenance] phase=4 done", relabeled);
    }

    await printStats(client, "after");
  });

  const elapsedMin = ((Date.now() - started) / 60_000).toFixed(1);
  console.log(`[maintenance] complete elapsed_min=${elapsedMin} dryRun=${dryRun}`);
}

main().catch((err) => {
  console.error("[maintenance] failed", err);
  process.exit(1);
});
