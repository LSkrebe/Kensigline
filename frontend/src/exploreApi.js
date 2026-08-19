import { fetchJsonSafe } from './api.js'
import {
  EMPTY_EXPLORE_DIRECTORY,
  EMPTY_EXPLORE_RECAP,
  isLiveDataMode,
  isMockDataMode,
} from './dataMode.js'
import { evaluateExploreRecap } from './exploreRecapEvaluate.js'
import {
  buildExploreDirectoryFromEvents,
  buildExploreDirectoryFullList,
  buildExploreDirectoryHomeLatest,
  buildExploreDirectoryHomePreview,
  buildExploreDirectoryMock,
} from './exploreDirectoryMock.js'
import { buildExploreDailyRecap } from './exploreRecapMock.js'

function pctMoveFromSeries(series, lookback = 5) {
  const arr = Array.isArray(series) ? series.filter(Number.isFinite) : []
  if (arr.length < 2) return null
  const last = arr[arr.length - 1]
  const startIdx = Math.max(0, arr.length - 1 - lookback)
  const first = arr[startIdx]
  if (!first) return null
  return ((last - first) / first) * 100
}

async function fetchBarsCloses(ticker, days = 260) {
  const t = String(ticker ?? '').trim().toUpperCase()
  if (!t) return []
  const res = await fetchJsonSafe(`/api/bars?ticker=${encodeURIComponent(t)}&days=${days}`, {
    timeoutMs: 10_000,
  })
  const bars = res.ok ? res.data?.items : null
  if (!Array.isArray(bars)) return []
  return bars.map((b) => Number(b?.close)).filter(Number.isFinite)
}

/** Fill missing price series on recap day payload (backend may already attach bars). */
export async function enrichRecapDayWithBars(day) {
  if (!day || typeof day !== 'object') return day

  const tickers = new Set()
  for (const f of day.filings ?? []) {
    if (f?.ticker) tickers.add(String(f.ticker).toUpperCase())
  }
  for (const e of day.earningsSoon ?? []) {
    if (e?.ticker) tickers.add(String(e.ticker).toUpperCase())
  }

  const needBars = [...tickers].filter((t) => {
    const filing = (day.filings ?? []).find((f) => String(f?.ticker).toUpperCase() === t)
    const earn = (day.earningsSoon ?? []).find((e) => String(e?.ticker).toUpperCase() === t)
    const series = filing?.priceSeries?.length ? filing.priceSeries : earn?.priceSeries
    return !Array.isArray(series) || series.length < 2
  })

  const seriesMap = new Map()
  await Promise.all(
    needBars.slice(0, 20).map(async (t) => {
      const closes = await fetchBarsCloses(t)
      if (closes.length) seriesMap.set(t, closes)
    }),
  )

  const filings = (day.filings ?? []).map((f) => {
    const t = String(f?.ticker ?? '').toUpperCase()
    const existing = Array.isArray(f.priceSeries) ? f.priceSeries.filter(Number.isFinite) : []
    const series = existing.length >= 2 ? existing : seriesMap.get(t) ?? []
    const dayMovePct = f.dayMovePct ?? pctMoveFromSeries(series, 3)
    return { ...f, priceSeries: series, dayMovePct }
  })

  const earningsSoon = (day.earningsSoon ?? []).map((e) => {
    const t = String(e?.ticker ?? '').toUpperCase()
    const existing = Array.isArray(e.priceSeries) ? e.priceSeries.filter(Number.isFinite) : []
    const series = existing.length >= 2 ? existing : seriesMap.get(t) ?? []
    return { ...e, priceSeries: series, dayMovePct: e.dayMovePct ?? pctMoveFromSeries(series, 3) }
  })

  return { ...day, filings, earningsSoon }
}

export async function fetchExploreRecapDay(backendUp) {
  if (!isLiveDataMode(backendUp)) return null
  const res = await fetchJsonSafe('/api/explore/recap', { timeoutMs: 14_000 })
  if (!res.ok || !res.data?.ok) return null
  return enrichRecapDayWithBars(res.data)
}

export async function loadExploreDailyRecap(backendUp) {
  if (isMockDataMode(backendUp)) {
    return buildExploreDailyRecap()
  }
  if (!isLiveDataMode(backendUp)) {
    return EMPTY_EXPLORE_RECAP
  }

  const day = await fetchExploreRecapDay(backendUp)
  if (day?.filings) {
    const recap = evaluateExploreRecap(day)
    setExploreRecapCache(day, recap)
    return recap
  }
  return EMPTY_EXPLORE_RECAP
}

export async function fetchExploreDirectoryEvents(backendUp) {
  if (!isLiveDataMode(backendUp)) return null
  const res = await fetchJsonSafe('/api/explore/directory', { timeoutMs: 14_000 })
  if (!res.ok || !res.data?.ok) return null
  return {
    companyEvents: Array.isArray(res.data.companyEvents) ? res.data.companyEvents : [],
    investorEvents: Array.isArray(res.data.investorEvents) ? res.data.investorEvents : [],
  }
}

export async function loadExploreDirectoryBundle(backendUp) {
  if (isMockDataMode(backendUp)) {
    const mockDirectory = buildExploreDirectoryMock()
    return {
      directory: mockDirectory,
      homePreview: buildExploreDirectoryHomePreview(mockDirectory),
      homeLatest: buildExploreDirectoryHomeLatest(mockDirectory),
      fullCompanies: buildExploreDirectoryFullList('companies', mockDirectory),
      fullInvestors: buildExploreDirectoryFullList('investors', mockDirectory),
      live: false,
    }
  }

  if (!isLiveDataMode(backendUp)) {
    return { ...EMPTY_EXPLORE_DIRECTORY, live: false, pending: true }
  }

  const events = await fetchExploreDirectoryEvents(backendUp)
  if (events) {
    const directory = buildExploreDirectoryFromEvents(events.companyEvents, events.investorEvents)
    return {
      directory,
      homePreview: buildExploreDirectoryHomePreview(directory),
      homeLatest: buildExploreDirectoryHomeLatest(directory),
      fullCompanies: buildExploreDirectoryFullList('companies', directory),
      fullInvestors: buildExploreDirectoryFullList('investors', directory),
      live: true,
      pending: false,
    }
  }

  return { ...EMPTY_EXPLORE_DIRECTORY, live: true, pending: false, error: true }
}

let cachedRecapDay = null
let cachedRecapSlides = null

export function setExploreRecapCache(day, recap) {
  cachedRecapDay = day ?? null
  cachedRecapSlides = recap?.slides ?? null
}

export function getExploreRecapCache() {
  return { day: cachedRecapDay, slides: cachedRecapSlides }
}

export async function loadExploreEventBriefContext(backendUp) {
  if (isMockDataMode(backendUp)) {
    const recap = buildExploreDailyRecap()
    return { day: null, slides: recap?.slides ?? [], mock: true }
  }

  if (!isLiveDataMode(backendUp)) {
    return { day: null, slides: [], mock: false, pending: true }
  }

  let { day, slides } = getExploreRecapCache()
  if (!day || !slides?.length) {
    const recap = await loadExploreDailyRecap(backendUp)
    day = cachedRecapDay
    slides = recap?.slides ?? cachedRecapSlides ?? []
  }

  return { day, slides, mock: false, pending: false }
}
