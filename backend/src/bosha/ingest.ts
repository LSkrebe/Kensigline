import { enqueueCurrentFilingFeed } from "../core/sec.js";
import { enqueueBoshaRssFeeds } from "./rss-queue.js";
import { enqueueBoshaDynamicTickerFeeds } from "./dynamic-feeds.js";

/**
 * Pull fresh SEC filings into the Bosha pipeline (parallel to pharma / insider queues).
 * Uses source_type `bosha_sec` so the same accession can also exist as `sec_pharma_filing`.
 */
export async function enqueueBoshaSecFilings(opts?: { pages?: number }) {
  const pages = Math.max(1, Math.min(20, Number(opts?.pages ?? process.env.BOSHA_FEED_PAGES ?? 3)));
  const forms = String(process.env.BOSHA_SEC_FORMS ?? "8-K,10-Q")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const out: Awaited<ReturnType<typeof enqueueCurrentFilingFeed>>[] = [];
  for (const formType of forms) {
    const r = await enqueueCurrentFilingFeed({
      formType,
      pages,
      pageSize: 100,
      sourceType: "bosha_sec",
      priority: 4,
    });
    out.push(r);
  }
  return { forms, pages, batches: out };
}

function parseEnvUrlList(key: string): string[] {
  return String(process.env[key] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((u) => u.startsWith("http"));
}

export { enqueueBoshaRssFeeds } from "./rss-queue.js";

/**
 * Web feeds for Bosha:
 *
 * 1. **Dynamic (default)** — no URLs to configure. Uses tickers from `companies` and
 *    `document_parsed` to fetch Yahoo headline RSS + Google News RSS search per rotating batch.
 *    Override batch size with `BOSHA_DYNAMIC_TICKER_BATCH`, or set `BOSHA_DYNAMIC_DISABLE=1` to turn off.
 *
 * 2. **Optional extras** — `BOSHA_PRESS_RSS_URLS` / `BOSHA_TRANSCRIPT_RSS_URLS` add more feeds.
 *
 * Other: `BOSHA_RSS_MAX_LINKS_PER_FEED`, `BOSHA_HTTP_USER_AGENT`.
 */
export async function enqueueBoshaWebFeeds() {
  const maxLinks = Math.max(5, Math.min(150, Number(process.env.BOSHA_RSS_MAX_LINKS_PER_FEED ?? 30)));
  const pressUrls = parseEnvUrlList("BOSHA_PRESS_RSS_URLS");
  const transcriptUrls = parseEnvUrlList("BOSHA_TRANSCRIPT_RSS_URLS");

  let pressExtra: Awaited<ReturnType<typeof enqueueBoshaRssFeeds>> | null = null;
  let transcriptExtra: Awaited<ReturnType<typeof enqueueBoshaRssFeeds>> | null = null;

  if (pressUrls.length) {
    pressExtra = await enqueueBoshaRssFeeds({
      feedUrls: pressUrls,
      sourceType: "bosha_press_rss",
      priority: 3,
      maxLinksPerFeed: maxLinks,
    });
  }
  if (transcriptUrls.length) {
    transcriptExtra = await enqueueBoshaRssFeeds({
      feedUrls: transcriptUrls,
      sourceType: "bosha_transcript_rss",
      priority: 3,
      maxLinksPerFeed: maxLinks,
    });
  }

  const dynamic = await enqueueBoshaDynamicTickerFeeds();

  return {
    dynamic,
    pressExtra,
    transcriptExtra,
    extraPressFeeds: pressUrls.length,
    extraTranscriptFeeds: transcriptUrls.length,
  };
}
