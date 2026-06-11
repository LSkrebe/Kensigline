import { fetchJsonSafe } from './api.js'

/**
 * @param {{ query?: string; sourceKeys?: string[]; pastDays?: number; aheadDays?: number; limit?: number }} [opts]
 */
export async function fetchDiscoverTimeline(opts = {}) {
  const params = new URLSearchParams()
  const q = String(opts.query ?? '').trim()
  if (q) params.set('q', q)
  const sources = (opts.sourceKeys ?? []).filter(Boolean)
  if (sources.length) params.set('sources', sources.join(','))
  if (opts.pastDays != null) params.set('past_days', String(opts.pastDays))
  if (opts.aheadDays != null) params.set('ahead_days', String(opts.aheadDays))
  if (opts.limit != null) params.set('limit', String(opts.limit))

  const qs = params.toString()
  const path = qs ? `/api/discover/timeline?${qs}` : '/api/discover/timeline'
  const res = await fetchJsonSafe(path, { timeoutMs: 30000 })
  if (!res.ok || !res.data?.ok) return null
  return res.data
}
