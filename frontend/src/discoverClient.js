import { fetchJsonSafe } from './api.js'

const CACHE_MS = 10 * 60_000

/** @type {{ at: number; key: string; data: unknown } | null} */
let cached = null
/** @type {Promise<unknown> | null} */
let inflight = null
/** @type {string} */
let inflightKey = ''

export const DISCOVER_TIMELINE_DEFAULTS = {
  limit: 24,
  pastDays: 60,
  aheadDays: 120,
  macroDays: 5,
}

function timelineCacheKey(opts = {}) {
  return JSON.stringify({
    q: String(opts.query ?? '').trim(),
    pastDays: opts.pastDays ?? DISCOVER_TIMELINE_DEFAULTS.pastDays,
    aheadDays: opts.aheadDays ?? DISCOVER_TIMELINE_DEFAULTS.aheadDays,
    limit: opts.limit ?? DISCOVER_TIMELINE_DEFAULTS.limit,
    macroDays: opts.macroDays ?? DISCOVER_TIMELINE_DEFAULTS.macroDays,
    sources: (opts.sourceKeys ?? []).join(','),
  })
}

/**
 * @param {typeof DISCOVER_TIMELINE_DEFAULTS & { query?: string; sourceKeys?: string[] }} [opts]
 */
export function peekDiscoverTimelineCache(opts = {}) {
  if (!cached) return null
  if (Date.now() - cached.at > CACHE_MS) return null
  if (cached.key !== timelineCacheKey(opts)) return null
  return cached.data
}

/**
 * @param {{ query?: string; sourceKeys?: string[]; pastDays?: number; aheadDays?: number; limit?: number; macroDays?: number }} [opts]
 */
export async function fetchDiscoverTimeline(opts = {}) {
  const key = timelineCacheKey(opts)
  const hit = peekDiscoverTimelineCache(opts)
  if (hit) return hit

  if (inflight && inflightKey === key) return inflight

  const params = new URLSearchParams()
  const q = String(opts.query ?? '').trim()
  if (q) params.set('q', q)
  const sources = (opts.sourceKeys ?? []).filter(Boolean)
  if (sources.length) params.set('sources', sources.join(','))
  if (opts.pastDays != null) params.set('past_days', String(opts.pastDays))
  if (opts.aheadDays != null) params.set('ahead_days', String(opts.aheadDays))
  if (opts.limit != null) params.set('limit', String(opts.limit))
  if (opts.macroDays != null) params.set('macro_days', String(opts.macroDays))

  const qs = params.toString()
  const path = qs ? `/api/discover/timeline?${qs}` : '/api/discover/timeline'

  inflightKey = key
  inflight = (async () => {
    const res = await fetchJsonSafe(path, { timeoutMs: 20_000 })
    if (!res.ok || !res.data?.ok) {
      const empty = { ok: true, upcoming: [], past: [], macro: [], market_moves: [], moves: {} }
      cached = { at: Date.now(), key, data: empty }
      return empty
    }
    cached = { at: Date.now(), key, data: res.data }
    return res.data
  })().finally(() => {
    inflight = null
  })

  return inflight
}

/** Warm the client cache as soon as the API is up (before opening Discover). */
export function prefetchDiscoverTimeline(opts = {}) {
  void fetchDiscoverTimeline({ ...DISCOVER_TIMELINE_DEFAULTS, ...opts })
}
