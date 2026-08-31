/**
 * Recompute institution transaction activities from prior share counts.
 * Fixes bulk "New position" rows when prior quarter data already existed.
 *
 * Usage: npx tsx src/scripts/backfill-institution-activities.ts
 */
import { db } from "../core/db.js";

const FILER_BATCH = 40;

async function backfillFiler(filerId: string): Promise<number> {
  const updated = await db.query<{ id: string }>(
    `
    WITH ranked AS (
      SELECT
        t.id,
        t.shares,
        t.activity,
        LAG(t.shares) OVER (
          PARTITION BY t.issuer_id
          ORDER BY t.transaction_at ASC, t.id ASC
        ) AS prior_shares,
        LAG(t.activity) OVER (
          PARTITION BY t.issuer_id
          ORDER BY t.transaction_at ASC, t.id ASC
        ) AS prior_activity
      FROM institution_transactions t
      WHERE t.filer_id = $1::uuid
    ),
    next_activity AS (
      SELECT
        id,
        CASE
          WHEN prior_shares IS NULL OR NOT (prior_shares > 0) THEN 'New position'
          WHEN shares IS NULL OR NOT (shares > 0) THEN 'New position'
          WHEN shares > prior_shares THEN 'Increased stake'
          WHEN shares < prior_shares THEN 'Reduced stake'
          WHEN prior_activity IN ('Increased stake', 'New position', 'Reduced stake') THEN prior_activity
          ELSE 'New position'
        END AS computed
      FROM ranked
    )
    UPDATE institution_transactions t
    SET activity = n.computed
    FROM next_activity n
    WHERE t.id = n.id
      AND coalesce(t.activity, '') IS DISTINCT FROM n.computed
    RETURNING t.id
    `,
    [filerId],
  );
  return updated.length;
}

async function main() {
  await db.query(`SET statement_timeout = '180s'`);

  const filers = await db.query<{ id: string }>(
    `SELECT DISTINCT filer_id::text AS id FROM institution_transactions ORDER BY filer_id`,
  );

  let total = 0;
  let filersTouched = 0;

  for (let i = 0; i < filers.length; i += FILER_BATCH) {
    const batch = filers.slice(i, i + FILER_BATCH);
    for (const { id } of batch) {
      const n = await backfillFiler(id);
      if (n > 0) {
        filersTouched += 1;
        total += n;
        console.log(`[backfill-institution-activities] filer=${id} updated=${n}`);
      }
    }
    console.log(
      `[backfill-institution-activities] progress=${Math.min(i + FILER_BATCH, filers.length)}/${filers.length}`,
    );
  }

  console.log(
    `[backfill-institution-activities] done filers=${filers.length} touched=${filersTouched} updated_rows=${total}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[backfill-institution-activities] failed", err);
    process.exit(1);
  });
