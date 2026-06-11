import type { DiscoverTimelineOpts } from "./timeline.js";
import { buildDiscoverTimeline } from "./timeline.js";
import type { DiscoverTimelineResult } from "./types.js";

type CacheEntry = { at: number; payload: DiscoverTimelineResult };

const cache = new Map<string, CacheEntry>();

function cacheKey(opts: DiscoverTimelineOpts) {
  const sources = opts.sourceKeys ? [...opts.sourceKeys].sort().join(",") : "";
  return JSON.stringify({
    q: String(opts.query ?? "").trim(),
    sources,
    pastDays: opts.pastDays ?? 90,
    aheadDays: opts.aheadDays ?? 180,
    limit: opts.limit ?? 120,
    macroDays: opts.macroDays ?? 5,
  });
}

export async function buildDiscoverTimelineCached(
  opts: DiscoverTimelineOpts = {},
): Promise<DiscoverTimelineResult> {
  const key = cacheKey(opts);
  const ttl = Math.max(5_000, Number(process.env.DISCOVER_TIMELINE_CACHE_MS ?? 45_000));
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.payload;

  const payload = await buildDiscoverTimeline(opts);
  cache.set(key, { at: Date.now(), payload });
  return payload;
}
