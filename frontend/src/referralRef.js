import { fetchJsonSafe } from './api.js'

const REF_KEY = 'ml.ref'
const VISITOR_KEY = 'ml.ref.vid'
const UTM_KEY = 'ml.utm'
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

function captureUtm(store) {
  try {
    if (store.getItem(UTM_KEY)) return
    const params = new URLSearchParams(window.location.search)
    const source = params.get('utm_source')?.trim().slice(0, 64)
    const medium = params.get('utm_medium')?.trim().slice(0, 64)
    const campaign = params.get('utm_campaign')?.trim().slice(0, 64)
    const content = params.get('utm_content')?.trim().slice(0, 64)
    const term = params.get('utm_term')?.trim().slice(0, 64)
    if (!source && !medium && !campaign && !content && !term) return
    store.setItem(
      UTM_KEY,
      JSON.stringify({
        source: source || null,
        medium: medium || null,
        campaign: campaign || null,
        content: content || null,
        term: term || null,
      }),
    )
  } catch {
    /* ignore */
  }
}

/** Capture ?r= / short path (e.g. /yt) and persist until checkout; log organic as direct. */
export function captureReferralRef() {
  const store = storage()
  if (!store) return null
  try {
    captureUtm(store)
    const params = new URLSearchParams(window.location.search)
    const fromUrl = params.get('r')?.trim().slice(0, 32) || pathRef()
    if (fromUrl) {
      // First-touch sticky: only set if empty.
      if (!store.getItem(REF_KEY)) store.setItem(REF_KEY, fromUrl)
      void logAttributionVisit(store.getItem(REF_KEY) || fromUrl)
      return store.getItem(REF_KEY) || fromUrl
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

export function peekVisitorId() {
  const store = storage()
  if (!store) return null
  try {
    return visitorId(store)
  } catch {
    return null
  }
}

export function peekUtm() {
  const store = storage()
  if (!store) return null
  try {
    const raw = store.getItem(UTM_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
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
  const store = storage()
  await fetchJsonSafe('/api/attribution/signup', {
    method: 'POST',
    body: {
      ref: normalized,
      visitor_id: store ? visitorId(store) : undefined,
    },
    timeoutMs: 8000,
  })
}
