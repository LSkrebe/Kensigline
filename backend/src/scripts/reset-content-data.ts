/**
 * Clear document/ingest/market cache data; keep user accounts, billing, and alert watchlists.
 *
 *   npx tsx src/scripts/reset-content-data.ts
 */
import "../load-env.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pool } from "../core/db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, "../../db/reset-content.sql");

/** Legacy tables from older schemas — best-effort truncate before main script. */
const LEGACY_TRUNCATES = [
  "research_memos",
  "ticker_feed_state",
  "gov_contract_ticker_links",
  "gov_contract_awards",
  "clinical_catalysts",
  "clinical_milestones",
  "clinical_programs",
  "bosha_documents",
  "bosha_entities",
  "bosha_ticker_state",
  "bosha_papers",
  "bosha_score_log",
  "bosha_events",
  "bosha_relationships",
  "bosha_claims",
  "bosha_exploration_queue",
  "document_parsed",
];

async function truncateIfExists(table: string): Promise<void> {
  try {
    await pool.query(`TRUNCATE TABLE ${table} CASCADE`);
    console.log(`[reset] truncated ${table}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("does not exist")) return;
    console.warn(`[reset] skip ${table}:`, msg.split("\n")[0]);
  }
}

async function main() {
  for (const table of LEGACY_TRUNCATES) {
    await truncateIfExists(table);
  }

  const sql = readFileSync(sqlPath, "utf8");
  await pool.query(sql);

  const kept = await pool.query<{ relname: string; n: string }>(
    `
    SELECT c.relname, c.reltuples::bigint::text AS n
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname = ANY($1::text[])
    ORDER BY c.relname
    `,
    [
      [
        "billing_accounts",
        "alert_preferences",
        "alert_watchlist",
        "alert_actor_watchlist",
        "alert_digest_log",
        "documents",
        "companies",
        "bars",
      ],
    ],
  );

  console.log("[reset] content wipe complete — preserved user tables:");
  for (const row of kept.rows) {
    console.log(`  ${row.relname}: ~${row.n} rows`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error("[reset] failed", err);
  process.exit(1);
});
