/** Default page size for feed list APIs (server + client). */
export const FEED_PAGE_SIZE = 40

export function feedPageQuery(basePath, { limit = FEED_PAGE_SIZE, offset = 0, extra = {} } = {}) {
  const params = new URLSearchParams()
  params.set('limit', String(limit))
  params.set('offset', String(offset))
  for (const [k, v] of Object.entries(extra)) {
    if (v != null && v !== '') params.set(k, String(v))
  }
  const qs = params.toString()
  return qs ? `${basePath}?${qs}` : basePath
}

export function mergeFeedPages(prev, next, { append = false } = {}) {
  const a = append && Array.isArray(prev) ? prev : []
  const b = Array.isArray(next) ? next : []
  if (!a.length) return b
  const seen = new Set(a.map((row) => String(row.id ?? row.__backend_id ?? '')))
  const out = [...a]
  for (const row of b) {
    const key = String(row.id ?? row.__backend_id ?? '')
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(row)
  }
  return out
}
