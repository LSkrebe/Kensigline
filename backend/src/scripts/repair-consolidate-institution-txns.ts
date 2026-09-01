/**
 * Targeted repair: merge duplicate institution_transactions rows that share a filing_id.
 * Does NOT re-parse 13F filings or rerun overnight maintenance.
 *
 * Usage:
 *   node --import ./dist/load-env.js dist/scripts/repair-consolidate-institution-txns.js
 *   node --import ./dist/load-env.js dist/scripts/repair-consolidate-institution-txns.js --slug=boston-research-management
 *   node --import ./dist/load-env.js dist/scripts/repair-consolidate-institution-txns.js --dry-run
 *   node --import ./dist/load-env.js dist/scripts/repair-consolidate-institution-txns.js --parallel=4
 */
import { createMaintenancePool, mapPoolLimit, prepareMaintenanceClient } from "./lib/maintenance-db.js";
import { ensureInstitutionTxnOnePerFilingIndex } from "../investigate/institutions/institution-txn-guards.js";

type Opts = { slug?: string | undefined; dryRun?: boolean; parallel: number };

function parseArgs(): Opts {
  const slugArg = process.argv.find((a) => a.startsWith("--slug="));
  const parArg = process.argv.find((a) => a.startsWith("--parallel="));
  const parallel = parArg ? Math.min(6, Math.max(1, Number(parArg.slice("--parallel=".length)) || 4)) : 4;
  return {
    slug: slugArg ? slugArg.slice("--slug=".length).trim() : undefined,
    dryRun: process.argv.includes("--dry-run"),
    parallel,
  };
}

function dupFilingsCte(filerId?: string): string {
  const filerFilter = filerId ? `WHERE filer_id = $1::uuid` : "";
  return `
    dup_filings AS (
      SELECT filing_id
      FROM institution_transactions
      ${filerFilter}
      GROUP BY filing_id
      HAVING count(*) > 1
    ),
    agg AS (
      SELECT
        t.filing_id,
        (array_agg(t.id ORDER BY t.id))[1] AS keep_id,
        sum(t.shares) AS shares,
        sum(t.amount_usd) AS amount_usd,
        (array_agg(t.activity ORDER BY t.id))[1] AS activity
      FROM institution_transactions t
      JOIN dup_filings d ON d.filing_id = t.filing_id
      GROUP BY t.filing_id
    )
  `;
}

async function repairBulk(client: import("pg").PoolClient, filerId: string, dryRun: boolean): Promise<number> {
  const params = [filerId];
  const preview = await client.query<{ filings: string; removed: string }>(
    `
    WITH ${dupFilingsCte(filerId)}
    SELECT
      count(*)::text AS filings,
      (
        SELECT count(*)::text
        FROM institution_transactions t
        JOIN dup_filings d ON d.filing_id = t.filing_id
        JOIN agg a ON a.filing_id = t.filing_id
        WHERE t.id <> a.keep_id
      ) AS removed
    FROM dup_filings
    `,
    params,
  );
  const filings = Number(preview.rows[0]?.filings ?? 0);
  const removed = Number(preview.rows[0]?.removed ?? 0);
  if (removed > 0) {
    console.log(`[repair] duplicate_filings=${filings} rows_to_remove=${removed} dryRun=${dryRun}`);
  }
  if (!removed || dryRun) return removed;

  await client.query("BEGIN");
  try {
    await client.query(
      `
      WITH ${dupFilingsCte(filerId)}
      UPDATE institution_transactions t
      SET shares = a.shares, amount_usd = a.amount_usd, activity = a.activity
      FROM agg a
      WHERE t.id = a.keep_id
      `,
      params,
    );
    const del = await client.query(
      `
      WITH ${dupFilingsCte(filerId)}
      DELETE FROM institution_transactions t
      USING agg a
      WHERE t.filing_id = a.filing_id AND t.id <> a.keep_id
      `,
      params,
    );
    await client.query("COMMIT");
    return del.rowCount ?? removed;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
}

async function main() {
  const { slug, dryRun, parallel } = parseArgs();
  const started = Date.now();
  const pool = createMaintenancePool(parallel + 1);
  const coordinator = await pool.connect();

  try {
    await prepareMaintenanceClient(coordinator);
    let filerIds: Array<{ id: string; name: string; slug: string }> = [];

    if (slug) {
      const res = await coordinator.query<{ id: string; name: string; slug: string }>(
        `SELECT id::text AS id, display_name AS name, slug FROM filers WHERE slug = $1 LIMIT 1`,
        [slug],
      );
      if (!res.rows[0]) {
        console.error(`[repair] filer not found slug=${slug}`);
        process.exitCode = 1;
        return;
      }
      filerIds = res.rows;
    } else {
      const res = await coordinator.query<{ id: string; name: string; slug: string }>(
        `
        SELECT id::text AS id, display_name AS name, slug
        FROM filers
        WHERE filer_type = 'institution'::filer_type
        ORDER BY display_name
        `,
      );
      filerIds = res.rows;
    }

    console.log(`[repair] filers=${filerIds.length} dryRun=${dryRun ?? false} parallel=${parallel}`);
    let totalRemoved = 0;
    let touched = 0;

    const results = await mapPoolLimit(filerIds, parallel, async (filer, index) => {
      const client = await pool.connect();
      try {
        await prepareMaintenanceClient(client);
        const removed = await repairBulk(client, filer.id, dryRun === true);
        if (removed > 0) {
          console.log(`[repair] ${filer.name} (${filer.slug}): removed=${removed}`);
        }
        if ((index + 1) % 50 === 0 || index + 1 === filerIds.length) {
          console.log(`[repair] progress ${index + 1}/${filerIds.length}`);
        }
        return removed;
      } finally {
        client.release();
      }
    });

    for (const removed of results) {
      if (removed > 0) {
        touched += 1;
        totalRemoved += removed;
      }
    }

    const sec = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`[repair] done filers_touched=${touched} removed=${totalRemoved} elapsed_s=${sec}`);

    if (!slug && !dryRun) {
      const index = await ensureInstitutionTxnOnePerFilingIndex(coordinator);
      if (index.dupes > 0) {
        console.warn(`[repair] unique_index_skipped duplicate_filings_remaining=${index.dupes}`);
      } else if (index.created) {
        console.log("[repair] unique_index institution_tx_one_per_filing_uidx ensured");
      } else {
        console.log("[repair] unique_index institution_tx_one_per_filing_uidx already present");
      }
    }
  } finally {
    coordinator.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
