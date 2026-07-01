import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchJsonSafe } from './api.js'
import {
  ALERT_WATCHLIST_MAX_DEFAULT,
  combinedAlertWatchlistCount,
  readAlertWatchlistMax,
  subscribeCombinedAlertWatchlist,
  writeAlertWatchlistMax,
} from './alertsWatchlistShared.js'

const STORAGE_KEY = 'mercerline:actor-watchlist'
const PENDING_KEY = 'mercerline:actor-watchlist-pending'
const WATCHLIST_EVENT = 'mercerline:actor-watchlist'
export const ACTOR_WATCHLIST_MAX_DEFAULT = ALERT_WATCHLIST_MAX_DEFAULT

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

function readLocalActorWatchlist() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return normalizeActors(JSON.parse(raw))
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

function writeLocalActorWatchlist(actors) {
  const next = normalizeActors(actors)
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      window.dispatchEvent(new CustomEvent(WATCHLIST_EVENT, { detail: next }))
    } catch {
      /* ignore */
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

export function subscribeActorAlertWatchlist(listener) {
  if (typeof window === 'undefined') return () => {}
  const onCustom = (e) => listener(normalizeActors(e.detail ?? readLocalActorWatchlist()))
  const onStorage = (e) => {
    if (e.key === STORAGE_KEY) listener(readLocalActorWatchlist())
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

export async function fetchActorAlertWatchlist() {
  const local = readLocalActorWatchlist()
  const max = readWatchlistMax()
  if (watchlistPending()) {
    return { ok: true, actors: local, max, synced: false }
  }
  const res = await fetchJsonSafe('/api/alerts/actor-watchlist')
  if (res.ok && Array.isArray(res.data?.actors)) {
    applyWatchlistMeta(res.data)
    const actors = writeLocalActorWatchlist(res.data.actors)
    return { ok: true, actors, max: res.data.max ?? readWatchlistMax(), synced: true }
  }
  return { ok: true, actors: local, max, synced: false }
}

export async function patchActorAlertWatchlist({ actor_key, display_name, mode, subscribed }) {
  const key = String(actor_key ?? '').trim().toLowerCase()
  if (!key) return { ok: false, actors: readLocalActorWatchlist(), max: readWatchlistMax() }

  const prev = readLocalActorWatchlist()
  const max = readWatchlistMax()
  if (subscribed && !prev.some((a) => a.actor_key === key) && combinedAlertWatchlistCount() >= max) {
    return { ok: false, error: 'watchlist_limit', actors: prev, max }
  }

  const optimistic = subscribed
    ? normalizeActors([
        ...prev.filter((a) => a.actor_key !== key),
        {
          actor_key: key,
          display_name: String(display_name ?? '').trim() || key,
          mode: mode === 'politicians' || mode === 'institutions' ? mode : 'insider',
        },
      ])
    : prev.filter((a) => a.actor_key !== key)
  writeLocalActorWatchlist(optimistic)

  const res = await fetchJsonSafe('/api/alerts/actor-watchlist', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: { actor_key: key, display_name, mode, subscribed: Boolean(subscribed) },
  })

  if (res.data?.max != null) applyWatchlistMeta(res.data)

  if (res.ok && Array.isArray(res.data?.actors)) {
    const actors = writeLocalActorWatchlist(res.data.actors)
    clearWatchlistPending()
    return { ok: true, actors, max: res.data.max ?? readWatchlistMax(), synced: true }
  }

  if (res.data?.error === 'watchlist_limit' || res.data?.error === 'actor_watchlist_limit') {
    writeLocalActorWatchlist(prev)
    return {
      ok: false,
      error: 'watchlist_limit',
      actors: Array.isArray(res.data.actors) ? normalizeActors(res.data.actors) : prev,
      max: res.data.max ?? max,
    }
  }

  markWatchlistPending()
  return { ok: true, actors: optimistic, max: readWatchlistMax(), synced: false }
}

export function useActorAlertWatchlist({ enabled = true } = {}) {
  const [actors, setActors] = useState(() => readLocalActorWatchlist())
  const [maxActors, setMaxActors] = useState(() => readWatchlistMax())
  const [loaded, setLoaded] = useState(() => readLocalActorWatchlist().length > 0)
  const [busyKey, setBusyKey] = useState('')
  const [limitError, setLimitError] = useState(false)
  const [peerRevision, setPeerRevision] = useState(0)

  useEffect(() => subscribeActorAlertWatchlist(setActors), [])
  useEffect(() => subscribeCombinedAlertWatchlist(() => setPeerRevision((v) => v + 1)), [])

  useEffect(() => {
    if (!enabled) {
      setActors([])
      setLoaded(true)
      return
    }
    let alive = true
    const hadLocal = readLocalActorWatchlist().length > 0
    if (!hadLocal) setLoaded(false)
    void fetchActorAlertWatchlist().then((res) => {
      if (!alive) return
      setActors(res.actors ?? [])
      if (res.max != null) setMaxActors(res.max)
      setLoaded(true)
    })
    return () => {
      alive = false
    }
  }, [enabled])

  const combinedCount = useMemo(
    () => combinedAlertWatchlistCount(),
    [actors, peerRevision],
  )
  const atLimit = combinedCount >= maxActors
  const canAdd = useCallback(
    (actorKey) => {
      const key = String(actorKey ?? '').trim().toLowerCase()
      if (!key) return false
      return actors.some((a) => a.actor_key === key) || combinedCount < maxActors
    },
    [actors, combinedCount, maxActors],
  )

  const setSubscribed = useCallback(async (actorKey, subscribed, meta = {}) => {
    const key = String(actorKey ?? '').trim().toLowerCase()
    if (!key) return { ok: false }
    setBusyKey(key)
    setLimitError(false)
    const res = await patchActorAlertWatchlist({
      actor_key: key,
      display_name: meta.display_name,
      mode: meta.mode,
      subscribed,
    })
    setBusyKey('')
    if (res.actors) setActors(res.actors)
    if (res.max != null) setMaxActors(res.max)
    if (res.error === 'watchlist_limit') setLimitError(true)
    return res
  }, [])

  const toggle = useCallback(
    async (actorKey, meta = {}) => {
      const key = String(actorKey ?? '').trim().toLowerCase()
      if (!key) return { ok: false }
      const subscribed = !actors.some((a) => a.actor_key === key)
      return setSubscribed(key, subscribed, meta)
    },
    [setSubscribed, actors],
  )

  const remove = useCallback((actorKey) => setSubscribed(actorKey, false), [setSubscribed])

  const isSubscribed = useCallback(
    (actorKey) => {
      const key = String(actorKey ?? '').trim().toLowerCase()
      return key ? actors.some((a) => a.actor_key === key) : false
    },
    [actors],
  )

  return {
    actors,
    maxActors,
    combinedCount,
    atLimit,
    canAdd,
    loaded,
    busyKey,
    limitError,
    toggle,
    remove,
    setSubscribed,
    isSubscribed,
  }
}
