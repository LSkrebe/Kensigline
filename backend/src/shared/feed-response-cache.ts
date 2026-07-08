type FeedCacheEntry = { at: number; body: unknown };

const cache = new Map<string, FeedCacheEntry>();

function ttlMs(): number {
  return Math.max(5_000, Number(process.env.FEED_RESPONSE_CACHE_MS ?? 30_000));
}

export function feedCacheKey(parts: Record<string, string | number | null | undefined>): string {
  return JSON.stringify(parts);
}

export function readFeedResponseCache<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > ttlMs()) {
    cache.delete(key);
    return null;
  }
  return hit.body as T;
}

export function writeFeedResponseCache(key: string, body: unknown): void {
  cache.set(key, { at: Date.now(), body });
  if (cache.size > 200) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 50);
    for (const [k] of oldest) cache.delete(k);
  }
}
