import { useEffect, useMemo, useState } from 'react'
import { fetchExplorePerformanceMembers } from './exploreApi.js'
import {
  explorePerformerReturn,
  explorePopularityScore,
} from './ExploreWatchlistSection.jsx'
import { EXPLORE_WATCHLIST_CATALOG } from './exploreWatchlistCatalog.js'
import { buildExploreWatchlistPeople } from './exploreWatchlistData.js'

export const INTRO_PERF_RANGE = '1Y'

const TOGETHER_MODES = ['insiders', 'politicians', 'institutions']
const COVERAGE_MODES = ['politicians', 'insiders', 'institutions']

function catalogRows() {
  return buildExploreWatchlistPeople([], { people: EXPLORE_WATCHLIST_CATALOG })
}

/** Attach live returns only — no mock fill. */
function mergeReturns(liveMap) {
  if (!liveMap || typeof liveMap !== 'object') return []

  return catalogRows().map((row) => {
    const slug = String(row.actorSlug ?? '').toLowerCase()
    const live = liveMap[slug]
    const returnsByRange =
      live?.returns && typeof live.returns === 'object' ? { ...live.returns } : {}
    return {
      ...row,
      returnsByRange,
      investedUsd: live?.investedUsd ?? row.investedUsd ?? null,
      modeLabel: row.modeLabel || modeLabel(row.mode),
    }
  })
}

function modeLabel(mode) {
  const key = String(mode ?? '').toLowerCase()
  if (key === 'politicians' || key === 'politician') return 'Politician'
  if (key === 'institutions' || key === 'institution') return 'Fund'
  if (key === 'insiders' || key === 'insider') return 'Insider'
  return 'Investor'
}

function modeKey(row) {
  const key = String(row?.mode ?? row?.typeKey ?? '').toLowerCase()
  if (key.startsWith('politic')) return 'politicians'
  if (key.startsWith('instit')) return 'institutions'
  if (key.startsWith('insider')) return 'insiders'
  return key
}

function scoreRow(row, range = INTRO_PERF_RANGE) {
  const ret = explorePerformerReturn(row, range)
  const pop = explorePopularityScore(row.actorSlug)
  const safeRet = Number.isFinite(ret) ? ret : -1
  return safeRet * 100 + pop * 0.02
}

/** One featured face per world - popular names with solid yearly returns. */
export function selectIntroTogether(rows, range = INTRO_PERF_RANGE) {
  return TOGETHER_MODES.map((mode) => {
    const candidates = (rows ?? []).filter((row) => modeKey(row) === mode && explorePerformerReturn(row, range) != null)
    if (!candidates.length) return null
    return [...candidates].sort((a, b) => scoreRow(b, range) - scoreRow(a, range) || String(a.name).localeCompare(String(b.name)))[0]
  }).filter(Boolean)
}

/** Top yearly performers, popularity-weighted so familiar names stay near the top. */
export function selectIntroLeaders(rows, limit = 6, range = INTRO_PERF_RANGE) {
  const people = (rows ?? []).filter((row) => explorePerformerReturn(row, range) != null)
  return [...people]
    .sort((a, b) => scoreRow(b, range) - scoreRow(a, range) || String(a.name).localeCompare(String(b.name)))
    .slice(0, limit)
}

/** Coverage columns filled with popular faces that already have yearly PnL. */
export function selectIntroCoverage(rows, perCol = 4, range = INTRO_PERF_RANGE) {
  const labels = {
    politicians: 'Politicians',
    insiders: 'Insiders',
    institutions: 'Funds',
  }
  return COVERAGE_MODES.map((mode) => {
    const candidates = (rows ?? []).filter((row) => modeKey(row) === mode)
    const ranked = [...candidates].sort((a, b) => {
      const ra = explorePerformerReturn(a, range)
      const rb = explorePerformerReturn(b, range)
      const posA = Number.isFinite(ra) && ra > 0 ? 1 : 0
      const posB = Number.isFinite(rb) && rb > 0 ? 1 : 0
      return (
        posB - posA ||
        scoreRow(b, range) - scoreRow(a, range) ||
        String(a.name).localeCompare(String(b.name))
      )
    })
    return {
      id: mode,
      label: labels[mode],
      faces: ranked.slice(0, perCol),
    }
  })
}

let liveMapCache = null
let liveMapPromise = null

function loadLiveMap() {
  if (liveMapPromise) return liveMapPromise
  liveMapPromise = fetchExplorePerformanceMembers(true)
    .then((map) => {
      liveMapCache = map && typeof map === 'object' ? map : null
      return liveMapCache
    })
    .catch(() => {
      liveMapCache = null
      return null
    })
  return liveMapPromise
}

export function useIntroExplorePeople() {
  const [liveMap, setLiveMap] = useState(liveMapCache)
  const [loading, setLoading] = useState(liveMapCache == null)

  useEffect(() => {
    let cancelled = false
    if (liveMapCache != null) {
      setLiveMap(liveMapCache)
      setLoading(false)
      return undefined
    }
    setLoading(true)
    void loadLiveMap().then((map) => {
      if (!cancelled) {
        setLiveMap(map)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const people = useMemo(() => mergeReturns(liveMap), [liveMap])

  return { people, loading, range: INTRO_PERF_RANGE }
}
