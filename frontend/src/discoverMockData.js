/** Discover tab mock payloads — frontend-only until backend catches up. */

import { buildHighlightedMarketMoves, getDiscoverWatchlistEvents, isDiscoverMarketMove } from './discoverEvents.js'

/** @typedef {'high' | 'medium' | 'low'} MacroImpact */

/**
 * @typedef {Object} DiscoverMacroEvent
 * @property {string} id
 * @property {string} time ET release time label
 * @property {string} title
 * @property {string} region US | EU | CN | UK
 * @property {MacroImpact} impact
 */

/**
 * @typedef {Object} DiscoverMacroDay
 * @property {string} date ISO date
 * @property {DiscoverMacroEvent[]} events
 */

/** Offline macro calendar fallback when the API is unavailable. */

/**
 * Offline fallback when a ticker has no row in the upcoming pool.
 * @type {Record<string, { daysAhead: number; title: string; kind: string } | undefined>}
 */
export const DISCOVER_MOCK_UPCOMING_FALLBACK = {
  NVDA: { daysAhead: 8, title: 'Product launch keynote', kind: 'catalyst' },
  LRCX: { daysAhead: 4, title: 'Investor presentation', kind: 'catalyst' },
  ASML: { daysAhead: 9, title: 'Technology conference', kind: 'catalyst' },
  TSM: { daysAhead: 12, title: 'Analyst day', kind: 'catalyst' },
  AMD: { daysAhead: 6, title: 'Advancing AI keynote', kind: 'catalyst' },
  AMAT: { daysAhead: 11, title: 'Guidance update', kind: 'catalyst' },
  MU: { daysAhead: 7, title: 'HBM supply briefing', kind: 'catalyst' },
  AVGO: { daysAhead: 10, title: 'Custom silicon analyst event', kind: 'catalyst' },
  KLAC: { daysAhead: 5, title: 'Process control symposium', kind: 'catalyst' },
  INTC: { daysAhead: 14, title: 'Foundry partner update', kind: 'catalyst' },
  QCOM: { daysAhead: 13, title: 'Mobile AI platform launch', kind: 'catalyst' },
  MRVL: { daysAhead: 15, title: 'Electro-optics roadmap day', kind: 'catalyst' },
  _default: { daysAhead: 30, title: 'Earnings report', kind: 'earnings' },
}

/** @deprecated Use DISCOVER_MOCK_UPCOMING_FALLBACK */
export const DISCOVER_MOCK_EARNINGS_DAYS_AHEAD = Object.fromEntries(
  Object.entries(DISCOVER_MOCK_UPCOMING_FALLBACK).map(([k, v]) => [k, v?.daysAhead ?? 30]),
)

export const MACRO_IMPACT_FILTER_TYPES = [
  { id: 'high', label: 'High impact', code: 'HIGH' },
  { id: 'medium', label: 'Medium impact', code: 'MED' },
  { id: 'low', label: 'Low impact', code: 'LOW' },
]

export const MACRO_IMPACT_FILTER_DEFAULT = new Set(MACRO_IMPACT_FILTER_TYPES.map((t) => t.id))

function parseLocalDay(dateStr) {
  const raw = String(dateStr ?? '').trim()
  const parts = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!parts) return null
  return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]), 12, 0, 0, 0)
}

function todayLocalStart() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function isWeekday(d) {
  const day = d.getDay()
  return day >= 1 && day <= 5
}

/** Weekday templates (Mon=0 … Fri=4) — dates are generated from the real calendar. */
const MACRO_DAY_TEMPLATES = /** @type {DiscoverMacroEvent[][]} */ ([
  [
    { id: 'mon-dallas', time: '10:30', title: 'Dallas Fed manufacturing activity', region: 'US', impact: 'low' },
    { id: 'mon-eu-sent', time: '10:00', title: 'Eurozone economic sentiment', region: 'EU', impact: 'medium' },
  ],
  [
    { id: 'tue-durables', time: '08:30', title: 'Durable goods orders', region: 'US', impact: 'medium' },
    { id: 'tue-eu-conf', time: '10:00', title: 'Eurozone consumer confidence', region: 'EU', impact: 'low' },
  ],
  [
    { id: 'wed-us-conf', time: '10:00', title: 'US consumer confidence', region: 'US', impact: 'medium' },
    { id: 'wed-waller', time: '14:00', title: 'Fed Governor Waller - remarks', region: 'US', impact: 'medium' },
    { id: 'wed-de-ifo', time: '04:00', title: 'Germany Ifo business climate', region: 'EU', impact: 'low' },
  ],
  [
    { id: 'thu-gdp', time: '08:30', title: 'GDP - Q1 2nd estimate', region: 'US', impact: 'high' },
    { id: 'thu-fomc-min', time: '14:00', title: 'FOMC meeting minutes', region: 'US', impact: 'high' },
  ],
  [
    { id: 'fri-claims', time: '08:30', title: 'Initial jobless claims', region: 'US', impact: 'medium' },
    { id: 'fri-pce', time: '08:30', title: 'PCE price index', region: 'US', impact: 'high' },
    { id: 'fri-ecb', time: '07:45', title: 'ECB monetary policy account', region: 'EU', impact: 'medium' },
  ],
])

function isoLocalDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Next N business days from today (Mon–Fri only, today included). */
export function filterMacroCalendarDays(days, { regions, impacts }) {
  if (!regions?.size || !impacts?.size) return []
  return days
    .map((day) => ({
      ...day,
      events: (Array.isArray(day?.events) ? day.events : []).filter(
        (event) => regions.has(event.region) && impacts.has(event.impact),
      ),
    }))
    .filter((day) => day.events.length > 0)
}

export function getUpcomingMacroDays(limit = 5) {
  const out = /** @type {DiscoverMacroDay[]} */ ([])
  const cursor = todayLocalStart()

  while (!isWeekday(cursor)) {
    cursor.setDate(cursor.getDate() + 1)
  }

  while (out.length < limit) {
    if (isWeekday(cursor)) {
      const dow = cursor.getDay() - 1
      const date = isoLocalDate(cursor)
      const templates = MACRO_DAY_TEMPLATES[dow] ?? MACRO_DAY_TEMPLATES[0] ?? []
      out.push({
        date,
        events: templates.map((event, idx) => ({
          ...event,
          id: `${date}-${event.id ?? idx}`,
        })),
      })
    }
    cursor.setDate(cursor.getDate() + 1)
  }

  return out
}

export function isDiscoverMacroToday(date) {
  const d = parseLocalDay(String(date ?? '').slice(0, 10))
  if (!d) return false
  return d.getTime() === todayLocalStart().getTime()
}

export function formatMacroDayHeader(date) {
  const raw = String(date ?? '').trim()
  const parts = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!parts) return { weekday: '—', label: '—', isToday: false }
  const y = Number(parts[1])
  const mo = Number(parts[2]) - 1
  const day = Number(parts[3])
  const d = new Date(y, mo, day, 12, 0, 0, 0)
  if (Number.isNaN(d.getTime())) return { weekday: '—', label: '—', isToday: false }
  const weekday = d.toLocaleDateString(undefined, { weekday: 'short' })
  const month = d.toLocaleDateString(undefined, { month: 'short' })
  return {
    weekday,
    label: `${month} ${d.getDate()}`,
    isToday: isDiscoverMacroToday(raw),
  }
}

function reactionSeed(ticker) {
  const s = String(ticker ?? 'X')
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h || 1
}

function reactionRand(seed) {
  let a = seed >>> 0
  return () => {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Deterministic mock session series ending in the event move (indexed to 100). */
export function mockReactionSeries(ticker, movePct, points = 36) {
  const move = Number(movePct)
  const safeMove = Number.isFinite(move) ? move : 0
  const rand = reactionRand(reactionSeed(ticker))
  const preDrift = safeMove * -0.12
  let v = 100
  const out = []

  for (let i = 0; i < points; i++) {
    const t = points <= 1 ? 1 : i / (points - 1)
    const noise = (rand() - 0.5) * 0.55
    let anchor = 100 + preDrift * Math.min(1, t * 2.2)
    if (t > 0.68) {
      const ramp = (t - 0.68) / 0.32
      anchor = 100 + preDrift * 0.35 + safeMove * ramp
    }
    v = v * 0.58 + anchor * 0.42 + noise
    out.push(v)
  }

  const targetEnd = 100 + safeMove
  const last = out[out.length - 1]
  if (!Number.isFinite(last) || last === 0) return out
  const scale = targetEnd / last
  return out.map((x, i) => (i === 0 ? 100 : Math.round(x * scale * 1000) / 1000))
}

/** Stable mock % move for an event id (used when live bar data is unavailable). */
export function mockMovePctForEvent(event) {
  const seed = String(event?.id ?? event?.ticker ?? 'x')
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  const raw = (h % 1600) / 100 - 8
  return Math.round(raw * 10) / 10
}

/** Mock move reactions keyed by event id — mirrors live `/api/discover/timeline` moves map. */
export function buildMockMoveReactions(events) {
  const out = /** @type {Record<string, { movePct: number; closes: number[] }>} */ ({})
  const maxEvents = 36
  const eligible = (events ?? []).filter(isDiscoverMarketMove).slice(0, maxEvents)
  for (const event of eligible) {
    const movePct = mockMovePctForEvent(event)
    out[event.id] = {
      movePct,
      closes: mockReactionSeries(event.ticker, movePct),
    }
  }
  return out
}

export function formatRippleMove(pct) {
  const n = Number(pct)
  if (!Number.isFinite(n)) return '—'
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(1)}%`
}

export function rippleMoveClass(pct) {
  const n = Number(pct)
  if (!Number.isFinite(n) || n === 0) return ''
  return n > 0 ? 'isUp' : 'isDown'
}

/**
 * Company-specific upcoming catalysts (non-macro).
 * @param {{ query?: string }} [opts]
 */
export function getWatchlistCatalysts(opts = {}) {
  return getDiscoverWatchlistEvents(opts)
}

export function getMarketMoveEvents(opts = {}) {
  return buildHighlightedMarketMoves(opts)
}
