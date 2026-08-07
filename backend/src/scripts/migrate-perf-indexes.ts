/**
 * Apply perf indexes + column backfills (safe to re-run).
 *
 *   npx tsx src/scripts/migrate-perf-indexes.ts
 */
import "../load-env.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pool } from "../core/db.js";
import { syncFeedIndexForDocument } from "../shared/feed-index.js";

const dir = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(dir, "../../db/perf-indexes.sql"), "utf8");

async function refreshRecentFeedIndex(days = 45, batchSize = 200): Promise<number> {
  let done = 0;
  let lastId: string | null = null;
  for (;;) {
    const result = await pool.query<{ id: string }>(
      `
      SELECT id::text AS id
      FROM documents
      WHERE ticker_norm IS NOT NULL
        AND feed_at IS NOT NULL
        AND feed_at >= now() - ($1 || ' days')::interval
        AND ($2::uuid IS NULL OR id > $2::uuid)
      ORDER BY id ASC
      LIMIT $3
      `,
      [String(days), lastId, batchSize],
    );
    const rows: Array<{ id: string }> = result.rows;
    if (!rows.length) break;
    for (const row of rows) {
      await syncFeedIndexForDocument(row.id);
      lastId = row.id;
      done += 1;
    }
    if (rows.length < batchSize) break;
  }
  return done;
}

async function main() {
  // Split statements so CREATE INDEX can run outside a single multi-statement failure mode.
  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  for (const statement of statements) {
    const label = statement.slice(0, 72).replace(/\s+/g, " ");
    console.log(`[perf] ${label}…`);
    const started = Date.now();
    await pool.query(statement);
    console.log(`[perf] done in ${Date.now() - started}ms`);
  }

  const refreshed = await refreshRecentFeedIndex(45);
  console.log(`[perf] refreshed feed index for ${refreshed} recent documents`);

  const counts = await pool.query<{ table_name: string; n: string }>(
    `
    SELECT 'documents' AS table_name, count(*)::text AS n FROM documents
    UNION ALL
    SELECT 'feed_ticker_latest', count(*)::text FROM feed_ticker_latest
    UNION ALL
    SELECT 'feed_market_latest', count(*)::text FROM feed_market_latest
    `,
  );
  for (const row of counts.rows) {
    console.log(`[perf] ${row.table_name}: ${row.n}`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
