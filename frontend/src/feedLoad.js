import { fetchJsonSafe } from './api.js'
import { readFeedCache, writeFeedCache } from './feedCache.js'
import { FEED_INITIAL_PAGE_SIZE, feedPageQuery } from './feedPagination.js'

export const FEED_FETCH_TIMEOUT_MS = 12_000
export const FEED_BACKGROUND_REFRESH_MS = 60_000

export function applyFeedCache(cacheKey, apply) {
  const hit = readFeedCache(cacheKey)
  if (!hit?.items) return null
  apply(hit)
  return hit
}

export function persistFeedCache(cacheKey, payload) {
  writeFeedCache(cacheKey, payload)
}

/**
 * Fetch one feed page. On failure returns { ok: false, items: [] } so callers never spin forever.
 */
export async function fetchFeedPage(pathBase, { limit = FEED_INITIAL_PAGE_SIZE, offset = 0, extra = {} } = {}) {
  const path = feedPageQuery(pathBase, { limit, offset, extra })
  const r = await fetchJsonSafe(path, { timeoutMs: FEED_FETCH_TIMEOUT_MS })
  if (!r.ok || !r.data || r.data.ok === false || !Array.isArray(r.data.items)) {
    return { ok: false, items: [], hasMore: false, nextOffset: offset, status: r.status }
  }
  return {
    ok: true,
    items: r.data.items,
    hasMore: Boolean(r.data.has_more),
    nextOffset: Number(r.data.next_offset) || offset + r.data.items.length,
  }
}
