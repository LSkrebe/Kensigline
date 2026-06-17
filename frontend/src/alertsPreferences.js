import { useCallback, useEffect, useState } from 'react'
import { fetchJsonSafe } from './api.js'

const STORAGE_KEY = 'mercerline:digest-enabled'
const PENDING_KEY = 'mercerline:digest-pending'
const PREFS_EVENT = 'mercerline:digest-prefs'

function readLocalEnabled() {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeLocalEnabled(enabled) {
  const on = Boolean(enabled)
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, on ? '1' : '0')
      window.dispatchEvent(new CustomEvent(PREFS_EVENT, { detail: on }))
    } catch {
      /* ignore */
    }
  }
  return on
}

function markDigestPending() {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(PENDING_KEY, '1')
    } catch {
      /* ignore */
    }
  }
}

function clearDigestPending() {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(PENDING_KEY)
    } catch {
      /* ignore */
    }
  }
}

function digestPending() {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(PENDING_KEY) === '1'
  } catch {
    return false
  }
}

export async function fetchDigestEnabled() {
  const local = readLocalEnabled()
  if (digestPending()) {
    return { ok: true, enabled: local, synced: false }
  }
  const res = await fetchJsonSafe('/api/alerts/preferences')
  if (res.ok && res.data?.preferences) {
    const enabled = Boolean(res.data.preferences.enabled)
    writeLocalEnabled(enabled)
    return { ok: true, enabled, synced: true }
  }
  return { ok: true, enabled: local, synced: false }
}

export async function patchDigestEnabled(enabled) {
  const next = Boolean(enabled)
  writeLocalEnabled(next)

  const res = await fetchJsonSafe('/api/alerts/preferences', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: { enabled: next },
  })

  if (res.ok && res.data?.preferences) {
    const synced = Boolean(res.data.preferences.enabled)
    writeLocalEnabled(synced)
    clearDigestPending()
    return { ok: true, enabled: synced, synced: true }
  }

  markDigestPending()
  return { ok: true, enabled: next, synced: false }
}

export function useDigestPreference({ enabled: authEnabled = true } = {}) {
  const [digestEnabled, setDigestEnabled] = useState(() => readLocalEnabled())
  const [loaded, setLoaded] = useState(() => readLocalEnabled() || !authEnabled)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return () => {}
    const onChange = (e) => setDigestEnabled(Boolean(e.detail))
    window.addEventListener(PREFS_EVENT, onChange)
    return () => window.removeEventListener(PREFS_EVENT, onChange)
  }, [])

  useEffect(() => {
    if (!authEnabled) {
      setDigestEnabled(false)
      setLoaded(true)
      return
    }
    let alive = true
    const hadLocal = readLocalEnabled()
    if (!hadLocal) setLoaded(false)
    void fetchDigestEnabled().then((res) => {
      if (!alive) return
      setDigestEnabled(Boolean(res.enabled))
      setLoaded(true)
    })
    return () => {
      alive = false
    }
  }, [authEnabled])

  const setEnabled = useCallback(async (next) => {
    const prev = readLocalEnabled()
    setDigestEnabled(next)
    setBusy(true)
    const res = await patchDigestEnabled(next)
    setBusy(false)
    setDigestEnabled(Boolean(res.enabled))
    if (!res.ok) setDigestEnabled(prev)
    return res
  }, [])

  return { digestEnabled, loaded, busy, setEnabled }
}
