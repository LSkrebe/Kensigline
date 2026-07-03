/**
 * Capture ?ref= on landing, persist first-touch attribution, strip param from the URL bar.
 */

const STORAGE_KEY = 'mercerline:referral'
const VISIT_SESSION_PREFIX = 'mercerline:referral-visit:'
export const ORGANIC_REFERRAL_KEY = 'organic'

function attributionDays() {
  const n = Number(import.meta.env.REFERRAL_ATTRIBUTION_DAYS ?? 90)
  return Number.isFinite(n) ? Math.max(1, Math.min(365, Math.round(n))) : 90
}

function normalizeRef(raw) {
  const key = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64)
  return key || null
}

function resolveRefFromUrl(url) {
  const direct = normalizeRef(url.searchParams.get('ref'))
  if (direct) return direct

  const source = normalizeRef(url.searchParams.get('utm_source'))
  if (!source) return null
  const medium = normalizeRef(url.searchParams.get('utm_medium'))
  if (medium && medium !== source) return `${source}_${medium}`
  return source
}

function readStoredReferral() {
  if (typeof window === 'undefined' || !window.localStorage) return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const ref = normalizeRef(parsed?.ref)
    const capturedAt = Number(parsed?.capturedAt ?? 0)
    if (!ref || !capturedAt) return null
    const maxAgeMs = attributionDays() * 24 * 60 * 60 * 1000
    if (Date.now() - capturedAt > maxAgeMs) {
      window.localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return { ref, capturedAt }
  } catch {
    return null
  }
}

function storeReferral(ref) {
  if (typeof window === 'undefined' || !window.localStorage) return
  const existing = readStoredReferral()
  if (existing) return
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ref, capturedAt: Date.now() }),
    )
  } catch {
    /* ignore quota errors */
  }
}

function stripReferralParamsFromUrl(url) {
  const clean = new URL(url.href)
  let changed = false
  for (const key of ['ref', 'utm_source', 'utm_medium', 'utm_campaign']) {
    if (clean.searchParams.has(key)) {
      clean.searchParams.delete(key)
      changed = true
    }
  }
  if (!changed) return
  const next = `${clean.pathname}${clean.search}${clean.hash}`
  window.history.replaceState({}, document.title, next)
}

async function recordVisit(ref) {
  if (typeof window === 'undefined' || !window.sessionStorage) return
  const sessionKey = `${VISIT_SESSION_PREFIX}${ref}`
  if (window.sessionStorage.getItem(sessionKey)) return

  const { fetchJsonSafe } = await import('./api.js')
  const res = await fetchJsonSafe('/api/referral/visit', {
    method: 'POST',
    body: { ref },
    timeoutMs: 8000,
  })
  if (res.ok) {
    try {
      window.sessionStorage.setItem(sessionKey, '1')
    } catch {
      /* ignore */
    }
  }
}

/** Run once on boot — before auth URL handling. */
export function captureReferralFromUrl() {
  if (typeof window === 'undefined') return

  const url = new URL(window.location.href)
  const incoming = resolveRefFromUrl(url)

  if (incoming) {
    storeReferral(incoming)
    void recordVisit(incoming)
  } else if (!readStoredReferral()) {
    // No ?ref= and no prior campaign touch — count as organic (plain mercerline.com).
    storeReferral(ORGANIC_REFERRAL_KEY)
    void recordVisit(ORGANIC_REFERRAL_KEY)
  }

  stripReferralParamsFromUrl(url)
}

export function getStoredReferral() {
  return readStoredReferral()?.ref ?? null
}

export async function attachStoredReferralToUser() {
  const ref = getStoredReferral()
  if (!ref) return { ok: false, skipped: true }

  const { fetchJsonSafe } = await import('./api.js')
  const res = await fetchJsonSafe('/api/referral/attach', {
    method: 'POST',
    body: { ref },
    timeoutMs: 8000,
  })
  return { ok: res.ok, attached: res.data?.attached === true, ref, status: res.status }
}
