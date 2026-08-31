import type pg from "pg";
import { isPlaceholderInvestorName } from "../research/market/tracked-investors-filter.js";

export type RelabelOpts = {
  dryRun?: boolean;
};

async function backfillFilerIssuer(
  client: pg.PoolClient,
  filerId: string,
  issuerId: string,
  dryRun: boolean,
): Promise<number> {
  if (dryRun) {
    const preview = await client.query<{ n: string }>(
      `
      WITH ranked AS (
        SELECT
          t.id,
          t.shares,
          t.activity,
          LAG(t.shares) OVER (ORDER BY t.transaction_at ASC, t.id ASC) AS prior_shares,
          LAG(t.activity) OVER (ORDER BY t.transaction_at ASC, t.id ASC) AS prior_activity
        FROM institution_transactions t
        WHERE t.filer_id = $1::uuid AND t.issuer_id = $2::uuid
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
      SELECT count(*)::text AS n
      FROM institution_transactions t
      JOIN next_activity n ON n.id = t.id
      WHERE coalesce(t.activity, '') IS DISTINCT FROM n.computed
      `,
      [filerId, issuerId],
    );
    return Number(preview.rows[0]?.n ?? 0);
  }

  const res = await client.query<{ id: string }>(
    `
    WITH ranked AS (
      SELECT
        t.id,
        t.shares,
        t.activity,
        LAG(t.shares) OVER (ORDER BY t.transaction_at ASC, t.id ASC) AS prior_shares,
        LAG(t.activity) OVER (ORDER BY t.transaction_at ASC, t.id ASC) AS prior_activity
      FROM institution_transactions t
      WHERE t.filer_id = $1::uuid AND t.issuer_id = $2::uuid
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
    [filerId, issuerId],
  );
  return res.rowCount ?? 0;
}

export async function relabelInstitutionActivities(
  client: pg.PoolClient,
  opts: RelabelOpts,
): Promise<{ filersTouched: number; updatedRows: number }> {
  const dryRun = opts.dryRun === true;

  const filersRes = await client.query<{ id: string; name: string }>(
    `
    SELECT id::text AS id, display_name AS name
    FROM filers
    WHERE filer_type = 'institution'::filer_type
    ORDER BY display_name
    `,
  );

  const realFilers = filersRes.rows.filter((f) => !isPlaceholderInvestorName(f.name));
  let total = 0;
  let filersTouched = 0;

  console.log(
    `[relabel] filers=${realFilers.length} skipped_placeholders=${filersRes.rows.length - realFilers.length} dryRun=${dryRun}`,
  );

  for (let i = 0; i < realFilers.length; i++) {
    const filer = realFilers[i]!;
    const issuersRes = await client.query<{ issuer_id: string }>(
      `SELECT DISTINCT issuer_id::text AS issuer_id FROM institution_transactions WHERE filer_id = $1::uuid`,
      [filer.id],
    );

    let filerTotal = 0;
    for (const { issuer_id } of issuersRes.rows) {
      filerTotal += await backfillFilerIssuer(client, filer.id, issuer_id, dryRun);
    }

    if (filerTotal > 0) {
      filersTouched += 1;
      total += filerTotal;
      console.log(`[relabel] ${filer.name}: updated=${filerTotal}`);
    }

    if ((i + 1) % 25 === 0) {
      console.log(`[relabel] progress ${i + 1}/${realFilers.length}`);
    }
  }

  return { filersTouched, updatedRows: total };
}
