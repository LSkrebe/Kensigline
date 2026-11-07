import { fetchJsonSafe } from './api.js'

const REF_KEY = 'ml.ref'
const VISITOR_KEY = 'ml.ref.vid'
const VISIT_LOGGED_PREFIX = 'ml.ref.logged.'

/** Organic / no campaign — used in attribution_events when no ?r= is present. */
export const DIRECT_REF = 'direct'

/** Path → ref for short social links (worker redirects these; this is SPA/local fallback). */
const SHORT_PATH_REFS = {
  '/yt': 'yt',
  '/youtube': 'yt',
  '/twt': 'twt',
  '/twitter': 'twt',
  '/x': 'twt',
  '/ig': 'ig',
  '/instagram': 'ig',
}

function storage() {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function pathRef() {
  if (typeof window === 'undefined') return null
  const path = window.location.pathname.replace(/\/$/, '') || '/'
  return SHORT_PATH_REFS[path] ?? null
}

/** Capture ?r= / short path (e.g. /yt) and persist until checkout; log organic as direct. */
export function captureReferralRef() {
  const store = storage()
  if (!store) return null
  try {
    const params = new URLSearchParams(window.location.search)
    const fromUrl = params.get('r')?.trim().slice(0, 32) || pathRef()
    if (fromUrl) {
      store.setItem(REF_KEY, fromUrl)
      void logAttributionVisit(fromUrl)
      return fromUrl
    }
    const existing = store.getItem(REF_KEY)
    if (existing) return existing
    void logAttributionVisit(DIRECT_REF)
    return null
  } catch {
    return null
  }
}

export function peekReferralRef() {
  const store = storage()
  if (!store) return null
  try {
    return store.getItem(REF_KEY)
  } catch {
    return null
  }
}

function visitorId(store) {
  let id = store.getItem(VISITOR_KEY)
  if (!id) {
    id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `v_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    store.setItem(VISITOR_KEY, id)
  }
  return id
}

/** Log one visit per ref per browser (deduped locally). */
async function logAttributionVisit(ref) {
  const store = storage()
  if (!store || !ref) return
  const dedupeKey = `${VISIT_LOGGED_PREFIX}${ref}`
  if (store.getItem(dedupeKey)) return
  const result = await fetchJsonSafe('/api/attribution/visit', {
    method: 'POST',
    body: { ref, visitor_id: visitorId(store) },
    timeoutMs: 8000,
  })
  if (result.ok) store.setItem(dedupeKey, '1')
}

/** Call after sign-in when a referral ref is present (first-touch signup). */
export async function recordAttributionSignup(ref) {
  const normalized = String(ref ?? '').trim().slice(0, 32)
  if (!normalized) return
  await fetchJsonSafe('/api/attribution/signup', {
    method: 'POST',
    body: { ref: normalized },
    timeoutMs: 8000,
  })
}
