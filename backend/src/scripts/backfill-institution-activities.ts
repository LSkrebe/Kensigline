/**
 * Recompute institution transaction activities from prior share counts.
 * Fixes bulk "New position" rows when prior quarter data already existed.
 *
 * Usage: npx tsx src/scripts/backfill-institution-activities.ts
 */
import { db } from "../core/db.js";

async function main() {
  const updated = await db.query<{ count: string }>(
    `
    WITH ranked AS (
      SELECT
        t.id,
        t.shares,
        t.activity,
        LAG(t.shares) OVER (
          PARTITION BY t.filer_id, t.issuer_id
          ORDER BY t.transaction_at ASC, t.id ASC
        ) AS prior_shares,
        LAG(t.activity) OVER (
          PARTITION BY t.filer_id, t.issuer_id
          ORDER BY t.transaction_at ASC, t.id ASC
        ) AS prior_activity
      FROM institution_transactions t
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
  );

  const count = updated.length;
  console.log(`[backfill-institution-activities] updated_rows=${count}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[backfill-institution-activities] failed", err);
    process.exit(1);
  });
