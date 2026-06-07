import { loadTickerUniverse as loadSharedTickerUniverse } from "../../shared/ticker-universe.js";
import { googleNewsTranscriptFeedUrl, yahooHeadlineFeedUrl } from "./feeds.js";
import { enqueueResearchRssFeeds } from "./rss-queue.js";
import { researchEnv, researchEnvNum } from "../../documents/spec.js";

/** Derive press/transcript RSS feeds from tickers already in the DB. */
let batchCursor = 0;

function clampInt(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

async function loadTickerUniverse(): Promise<string[]> {
  return loadSharedTickerUniverse(researchEnvNum("DYNAMIC_MAX_UNIVERSE", 500));
}

function nextTickerBatch(all: string[], batchSize: number): string[] {
  const n = all.length;
  if (!n) return [];
  const bs = Math.min(batchSize, n);
  const start = (batchCursor * bs) % n;
  batchCursor += 1;
  const out: string[] = [];
  for (let i = 0; i < bs; i++) {
    out.push(all[(start + i) % n]!);
  }
  return [...new Set(out)];
}

export async function enqueueResearchDynamicTickerFeeds(): Promise<{
  ok: boolean;
  tickers_in_batch: number;
  universe: number;
  press?: Awaited<ReturnType<typeof enqueueResearchRssFeeds>>;
  transcript?: Awaited<ReturnType<typeof enqueueResearchRssFeeds>>;
  skipped_reason?: string;
}> {
  if (String(researchEnv("DYNAMIC_DISABLE", "")).trim() === "1") {
    return { ok: false, tickers_in_batch: 0, universe: 0, skipped_reason: "disabled" };
  }

  const all = await loadTickerUniverse();
  if (!all.length) {
    return { ok: false, tickers_in_batch: 0, universe: 0, skipped_reason: "no_tickers" };
  }

  const batchSize = clampInt(researchEnvNum("DYNAMIC_TICKER_BATCH", 12), 1, 40);
  const maxLinksPress = clampInt(researchEnvNum("DYNAMIC_MAX_LINKS_PRESS", 12), 3, 40);
  const maxLinksTranscript = clampInt(researchEnvNum("DYNAMIC_MAX_LINKS_TRANSCRIPT", 8), 2, 25);

  const batch = nextTickerBatch(all, batchSize);
  const pressFeeds = batch.map(yahooHeadlineFeedUrl);
  const transcriptFeeds = batch.map(googleNewsTranscriptFeedUrl);

  const press = await enqueueResearchRssFeeds({
    feedUrls: pressFeeds,
    sourceType: "research_press_rss",
    priority: 3,
    maxLinksPerFeed: maxLinksPress,
  });

  const transcript = await enqueueResearchRssFeeds({
    feedUrls: transcriptFeeds,
    sourceType: "research_transcript_rss",
    priority: 3,
    maxLinksPerFeed: maxLinksTranscript,
  });

  return {
    ok: true,
    tickers_in_batch: batch.length,
    universe: all.length,
    press,
    transcript,
  };
}
