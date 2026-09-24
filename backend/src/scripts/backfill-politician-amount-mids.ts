/**
 * Backfill politician amount_usd / amount_usd_mid from amount_range midpoints.
 *
 *   npx tsx src/scripts/backfill-politician-amount-mids.ts
 *   npx tsx src/scripts/backfill-politician-amount-mids.ts --dry-run
 */
import "../load-env.js";
import { db } from "../core/db.js";
import { parseUsdAmountRange } from "../shared/amount-range.js";

async function main() {
  const dry = process.argv.includes("--dry-run");
  const rows = await db.queryApi<{ id: string; amount_range: string | null; amount_usd_mid: number | null }>(
    `
    SELECT id::text, amount_range, amount_usd_mid
    FROM politician_transactions
    WHERE nullif(trim(amount_range), '') IS NOT NULL
      AND (amount_usd_mid IS NULL OR amount_usd IS NULL)
    LIMIT 50000
    `,
    [],
    60_000,
  );

  let updated = 0;
  let skipped = 0;
  for (const row of rows) {
    const { mid } = parseUsdAmountRange(row.amount_range);
    if (mid == null || !Number.isFinite(mid)) {
      skipped += 1;
      continue;
    }
    if (dry) {
      updated += 1;
      continue;
    }
    await db.queryApi(
      `
      UPDATE politician_transactions
      SET amount_usd_mid = $2,
          amount_usd = COALESCE(amount_usd, $2)
      WHERE id = $1::uuid
      `,
      [row.id, mid],
      15_000,
    );
    updated += 1;
  }

  console.log("[backfill-mids]", { scanned: rows.length, updated, skipped, dry });
}

main().catch((err) => {
  console.error("[backfill-mids] fatal", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
