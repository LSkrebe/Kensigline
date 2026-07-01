import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchJsonSafe } from './api.js'
import {
  ALERT_WATCHLIST_MAX_DEFAULT,
  combinedAlertWatchlistCount,
  readAlertWatchlistMax,
  readLocalActorWatchlist,
  subscribeCombinedAlertWatchlist,
  writeAlertWatchlistMax,
} from './alertsWatchlistShared.js'

const STORAGE_KEY = 'mercerline:ticker-watchlist'
const PENDING_KEY = 'mercerline:ticker-watchlist-pending'
const WATCHLIST_EVENT = 'mercerline:watchlist'
/** Matches backend default for $99/mo plan — overridden by GET /api/alerts/watchlist */
export const WATCHLIST_MAX_DEFAULT = ALERT_WATCHLIST_MAX_DEFAULT

function normalizeTickers(list) {
  if (!Array.isArray(list)) return []
  return [...new Set(list.map((t) => String(t ?? '').trim().toUpperCase()).filter(Boolean))].sort()
}

function readLocalWatchlist() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return normalizeTickers(JSON.parse(raw))
  } catch {
    return []
  }
}

function readWatchlistMax() {
  return readAlertWatchlistMax()
}

function writeWatchlistMax(max) {
  return writeAlertWatchlistMax(max)
}

function writeLocalWatchlist(tickers) {
  const next = normalizeTickers(tickers)
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      window.dispatchEvent(new CustomEvent(WATCHLIST_EVENT, { detail: next }))
    } catch {
      /* ignore quota */
    }
  }
  return next
}

function markWatchlistPending() {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(PENDING_KEY, '1')
    } catch {
      /* ignore */
    }
  }
}

function clearWatchlistPending() {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(PENDING_KEY)
    } catch {
      /* ignore */
    }
  }
}

function watchlistPending() {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(PENDING_KEY) === '1'
  } catch {
    return false
  }
}

export function subscribeAlertWatchlist(listener) {
  if (typeof window === 'undefined') return () => {}
  const onCustom = (e) => listener(normalizeTickers(e.detail ?? readLocalWatchlist()))
  const onStorage = (e) => {
    if (e.key === STORAGE_KEY) listener(readLocalWatchlist())
  }
  window.addEventListener(WATCHLIST_EVENT, onCustom)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(WATCHLIST_EVENT, onCustom)
    window.removeEventListener('storage', onStorage)
  }
}

function applyWatchlistMeta(data) {
  if (data?.max != null) writeWatchlistMax(data.max)
}

export async function fetchAlertWatchlist() {
  const local = readLocalWatchlist()
  const max = readWatchlistMax()
  if (watchlistPending()) {
    return { ok: true, tickers: local, max, synced: false }
  }
  const res = await fetchJsonSafe('/api/alerts/watchlist')
  if (res.ok && Array.isArray(res.data?.tickers)) {
    applyWatchlistMeta(res.data)
    const tickers = writeLocalWatchlist(res.data.tickers)
    return { ok: true, tickers, max: res.data.max ?? readWatchlistMax(), synced: true }
  }
  return { ok: true, tickers: local, max, synced: false }
}

export async function patchAlertWatchlist({ ticker, subscribed }) {
  const t = String(ticker ?? '').trim().toUpperCase()
  if (!t) return { ok: false, tickers: readLocalWatchlist(), max: readWatchlistMax() }

  const prev = readLocalWatchlist()
  const max = readWatchlistMax()
  if (subscribed && !prev.includes(t) && combinedAlertWatchlistCount() >= max) {
    return { ok: false, error: 'watchlist_limit', tickers: prev, max }
  }

  const optimistic = subscribed ? normalizeTickers([...prev, t]) : prev.filter((x) => x !== t)
  writeLocalWatchlist(optimistic)

  const res = await fetchJsonSafe('/api/alerts/watchlist', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: { ticker: t, subscribed: Boolean(subscribed) },
  })

  if (res.data?.max != null) applyWatchlistMeta(res.data)

  if (res.ok && Array.isArray(res.data?.tickers)) {
    const tickers = writeLocalWatchlist(res.data.tickers)
    clearWatchlistPending()
    return { ok: true, tickers, max: res.data.max ?? readWatchlistMax(), synced: true }
  }

  if (res.data?.error === 'watchlist_limit') {
    writeLocalWatchlist(prev)
    return {
      ok: false,
      error: 'watchlist_limit',
      tickers: Array.isArray(res.data.tickers) ? normalizeTickers(res.data.tickers) : prev,
      max: res.data.max ?? max,
    }
  }

  markWatchlistPending()
  return { ok: true, tickers: optimistic, max: readWatchlistMax(), synced: false }
}

export function useAlertWatchlist({ enabled = true } = {}) {
  const [tickers, setTickers] = useState(() => readLocalWatchlist())
  const [maxTickers, setMaxTickers] = useState(() => readWatchlistMax())
  const [loaded, setLoaded] = useState(() => readLocalWatchlist().length > 0)
  const [busyTicker, setBusyTicker] = useState('')
  const [limitError, setLimitError] = useState(false)
  const [peerRevision, setPeerRevision] = useState(0)

  useEffect(() => subscribeAlertWatchlist(setTickers), [])
  useEffect(() => subscribeCombinedAlertWatchlist(() => setPeerRevision((v) => v + 1)), [])

  useEffect(() => {
    if (!enabled) {
      setTickers([])
      setLoaded(true)
      return
    }
    let alive = true
    const hadLocal = readLocalWatchlist().length > 0
    if (!hadLocal) setLoaded(false)
    void fetchAlertWatchlist().then((res) => {
      if (!alive) return
      setTickers(res.tickers ?? [])
      if (res.max != null) setMaxTickers(res.max)
      setLoaded(true)
    })
    return () => {
      alive = false
    }
  }, [enabled])

  const combinedCount = useMemo(
    () => combinedAlertWatchlistCount(),
    [tickers, peerRevision],
  )
  const atLimit = combinedCount >= maxTickers
  const canAdd = useCallback(
    (ticker) => {
      const t = String(ticker ?? '').trim().toUpperCase()
      if (!t) return false
      return tickers.includes(t) || combinedCount < maxTickers
    },
    [tickers, combinedCount, maxTickers],
  )

  const setSubscribed = useCallback(
    async (ticker, subscribed) => {
      const t = String(ticker ?? '').trim().toUpperCase()
      if (!t) return { ok: false }
      setBusyTicker(t)
      setLimitError(false)
      const res = await patchAlertWatchlist({ ticker: t, subscribed })
      setBusyTicker('')
      if (res.tickers) setTickers(res.tickers)
      if (res.max != null) setMaxTickers(res.max)
      if (res.error === 'watchlist_limit') setLimitError(true)
      return res
    },
    [],
  )

  const toggle = useCallback(
    async (ticker) => {
      const t = String(ticker ?? '').trim().toUpperCase()
      if (!t) return { ok: false }
      const subscribed = !tickers.includes(t)
      return setSubscribed(t, subscribed)
    },
    [setSubscribed, tickers],
  )

  const remove = useCallback((ticker) => setSubscribed(ticker, false), [setSubscribed])

  return {
    tickers,
    maxTickers,
    combinedCount,
    atLimit,
    canAdd,
    loaded,
    busyTicker,
    limitError,
    toggle,
    remove,
    setSubscribed,
  }
}
