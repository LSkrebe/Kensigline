export function exploreInvestorSlug(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** @deprecated Use exploreInvestorSlug */
export const exploreActorSlug = exploreInvestorSlug

/** Best-effort display name when only a URL slug is known. */
export function exploreInvestorNameFromSlug(slug) {
  const s = String(slug ?? '').trim().replace(/-+/g, ' ')
  if (!s) return ''
  return s.replace(/\b\w/g, (ch) => ch.toUpperCase())
}

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
  const candidates = [investorRow?.actorName, ...(investorRow?.matchNames ?? [])]
  for (const raw of candidates) {
    const name = String(raw ?? '').trim()
    if (!name) continue
    if (exploreInvestorSlug(name) === target) return true
    // "PELOSI, NANCY" ↔ pelosi-nancy / nancy-pelosi
    if (name.includes(',')) {
      const [last, rest] = name.split(',').map((p) => p.trim())
      if (last && rest && exploreInvestorSlug(`${rest} ${last}`) === target) return true
      if (last && rest && exploreInvestorSlug(`${last} ${rest}`) === target) return true
    }
  }
  return false
}

/** @deprecated Use exploreInvestorNameMatchesSlug */
export const exploreActorNameMatchesSlug = exploreInvestorNameMatchesSlug

/**
 * Minimal actor-feed shaped row so deep pages can render the correct person
 * even when they are absent from the live Investigate feeds.
 */
export function stubActorRowFromExploreInvestor(input, mode = 'insider') {
  const name = String(input?.name ?? input?.actorName ?? '').trim()
  if (!name) return null
  const m = mode === 'politicians' || mode === 'institutions' ? mode : 'insider'
  const ticker = String(input?.ticker ?? '').trim().toUpperCase() || null
  const detail =
    String(input?.detail ?? input?.actorDetail ?? '').trim() ||
    (m === 'politicians' ? 'Politician' : m === 'institutions' ? 'Institution' : 'Insider')
  return {
    id: `explore:${exploreInvestorSlug(name)}`,
    actorName: name,
    actorDetail: detail,
    actorDetailSecondary: String(input?.detailSecondary ?? input?.actorDetailSecondary ?? '').trim(),
    source: m,
    matchNames: [name],
    transactions: Array.isArray(input?.transactions) ? input.transactions : [],
    ticker,
  }
}

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

export function findExploreInvestorDirectoryRowBySlug(slug, directoryRows = []) {
  const target = String(slug ?? '').trim().toLowerCase()
  if (!target) return null
  for (const row of directoryRows) {
    if (exploreInvestorSlug(row?.name) === target) return row
  }
  return null
}

/**
 * Resolve which investor the deep page should show from the URL slug.
 * Prefer live feed identity; otherwise directory / stub so we never silently keep idx 0.
 * When both feed + focus exist, keep the richer transaction set (company-seeded focus often wins first paint).
 */
export function resolveExploreInvestorDossier({
  investorSlug,
  feeds,
  directoryRows = [],
  focus = null,
  cached = null,
}) {
  const slug = String(investorSlug ?? '').trim().toLowerCase()
  if (!slug) return null

  const feedHit = findExploreInvestorInFeeds(slug, feeds)
  const focusOk = focus?.slug === slug && focus?.actorRow
  const cachedOk = cached?.actorRow?.transactions?.length > 0
  const feedN = feedHit?.row?.transactions?.length ?? 0
  const focusN = focusOk ? focus.actorRow.transactions?.length ?? 0 : 0
  const cachedN = cachedOk ? cached.actorRow.transactions.length : 0

  // Always prefer the richest live feed aggregation when it beats focus/cache.
  if (feedHit && feedN > 0 && feedN >= focusN && feedN >= cachedN) {
    return {
      slug,
      mode: feedHit.mode,
      index: feedHit.index,
      actorRow: feedHit.row,
      fromFeed: true,
    }
  }

  if (feedHit && feedN > focusN) {
    return {
      slug,
      mode: feedHit.mode,
      index: feedHit.index,
      actorRow: feedHit.row,
      fromFeed: true,
    }
  }

  if (focusOk && focusN >= cachedN && focusN > 0) {
    return {
      slug,
      mode: focus.mode || feedHit?.mode || 'insider',
      index: feedHit?.index ?? null,
      actorRow: focus.actorRow,
      fromFeed: Boolean(feedHit),
    }
  }

  if (cachedOk) {
    return {
      slug,
      mode: cached.mode || focus?.mode || feedHit?.mode || 'insider',
      index: feedHit?.index ?? null,
      actorRow: cached.actorRow,
      fromFeed: Boolean(feedHit),
    }
  }

  if (feedHit) {
    return {
      slug,
      mode: feedHit.mode,
      index: feedHit.index,
      actorRow: feedHit.row,
      fromFeed: true,
    }
  }

  if (focusOk) {
    return {
      slug,
      mode: focus.mode || 'insider',
      index: null,
      actorRow: focus.actorRow,
      fromFeed: false,
    }
  }

  const dir = findExploreInvestorDirectoryRowBySlug(slug, directoryRows)
  if (dir) {
    const mode = exploreInvestorModeFromDocType(dir.docType)
    return {
      slug,
      mode,
      index: null,
      actorRow: stubActorRowFromExploreInvestor(dir, mode),
      fromFeed: false,
    }
  }

  const name = exploreInvestorNameFromSlug(slug)
  return {
    slug,
    mode: 'insider',
    index: null,
    actorRow: stubActorRowFromExploreInvestor({ name }, 'insider'),
    fromFeed: false,
  }
}

export function applyExploreInvestorFeedSelection(hit, handlers) {
  if (!hit) return
  const { mode, index } = hit
  if (index == null || index < 0) {
    if (mode) handlers.setInvestigateMode(mode)
    return
  }
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
