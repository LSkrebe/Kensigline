import { enqueueCurrentFilingFeed } from "../../core/sec.js";
import { enqueueResearchRssFeeds } from "./rss-queue.js";
import { enqueueResearchDynamicTickerFeeds } from "./dynamic-feeds.js";
import { researchEnv } from "../../documents/spec.js";

const DEFAULT_SEC_FORMS = "8-K,10-Q,10-K,6-K,20-F,S-1,S-3,S-4,DEF 14A,424B5,SC 13D,SC 13G";
/** Backfill only — earnings/periodic forms; skips S-1, proxy, shelf, etc. to cut LLM on low-signal filings. */
const DEFAULT_BACKFILL_SEC_FORMS = "8-K,10-Q,10-K,6-K,20-F";

/** Earnings / periodic reports — higher queue tier for Analyse drivers and guidance. */
const EARNINGS_SEC_FORMS = new Set(["10-Q", "10-K", "20-F", "6-K", "8-K"]);

export function researchSecFormList(): string[] {
  return String(researchEnv("SEC_FORMS", DEFAULT_SEC_FORMS))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function livePriorityForResearchSecForm(formType: string): number {
  return EARNINGS_SEC_FORMS.has(formType) ? 5 : 4;
}

export function backfillPriorityForResearchSecForm(formType: string): number {
  return EARNINGS_SEC_FORMS.has(formType) ? 2 : 1;
}

export function researchSecFormListForBackfill(): string[] {
  return String(researchEnv("BACKFILL_SEC_FORMS", DEFAULT_BACKFILL_SEC_FORMS))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Earnings forms first so FIFO within a backfill day favors 10-Q/10-K over S-1 etc. */
export function researchSecFormsForBackfill(forms: string[]): string[] {
  const earnings: string[] = [];
  const other: string[] = [];
  for (const form of forms) {
    (EARNINGS_SEC_FORMS.has(form) ? earnings : other).push(form);
  }
  return [...earnings, ...other];
}

/** Pull fresh SEC filings into the research document pipeline. */
export async function enqueueResearchSecFilings(opts?: { pages?: number }) {
  const pages = Math.max(1, Math.min(20, Number(opts?.pages ?? researchEnv("FEED_PAGES", "3"))));
  const forms = researchSecFormList();
  const out: Awaited<ReturnType<typeof enqueueCurrentFilingFeed>>[] = [];
  for (const formType of forms) {
    const r = await enqueueCurrentFilingFeed({
      formType,
      pages,
      pageSize: 100,
      sourceType: "research_sec",
      priority: livePriorityForResearchSecForm(formType),
    });
    out.push(r);
  }
  return { forms, pages, batches: out };
}

function parseEnvUrlList(key: string): string[] {
  return String(researchEnv(key, ""))
    .split(",")
    .map((s) => s.trim())
    .filter((u) => u.startsWith("http"));
}

export { enqueueResearchRssFeeds } from "./rss-queue.js";

/** Web feeds: dynamic ticker RSS + optional extra press/transcript URLs. */
export async function enqueueResearchWebFeeds() {
  const maxLinks = Math.max(5, Math.min(150, Number(researchEnv("RSS_MAX_LINKS_PER_FEED", "30"))));
  const pressUrls = parseEnvUrlList("PRESS_RSS_URLS");
  const transcriptUrls = parseEnvUrlList("TRANSCRIPT_RSS_URLS");

  let pressExtra: Awaited<ReturnType<typeof enqueueResearchRssFeeds>> | null = null;
  let transcriptExtra: Awaited<ReturnType<typeof enqueueResearchRssFeeds>> | null = null;

  if (pressUrls.length) {
    pressExtra = await enqueueResearchRssFeeds({
      feedUrls: pressUrls,
      sourceType: "research_press_rss",
      priority: 3,
      maxLinksPerFeed: maxLinks,
    });
  }
  if (transcriptUrls.length) {
    transcriptExtra = await enqueueResearchRssFeeds({
      feedUrls: transcriptUrls,
      sourceType: "research_transcript_rss",
      priority: 3,
      maxLinksPerFeed: maxLinks,
    });
  }

  const dynamic = await enqueueResearchDynamicTickerFeeds();

  const govUrls = parseEnvUrlList("GOV_CONTRACT_RSS_URLS");
  let govExtra: Awaited<ReturnType<typeof enqueueResearchRssFeeds>> | null = null;
  if (govUrls.length) {
    govExtra = await enqueueResearchRssFeeds({
      feedUrls: govUrls,
      sourceType: "research_gov_contract",
      priority: 3,
      maxLinksPerFeed: maxLinks,
    });
  }

  return {
    dynamic,
    pressExtra,
    transcriptExtra,
    govExtra,
    extraPressFeeds: pressUrls.length,
    extraTranscriptFeeds: transcriptUrls.length,
    extraGovFeeds: govUrls.length,
  };
}
