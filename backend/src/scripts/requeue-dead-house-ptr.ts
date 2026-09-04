/**
 * Re-queue dead House PTR rows that failed due to parser gaps (safe to retry after parser fixes).
 * Run: export DATABASE_URL=... && node dist/scripts/requeue-dead-house-ptr.js
 */
import { db } from "../core/db.js";

const RETRYABLE = [
  "house_ptr_low_confidence_parse",
  "skipped_missing_tickers",
  "skipped_missing_tickers_or_filer",
  "skipped_no_reportable_transactions",
];

async function main() {
  const dead = await db.queryApi<{ url: string; last_error: string | null }>(
    `
    SELECT url, last_error
    FROM document_queue
    WHERE source_type = 'house_ptr'
      AND status = 'dead'
      AND (
        last_error = ANY($1::text[])
        OR last_error LIKE 'house_ptr_low_confidence%'
        OR last_error LIKE 'skipped_missing_%'
        OR last_error LIKE 'skipped_no_reportable%'
      )
    `,
    [RETRYABLE],
    120_000,
  );

  const urls = [...new Set(dead.map((r) => r.url).filter(Boolean))];
  console.log(`[requeue-dead-house-ptr] retryable=${urls.length}`);

  if (!urls.length) return;

  await db.queryApi(
    `DELETE FROM politician_transactions WHERE filing_id IN (SELECT id FROM filings WHERE url = ANY($1::text[]))`,
    [urls],
    120_000,
  );
  await db.queryApi(`DELETE FROM filings WHERE url = ANY($1::text[])`, [urls], 120_000);

  const requeued = await db.queryApi(
    `
    UPDATE document_queue
    SET status = 'ready_to_parse',
        priority = 5,
        last_error = NULL,
        next_attempt_at = NULL,
        updated_at = now()
    WHERE source_type = 'house_ptr'
      AND url = ANY($1::text[])
    RETURNING id
    `,
    [urls],
    120_000,
  );

  console.log(`[requeue-dead-house-ptr] requeued=${requeued.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[requeue-dead-house-ptr] failed", err);
    process.exit(1);
  });
