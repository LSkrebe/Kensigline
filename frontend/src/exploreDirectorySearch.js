/** Client-side explore directory search helpers. */

export function normalizeExploreSearchQuery(query) {
  return String(query ?? '').trim()
}

function includesToken(haystack, token) {
  return String(haystack ?? '').toUpperCase().includes(token)
}

/** Home preview rows (company + investor share the same shape). */
export function filterExploreHomeRows(rows, query) {
  const token = normalizeExploreSearchQuery(query).toUpperCase()
  if (!token) return rows
  return rows.filter(
    (row) =>
      includesToken(row.ticker, token) ||
      includesToken(row.name, token) ||
      includesToken(row.event, token),
  )
}

/** Full directory list rows. */
export function filterExploreDirectoryListRows(rows, query, kind) {
  const token = normalizeExploreSearchQuery(query).toUpperCase()
  if (!token) return rows

  if (kind === 'companies') {
    return rows.filter(
      (row) =>
        includesToken(row.ticker, token) ||
        includesToken(row.name, token) ||
        includesToken(row.event, token),
    )
  }

  return rows.filter(
    (row) =>
      includesToken(row.name, token) ||
      includesToken(row.modeCode, token) ||
      includesToken(row.ticker, token) ||
      (Array.isArray(row.tickers) && row.tickers.some((t) => includesToken(t, token))),
  )
}
