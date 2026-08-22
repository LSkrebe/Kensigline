import "../load-env.js";
import { pool } from "../core/db.js";

async function main() {
  const r = await pool.query<{
    insiders: string;
    politicians: string;
    inst_ok: string;
    inst_bad: string;
  }>(`
    SELECT
      (SELECT count(*)::text FROM insider_transactions WHERE transaction_at >= now() - interval '14 days') AS insiders,
      (SELECT count(*)::text FROM politician_transactions WHERE transaction_at >= now() - interval '14 days') AS politicians,
      (SELECT count(*)::text FROM institution_transactions t JOIN filers f ON f.id=t.filer_id
        WHERE lower(trim(f.display_name)) NOT IN ('institution','institutions')) AS inst_ok,
      (SELECT count(*)::text FROM institution_transactions t JOIN filers f ON f.id=t.filer_id
        WHERE lower(trim(f.display_name)) IN ('institution','institutions')) AS inst_bad
  `);
  console.log("counts_14d", r.rows[0]);

  const top = await pool.query(`SELECT f.display_name, count(*)::int c
    FROM institution_transactions t JOIN filers f ON f.id=t.filer_id
    GROUP BY 1 ORDER BY c DESC LIMIT 8`);
  console.log("top_filers", top.rows);

  const byDay = await pool.query(`
    SELECT d::date::text AS day, src, cnt FROM (
      SELECT date_trunc('day', t.transaction_at) AS d, 'insider' AS src, count(*)::int AS cnt
      FROM insider_transactions t WHERE t.transaction_at >= now() - interval '7 days' GROUP BY 1
      UNION ALL
      SELECT date_trunc('day', t.transaction_at), 'politician', count(*)::int
      FROM politician_transactions t WHERE t.transaction_at >= now() - interval '7 days' GROUP BY 1
      UNION ALL
      SELECT date_trunc('day', t.transaction_at), 'institution', count(*)::int
      FROM institution_transactions t JOIN filers f ON f.id=t.filer_id
      WHERE t.transaction_at >= now() - interval '7 days'
        AND lower(trim(f.display_name)) NOT IN ('institution','institutions')
      GROUP BY 1
    ) x ORDER BY day DESC, src
  `);
  console.log("by_day_7d", byDay.rows);

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
