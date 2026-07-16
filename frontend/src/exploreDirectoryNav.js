export function exploreInvestorSlug(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** @deprecated Use exploreInvestorSlug */
export const exploreActorSlug = exploreInvestorSlug

export function exploreInvestorModeFromDocType(docType) {
  const d = String(docType ?? '').trim().toLowerCase()
  if (d.startsWith('ptr')) return 'politicians'
  if (d.startsWith('13f')) return 'institutions'
  return 'insider'
}

/** Map tracked-investor type keys (insider / politician / institution) to Investigate modes. */
export function exploreInvestorModeFromTypeKey(typeKey) {
  const k = String(typeKey ?? '').trim().toLowerCase()
  if (k === 'politician' || k === 'politicians' || k === 'ptr') return 'politicians'
  if (k === 'institution' || k === 'institutions' || k === '13f') return 'institutions'
  return 'insider'
}

/** @deprecated Use exploreInvestorModeFromDocType */
export const exploreActorModeFromDocType = exploreInvestorModeFromDocType

export function exploreInvestorNameMatchesSlug(investorRow, slug) {
  const target = String(slug ?? '').trim().toLowerCase()
  if (!target) return false
  if (exploreInvestorSlug(investorRow?.actorName) === target) return true
  for (const alias of investorRow?.matchNames ?? []) {
    if (exploreInvestorSlug(alias) === target) return true
  }
  return false
}

/** @deprecated Use exploreInvestorNameMatchesSlug */
export const exploreActorNameMatchesSlug = exploreInvestorNameMatchesSlug

export function findExploreInvestorInFeeds(investorSlug, feeds) {
  const slug = String(investorSlug ?? '').trim().toLowerCase()
  if (!slug) return null

  for (const mode of ['insider', 'politicians', 'institutions']) {
    const rows = feeds[mode] ?? []
    const index = rows.findIndex((row) => exploreInvestorNameMatchesSlug(row, slug))
    if (index >= 0) return { mode, index, row: rows[index] }
  }

  return null
}

/** @deprecated Use findExploreInvestorInFeeds */
export const findExploreActorInFeeds = findExploreInvestorInFeeds

export function findExploreInvestorInFeedsByName(name, preferredMode, feeds) {
  const slug = exploreInvestorSlug(name)
  if (!slug) return null

  const preferred = feeds[preferredMode] ?? []
  const preferredIndex = preferred.findIndex((row) => exploreInvestorNameMatchesSlug(row, slug))
  if (preferredIndex >= 0) {
    return { mode: preferredMode, index: preferredIndex, row: preferred[preferredIndex] }
  }

  return findExploreInvestorInFeeds(slug, feeds)
}

/** @deprecated Use findExploreInvestorInFeedsByName */
export const findExploreActorInFeedsByName = findExploreInvestorInFeedsByName

export function applyExploreInvestorFeedSelection(hit, handlers) {
  if (!hit) return
  const { mode, index } = hit
  handlers.setInvestigateMode(mode)
  if (mode === 'politicians') {
    handlers.setPoliticiansIdx(index)
    handlers.setPoliticiansCaseTradeIdx(0)
  } else if (mode === 'institutions') {
    handlers.setInstitutionsIdx(index)
    handlers.setInstitutionsCaseTradeIdx(0)
  } else {
    handlers.setInsiderIdx(index)
    handlers.setInsiderCaseTradeIdx(0)
  }
}

/** @deprecated Use applyExploreInvestorFeedSelection */
export const applyExploreActorFeedSelection = applyExploreInvestorFeedSelection
