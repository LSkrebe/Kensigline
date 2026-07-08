/**
 * One-off repair: move far-future event_at values to data.catalyst_at and reset activity to filed/parsed.
 *
 *   npx tsx src/scripts/fix-future-event-at.ts
 */
import "../load-env.js";
import { pool } from "../core/db.js";
import { FEED_FUTURE_GRACE_DAYS } from "../shared/document-activity-at.js";

async function main() {
  const grace = `${FEED_FUTURE_GRACE_DAYS} days`;
  const before = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM documents WHERE event_at > now() + ($1::interval)`,
    [grace],
  );
  console.log("future_event_at_before", before.rows[0]?.c ?? "0");

  const r = await pool.query(
    `
    UPDATE documents d
    SET
      data = CASE
        WHEN d.data IS NULL OR d.data = 'null'::jsonb THEN jsonb_build_object('catalyst_at', d.event_at::text)
        WHEN (d.data ? 'catalyst_at') AND NULLIF(trim(d.data->>'catalyst_at'), '') IS NOT NULL THEN d.data
        ELSE d.data || jsonb_build_object('catalyst_at', d.event_at::text)
      END,
      event_at = COALESCE(
        NULLIF(trim(d.data->'filing'->>'filed_at'), '')::timestamptz,
        d.published_at,
        d.parsed_at
      )
    WHERE d.event_at > now() + ($1::interval)
    `,
    [grace],
  );
  console.log("rows_updated", r.rowCount);

  const after = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM documents WHERE event_at > now() + ($1::interval)`,
    [grace],
  );
  console.log("future_event_at_after", after.rows[0]?.c ?? "0");

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
