import test from "node:test";
import assert from "node:assert/strict";
import {
  activityRowsFromDossierTxns,
  buildDossierActivity,
  tradeDollars,
} from "./activity.js";

test("tradeDollars ignores share-count labels", () => {
  assert.equal(tradeDollars({ value: "591K sh" }), 0);
  assert.equal(tradeDollars({ value: "−$4.8M" }), 4.8e6);
  assert.equal(tradeDollars({ amountUsd: 12_000 }), 12_000);
});

test("API Form 4 txns produce precomputed filings and holdings", () => {
  const activity = buildDossierActivity(
    activityRowsFromDossierTxns([
      {
        ticker: "META",
        company: "Meta Platforms",
        ts: "2026-06-01",
        sheetRow: {
          transactionCode: "S",
          acquiredDisposed: "D",
          amountUsd: 5_000_000,
          shares: 20_000,
          sharesAfter: 340_000_000,
          filedAt: "2026-06-02",
          performanceMeta: { price: 250, sharesAfter: 340_000_000, securityTitle: "Class A Common Stock" },
        },
      },
      {
        ticker: "META",
        company: "Meta Platforms",
        ts: "2026-06-10",
        sheetRow: {
          transactionCode: "S",
          acquiredDisposed: "D",
          amountUsd: 3_000_000,
          shares: 12_000,
          sharesAfter: 339_988_000,
          filedAt: "2026-06-11",
          performanceMeta: { price: 250, sharesAfter: 339_988_000 },
        },
      },
    ]),
  );
  assert.ok(activity);
  assert.ok(activity!.filings.length >= 1);
  assert.equal(activity!.holdings.length, 1);
  assert.equal(activity!.holdings[0]!.ticker, "META");
  assert.notEqual(activity!.aum, "—");
});

test("missing sharesAfter does not zero politician books", () => {
  const activity = buildDossierActivity(
    activityRowsFromDossierTxns([
      {
        ticker: "NVDA",
        company: "NVIDIA",
        ts: "2025-01-01",
        sheetRow: { transactionCode: "P", amountUsd: 1_000_000, filedAt: "2025-01-02" },
      },
      {
        ticker: "NVDA",
        company: "NVIDIA",
        ts: "2025-03-01",
        sheetRow: { transactionCode: "P", amountUsd: 500_000, filedAt: "2025-03-02" },
      },
    ]),
  );
  assert.equal(activity!.holdings.length, 1);
  assert.match(activity!.aum, /\$1\.5M/);
});
