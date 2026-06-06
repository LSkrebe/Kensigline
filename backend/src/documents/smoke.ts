/**
 * Lightweight smoke tests for research feed helpers (no DB, no network).
 * Run: npx tsx src/documents/smoke.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { historicalFundamentalsFromCompanyFacts } from "../core/fundamentals.js";
import { historicalRunwayFromCompanyFacts } from "../core/runway.js";
import { parseForwardRevenueGrowthFromText } from "../research/market/guidance-parse.js";
import { extractLinksFromFeedXml, googleNewsTranscriptFeedUrl, stripHtmlToText, yahooHeadlineFeedUrl } from "../research/market/feeds.js";

test("stripHtmlToText removes tags", () => {
  assert.equal(stripHtmlToText("<p>Hello <b>world</b></p>"), "Hello world");
});

test("RSS 2.0 link extraction", () => {
  const xml = `<?xml version="1.0"?><rss><channel>
    <item><title>Test PR</title><link>https://example.com/a</link></item>
    <item><title>Two</title><link>https://example.com/b</link></item>
  </channel></rss>`;
  const links = extractLinksFromFeedXml(xml, "https://feeds.example.com/news.xml");
  assert.equal(links.length, 2);
  assert.equal(links[0]!.url, "https://example.com/a");
});

test("dynamic Yahoo / Google feed URL shapes", () => {
  assert.ok(yahooHeadlineFeedUrl("AAPL").includes("AAPL"));
  assert.ok(yahooHeadlineFeedUrl("aapl").includes("AAPL"));
  const g = googleNewsTranscriptFeedUrl("MSFT");
  assert.ok(g.includes("news.google.com"));
  assert.ok(decodeURIComponent(g).includes("MSFT"));
});

test("Atom link extraction", () => {
  const xml = `<?xml version="1.0"?>
  <feed xmlns="http://www.w3.org/2005/Atom">
    <entry>
      <title>Call</title>
      <link href="https://cdn.example.com/transcript/123"/>
    </entry>
  </feed>`;
  const links = extractLinksFromFeedXml(xml, "https://example.com/atom.xml");
  assert.equal(links.length, 1);
  assert.ok(links[0]!.url.includes("cdn.example.com"));
});

test("historicalFundamentalsFromCompanyFacts YoY revenue and margins", () => {
  const mockFacts = {
    facts: {
      "us-gaap": {
        Revenues: {
          units: {
            USD: [
              { val: 1100, end: "2024-03-31", filed: "2024-05-01", fy: 2024, fp: "Q1", form: "10-Q" },
              { val: 1000, end: "2023-03-31", filed: "2023-05-01", fy: 2023, fp: "Q1", form: "10-Q" },
            ],
          },
        },
        NetIncomeLoss: {
          units: {
            USD: [{ val: 220, end: "2024-03-31", filed: "2024-05-01", fy: 2024, fp: "Q1", form: "10-Q" }],
          },
        },
        NetCashProvidedByUsedInOperatingActivities: {
          units: {
            USD: [{ val: 300, end: "2024-03-31", filed: "2024-05-01", fy: 2024, fp: "Q1", form: "10-Q" }],
          },
        },
        PaymentsToAcquirePropertyPlantAndEquipment: {
          units: {
            USD: [{ val: 50, end: "2024-03-31", filed: "2024-05-01", fy: 2024, fp: "Q1", form: "10-Q" }],
          },
        },
      },
    },
  };
  const out = historicalFundamentalsFromCompanyFacts(mockFacts);
  assert.equal(out.revenueGrowth, 10);
  assert.equal(out.netMargin, 20);
  assert.equal(out.fcfMargin, 22.7);
});

test("parseForwardRevenueGrowthFromText finds guidance percent", () => {
  assert.equal(
    parseForwardRevenueGrowthFromText("Management expects full-year revenue growth of 12.5% driven by AI demand."),
    12.5,
  );
  assert.equal(parseForwardRevenueGrowthFromText("No numeric guidance in this filing."), null);
});

test("historicalRunwayFromCompanyFacts cash burn and runway quarters", () => {
  const mockFacts = {
    facts: {
      "us-gaap": {
        CashAndCashEquivalentsAtCarryingValue: {
          units: {
            USD: [{ val: 180_000_000, end: "2024-03-31", filed: "2024-05-01", fy: 2024, fp: "Q1", form: "10-Q" }],
          },
        },
        NetCashProvidedByUsedInOperatingActivities: {
          units: {
            USD: [{ val: -35_000_000, end: "2024-03-31", filed: "2024-05-01", fy: 2024, fp: "Q1", form: "10-Q" }],
          },
        },
      },
    },
  };
  const out = historicalRunwayFromCompanyFacts(mockFacts);
  assert.equal(out.cashUsd, 180_000_000);
  assert.equal(out.quarterlyBurnUsd, 35_000_000);
  assert.equal(out.runwayQuarters, 5.1);
});
