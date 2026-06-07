/**
 * Lightweight smoke tests for research feed helpers (no DB, no network).
 * Run: npx tsx src/documents/smoke.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { historicalFundamentalsFromCompanyFacts, fundamentalsSeriesFromCompanyFacts } from "../core/fundamentals.js";
import { historicalRunwayFromCompanyFacts } from "../core/runway.js";
import { parseSenatePtrHtml } from "../core/senate.js";
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

test("fundamentalsSeriesFromCompanyFacts builds annual FY series", () => {
  const mockFacts = {
    facts: {
      "us-gaap": {
        Revenues: {
          units: {
            USD: [
              { val: 500, end: "2021-12-31", filed: "2022-02-01", fy: 2021, fp: "FY", form: "10-K" },
              { val: 600, end: "2022-12-31", filed: "2023-02-01", fy: 2022, fp: "FY", form: "10-K" },
              { val: 720, end: "2023-12-31", filed: "2024-02-01", fy: 2023, fp: "FY", form: "10-K" },
              { val: 900, end: "2024-12-31", filed: "2025-02-01", fy: 2024, fp: "FY", form: "10-K" },
            ],
          },
        },
        GrossProfit: {
          units: {
            USD: [
              { val: 200, end: "2024-12-31", filed: "2025-02-01", fy: 2024, fp: "FY", form: "10-K" },
            ],
          },
        },
        NetIncomeLoss: {
          units: {
            USD: [{ val: 90, end: "2024-12-31", filed: "2025-02-01", fy: 2024, fp: "FY", form: "10-K" }],
          },
        },
        WeightedAverageNumberOfSharesOutstandingBasic: {
          units: {
            shares: [{ val: 100_000_000, end: "2024-12-31", filed: "2025-02-01", fy: 2024, fp: "FY", form: "10-K" }],
          },
        },
      },
    },
  };
  const out = fundamentalsSeriesFromCompanyFacts(mockFacts, { periods: 4 });
  assert.equal(out.periodLabels.length, 4);
  assert.equal(out.periodLabels.at(-1), "FY24");
  assert.equal(out.revenueGrowth.at(-1), 25);
  assert.equal(out.grossMargin.at(-1), 22.2);
  assert.equal(out.netMargin.at(-1), 10);
  assert.equal(out.sharesOutstanding.at(-1), 100_000_000);
});

test("parseForwardRevenueGrowthFromText finds guidance percent", () => {
  assert.equal(
    parseForwardRevenueGrowthFromText("Management expects full-year revenue growth of 12.5% driven by AI demand."),
    12.5,
  );
  assert.equal(parseForwardRevenueGrowthFromText("No numeric guidance in this filing."), null);
});

test("parseSenatePtrHtml extracts senator stock purchases", () => {
  const html = `
    <h2>The Honorable David H McCormick (McCormick, David H.)</h2>
    <p>Filed 12/26/2025 @ 12:36 PM</p>
    <table>
      <tr>
        <td>8</td><td>11/28/2025</td><td>Self</td>
        <td><a href="https://finance.yahoo.com/quote/BITB">BITB</a></td>
        <td>Bitwise Bitcoin ETF</td><td>Stock</td><td>Purchase</td><td>$50,001 - $100,000</td><td>--</td>
      </tr>
      <tr>
        <td>1</td><td>06/03/2025</td><td>Spouse</td>
        <td><a href="https://finance.yahoo.com/quote/PFE">PFE</a></td>
        <td>Pfizer, Inc. Common Stock</td><td>Stock</td><td>Sale (Full)</td><td>$1,001 - $15,000</td><td>--</td>
      </tr>
    </table>
  `;
  const url = "https://efdsearch.senate.gov/search/view/ptr/e337e1b4-ff0a-4b83-8a58-1d25a81ea26f/";
  const out = parseSenatePtrHtml(html, url);
  assert.equal(out.filing_id, "e337e1b4-ff0a-4b83-8a58-1d25a81ea26f");
  assert.ok(out.filer.name?.includes("McCormick"));
  const purchases = out.transactions.filter((t) => t.transaction_type === "P" && t.ticker);
  assert.equal(purchases.length, 1);
  assert.equal(purchases[0]!.ticker, "BITB");
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
