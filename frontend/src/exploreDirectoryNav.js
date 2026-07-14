export function exploreActorSlug(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function exploreActorModeFromDocType(docType) {
  const d = String(docType ?? '').trim().toLowerCase()
  if (d.startsWith('ptr')) return 'politicians'
  if (d.startsWith('13f')) return 'institutions'
  return 'insider'
}

export function exploreActorNameMatchesSlug(actorRow, slug) {
  const target = String(slug ?? '').trim().toLowerCase()
  if (!target) return false
  if (exploreActorSlug(actorRow?.actorName) === target) return true
  for (const alias of actorRow?.matchNames ?? []) {
    if (exploreActorSlug(alias) === target) return true
  }
  return false
}

export function findExploreActorInFeeds(actorSlug, feeds) {
  const slug = String(actorSlug ?? '').trim().toLowerCase()
  if (!slug) return null

  for (const mode of ['insider', 'politicians', 'institutions']) {
    const rows = feeds[mode] ?? []
    const index = rows.findIndex((row) => exploreActorNameMatchesSlug(row, slug))
    if (index >= 0) return { mode, index, row: rows[index] }
  }

  return null
}

export function findExploreActorInFeedsByName(name, preferredMode, feeds) {
  const slug = exploreActorSlug(name)
  if (!slug) return null

  const preferred = feeds[preferredMode] ?? []
  const preferredIndex = preferred.findIndex((row) => exploreActorNameMatchesSlug(row, slug))
  if (preferredIndex >= 0) {
    return { mode: preferredMode, index: preferredIndex, row: preferred[preferredIndex] }
  }

  return findExploreActorInFeeds(slug, feeds)
}

export function applyExploreActorFeedSelection(hit, handlers) {
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
