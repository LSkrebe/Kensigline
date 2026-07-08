import { db } from "../../core/db.js";
import { isUrlAllowedForResearchHttpIngest } from "../../documents/spec.js";
import { extractLinksFromFeedXml, fetchFeedXml } from "./feeds.js";

/** Shared helper: fetch RSS/Atom XML and enqueue article URLs for research document parsing. */
export async function enqueueResearchRssFeeds(opts: {
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
        if (!isUrlAllowedForResearchHttpIngest(url)) continue;
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
