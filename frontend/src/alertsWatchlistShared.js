const TICKER_STORAGE_KEY = 'mercerline:ticker-watchlist'
const ACTOR_STORAGE_KEY = 'mercerline:actor-watchlist'
const MAX_KEY = 'mercerline:watchlist-max'

export const ALERT_WATCHLIST_MAX_DEFAULT = 20

function normalizeTickers(list) {
  if (!Array.isArray(list)) return []
  return [...new Set(list.map((t) => String(t ?? '').trim().toUpperCase()).filter(Boolean))].sort()
}

function normalizeActors(list) {
  if (!Array.isArray(list)) return []
  const out = []
  const seen = new Set()
  for (const raw of list) {
    const actor_key = String(raw?.actor_key ?? '').trim().toLowerCase()
    if (!actor_key || seen.has(actor_key)) continue
    seen.add(actor_key)
    out.push({
      actor_key,
      display_name: String(raw?.display_name ?? '').trim() || actor_key,
      mode: raw?.mode === 'politicians' || raw?.mode === 'institutions' ? raw.mode : 'insider',
    })
  }
  return out.sort((a, b) => a.display_name.localeCompare(b.display_name))
}

export function readLocalTickerWatchlist() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(TICKER_STORAGE_KEY)
    if (!raw) return []
    return normalizeTickers(JSON.parse(raw))
  } catch {
    return []
  }
}

export function readLocalActorWatchlist() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(ACTOR_STORAGE_KEY)
    if (!raw) return []
    return normalizeActors(JSON.parse(raw))
  } catch {
    return []
  }
}

export function readAlertWatchlistMax() {
  if (typeof window === 'undefined') return ALERT_WATCHLIST_MAX_DEFAULT
  try {
    const raw = window.localStorage.getItem(MAX_KEY)
    const n = Number(raw)
    if (Number.isFinite(n) && n >= 1) return Math.round(n)
  } catch {
    /* ignore */
  }
  return ALERT_WATCHLIST_MAX_DEFAULT
}

export function combinedAlertWatchlistCount() {
  return readLocalTickerWatchlist().length + readLocalActorWatchlist().length
}

export function writeAlertWatchlistMax(max) {
  const n = Math.max(1, Math.round(Number(max) || ALERT_WATCHLIST_MAX_DEFAULT))
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(MAX_KEY, String(n))
    } catch {
      /* ignore */
    }
  }
  return n
}

export function subscribeCombinedAlertWatchlist(listener) {
  if (typeof window === 'undefined') return () => {}
  const notify = () => listener(combinedAlertWatchlistCount())
  const onStorage = (e) => {
    if (e.key === TICKER_STORAGE_KEY || e.key === ACTOR_STORAGE_KEY) notify()
  }
  window.addEventListener('mercerline:watchlist', notify)
  window.addEventListener('mercerline:actor-watchlist', notify)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener('mercerline:watchlist', notify)
    window.removeEventListener('mercerline:actor-watchlist', notify)
    window.removeEventListener('storage', onStorage)
  }
}
