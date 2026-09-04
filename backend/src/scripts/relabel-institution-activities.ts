import type pg from "pg";
import { isPlaceholderInvestorName } from "../research/market/tracked-investors-filter.js";
import { mapPoolLimit, prepareMaintenanceClient } from "./lib/maintenance-db.js";

export type RelabelOpts = {
  dryRun?: boolean;
  /** Parallel filer relabels (default 3). */
  parallelism?: number;
};

function relabelActivityCte(filerIdParam = "$1::uuid"): string {
  return `
    WITH ranked AS (
      SELECT
        t.id,
        t.shares,
        t.activity,
        t.transaction_at,
        MIN(t.transaction_at) OVER (PARTITION BY t.filer_id) AS filer_first_at,
        LAG(t.shares) OVER (
          PARTITION BY t.issuer_id
          ORDER BY t.transaction_at ASC, t.id ASC
        ) AS prior_shares,
        LAG(t.activity) OVER (
          PARTITION BY t.issuer_id
          ORDER BY t.transaction_at ASC, t.id ASC
        ) AS prior_activity
      FROM institution_transactions t
      WHERE t.filer_id = ${filerIdParam}
    ),
    next_activity AS (
      SELECT
        id,
        CASE
          WHEN prior_shares IS NULL AND transaction_at = filer_first_at THEN 'Held'
          WHEN prior_shares IS NULL OR NOT (prior_shares > 0) THEN 'New position'
          WHEN shares IS NULL OR NOT (shares > 0) THEN 'New position'
          WHEN shares > prior_shares THEN 'Increased stake'
          WHEN shares < prior_shares THEN 'Reduced stake'
          WHEN prior_activity IN ('Increased stake', 'New position', 'Reduced stake', 'Held') THEN prior_activity
          ELSE 'New position'
        END AS computed
      FROM ranked
    )
  `;
}

/** One windowed pass per filer (all issuers) instead of one query per issuer. */
async function backfillFilerAllIssuers(
  client: pg.PoolClient,
  filerId: string,
  dryRun: boolean,
): Promise<number> {
  if (dryRun) {
    const preview = await client.query<{ n: string }>(
      `
      ${relabelActivityCte()}
      SELECT count(*)::text AS n
      FROM institution_transactions t
      JOIN next_activity n ON n.id = t.id
      WHERE coalesce(t.activity, '') IS DISTINCT FROM n.computed
      `,
      [filerId],
    );
    return Number(preview.rows[0]?.n ?? 0);
  }

  const res = await client.query<{ id: string }>(
    `
    ${relabelActivityCte()}
    UPDATE institution_transactions t
    SET activity = n.computed
    FROM next_activity n
    WHERE t.id = n.id
      AND coalesce(t.activity, '') IS DISTINCT FROM n.computed
    RETURNING t.id
    `,
    [filerId],
  );
  return res.rowCount ?? 0;
}

export async function relabelInstitutionActivities(
  pool: pg.Pool,
  coordinator: pg.PoolClient,
  opts: RelabelOpts,
): Promise<{ filersTouched: number; updatedRows: number }> {
  const dryRun = opts.dryRun === true;
  const filerParallelism = Math.min(4, Math.max(1, opts.parallelism ?? 3));

  const filersRes = await coordinator.query<{ id: string; name: string }>(
    `
    SELECT id::text AS id, display_name AS name
    FROM filers
    WHERE filer_type = 'institution'::filer_type
    ORDER BY display_name
    `,
  );

  const realFilers = filersRes.rows.filter((f) => !isPlaceholderInvestorName(f.name));

  console.log(
    `[relabel] filers=${realFilers.length} skipped_placeholders=${filersRes.rows.length - realFilers.length} filerParallelism=${filerParallelism} mode=per_filer dryRun=${dryRun}`,
  );

  let filersTouched = 0;
  let total = 0;

  const counts = await mapPoolLimit(realFilers, filerParallelism, async (filer, index) => {
    const client = await pool.connect();
    try {
      await prepareMaintenanceClient(client);
      const filerTotal = await backfillFilerAllIssuers(client, filer.id, dryRun);
      if (filerTotal > 0) {
        console.log(`[relabel] ${filer.name}: updated=${filerTotal}`);
      }
      if ((index + 1) % 50 === 0 || index + 1 === realFilers.length) {
        console.log(`[relabel] progress ${index + 1}/${realFilers.length}`);
      }
      return filerTotal;
    } finally {
      client.release();
    }
  });

  for (const filerTotal of counts) {
    if (filerTotal > 0) {
      filersTouched += 1;
      total += filerTotal;
    }
  }

  return { filersTouched, updatedRows: total };
}
