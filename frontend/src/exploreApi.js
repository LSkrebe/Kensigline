import { clearAuthTokenCache, fetchJsonSafe, waitForAuthToken } from './api.js'
import { logClientDiagnostic } from './clientDiagnostics.js'
import {
  EMPTY_EXPLORE_DIRECTORY,
  EMPTY_EXPLORE_RECAP,
  isExploreNetworkMode,
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
  resolveExploreDisplayDay,
  todayIsoUtc,
} from './exploreDirectoryMock.js'
import { buildExploreDailyRecap } from './exploreRecapMock.js'
import { buildExploreRecapMockDay } from './exploreRecapMockDay.js'

/** Client-side explore home cache — survives subview navigation within the session. */
const EXPLORE_HOME_CACHE_TTL_MS = 5 * 60_000
const EXPLORE_HOME_SESSION_KEY = 'mercerline:explore:home:v8'
const EXPLORE_HOME_SESSION_TTL_MS = 10 * 60_000
/** Paint stale session instantly while revalidating (matches backend stale window). */
const EXPLORE_HOME_SESSION_STALE_MS = 30 * 60_000
/** Longer-lived local paint for true cold opens (same device). */
const EXPLORE_HOME_LOCAL_KEY = 'mercerline:explore:home:local:v5'
const EXPLORE_HOME_LOCAL_TTL_MS = 24 * 60 * 60_000

function readExploreHomeSession() {
  if (typeof window === 'undefined' || !window.sessionStorage) return null
  try {
    const raw = window.sessionStorage.getItem(EXPLORE_HOME_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.at || !parsed.recap || !parsed.directory) return null
    const age = Date.now() - parsed.at
    if (age > EXPLORE_HOME_SESSION_STALE_MS) return null
    return { ...parsed, stale: age > EXPLORE_HOME_SESSION_TTL_MS }
  } catch {
    return null
  }
}

function writeExploreHomeSession(recap, directory) {
  if (typeof window === 'undefined' || !window.sessionStorage) return
  try {
    window.sessionStorage.setItem(
      EXPLORE_HOME_SESSION_KEY,
      JSON.stringify({ at: Date.now(), recap, directory, day: cachedRecapDay }),
    )
  } catch {
    /* quota */
  }
  try {
    window.localStorage?.setItem(
      EXPLORE_HOME_LOCAL_KEY,
      JSON.stringify({ at: Date.now(), recap, directory, day: cachedRecapDay }),
    )
  } catch {
    /* quota */
  }
}

function readExploreHomeLocal() {
  if (typeof window === 'undefined' || !window.localStorage) return null
  try {
    const raw = window.localStorage.getItem(EXPLORE_HOME_LOCAL_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.at || !parsed.recap || !parsed.directory) return null
    const age = Date.now() - parsed.at
    if (age > EXPLORE_HOME_LOCAL_TTL_MS) return null
    return { ...parsed, stale: age > EXPLORE_HOME_SESSION_TTL_MS }
  } catch {
    return null
  }
}

function canUseExploreSessionCache(backendUp) {
  return backendUp !== false
}

function hydrateMemoryCacheFromSession(backendUp) {
  if (!canUseExploreSessionCache(backendUp)) return null
  const session = readExploreHomeSession() ?? readExploreHomeLocal()
  if (!session) return null
  recapResultCacheEntry = { at: session.at, backendUp: backendUp === true ? true : backendUp, recap: session.recap }
  directoryCacheEntry = { at: session.at, backendUp: backendUp === true ? true : backendUp, bundle: session.directory }
  if (Array.isArray(session.recap?.slides) && session.recap.slides.length) {
    cachedRecapDay = session.day ?? null
    cachedRecapSlides = session.recap.slides
  }
  markExploreHomeReady()
  return session
}

/** Restore explore home from sessionStorage before health probe finishes. */
export function hydrateExploreHomeFromSession(backendUp = null) {
  return hydrateMemoryCacheFromSession(backendUp)
}

function snapshotFromSession(backendUp) {
  if (!canUseExploreSessionCache(backendUp)) return null
  const session = readExploreHomeSession() ?? readExploreHomeLocal()
  if (!session) return null
  recapResultCacheEntry = { at: session.at, backendUp: backendUp === true ? true : backendUp, recap: session.recap }
  directoryCacheEntry = { at: session.at, backendUp: backendUp === true ? true : backendUp, bundle: session.directory }
  return {
    recap: session.recap,
    homePreview: session.directory.homePreview,
    homeLatest: session.directory.homeLatest,
    fullInvestors: session.directory.fullInvestors,
    fullCompanies: session.directory.fullCompanies,
    fromCache: true,
    stale: session.stale === true,
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/** Retry when auth/session or DB blips race the first paint after idle. */
export async function fetchJsonWithAuthRetry(path, opts = {}) {
  const attempts = Math.max(1, Number(opts.authRetries ?? 5) || 5)
  const fastAuth = opts.fastAuth === true
  let last = null
  for (let i = 0; i < attempts; i++) {
    if (i > 0) {
      clearAuthTokenCache()
      await waitForAuthToken(Math.min(2500, 600 + i * 400))
      await sleep(120 + i * 220)
    } else {
      await waitForAuthToken(fastAuth ? 400 : 1200)
    }
    last = await fetchJsonSafe(path, opts)
    if (last.ok) return last
    if (last.status !== 401 && last.status !== 0 && last.status !== 503) return last
  }
  return last
}

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

function filingsNeedBarEnrichment(day) {
  const filings = day?.filings ?? []
  const earnings = day?.earningsSoon ?? []
  if (!filings.length && !earnings.length) return false
  const filingNeeds = filings.some((f) => {
    const series = Array.isArray(f?.priceSeries) ? f.priceSeries.filter(Number.isFinite) : []
    return series.length < 2
  })
  const earnNeeds = earnings.some((e) => {
    const series = Array.isArray(e?.priceSeries) ? e.priceSeries.filter(Number.isFinite) : []
    return series.length < 2
  })
  return filingNeeds || earnNeeds
}

/** Fill missing price series on recap day payload (backend usually attaches bars already). */
export async function enrichRecapDayWithBars(day) {
  if (!day || typeof day !== 'object') return day
  if (!filingsNeedBarEnrichment(day)) return day

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

  if (!needBars.length) return day

  const seriesMap = new Map()
  await Promise.all(
    needBars.slice(0, 12).map(async (t) => {
      const closes = await fetchBarsCloses(t, 365)
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

function scopeRecapDayToDisplayDay(day) {
  if (!day || typeof day !== 'object') return day
  const dates = (day.filings ?? []).map((f) => f.filingDate)
  const { displayDayKey, requestedDayKey, isFallback } = resolveExploreDisplayDay(dates, {
    today: todayIsoUtc(),
    maxLookback: 7,
    utc: true,
  })
  const filings = (day.filings ?? []).filter(
    (f) => String(f?.filingDate ?? '').slice(0, 10) === displayDayKey,
  )
  return {
    ...day,
    dayKey: displayDayKey,
    requestedDayKey,
    isFallback,
    filings,
  }
}

function cacheEntryFresh(entry, backendUp) {
  return (
    entry &&
    entry.backendUp !== false &&
    backendUp !== false &&
    Date.now() - entry.at < EXPLORE_HOME_CACHE_TTL_MS
  )
}

let directoryCacheEntry = null
let recapResultCacheEntry = null
let directoryInflight = null
let recapInflight = null
let homeInflight = null
let exploreHomeReady = false
let exploreHomeReadyPromise = null
let exploreHomeReadyResolve = null

function ensureExploreHomeReadyPromise() {
  if (!exploreHomeReadyPromise) {
    exploreHomeReadyPromise = new Promise((resolve) => {
      exploreHomeReadyResolve = resolve
    })
  }
  return exploreHomeReadyPromise
}

export function markExploreHomeReady() {
  if (exploreHomeReady) return
  exploreHomeReady = true
  exploreHomeReadyResolve?.()
}

export function waitForExploreHomeReady(backendUp) {
  if (!isExploreNetworkMode(backendUp)) {
    markExploreHomeReady()
    return Promise.resolve()
  }
  if (exploreHomeReady || peekExploreHomeSnapshot(backendUp)) {
    markExploreHomeReady()
    return Promise.resolve()
  }
  if (homeInflight) {
    return homeInflight.then(() => undefined)
  }
  return ensureExploreHomeReadyPromise()
}

/** Company display name from cached Explore directory rows (matches home / list pages). */
export function lookupExploreDirectoryCompanyName(ticker, backendUp) {
  const snap = peekExploreHomeSnapshot(backendUp)
  if (!snap) return null
  const t = String(ticker ?? '').trim().toUpperCase()
  if (!t) return null
  const rows = [
    ...(snap.fullCompanies ?? []),
    ...(snap.homePreview?.companies ?? []),
    ...(snap.homeLatest?.companies ?? []),
  ]
  for (const row of rows) {
    if (String(row?.ticker ?? '').trim().toUpperCase() === t) {
      const name = String(row?.name ?? '').trim()
      if (name) return name
    }
  }
  return null
}

/** Instant paint when returning to Explore home within the session cache window. */
export function peekExploreHomeSnapshot(backendUp) {
  if (backendUp === false) return null
  let hasRecap = cacheEntryFresh(recapResultCacheEntry, backendUp)
  let hasDir = cacheEntryFresh(directoryCacheEntry, backendUp)
  let stale = false
  if (!hasRecap || !hasDir) {
    const sessionSnap = snapshotFromSession(backendUp)
    if (sessionSnap) {
      hasRecap = true
      hasDir = true
      stale = sessionSnap.stale === true
    }
  }
  if (!hasRecap && !hasDir) return null
  return {
    recap: hasRecap ? recapResultCacheEntry.recap : null,
    homePreview: hasDir ? directoryCacheEntry.bundle.homePreview : null,
    homeLatest: hasDir ? directoryCacheEntry.bundle.homeLatest : null,
    fullInvestors: hasDir ? directoryCacheEntry.bundle.fullInvestors : null,
    fullCompanies: hasDir ? directoryCacheEntry.bundle.fullCompanies : null,
    fromCache: true,
    stale,
  }
}

function processExploreHomeResponse(data, backendUp) {
  const day = data?.recap ?? null
  if (!day) return null

  const serverEval = data?.recapEvaluated
  let recapOut

  if (serverEval?.slides?.length) {
    recapOut = {
      slides: serverEval.slides,
      displayDayKey: serverEval.displayDayKey ?? day.dayKey,
      requestedDayKey: serverEval.requestedDayKey ?? day.dayKey,
      isFallback: serverEval.isFallback === true,
    }
    setExploreRecapCache({ ...day, dayKey: recapOut.displayDayKey }, recapOut)
  } else {
    const scopedDay = scopeRecapDayToDisplayDay(day)
    const recap = evaluateExploreRecap(scopedDay)
    recapOut = {
      ...recap,
      displayDayKey: scopedDay.dayKey,
      requestedDayKey: scopedDay.requestedDayKey,
      isFallback: scopedDay.isFallback,
    }
    setExploreRecapCache(scopedDay, recapOut)
  }

  recapResultCacheEntry = { at: Date.now(), backendUp, recap: recapOut }
  markExploreHomeReady()

  const events = {
    companyEvents: Array.isArray(data.companyEvents) ? data.companyEvents : [],
    investorEvents: Array.isArray(data.investorEvents) ? data.investorEvents : [],
    watchlistEvents: Array.isArray(data.watchlistEvents) ? data.watchlistEvents : [],
  }
  const directoryBundle = buildDirectoryBundleFromEvents(events)
  directoryCacheEntry = { at: Date.now(), backendUp, bundle: directoryBundle }
  writeExploreHomeSession(recapOut, directoryBundle)

  return { recap: recapOut, directory: directoryBundle }
}

export async function fetchExploreHome(backendUp, opts = {}) {
  if (!isExploreNetworkMode(backendUp)) return null
  const storeUp = backendUp === true
  let res = await fetchJsonSafe('/api/explore/home', { timeoutMs: 20_000 })
  if (!res.ok && (res.status === 401 || res.status === 0)) {
    res = await fetchJsonWithAuthRetry('/api/explore/home', {
      timeoutMs: 20_000,
      authRetries: 2,
      fastAuth: opts.fastAuth === true,
    })
  }
  if (!res.ok || !res.data?.ok) return null
  return processExploreHomeResponse(res.data, storeUp)
}

export async function fetchExploreRecapDay(backendUp) {
  if (!isLiveDataMode(backendUp)) return null
  const res = await fetchJsonWithAuthRetry('/api/explore/recap', { timeoutMs: 45_000 })
  if (!res.ok || !res.data?.ok) return null
  return enrichRecapDayWithBars(res.data)
}

export async function loadExploreDailyRecap(backendUp, opts = {}) {
  if (isMockDataMode(backendUp)) {
    return buildExploreDailyRecap()
  }
  if (!isLiveDataMode(backendUp)) {
    return EMPTY_EXPLORE_RECAP
  }

  if (!opts.force && cacheEntryFresh(recapResultCacheEntry, backendUp)) {
    const cached = recapResultCacheEntry.recap
    if (cached?.slides?.length && !cachedRecapSlides?.length) {
      cachedRecapSlides = cached.slides
    }
    return cached
  }

  if (recapInflight) return recapInflight

  recapInflight = (async () => {
    try {
      const day = await fetchExploreRecapDay(backendUp)
      if (day) {
        const scopedDay = scopeRecapDayToDisplayDay(day)
        const recap = evaluateExploreRecap(scopedDay)
        const out = {
          ...recap,
          displayDayKey: scopedDay.dayKey,
          requestedDayKey: scopedDay.requestedDayKey,
          isFallback: scopedDay.isFallback,
        }
        setExploreRecapCache(scopedDay, out)
        recapResultCacheEntry = { at: Date.now(), backendUp, recap: out }
        return out
      }
      logClientDiagnostic('explore.recap_empty', { backendUp: backendUp === true })
      return EMPTY_EXPLORE_RECAP
    } finally {
      recapInflight = null
    }
  })()

  return recapInflight
}

export async function fetchExploreDirectoryEvents(backendUp) {
  if (!isLiveDataMode(backendUp)) return null
  const res = await fetchJsonWithAuthRetry('/api/explore/directory', { timeoutMs: 30_000 })
  if (!res.ok || !res.data?.ok) return null
  return {
    companyEvents: Array.isArray(res.data.companyEvents) ? res.data.companyEvents : [],
    investorEvents: Array.isArray(res.data.investorEvents) ? res.data.investorEvents : [],
    watchlistEvents: Array.isArray(res.data.watchlistEvents) ? res.data.watchlistEvents : [],
  }
}

/** Cohort payload for Explore performance surfaces. */
export async function fetchExplorePerformance(backendUp) {
  if (!isLiveDataMode(backendUp)) return null
  const res = await fetchJsonWithAuthRetry('/api/explore/performance', {
    timeoutMs: 12_000,
    authRetries: 2,
    fastAuth: true,
  })
  if (!res.ok || !res.data?.ok) return null
  return res.data
}

function finiteUsd(value) {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

/** Prefer the realistic twin when one filer is inflated / double-counted vs another. */
function mergeInvestedUsd(a, b) {
  const left = finiteUsd(a)
  const right = finiteUsd(b)
  if (left == null || left <= 0) return right != null && right > 0 ? right : null
  if (right == null || right <= 0) return left
  const hi = Math.max(left, right)
  const lo = Math.min(left, right)
  const ratio = hi / lo
  if (hi >= 200_000_000_000 && ratio >= 8) return lo
  if (ratio > 80 && ratio < 2000) return lo
  return hi
}

/** Per-filer disclosed-stock returns + invested totals for Explore cards / tape. */
export async function fetchExplorePerformanceMembers(backendUp) {
  const data = await fetchExplorePerformance(backendUp)
  if (!data) return null
  const bySlug = new Map()
  const push = (slug, returns, fallback, investedUsd = null) => {
    const key = String(slug ?? '').toLowerCase().trim()
    if (!key) return
    const prev = bySlug.get(key) ?? { returns: {}, investedUsd: null }
    const nextReturns = { ...prev.returns }
    if (returns && typeof returns === 'object') {
      for (const [range, value] of Object.entries(returns)) {
        if (Number.isFinite(Number(value))) nextReturns[range] = Number(value)
      }
    }
    if (Number.isFinite(Number(fallback)) && nextReturns['1Y'] == null) nextReturns['1Y'] = Number(fallback)
    bySlug.set(key, {
      returns: nextReturns,
      investedUsd: mergeInvestedUsd(prev.investedUsd, investedUsd),
    })
  }
  for (const member of data.members ?? []) {
    push(member?.slug, member?.returns, member?.returnFraction, member?.investedUsd)
  }
  for (const group of data.groups ?? []) {
    for (const leader of group?.leaders ?? []) {
      push(leader?.slug, leader?.returns, leader?.returnFraction, leader?.investedUsd)
    }
  }
  return Object.fromEntries(bySlug)
}

function buildDirectoryBundleFromEvents(events) {
  const directory = buildExploreDirectoryFromEvents(events.companyEvents, events.investorEvents)
  const homePreview = buildExploreDirectoryHomePreview(directory, { utc: true, maxLookback: 14 })
  return {
    directory,
    homePreview,
    homeLatest: buildExploreDirectoryHomeLatest(directory),
    fullCompanies: buildExploreDirectoryFullList('companies', directory),
    fullInvestors: buildExploreDirectoryFullList('investors', directory),
    watchlistEvents: events.watchlistEvents ?? [],
    displayDayKey: homePreview.displayDayKey,
    isFallback: homePreview.isFallback,
    live: true,
    pending: false,
  }
}

export async function loadExploreDirectoryBundle(backendUp, opts = {}) {
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

  if (!opts.force && cacheEntryFresh(directoryCacheEntry, backendUp)) {
    return directoryCacheEntry.bundle
  }

  if (directoryInflight) return directoryInflight

  directoryInflight = (async () => {
    try {
      const events = await fetchExploreDirectoryEvents(backendUp)
      if (events) {
        const bundle = buildDirectoryBundleFromEvents(events)
        directoryCacheEntry = { at: Date.now(), backendUp, bundle }
        return bundle
      }
      return { ...EMPTY_EXPLORE_DIRECTORY, live: true, pending: false, error: true }
    } finally {
      directoryInflight = null
    }
  })()

  return directoryInflight
}

export async function loadExploreHomeBundle(backendUp, opts = {}) {
  if (isMockDataMode(backendUp)) {
    const recap = buildExploreDailyRecap()
    const mockDirectory = buildExploreDirectoryMock()
    return {
      recap,
      directory: {
        directory: mockDirectory,
        homePreview: buildExploreDirectoryHomePreview(mockDirectory),
        homeLatest: buildExploreDirectoryHomeLatest(mockDirectory),
        fullCompanies: buildExploreDirectoryFullList('companies', mockDirectory),
        fullInvestors: buildExploreDirectoryFullList('investors', mockDirectory),
        live: false,
      },
      fromCache: false,
    }
  }

  if (!isExploreNetworkMode(backendUp)) {
    return { recap: EMPTY_EXPLORE_RECAP, directory: EMPTY_EXPLORE_DIRECTORY, pending: true }
  }

  if (!opts.force) {
    const cached = peekExploreHomeSnapshot(backendUp)
    if (cached?.recap && cached?.homePreview) {
      const needsRefresh = cached.stale === true
      if (!needsRefresh) {
        return {
          recap: cached.recap,
          directory: directoryCacheEntry.bundle,
          fromCache: true,
        }
      }
      void refreshExploreHomeBundle(backendUp)
      return {
        recap: cached.recap,
        directory: directoryCacheEntry.bundle,
        fromCache: true,
        stale: true,
      }
    }
  }

  return fetchExploreHomeBundleFresh(backendUp)
}

async function fetchExploreHomeBundleFresh(backendUp) {
  if (homeInflight) return homeInflight

  homeInflight = (async () => {
    try {
      let processed = await fetchExploreHome(backendUp, { fastAuth: true })
      if (!processed) {
        processed = await fetchExploreHome(backendUp)
      }
      if (processed) {
        return { recap: processed.recap, directory: processed.directory, fromCache: false }
      }
      const staleSnap = snapshotFromSession(backendUp)
      if (staleSnap?.recap && directoryCacheEntry?.bundle) {
        return { recap: staleSnap.recap, directory: directoryCacheEntry.bundle, fromCache: true, stale: true }
      }
      return {
        recap: EMPTY_EXPLORE_RECAP,
        directory: { ...EMPTY_EXPLORE_DIRECTORY, live: true, pending: false, error: true },
        fromCache: false,
      }
    } finally {
      markExploreHomeReady()
      homeInflight = null
    }
  })()

  return homeInflight
}

function refreshExploreHomeBundle(backendUp) {
  if (!isExploreNetworkMode(backendUp)) return Promise.resolve(null)
  return fetchExploreHomeBundleFresh(backendUp)
}

/** Warm explore home as soon as backend + auth are ready (before Explore mount). */
export function prefetchExploreHome(backendUp) {
  if (!isExploreNetworkMode(backendUp)) return Promise.resolve(null)
  return loadExploreHomeBundle(backendUp, { force: false })
}

let cachedRecapDay = null
let cachedRecapSlides = null

// Hydrate only after every cache binding (including ready state) is initialized.
if (typeof window !== 'undefined') {
  hydrateMemoryCacheFromSession(null)
}

export function setExploreRecapCache(day, recap) {
  cachedRecapDay = day ?? null
  cachedRecapSlides = recap?.slides ?? null
}

export function getExploreRecapCache() {
  return { day: cachedRecapDay, slides: cachedRecapSlides }
}

function recapSlidesFromMemory(backendUp) {
  const fromCache = cachedRecapSlides
  if (Array.isArray(fromCache) && fromCache.length) return fromCache
  const snap = peekExploreHomeSnapshot(backendUp)
  const slides = snap?.recap?.slides
  return Array.isArray(slides) && slides.length ? slides : []
}

export async function loadExploreEventBriefContext(backendUp) {
  if (isMockDataMode(backendUp)) {
    const recap = buildExploreDailyRecap()
    return {
      day: buildExploreRecapMockDay(),
      slides: recap?.slides ?? [],
      mock: true,
      pending: false,
    }
  }

  const cachedSlides = recapSlidesFromMemory(backendUp)
  if (!isLiveDataMode(backendUp)) {
    if (cachedSlides.length) {
      return { day: cachedRecapDay, slides: cachedSlides, mock: false, pending: true }
    }
    return { day: null, slides: [], mock: false, pending: true }
  }

  let { day, slides } = getExploreRecapCache()
  if (!slides?.length) slides = cachedSlides
  const complete = (d, ss) => {
    if (!d || !ss?.length) return false
    const ids = new Set((d.filings ?? []).map(f => String(f.id)))
    return ss.every(slide => (slide.memberIds ?? []).every(id => ids.has(String(id))))
  }
  if (!complete(day, slides)) {
    // Fetch slides and their member records together. A cached headline alone
    // cannot satisfy an event-detail request.
    await fetchExploreHome(backendUp)
    ;({ day, slides } = getExploreRecapCache())
    if (!complete(day, slides)) {
      await loadExploreDailyRecap(backendUp, { force: true })
      ;({ day, slides } = getExploreRecapCache())
    }
    if (!slides?.length) slides = cachedSlides
  }

  return {
    day: day ?? cachedRecapDay,
    slides: slides ?? cachedSlides ?? [],
    mock: false,
    pending: false,
  }
}

export async function fetchExploreEventChartSeries(ticker, seedSeries = [], backendUp = null) {
  const seed = Array.isArray(seedSeries) ? seedSeries.filter(Number.isFinite) : []
  if (seed.length >= 180) return seed
  if (backendUp === false) return seed
  const t = String(ticker ?? '').trim().toUpperCase()
  if (!t) return seed
  const closes = await fetchBarsCloses(t, 365)
  return closes.length >= 30 ? closes : seed.length ? seed : closes
}
