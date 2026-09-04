/**
 * Re-queue House PTR filings that landed under the generic POLITICIAN filer.
 * Run: npm run build && node dist/scripts/reparse-house-ptr-filers.js
 */
import { db } from "../core/db.js";

async function main() {
  const misfiled = await db.queryApi<{ filing_id: string; url: string }>(
    `
    SELECT fl.id::text AS filing_id, fl.url
    FROM filings fl
    JOIN politician_transactions pt ON pt.filing_id = fl.id
    JOIN filers f ON f.id = pt.filer_id
    WHERE fl.source_type = 'house_ptr'
      AND f.slug = 'politician'
    GROUP BY fl.id, fl.url
    `,
    [],
    120_000,
  );

  const urls = [...new Set(misfiled.map((r) => r.url).filter(Boolean))];
  const filingIds = [...new Set(misfiled.map((r) => r.filing_id).filter(Boolean))];

  console.log(`[reparse-house-ptr] misfiled_filings=${filingIds.length} unique_urls=${urls.length}`);

  if (filingIds.length) {
    await db.queryApi(`DELETE FROM politician_transactions WHERE filing_id = ANY($1::uuid[])`, [filingIds], 120_000);
    await db.queryApi(`DELETE FROM filings WHERE id = ANY($1::uuid[])`, [filingIds], 120_000);
    const requeue = await db.queryApi(
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
    console.log(`[reparse-house-ptr] requeued=${requeue.length}`);
  }

  const orphanParsed = await db.queryApi<{ url: string }>(
    `
    SELECT DISTINCT dq.url
    FROM document_queue dq
    WHERE dq.source_type = 'house_ptr'
      AND dq.status = 'parsed'
      AND NOT EXISTS (
        SELECT 1
        FROM filings fl
        JOIN politician_transactions pt ON pt.filing_id = fl.id
        JOIN filers f ON f.id = pt.filer_id
        WHERE fl.url = dq.url
          AND f.slug <> 'politician'
      )
    `,
    [],
    120_000,
  );
  const orphanUrls = orphanParsed.map((r) => r.url).filter(Boolean);
  if (orphanUrls.length) {
    await db.queryApi(
      `DELETE FROM politician_transactions WHERE filing_id IN (SELECT id FROM filings WHERE url = ANY($1::text[]))`,
      [orphanUrls],
      120_000,
    );
    await db.queryApi(`DELETE FROM filings WHERE url = ANY($1::text[])`, [orphanUrls], 120_000);
    const orphanRequeue = await db.queryApi(
      `
      UPDATE document_queue
      SET status = 'ready_to_parse', priority = 5, last_error = NULL, next_attempt_at = NULL, updated_at = now()
      WHERE source_type = 'house_ptr' AND url = ANY($1::text[])
      RETURNING id
      `,
      [orphanUrls],
      120_000,
    );
    console.log(`[reparse-house-ptr] orphan_requeued=${orphanRequeue.length}`);
  }

  if (!filingIds.length && !orphanUrls.length) {
    console.log("[reparse-house-ptr] nothing to do");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[reparse-house-ptr] failed", err);
    process.exit(1);
  });
