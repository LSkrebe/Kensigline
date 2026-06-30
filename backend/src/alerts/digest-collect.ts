import { collectFeedCandidates, type IdeaCandidate } from "./candidates.js";

export type DigestSection = {
  id: "market" | "investigate";
  title: string;
  subtitle?: string;
  items: IdeaCandidate[];
};

function envInt(key: string, fallback: number, min: number, max: number): number {
  const n = Number(process.env[key] ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function pickTop(items: IdeaCandidate[], limit: number): IdeaCandidate[] {
  const seen = new Set<string>();
  const out: IdeaCandidate[] = [];
  const sorted = [...items].sort(
    (a, b) => b.idea_score - a.idea_score || String(b.event_at).localeCompare(String(a.event_at)),
  );
  for (const it of sorted) {
    const key = `${it.feed}:${it.ticker}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
    if (out.length >= limit) break;
  }
  return out;
}

function feedEnabled(feeds: Set<string>, feed: string): boolean {
  return feeds.has(feed);
}

/**
 * Mode-aware digest: top ideas from Market, plus exceptional Investigate flows.
 */
export async function collectDigestSections(opts: {
  sinceHours?: number;
  feeds?: string[];
}): Promise<DigestSection[]> {
  const sinceHours = Math.max(6, Math.min(168, Number(opts.sinceHours ?? 36)));
  const feeds = new Set(
    opts.feeds ?? ["insider", "politicians", "institutions", "research"],
  );

  const marketCount = envInt("DIGEST_MARKET_COUNT", 2, 1, 5);
  const investigateMin = envInt("IDEA_SCORE_DIGEST_EXCEPTIONAL", 85, 70, 99);
  const investigatePerFeed = envInt("DIGEST_INVESTIGATE_PER_FEED", 1, 0, 3);
  const researchMin = envInt("DIGEST_MARKET_MIN_SCORE", 72, 50, 95);

  const sections: DigestSection[] = [];

  if (feedEnabled(feeds, "research")) {
    const pool = await collectFeedCandidates({
      sinceHours,
      feeds: ["research"],
      minScore: researchMin,
      limit: 40,
    });
    const items = pickTop(pool, marketCount);
    if (items.length) {
      sections.push({
        id: "market",
        title: "Market",
        subtitle: "Top market intelligence from research filings",
        items,
      });
    }
  }

  const investigateFeeds: Array<{ feed: string; label: string }> = [
    { feed: "insider", label: "Insider" },
    { feed: "politicians", label: "Politicians" },
    { feed: "institutions", label: "Institutions" },
  ];

  const investigateItems: IdeaCandidate[] = [];
  for (const { feed } of investigateFeeds) {
    if (!feedEnabled(feeds, feed) || investigatePerFeed <= 0) continue;
    const pool = await collectFeedCandidates({
      sinceHours,
      feeds: [feed],
      minScore: investigateMin,
      limit: 20,
    });
    investigateItems.push(...pickTop(pool, investigatePerFeed));
  }

  if (investigateItems.length) {
    const ranked = pickTop(investigateItems, investigatePerFeed * investigateFeeds.length);
    sections.push({
      id: "investigate",
      title: "Standout flows",
      subtitle: `Exceptional insider, politician, and institutional activity (score ≥ ${investigateMin})`,
      items: ranked,
    });
  }

  return sections;
}

export function digestItemCount(sections: DigestSection[]): number {
  return sections.reduce((n, s) => n + s.items.length, 0);
}
