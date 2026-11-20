/**
 * Lightweight first-party landing engagement tracker.
 * Batches scroll/section/CTA events + session heartbeats to /api/attribution/track.
 */
import { fetchJsonSafe } from './api.js'
import { DIRECT_REF, peekReferralRef, peekUtm, peekVisitorId } from './referralRef.js'

const SESSION_KEY = 'ml.analytics.sid'
const SCROLL_KEY = 'ml.analytics.scroll'
const SECTION_KEY = 'ml.analytics.sections'
const IDLE_MS = 30_000
const HEARTBEAT_MS = 15_000
const FLUSH_EVENTS = 8
const SECTION_IDS = ['story', 'together', 'product', 'leaders', 'coverage', 'reviews', 'pricing', 'faq', 'cta']
const SCROLL_MILESTONES = [25, 50, 75, 90, 100]

function storage(kind = 'local') {
  if (typeof window === 'undefined') return null
  try {
    return kind === 'session' ? window.sessionStorage : window.localStorage
  } catch {
    return null
  }
}

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function deviceCategory() {
  if (typeof navigator === 'undefined') return 'desktop'
  const ua = navigator.userAgent || ''
  if (/iPad|Tablet/i.test(ua)) return 'tablet'
  if (/Mobi|Android.*Mobile|iPhone|iPod/i.test(ua)) return 'mobile'
  return 'desktop'
}

function referrerHost() {
  try {
    if (!document.referrer) return null
    return new URL(document.referrer).hostname.slice(0, 120)
  } catch {
    return null
  }
}

function readSet(store, key) {
  try {
    const raw = store?.getItem(key)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw))
  } catch {
    return new Set()
  }
}

function writeSet(store, key, set) {
  try {
    store?.setItem(key, JSON.stringify([...set]))
  } catch {
    /* ignore */
  }
}

function sessionId() {
  const store = storage('session')
  if (!store) return uuid()
  let id = store.getItem(SESSION_KEY)
  if (!id) {
    id = uuid()
    store.setItem(SESSION_KEY, id)
  }
  return id
}

let started = false
let startedAt = 0
let activeMs = 0
let activeSliceStart = 0
let lastActivityAt = 0
let visible = true
let maxScrollPct = 0
let queue = []
let flushTimer = null
let heartbeatTimer = null
let scrollerEl = null
let observers = []

function markActivity() {
  lastActivityAt = Date.now()
  if (visible && !activeSliceStart) activeSliceStart = Date.now()
}

function closeActiveSlice() {
  if (!activeSliceStart) return
  const now = Date.now()
  const end = Math.min(now, lastActivityAt + IDLE_MS)
  if (end > activeSliceStart) activeMs += end - activeSliceStart
  activeSliceStart = 0
}

function tickActive() {
  if (!visible) return
  const now = Date.now()
  if (now - lastActivityAt > IDLE_MS) {
    closeActiveSlice()
    return
  }
  if (!activeSliceStart) activeSliceStart = lastActivityAt
}

function queueEvent(type, meta = {}) {
  queue.push({ type, ts: new Date().toISOString(), meta })
  if (queue.length >= FLUSH_EVENTS) void flush(false)
}

function scrollPct() {
  const el = scrollerEl
  if (!el) return 0
  const max = el.scrollHeight - el.clientHeight
  if (max <= 0) return 100
  return Math.max(0, Math.min(100, Math.round((100 * el.scrollTop) / max)))
}

function onScroll() {
  markActivity()
  const pct = scrollPct()
  if (pct > maxScrollPct) maxScrollPct = pct
  const store = storage('session')
  const seen = readSet(store, SCROLL_KEY)
  for (const m of SCROLL_MILESTONES) {
    if (pct >= m && !seen.has(String(m))) {
      seen.add(String(m))
      queueEvent('scroll_milestone', { pct: m })
    }
  }
  writeSet(store, SCROLL_KEY, seen)
}

function sessionPayload() {
  tickActive()
  closeActiveSlice()
  if (visible && Date.now() - lastActivityAt <= IDLE_MS) activeSliceStart = Date.now()
  const now = Date.now()
  const utm = peekUtm() || {}
  return {
    started_at: new Date(startedAt).toISOString(),
    ended_at: new Date(now).toISOString(),
    duration_ms: Math.max(0, now - startedAt),
    active_ms: Math.max(0, Math.round(activeMs)),
    max_scroll_pct: maxScrollPct,
    device: deviceCategory(),
  }
}

async function flush(useBeacon) {
  if (!started) return
  const visitorId = peekVisitorId()
  if (!visitorId) return
  const events = queue.splice(0, queue.length)
  const body = {
    visitor_id: visitorId,
    session_id: sessionId(),
    ref: peekReferralRef() || DIRECT_REF,
    landing_path: typeof window !== 'undefined' ? window.location.pathname.slice(0, 200) : '/',
    referrer_host: referrerHost(),
    ...utmFields(),
    session: sessionPayload(),
    events,
  }

  if (useBeacon && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    try {
      const blob = new Blob([JSON.stringify(body)], { type: 'application/json' })
      const ok = navigator.sendBeacon('/api/attribution/track', blob)
      if (ok) return
    } catch {
      /* fall through */
    }
  }

  await fetchJsonSafe('/api/attribution/track', {
    method: 'POST',
    body,
    timeoutMs: 8000,
  })
}

function utmFields() {
  const utm = peekUtm() || {}
  return {
    utm_source: utm.source || null,
    utm_medium: utm.medium || null,
    utm_campaign: utm.campaign || null,
  }
}

function onVisibility() {
  visible = typeof document === 'undefined' ? true : document.visibilityState !== 'hidden'
  if (visible) {
    markActivity()
  } else {
    closeActiveSlice()
    void flush(true)
  }
}

function observeSections() {
  if (typeof IntersectionObserver === 'undefined') return
  const store = storage('session')
  const seen = readSet(store, SECTION_KEY)
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.45) continue
        const id = entry.target.id
        if (!id || seen.has(id)) continue
        // Require a short dwell before counting.
        const el = entry.target
        if (el.dataset.mlViewTimer) continue
        el.dataset.mlViewTimer = '1'
        window.setTimeout(() => {
          delete el.dataset.mlViewTimer
          const still = entry.target.getBoundingClientRect()
          const vh = window.innerHeight || 1
          const visiblePx = Math.min(still.bottom, vh) - Math.max(still.top, 0)
          if (visiblePx / Math.min(still.height || 1, vh) < 0.4) return
          if (seen.has(id)) return
          seen.add(id)
          writeSet(store, SECTION_KEY, seen)
          queueEvent('section_viewed', { section: id })
          markActivity()
        }, 600)
      }
    },
    { threshold: [0.45, 0.6] },
  )
  for (const id of SECTION_IDS) {
    const el = document.getElementById(id)
    if (el) io.observe(el)
  }
  observers.push(io)
}

export function trackLandingEvent(type, meta = {}) {
  if (!started) return
  if (type === 'buy_clicked' || type === 'cta_clicked' || type === 'login_clicked') {
    queueEvent(type, meta)
    markActivity()
    void flush(false)
  }
}

/**
 * Start tracking on the intro landing page.
 * @param {{ scroller: HTMLElement | null }} opts
 */
export function startLandingAnalytics(opts = {}) {
  if (started || typeof window === 'undefined') return () => {}
  started = true
  startedAt = Date.now()
  lastActivityAt = startedAt
  activeSliceStart = startedAt
  visible = document.visibilityState !== 'hidden'
  scrollerEl = opts.scroller || document.documentElement
  maxScrollPct = scrollPct()

  const onAct = () => markActivity()
  const scrollTarget = scrollerEl
  scrollTarget?.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('pointerdown', onAct, { passive: true })
  window.addEventListener('keydown', onAct)
  window.addEventListener('mousemove', onAct, { passive: true })
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', () => void flush(true))

  observeSections()
  void flush(false)
  heartbeatTimer = window.setInterval(() => {
    tickActive()
    void flush(false)
  }, HEARTBEAT_MS)

  return () => {
    closeActiveSlice()
    void flush(true)
    started = false
    scrollTarget?.removeEventListener('scroll', onScroll)
    window.removeEventListener('pointerdown', onAct)
    window.removeEventListener('keydown', onAct)
    window.removeEventListener('mousemove', onAct)
    document.removeEventListener('visibilitychange', onVisibility)
    if (heartbeatTimer) window.clearInterval(heartbeatTimer)
    if (flushTimer) window.clearTimeout(flushTimer)
    for (const o of observers) o.disconnect()
    observers = []
  }
}
