/**
 * Focused tests for LLM cost-reduction helpers (no DB, no network).
 * Run: npx tsx src/documents/llm-cost-smoke.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { stripBoilerplateForLlm, paragraphHasMaterialSignal } from "../core/boilerplate-strip.js";
import { compactSecTextForLlm } from "../core/sec-llm-text.js";
import { compactHttpTextForLlm } from "../core/http-llm-text.js";
import {
  assessInsiderParseConfidence,
  buildInsiderContextSentences,
  buildInsiderDefaultFeedLabel,
} from "../investigate/insider/narrative.js";
import { computeResearchNearDupKey, textShingleSimilarity } from "../core/research-fingerprint.js";
import { buildGovContractExtractFromFacts, parseGovContractFacts } from "../research/market/gov-contract-parse.js";
import {
  scoreResearchDocument,
  computeInvestigateTickerRollup,
  mergeResearchFeedIdea,
} from "../core/idea-score.js";

test("stripBoilerplate removes safe harbor but keeps revenue guidance", () => {
  const raw = `
ACME Corp announces results.

Revenue grew 18% to $420M in Q1 2026 and EPS beat consensus by $0.12.

FORWARD-LOOKING STATEMENTS
This release contains forward-looking statements subject to risks.

SAFE HARBOR
Actual results may differ materially.

About ACME Corp
ACME is a leading widget manufacturer.

Investor Relations
Jane Doe, jane@acme.com, (555) 555-0100
  `.trim();

  const out = stripBoilerplateForLlm(raw);
  assert.match(out, /\$420M/);
  assert.match(out, /18%/);
  assert.doesNotMatch(out, /SAFE HARBOR/i);
  assert.doesNotMatch(out, /Investor Relations/i);
});

test("SEC compaction drops signatures block", () => {
  const filing = `
Item 2.02 Results of Operations and Financial Condition

On March 1, 2026 the company reported revenue of $95M, up 12% year over year.

SIGNATURES

Pursuant to the requirements of the Securities Exchange Act...

/s/ John Smith
Chief Financial Officer
  `.trim();

  const compact = compactSecTextForLlm(filing, 20_000);
  assert.match(compact, /\$95M/);
  assert.doesNotMatch(compact, /Pursuant to the requirements/i);
});

test("press compaction removes footer boilerplate", () => {
  const pr = `
Company X announces FDA acceptance of its NDA for Drug Y.

The PDUFA action date is June 30, 2026.

About Company X
Company X is a biotech...

Media Contact: press@companyx.com

Copyright 2026 Company X. All rights reserved.
  `.trim();

  const compact = compactHttpTextForLlm(pr, "press", 8_000);
  assert.match(compact, /PDUFA/i);
  assert.match(compact, /FDA acceptance/i);
  assert.doesNotMatch(compact, /Media Contact/i);
  assert.doesNotMatch(compact, /Copyright 2026/i);
});

test("insider deterministic path is confident for Form 4 sale-only filings", () => {
  const txns = [
    {
      transaction_code: "S",
      transaction_date: "2026-03-01",
      shares: 5_000,
      price: 12.5,
      amount_usd: 62_500,
      security_title: "Common",
      acquired_disposed: "D",
      is_derivative: false,
    },
  ];
  const conf = assessInsiderParseConfidence({
    issuerTicker: "ACME",
    owners: [{ name: "Jane Doe", role: "CEO" }],
    transactions: txns,
    formSourceKey: "Form 4",
    requirePOnly: true,
  });
  assert.equal(conf.confident, true);

  const label = buildInsiderDefaultFeedLabel({
    formSourceKey: "Form 4",
    requirePOnly: true,
    transactions: txns,
  });
  assert.match(label, /open-market sale/i);

  const sentences = buildInsiderContextSentences({
    formSourceKey: "Form 4",
    issuerName: "ACME Corp",
    issuerTicker: "ACME",
    owner: { name: "Jane Doe", role: "CEO" },
    transactions: txns,
    requirePOnly: true,
  });
  assert.ok(sentences.length >= 1);
  assert.match(sentences[0]!, /sale/i);
});

test("insider deterministic path is confident for parsed Form 4 P purchases", () => {
  const txns = [
    {
      transaction_code: "P",
      transaction_date: "2026-03-01",
      shares: 10_000,
      price: 12.5,
      amount_usd: 125_000,
      security_title: "Common",
      acquired_disposed: "A",
      is_derivative: false,
    },
  ];
  const conf = assessInsiderParseConfidence({
    issuerTicker: "ACME",
    owners: [{ name: "Jane Doe", role: "CEO" }],
    transactions: txns,
    formSourceKey: "Form 4",
    requirePOnly: true,
  });
  assert.equal(conf.confident, true);

  const label = buildInsiderDefaultFeedLabel({
    formSourceKey: "Form 4",
    requirePOnly: true,
    transactions: txns,
  });
  assert.match(label, /Net buying/i);

  const sentences = buildInsiderContextSentences({
    formSourceKey: "Form 4",
    issuerName: "ACME Corp",
    issuerTicker: "ACME",
    owner: { name: "Jane Doe", role: "CEO" },
    transactions: txns,
    requirePOnly: true,
  });
  assert.ok(sentences.length >= 1);
  assert.match(sentences[0]!, /open-market purchase/i);
});

test("insider AI fallback remains for low-confidence filings", () => {
  const conf = assessInsiderParseConfidence({
    issuerTicker: null,
    owners: [{ name: "Jane Doe", role: "CEO" }],
    transactions: [{ transaction_code: "P", transaction_date: null, shares: null, price: null, amount_usd: null, security_title: null, acquired_disposed: null, is_derivative: false }],
    formSourceKey: "Form 4",
    requirePOnly: true,
  });
  assert.equal(conf.confident, false);
  assert.ok(conf.reasons.includes("missing_ticker"));
});

test("near-duplicate key matches syndicated mirrors", () => {
  const a = `
ACME reports Q1 revenue of $500M, up 10%, and raises FY guidance to $2.1B-$2.2B.
  `.trim();
  const b = `
FORWARD-LOOKING STATEMENTS apply.

ACME reports Q1 revenue of $500M, up 10%, and raises FY guidance to $2.1B-$2.2B.

Media Contact: ir@acme.com
  `.trim();
  assert.equal(computeResearchNearDupKey(a), computeResearchNearDupKey(b));
  assert.ok(textShingleSimilarity(a, b) >= 0.5);
});

test("gov contract structured parse can skip LLM", () => {
  const page = `
Recipient: Orion Defense Systems Inc
Agency: Department of Defense
Award ID: FA1234-26-C-0001
Award Amount: $12.5 million
NAICS: 541512
Period of Performance: 2026-03-01 to 2027-02-28
Description: Software modernization and sustainment services.
  `.trim();
  const facts = parseGovContractFacts(page);
  const out = buildGovContractExtractFromFacts(facts, { url: "https://sam.gov/award/1", hintedTicker: "ODS" });
  assert.ok(out);
  assert.equal(out!.source_key, "Gov contract");
  assert.match(out!.analysis, /federal contract/i);
});

test("idea_score remains deterministic for insider purchases", () => {
  const a = scoreResearchDocument({
    analysis: "CEO open-market purchase cluster",
    source_key: "Form 4",
    feed_kind: "insider",
    program_phase: null,
    event_at: new Date().toISOString(),
    data: {
      cluster: {
        worksheet_rows: [{ transaction_code: "P", amount_usd: 500_000, role: "CEO" }],
      },
    },
  });
  const b = scoreResearchDocument({
    analysis: "CEO open-market purchase cluster",
    source_key: "Form 4",
    feed_kind: "insider",
    program_phase: null,
    event_at: new Date().toISOString(),
    data: {
      cluster: {
        worksheet_rows: [{ transaction_code: "P", amount_usd: 500_000, role: "CEO" }],
      },
    },
  });
  assert.deepEqual(a, b);
  assert.ok(typeof a.idea_score === "number");
});

test("investigate ticker rollup picks strongest recent feed", () => {
  const recent = new Date().toISOString();
  const rollup = computeInvestigateTickerRollup([
    {
      feed_kind: "insider",
      idea_score: 82,
      idea_reasons: ["CEO open-market purchase"],
      event_at: recent,
    },
    {
      feed_kind: "politicians",
      idea_score: 68,
      idea_reasons: ["Politician purchase"],
      event_at: recent,
    },
  ]);
  assert.equal(rollup.idea_score, 82);
  assert.equal(rollup.idea_best, true);
  assert.equal(rollup.feed_kind, "insider");
});

test("mergeResearchFeedIdea carries investigate best over weak latest doc", () => {
  const merged = mergeResearchFeedIdea(
    { idea_score: 24, idea_best: false, idea_reasons: ["Material 8-K filing"] },
    { idea_score: 86, idea_best: true, idea_reasons: ["Purchase notional above $1M"] },
  );
  assert.equal(merged.idea_best, true);
  assert.equal(merged.idea_score, 86);
  assert.match(merged.idea_reasons[0] ?? "", /purchase/i);
});

test("paragraphHasMaterialSignal detects clinical facts", () => {
  assert.equal(
    paragraphHasMaterialSignal("Phase 3 topline showed 42% reduction in primary endpoint with p<0.001."),
    true,
  );
  assert.equal(paragraphHasMaterialSignal("This release includes forward-looking statements only."), false);
});
