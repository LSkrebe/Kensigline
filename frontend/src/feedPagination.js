/** First paint — small page for fast API + render. */
export const FEED_INITIAL_PAGE_SIZE = 15

/** Scroll / load-more page size. */
export const FEED_PAGE_SIZE = 40

export function feedPageQuery(
  basePath,
  { limit = FEED_PAGE_SIZE, offset = 0, cursor = null, extra = {} } = {},
) {
  const params = new URLSearchParams()
  params.set('limit', String(limit))
  if (cursor) {
    params.set('cursor', String(cursor))
  } else {
    params.set('offset', String(offset))
  }
  for (const [k, v] of Object.entries(extra)) {
    if (v != null && v !== '') params.set(k, String(v))
  }
  const qs = params.toString()
  return qs ? `${basePath}?${qs}` : basePath
}

function feedRowWorksheetScore(row) {
  const rows = row?.caseSheet?.rows
  if (!Array.isArray(rows) || !rows.length) return 0
  let score = rows.length
  for (const r of rows) {
    const usd = Number(r?.amountUsd)
    if (Number.isFinite(usd) && usd > 1) score += 2
    if (r?.companyRow || r?.url) score += 1
  }
  return score
}

/** Merge feed pages; on duplicate ids keep the richer caseSheet, not first-seen. */
export function mergeFeedPages(prev, next, { append = false } = {}) {
  const a = append && Array.isArray(prev) ? prev : []
  const b = Array.isArray(next) ? next : []
  if (!a.length) return b
  const byId = new Map()
  const order = []
  const add = (row) => {
    const key = String(row?.id ?? row?.__backend_id ?? '')
    if (!key) {
      order.push({ kind: 'anon', row })
      return
    }
    const existing = byId.get(key)
    if (!existing) {
      byId.set(key, row)
      order.push({ kind: 'id', key })
      return
    }
    if (feedRowWorksheetScore(row) > feedRowWorksheetScore(existing)) {
      byId.set(key, row)
    }
  }
  for (const row of a) add(row)
  for (const row of b) add(row)
  return order.map((entry) => (entry.kind === 'id' ? byId.get(entry.key) : entry.row))
}
