/** Placeholder filer names that collapse into bogus mega-rows (mirrors backend filter). */
const PLACEHOLDER_INVESTOR_NAME_RE =
  /^(institutions?|insiders?|politicians?|filers?|unknown|n\/?a|null|undefined|none|—|-|–|--)$/i

export function isPlaceholderInvestorName(name) {
  const s = String(name ?? '')
    .trim()
    .replace(/\s+/g, ' ')
  if (!s) return true
  if (PLACEHOLDER_INVESTOR_NAME_RE.test(s)) return true
  if (/^(institutions?|insiders?|politicians?|unknown)\b/i.test(s) && s.length <= 24) return true
  return false
}

export function isPlausibleExploreInvestorRow(row) {
  if (isExploreBaselineHoldingsEvent(row)) return false
  return !isPlaceholderInvestorName(row?.name ?? row?.actorName)
}

/** Baseline 13F ingest — holdings count only, no dossier trade history. */
export function isExploreBaselineHoldingsEvent(row) {
  if (row?.baseline13f === true) return true
  return /^\d+\s+(holdings?|pos)$/i.test(String(row?.trail ?? ''))
}
