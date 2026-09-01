/**
 * 13F institution transaction guards — no DB, no network.
 * Run: npx tsx src/investigate/institutions/smoke.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  consolidateInstitutionTxnRows,
  type InstitutionTxnRow,
} from "./institution-txn-consolidate.js";

test("consolidateInstitutionTxnRows collapses multi-row writes to one", () => {
  const rows: InstitutionTxnRow[] = [
    {
      filerId: "00000000-0000-0000-0000-000000000001",
      activity: "Increased stake",
      amountUsd: 9_000_000_000,
      shares: 40_000,
      transactionAt: "2026-01-01T00:00:00.000Z",
    },
    {
      filerId: "00000000-0000-0000-0000-000000000001",
      activity: "Increased stake",
      amountUsd: 1_000_000_000,
      shares: 1_000,
      transactionAt: "2026-01-01T00:00:00.000Z",
    },
  ];
  const out = consolidateInstitutionTxnRows(rows);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.shares, 41_000);
  assert.equal(out[0]!.amountUsd, 10_000_000_000);
});
