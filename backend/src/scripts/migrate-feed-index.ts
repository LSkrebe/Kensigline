/**
 * Apply feed index schema and rebuild from documents.
 *
 *   npx tsx src/scripts/migrate-feed-index.ts
 */
import "../load-env.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pool } from "../core/db.js";
import { rebuildFeedIndexFromDocuments } from "../shared/feed-index.js";

const dir = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(dir, "../../db/feed-index.sql"), "utf8");

async function main() {
  await pool.query(sql);
  console.log("[feed-index] schema applied");

  const backfill = await pool.query(
    `
    UPDATE documents d
    SET
      ticker_norm = upper(trim(d.ticker)),
      feed_at = COALESCE(
        d.feed_at,
        CASE
          WHEN d.event_at IS NOT NULL AND d.event_at <= now() + interval '14 days' THEN d.event_at
          ELSE NULL
        END,
        d.published_at,
        d.parsed_at
      )
    WHERE d.ticker IS NOT NULL AND length(trim(d.ticker)) > 0
    `,
  );
  console.log("[feed-index] backfilled document columns", backfill.rowCount);

  await rebuildFeedIndexFromDocuments();
  const counts = await pool.query<{ table_name: string; n: string }>(
    `
    SELECT 'feed_ticker_latest' AS table_name, count(*)::text AS n FROM feed_ticker_latest
    UNION ALL
    SELECT 'feed_market_latest', count(*)::text FROM feed_market_latest
    `,
  );
  for (const row of counts.rows) {
    console.log(`[feed-index] ${row.table_name}: ${row.n} rows`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
