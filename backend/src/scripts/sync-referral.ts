/**
 * Sync REFERRAL_SOURCES from env and disable retired campaign keys.
 *
 *   npx tsx src/scripts/sync-referral.ts
 */
import "../load-env.js";
import { pool } from "../core/db.js";
import { ORGANIC_REFERRAL_KEY } from "../referral/config.js";
import { listReferralStats, syncReferralSourcesFromEnv } from "../referral/store.js";

const RETIRED_KEYS = ["direct", "unknown"];

async function main() {
  await syncReferralSourcesFromEnv();

  if (RETIRED_KEYS.length) {
    const retired = await pool.query<{ source_key: string }>(
      `
      UPDATE referral_sources
      SET enabled = false, updated_at = now()
      WHERE source_key = ANY($1::text[])
        AND source_key <> $2
      RETURNING source_key
      `,
      [RETIRED_KEYS, ORGANIC_REFERRAL_KEY],
    );
    if (retired.rows.length) {
      console.log("[referral] disabled retired keys:", retired.rows.map((r) => r.source_key).join(", "));
    }
  }

  const stats = await listReferralStats();
  for (const row of stats) {
    console.log(
      `[referral] ${row.source_key} enabled=${row.enabled} system=${row.system} visits=${row.visits} signups=${row.signups}`,
    );
  }
  console.log("[referral] sync ok");
  await pool.end();
}

main().catch((err) => {
  console.error("[referral] sync failed", err);
  process.exit(1);
});
