/** Discover tab mock payloads — frontend-only until backend catches up. */

import { getDiscoverMarketMoves, getDiscoverWatchlistEvents } from './discoverEvents.js'

/** @typedef {'market' | 'clinical'} DiscoverIntelMode */
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

/** Optional mock session-move overlay until bars/outcomes feed the chart column. */
export const MOCK_DISCOVER_MOVE_PCT = {
  'disc-atyr-8k-today': -4.1,
  'disc-asml-gov': 3.2,
  'disc-nvda-earnings': 6.8,
  'disc-asml-q1': 5.4,
  'disc-srpt-fda-req': -18.2,
  'disc-atyr-enroll': 12.4,
}

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
    { id: 'wed-waller', time: '14:00', title: 'Fed Governor Waller — remarks', region: 'US', impact: 'medium' },
    { id: 'wed-de-ifo', time: '04:00', title: 'Germany Ifo business climate', region: 'EU', impact: 'low' },
  ],
  [
    { id: 'thu-gdp', time: '08:30', title: 'GDP — Q1 2nd estimate', region: 'US', impact: 'high' },
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
      events: day.events.filter((event) => regions.has(event.region) && impacts.has(event.impact)),
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
  return getDiscoverMarketMoves(opts)
}
