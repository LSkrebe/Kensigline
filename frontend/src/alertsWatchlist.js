import { useCallback, useEffect, useState } from 'react'
import { fetchJsonSafe } from './api.js'

const STORAGE_KEY = 'mercerline:ticker-watchlist'
const PENDING_KEY = 'mercerline:ticker-watchlist-pending'
const WATCHLIST_EVENT = 'mercerline:watchlist'

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

export async function fetchAlertWatchlist() {
  const local = readLocalWatchlist()
  if (watchlistPending()) {
    return { ok: true, tickers: local, synced: false }
  }
  const res = await fetchJsonSafe('/api/alerts/watchlist')
  if (res.ok && Array.isArray(res.data?.tickers)) {
    const tickers = writeLocalWatchlist(res.data.tickers)
    return { ok: true, tickers, synced: true }
  }
  return { ok: true, tickers: local, synced: false }
}

export async function patchAlertWatchlist({ ticker, subscribed }) {
  const t = String(ticker ?? '').trim().toUpperCase()
  if (!t) return { ok: false, tickers: readLocalWatchlist() }

  const prev = readLocalWatchlist()
  const optimistic = subscribed ? normalizeTickers([...prev, t]) : prev.filter((x) => x !== t)
  writeLocalWatchlist(optimistic)

  const res = await fetchJsonSafe('/api/alerts/watchlist', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: { ticker: t, subscribed: Boolean(subscribed) },
  })

  if (res.ok && Array.isArray(res.data?.tickers)) {
    const tickers = writeLocalWatchlist(res.data.tickers)
    clearWatchlistPending()
    return { ok: true, tickers, synced: true }
  }

  markWatchlistPending()
  return { ok: true, tickers: optimistic, synced: false }
}

export function useAlertWatchlist({ enabled = true } = {}) {
  const [tickers, setTickers] = useState(() => readLocalWatchlist())
  const [loaded, setLoaded] = useState(() => readLocalWatchlist().length > 0)
  const [busyTicker, setBusyTicker] = useState('')

  useEffect(() => subscribeAlertWatchlist(setTickers), [])

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
      setLoaded(true)
    })
    return () => {
      alive = false
    }
  }, [enabled])

  const setSubscribed = useCallback(async (ticker, subscribed) => {
    const t = String(ticker ?? '').trim().toUpperCase()
    if (!t) return { ok: false }
    setBusyTicker(t)
    const res = await patchAlertWatchlist({ ticker: t, subscribed })
    setBusyTicker('')
    if (res.tickers) setTickers(res.tickers)
    return res
  }, [])

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

  return { tickers, loaded, busyTicker, toggle, remove, setSubscribed }
}
