/**
 * Clear document/ingest/market cache data; keep user accounts, billing, and alert watchlists.
 *
 *   npx tsx src/scripts/reset-content-data.ts
 */
import "../load-env.js";
import { pool } from "../core/db.js";

const CONTENT_TRUNCATES = [
  "alert_ticker_sent_log",
  "alert_actor_sent_log",
  "insider_transactions",
  "politician_transactions",
  "institution_filings_13f",
  "documents",
  "document_queue",
  "outcomes",
  "bars",
  "ticker_context_cache",
  "ingest_cursors",
  "companies",
];

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

const PRESERVED_TABLES = [
  "billing_accounts",
  "referral_sources",
  "user_attribution",
  "alert_preferences",
  "alert_watchlist",
  "alert_actor_watchlist",
  "alert_digest_log",
];

async function truncateIfExists(table: string): Promise<boolean> {
  try {
    await pool.query(`TRUNCATE TABLE ${table} CASCADE`);
    console.log(`[reset] truncated ${table}`);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("does not exist")) {
      console.log(`[reset] skip ${table} (not present)`);
      return false;
    }
    throw err;
  }
}

async function countTable(table: string): Promise<string> {
  try {
    const r = await pool.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${table}`);
    return r.rows[0]?.n ?? "?";
  } catch {
    return "—";
  }
}

async function main() {
  for (const table of [...LEGACY_TRUNCATES, ...CONTENT_TRUNCATES]) {
    await truncateIfExists(table);
  }

  console.log("[reset] content wipe complete — preserved user tables:");
  for (const table of PRESERVED_TABLES) {
    const n = await countTable(table);
    console.log(`  ${table}: ${n} rows`);
  }

  for (const table of ["documents", "companies", "bars", "document_queue"]) {
    const n = await countTable(table);
    console.log(`  ${table}: ${n} rows`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error("[reset] failed", err);
  process.exit(1);
});
