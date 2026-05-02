import { db } from "../core/db.js";
import { googleNewsTranscriptFeedUrl, yahooHeadlineFeedUrl } from "./feeds.js";
import { enqueueBoshaRssFeeds } from "./rss-queue.js";

/**
 * Bosha web feeds without hard-coded RSS URLs: derive feeds from tickers already in the DB
 * (companies + anything seen in document_parsed). Each worker cycle pulls a rotating batch
 * so we do not hammer third parties with the full universe at once.
 */

let batchCursor = 0;

function clampInt(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

async function loadTickerUniverse(): Promise<string[]> {
  const rows = await db.query<{ t: string }>(
    `
    SELECT DISTINCT upper(trim(x.ticker)) AS t
    FROM (
      SELECT ticker FROM companies WHERE ticker IS NOT NULL
      UNION ALL
      SELECT ticker FROM document_parsed WHERE ticker IS NOT NULL
    ) x
    WHERE length(trim(x.ticker)) BETWEEN 1 AND 6
      AND trim(x.ticker) ~ '^[A-Za-z]{1,6}$'
    ORDER BY t
    `,
  );
  const list = rows.map((r) => r.t).filter(Boolean);
  const maxU = clampInt(Number(process.env.BOSHA_DYNAMIC_MAX_UNIVERSE ?? 500), 50, 5000);
  return list.slice(0, maxU);
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

export async function enqueueBoshaDynamicTickerFeeds(): Promise<{
  ok: boolean;
  tickers_in_batch: number;
  universe: number;
  press?: Awaited<ReturnType<typeof enqueueBoshaRssFeeds>>;
  transcript?: Awaited<ReturnType<typeof enqueueBoshaRssFeeds>>;
  skipped_reason?: string;
}> {
  if (String(process.env.BOSHA_DYNAMIC_DISABLE ?? "").trim() === "1") {
    return { ok: false, tickers_in_batch: 0, universe: 0, skipped_reason: "disabled" };
  }

  const all = await loadTickerUniverse();
  if (!all.length) {
    return { ok: false, tickers_in_batch: 0, universe: 0, skipped_reason: "no_tickers" };
  }

  const batchSize = clampInt(Number(process.env.BOSHA_DYNAMIC_TICKER_BATCH ?? 12), 1, 40);
  const maxLinksPress = clampInt(Number(process.env.BOSHA_DYNAMIC_MAX_LINKS_PRESS ?? 12), 3, 40);
  const maxLinksTranscript = clampInt(Number(process.env.BOSHA_DYNAMIC_MAX_LINKS_TRANSCRIPT ?? 8), 2, 25);

  const batch = nextTickerBatch(all, batchSize);
  const pressFeeds = batch.map(yahooHeadlineFeedUrl);
  const transcriptFeeds = batch.map(googleNewsTranscriptFeedUrl);

  const press = await enqueueBoshaRssFeeds({
    feedUrls: pressFeeds,
    sourceType: "bosha_press_rss",
    priority: 3,
    maxLinksPerFeed: maxLinksPress,
  });

  const transcript = await enqueueBoshaRssFeeds({
    feedUrls: transcriptFeeds,
    sourceType: "bosha_transcript_rss",
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
