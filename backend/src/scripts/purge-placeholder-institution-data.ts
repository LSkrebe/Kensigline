import type pg from "pg";
import { isPlaceholderInvestorName } from "../research/market/tracked-investors-filter.js";

export type PurgeOpts = {
  dryRun?: boolean;
};

/**
 * Remove institution transactions still tied to placeholder filer names.
 * These are unrecoverable junk (generic "Institution" bucket leftovers).
 */
export async function purgePlaceholderInstitutionTransactions(
  client: pg.PoolClient,
  opts: PurgeOpts,
): Promise<{ deletedTxns: number; deletedFilers: number }> {
  const dryRun = opts.dryRun === true;

  const countRes = await client.query<{ n: string }>(
    `
    SELECT count(*)::text AS n
    FROM institution_transactions t
    JOIN filers f ON f.id = t.filer_id
    WHERE f.filer_type = 'institution'::filer_type
      AND (
        lower(trim(f.display_name)) IN ('institution', 'institutions', 'unknown', 'filer', 'insider', 'politician')
        OR lower(trim(f.display_name)) = 'n/a'
      )
    `,
  );
  const toDelete = Number(countRes.rows[0]?.n ?? 0);
  console.log(`[purge] placeholder_txns_to_delete=${toDelete}`);

  if (!toDelete || dryRun) {
    return { deletedTxns: dryRun ? toDelete : 0, deletedFilers: 0 };
  }

  const delRes = await client.query(
    `
    DELETE FROM institution_transactions t
    USING filers f
    WHERE f.id = t.filer_id
      AND f.filer_type = 'institution'::filer_type
      AND (
        lower(trim(f.display_name)) IN ('institution', 'institutions', 'unknown', 'filer', 'insider', 'politician')
        OR lower(trim(f.display_name)) = 'n/a'
      )
    `,
  );

  const filerRes = await client.query(
    `
    DELETE FROM filers f
    WHERE f.filer_type = 'institution'::filer_type
      AND (
        lower(trim(f.display_name)) IN ('institution', 'institutions', 'unknown', 'filer', 'insider', 'politician')
        OR lower(trim(f.display_name)) = 'n/a'
      )
      AND NOT EXISTS (SELECT 1 FROM institution_transactions t WHERE t.filer_id = f.id)
    `,
  );

  return {
    deletedTxns: delRes.rowCount ?? 0,
    deletedFilers: filerRes.rowCount ?? 0,
  };
}

/** Quick sanity check after maintenance. */
export async function listTopInstitutionFilers(client: pg.PoolClient, limit = 10) {
  const rows = await client.query<{ name: string; n: string }>(
    `
    SELECT f.display_name AS name, count(*)::text AS n
    FROM institution_transactions t
    JOIN filers f ON f.id = t.filer_id
    GROUP BY f.display_name
    ORDER BY count(*) DESC
    LIMIT $1
    `,
    [limit],
  );
  return rows.rows.map((r) => ({
    name: r.name,
    count: Number(r.n),
    placeholder: isPlaceholderInvestorName(r.name),
  }));
}
