import type pg from "pg";
import { db } from "../../core/db.js";

export async function countDuplicateInstitutionFilings(client?: pg.PoolClient): Promise<number> {
  const sql = `
    SELECT count(*)::text AS n
    FROM (
      SELECT filing_id
      FROM institution_transactions
      GROUP BY filing_id
      HAVING count(*) > 1
    ) dup
  `;
  if (client) {
    const res = await client.query<{ n: string }>(sql);
    return Number(res.rows[0]?.n ?? 0);
  }
  const row = await db.one<{ n: string }>(sql);
  return Number(row?.n ?? 0);
}

/** DB-level guarantee: one institution_transactions row per filing. Run after duplicate repair. */
export async function ensureInstitutionTxnOnePerFilingIndex(client?: pg.PoolClient): Promise<{ dupes: number; created: boolean }> {
  const dupes = await countDuplicateInstitutionFilings(client);
  if (dupes > 0) {
    return { dupes, created: false };
  }
  const indexSql = `
    CREATE UNIQUE INDEX IF NOT EXISTS institution_tx_one_per_filing_uidx
      ON institution_transactions (filing_id)
  `;
  if (client) {
    await client.query(indexSql);
  } else {
    await db.query(indexSql);
  }
  return { dupes: 0, created: true };
}

export async function assertSingleInstitutionTxnPerFiling(filingId: string): Promise<void> {
  const row = await db.one<{ n: string }>(
    `SELECT count(*)::text AS n FROM institution_transactions WHERE filing_id = $1::uuid`,
    [filingId],
  );
  const n = Number(row?.n ?? 0);
  if (n > 1) {
    throw new Error(`institution_txn_multi_row_filing filing_id=${filingId} count=${n}`);
  }
}

export type { InstitutionTxnRow } from "./institution-txn-consolidate.js";
export { consolidateInstitutionTxnRows } from "./institution-txn-consolidate.js";
