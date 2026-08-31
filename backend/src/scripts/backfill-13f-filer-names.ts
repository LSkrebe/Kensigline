/**
 * Repair 13F institution filer names (manual / partial runs).
 * For full overnight repair use overnight-institution-maintenance.ts instead.
 */
import "../load-env.js";
import { withMaintenanceClient } from "./lib/maintenance-db.js";
import { repairAllCikNamedFilers, repairAllGenericInstitutionGroups } from "./repair-institution-filer-names.js";

const dryRun = process.argv.includes("--dry-run");
const fetchSec = process.argv.includes("--fetch-sec");
const cikOnly = process.argv.includes("--cik-only");
const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 500);

async function main() {
  await withMaintenanceClient(async (client) => {
    let generic = { repairedGroups: 0, updatedTxns: 0, skipped: 0, rounds: 0 };
    let cik = { repaired: 0, skipped: 0, rounds: 0 };

    if (!cikOnly) {
      generic = await repairAllGenericInstitutionGroups(client, {
        dryRun,
        fetchSec,
        batchSize: Math.min(limit, 500),
        maxRounds: 1,
      });
    }
    cik = await repairAllCikNamedFilers(client, {
      dryRun,
      batchSize: Math.min(limit, 500),
      maxRounds: 1,
    });

    console.log("done", { ...generic, cikRepaired: cik.repaired, dryRun, fetchSec, cikOnly });
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
