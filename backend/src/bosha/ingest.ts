import { enqueueCurrentFilingFeed } from "../core/sec.js";
import { db } from "../core/db.js";
import { extractLinksFromFeedXml, fetchFeedXml } from "./feeds.js";

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

export async function enqueueBoshaRssFeeds(opts: {
  feedUrls: string[];
  sourceType: string;
  priority: number;
  maxLinksPerFeed: number;
}) {
  const summary: Array<{ feedUrl: string; enqueued: number; links_seen: number; error?: string }> = [];
  for (const feedUrl of opts.feedUrls) {
    try {
      const xml = await fetchFeedXml(feedUrl);
      const links = extractLinksFromFeedXml(xml, feedUrl).slice(0, opts.maxLinksPerFeed);
      let enq = 0;
      for (const { url } of links) {
        const r = await db.one<{ id: string }>(
          `
          INSERT INTO document_queue (url, source_type, status, priority, attempts, next_attempt_at)
          VALUES ($1, $2, 'ready_to_parse', $3, 0, now())
          ON CONFLICT (url, source_type) DO NOTHING
          RETURNING id
          `,
          [url, opts.sourceType, opts.priority],
        );
        if (r?.id) enq += 1;
      }
      summary.push({ feedUrl, enqueued: enq, links_seen: links.length });
    } catch (e: any) {
      summary.push({
        feedUrl,
        enqueued: 0,
        links_seen: 0,
        error: String(e?.message ?? e).slice(0, 500),
      });
    }
  }
  return summary;
}

/**
 * Press releases + earnings-call transcripts via configurable RSS/Atom URLs.
 *
 * Env:
 * - `BOSHA_PRESS_RSS_URLS` — comma-separated feed URLs (PR / IR wires).
 * - `BOSHA_TRANSCRIPT_RSS_URLS` — comma-separated feeds that link to call transcripts.
 * - `BOSHA_RSS_MAX_LINKS_PER_FEED` — cap items queued per feed per run (default 30).
 * - `BOSHA_HTTP_USER_AGENT` — UA string for RSS/article fetches.
 */
export async function enqueueBoshaWebFeeds() {
  const maxLinks = Math.max(5, Math.min(150, Number(process.env.BOSHA_RSS_MAX_LINKS_PER_FEED ?? 30)));
  const pressUrls = parseEnvUrlList("BOSHA_PRESS_RSS_URLS");
  const transcriptUrls = parseEnvUrlList("BOSHA_TRANSCRIPT_RSS_URLS");

  let press: Awaited<ReturnType<typeof enqueueBoshaRssFeeds>> | null = null;
  let transcript: Awaited<ReturnType<typeof enqueueBoshaRssFeeds>> | null = null;

  if (pressUrls.length) {
    press = await enqueueBoshaRssFeeds({
      feedUrls: pressUrls,
      sourceType: "bosha_press_rss",
      priority: 3,
      maxLinksPerFeed: maxLinks,
    });
  }
  if (transcriptUrls.length) {
    transcript = await enqueueBoshaRssFeeds({
      feedUrls: transcriptUrls,
      sourceType: "bosha_transcript_rss",
      priority: 3,
      maxLinksPerFeed: maxLinks,
    });
  }

  return { press, transcript, pressUrls: pressUrls.length, transcriptUrls: transcriptUrls.length };
}
