import { mockAtDaysAgo } from './mockDates.js'
import {
  buildMockWeekDiscoverFlowMoves,
  buildMockWeekDiscoverPastEvents,
  MOCK_SEMIS_BY_TICKER,
} from './mockWeekData.js'

import { eventMentionedSearchText, getEventMentioned } from './eventBriefs.js'
import {
  DISCOVER_MARKET_MOVE_FILTER_TYPES,
  DISCOVER_RESEARCH_DOCUMENT_FILTER_DEFAULT,
  DISCOVER_WATCHLIST_FILTER_DEFAULT,
  DISCOVER_WATCHLIST_FILTER_TYPES,
  normalizeResearchPaperSourceKey,
} from './researchPaperSources.js'

export {
  DISCOVER_MARKET_MOVE_FILTER_TYPES,
  DISCOVER_RESEARCH_DOCUMENT_FILTER_DEFAULT as DISCOVER_MARKET_MOVE_FILTER_DEFAULT,
  DISCOVER_WATCHLIST_FILTER_TYPES,
  DISCOVER_WATCHLIST_FILTER_DEFAULT,
}

const DISCOVER_COMPANIES = Object.fromEntries(
  Object.entries(MOCK_SEMIS_BY_TICKER).map(([ticker, co]) => [ticker, { name: co.name }]),
)

function isoDayFromOffset(daysAhead) {
  const d = new Date()
  d.setDate(d.getDate() + daysAhead)
  d.setHours(0, 0, 0, 0)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Dynamic upcoming rows — nearest per ticker wins in footer strips (not always earnings). */
function buildDiscoverMockUpcomingEvents() {
  const templates = [
    {
      id: 'disc-lrcx-analyst',
      ticker: 'LRCX',
      companyName: DISCOVER_COMPANIES.LRCX.name,
      daysAhead: 4,
      title: 'Investor presentation',
      kind: 'catalyst',
      source: 'Investor presentation',
      impact: 'medium',
      briefKey: 'lrcx-analyst',
      idea_best: true,
    },
    {
      id: 'disc-amd-keynote',
      ticker: 'AMD',
      companyName: DISCOVER_COMPANIES.AMD.name,
      daysAhead: 6,
      title: 'Advancing AI keynote',
      kind: 'catalyst',
      source: 'Investor presentation',
      impact: 'high',
      briefKey: 'amd-keynote',
      idea_best: true,
    },
    {
      id: 'disc-nvda-keynote',
      ticker: 'NVDA',
      companyName: DISCOVER_COMPANIES.NVDA.name,
      daysAhead: 8,
      title: 'Product launch keynote',
      kind: 'catalyst',
      source: 'Press release',
      impact: 'high',
      briefKey: 'nvda-computex',
      idea_best: true,
    },
    {
      id: 'disc-asml-tech',
      ticker: 'ASML',
      companyName: DISCOVER_COMPANIES.ASML.name,
      daysAhead: 9,
      title: 'Technology conference',
      kind: 'catalyst',
      source: 'Investor presentation',
      impact: 'high',
      briefKey: 'asml-tech',
      idea_best: true,
    },
    {
      id: 'disc-amat-guidance',
      ticker: 'AMAT',
      companyName: DISCOVER_COMPANIES.AMAT.name,
      daysAhead: 11,
      title: 'Guidance update at analyst event',
      kind: 'catalyst',
      source: '8-K',
      impact: 'medium',
      briefKey: 'amat-guidance',
      idea_best: true,
    },
    {
      id: 'disc-tsm-cmd',
      ticker: 'TSM',
      companyName: DISCOVER_COMPANIES.TSM.name,
      daysAhead: 12,
      title: 'Analyst day',
      kind: 'catalyst',
      source: 'Investor presentation',
      impact: 'medium',
      briefKey: 'tsm-cmd',
      idea_best: true,
    },
    {
      id: 'disc-mu-hbm',
      ticker: 'MU',
      companyName: DISCOVER_COMPANIES.MU?.name ?? 'Micron Technology, Inc.',
      daysAhead: 7,
      title: 'HBM3e capacity briefing',
      kind: 'catalyst',
      source: 'Investor presentation',
      impact: 'high',
      idea_best: true,
    },
    {
      id: 'disc-avgo-asic',
      ticker: 'AVGO',
      companyName: DISCOVER_COMPANIES.AVGO?.name ?? 'Broadcom Inc.',
      daysAhead: 10,
      title: 'Custom XPU analyst event',
      kind: 'catalyst',
      source: 'Investor presentation',
      impact: 'medium',
      idea_best: true,
    },
    {
      id: 'disc-klac-symposium',
      ticker: 'KLAC',
      companyName: DISCOVER_COMPANIES.KLAC?.name ?? 'KLA Corporation',
      daysAhead: 5,
      title: 'Process control symposium',
      kind: 'catalyst',
      source: 'Investor presentation',
      impact: 'medium',
      idea_best: true,
    },
    {
      id: 'disc-nvda-earnings-up',
      ticker: 'NVDA',
      companyName: DISCOVER_COMPANIES.NVDA.name,
      daysAhead: 45,
      title: 'Earnings report',
      kind: 'earnings',
      source: '8-K',
      impact: 'high',
      briefKey: 'nvda-earnings-up',
      idea_best: true,
    },
    {
      id: 'disc-asml-earnings',
      ticker: 'ASML',
      companyName: DISCOVER_COMPANIES.ASML.name,
      daysAhead: 52,
      title: 'Earnings report',
      kind: 'earnings',
      source: '8-K',
      impact: 'high',
      briefKey: 'asml-earnings',
      idea_best: true,
    },
  ]

  return templates.map(({ daysAhead, ...row }) => ({
    ...row,
    at: isoDayFromOffset(daysAhead),
  }))
}

export { buildDiscoverMockUpcomingEvents }

/** @typedef {'catalyst' | 'filing' | 'earnings' | 'trial' | 'regulatory' | 'flow'} DiscoverEventKind */

/**
 * @typedef {Object} DiscoverEvent
 * @property {string} id
 * @property {string} ticker
 * @property {string} companyName
 * @property {string} at ISO date or datetime
 * @property {string} title
 * @property {DiscoverEventKind} kind
 * @property {string} [source]
 * @property {string} [phase]
 * @property {string} [programKey]
 * @property {string} [summary] past events — paper-style analysis
 * @property {string} [briefKey] links mock mentioned-name sets in eventBriefs.js
 * @property {string} [url]
 * @property {'high' | 'medium' | 'low'} [impact]
 * @property {number} [idea_score]
 * @property {boolean} [idea_best]
 * @property {string[]} [idea_reasons]
 * @property {{ label: string; at: string; soon: boolean }} [next_upcoming]
 */

/** @type {DiscoverEvent[]} */
function buildDiscoverPastEvents() {
  return buildMockWeekDiscoverPastEvents()
}

const DISCOVER_EVENTS = [...buildDiscoverMockUpcomingEvents(), ...buildDiscoverPastEvents()]

function buildDiscoverFlowMarketMoves() {
  return buildMockWeekDiscoverFlowMoves()
}

const DISCOVER_FLOW_MARKET_MOVES = buildDiscoverFlowMarketMoves()

const KIND_LABEL = {
  catalyst: 'Catalyst',
  filing: 'Filing',
  earnings: 'Earnings',
  trial: 'Trial',
  regulatory: 'Regulatory',
  flow: 'Flow',
}

export function discoverKindLabel(kind) {
  return KIND_LABEL[kind] ?? 'Event'
}

/** @param {DiscoverEvent} event @param {Set<string> | null | undefined} enabled */
export function discoverEventPassesFilters(event, enabled) {
  if (!enabled?.size) return false
  const sourceKey = normalizeResearchPaperSourceKey(event.source)
  return enabled.has(sourceKey)
}

function eventDayStartMs(at) {
  const raw = String(at ?? '').trim()
  if (!raw) return NaN
  const d = new Date(raw.includes('T') ? raw : `${raw}T12:00:00`)
  if (Number.isNaN(d.getTime())) return NaN
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function todayStartMs() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function discoverEventRelativeLabel(at) {
  const dayMs = eventDayStartMs(at)
  if (!Number.isFinite(dayMs)) return '—'
  const diffDays = Math.round((dayMs - todayStartMs()) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays === -1) return 'Yesterday'
  if (diffDays > 0 && diffDays <= 90) return `In ${diffDays}d`
  if (diffDays < 0 && diffDays >= -14) return `${Math.abs(diffDays)}d ago`
  return formatDiscoverDate(at)
}

/** Compact day count for Discover watchlist (e.g. `4d`, `Today`). */
export function discoverWatchlistDaysLabel(at) {
  const dayMs = eventDayStartMs(at)
  if (!Number.isFinite(dayMs)) return '—'
  const diffDays = Math.round((dayMs - todayStartMs()) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays > 0 && diffDays <= 90) return `${diffDays}d`
  if (diffDays < 0 && diffDays >= -14) return `${Math.abs(diffDays)}d ago`
  return formatDiscoverDate(at)
}

export function formatDiscoverDate(at) {
  const raw = String(at ?? '').trim()
  if (!raw) return '—'
  const d = new Date(raw.includes('T') ? raw : `${raw}T12:00:00`)
  if (Number.isNaN(d.getTime())) return '—'
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const yr = d.getFullYear()
  const thisYear = new Date().getFullYear()
  return yr === thisYear ? `${mo}-${day}` : `${mo}-${day}-${yr}`
}

export function formatDiscoverDayHead(at) {
  const raw = String(at ?? '').trim()
  if (!raw) return '—'
  const d = new Date(raw.includes('T') ? raw : `${raw}T12:00:00`)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function isSameLocalCalendarDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function isAtLocalToday(at) {
  const d = at instanceof Date ? at : new Date(at)
  if (Number.isNaN(d.getTime())) return false
  return isSameLocalCalendarDay(d, new Date())
}

function isAtLocalThisMonth(at, ref = new Date()) {
  const d = at instanceof Date ? at : new Date(at)
  const r = ref instanceof Date ? ref : new Date(ref)
  if (Number.isNaN(d.getTime()) || Number.isNaN(r.getTime())) return false
  return d.getFullYear() === r.getFullYear() && d.getMonth() === r.getMonth()
}

function discoverEventAtIso(event) {
  const raw = String(event?.at ?? '').trim()
  return raw.includes('T') ? raw : `${raw}T12:00:00`
}

/**
 * Paper-style timeline rows: TODAY (past only) / THIS MONTH / year gaps.
 * @param {DiscoverEvent[]} events
 * @param {'upcoming' | 'past'} variant
 */
export function buildDiscoverCardDisplayRows(events, variant) {
  /** @type {Array<{ type: 'sep'; key: string; label: string } | { type: 'event'; key: string; event: DiscoverEvent }>} */
  const out = []
  const items = (events ?? [])
    .map((event) => ({
      id: event.id,
      at: discoverEventAtIso(event),
      event,
    }))
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
  if (!items.length) return out

  for (let i = 0; i < items.length; i++) {
    const row = items[i]
    const prev = i > 0 ? items[i - 1] : null
    const gapCandidates = []

    if (variant === 'past' && prev && isAtLocalToday(prev.at) && !isAtLocalToday(row.at)) {
      gapCandidates.push({ rank: 0, key: `today-sep-${row.id}`, label: 'TODAY' })
    }
    if (prev && isAtLocalThisMonth(prev.at) && !isAtLocalThisMonth(row.at)) {
      gapCandidates.push({ rank: 1, key: `month-sep-${row.id}`, label: 'THIS MONTH' })
    }
    if (prev) {
      const y0 = new Date(prev.at).getFullYear()
      const y1 = new Date(row.at).getFullYear()
      if (Number.isFinite(y0) && Number.isFinite(y1) && y1 !== y0) {
        gapCandidates.push({ rank: 2, key: `year-${y1}-sep-${row.id}`, label: String(y1) })
      }
    }
    if (gapCandidates.length) {
      gapCandidates.sort((a, b) => a.rank - b.rank)
      out.push({ type: 'sep', key: gapCandidates[0].key, label: gapCandidates[0].label })
    }
    out.push({ type: 'event', key: row.id, event: row.event })
  }

  return out
}

/**
 * @param {{ query?: string }} [opts]
 * @returns {Array<{ type: 'today' } | { type: 'day'; date: string; variant: 'upcoming' | 'past'; events: DiscoverEvent[] }>}
 */
export function buildDiscoverDayGroups(opts = {}) {
  const { upcoming, past } = buildDiscoverTimeline(opts)
  /** @type {ReturnType<typeof buildDiscoverDayGroups>} */
  const groups = []

  let lastDay = null
  for (const event of upcoming) {
    const day = event.at.slice(0, 10)
    if (day !== lastDay) {
      groups.push({ type: 'day', date: day, variant: 'upcoming', events: [] })
      lastDay = day
    }
    groups.at(-1).events.push(event)
  }

  if (upcoming.length || past.length) {
    groups.push({ type: 'today' })
    lastDay = null
  }

  for (const event of past) {
    const day = event.at.slice(0, 10)
    if (day !== lastDay) {
      groups.push({ type: 'day', date: day, variant: 'past', events: [] })
      lastDay = day
    }
    groups.at(-1).events.push(event)
  }

  return groups
}

/** Group a flat event list by calendar day (preserves input order). */
export function groupEventsByDay(events, variant) {
  /** @type {Array<{ type: 'day'; date: string; variant: 'upcoming' | 'past'; events: DiscoverEvent[] }>} */
  const groups = []
  let lastDay = null
  for (const event of events) {
    const day = event.at.slice(0, 10)
    if (day !== lastDay) {
      groups.push({ type: 'day', date: day, variant, events: [] })
      lastDay = day
    }
    groups.at(-1).events.push(event)
  }
  return groups
}

export { getEventMentioned } from './eventBriefs.js'

export function truncateDiscoverSummary(text, max = 160) {
  const t = String(text ?? '').trim().replace(/\s+/g, ' ')
  if (!t) return ''
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

/**
 * @param {{ query?: string; enabledFilters?: Set<string> }} [opts]
 * @returns {{ upcoming: DiscoverEvent[]; past: DiscoverEvent[] }}
 */
export function buildDiscoverTimeline(opts = {}) {
  const q = String(opts.query ?? '')
    .trim()
    .toLowerCase()
  const enabledFilters = opts.enabledFilters ?? DISCOVER_WATCHLIST_FILTER_DEFAULT
  const today = todayStartMs()
  const sourceRows = opts.events ?? DISCOVER_EVENTS

  let rows = sourceRows.filter((e) => discoverEventPassesFilters(e, enabledFilters))

  if (q) {
    rows = rows.filter((e) => {
      const mentioned =
        e.mentioned != null
          ? eventMentionedSearchText(e.ticker, e.mentioned)
          : eventMentionedSearchText(e.ticker, getEventMentioned(e.briefKey))
      const hay = `${e.ticker} ${e.companyName} ${e.title} ${e.programKey ?? ''} ${e.source ?? ''} ${e.summary ?? ''} ${mentioned}`.toLowerCase()
      return hay.includes(q)
    })
  }

  const upcoming = []
  const past = []

  for (const e of rows) {
    const ms = eventDayStartMs(e.at)
    if (!Number.isFinite(ms)) continue
    if (ms >= today) upcoming.push(e)
    else past.push(e)
  }

  upcoming.sort((a, b) => eventDayStartMs(a.at) - eventDayStartMs(b.at))
  past.sort((a, b) => eventDayStartMs(b.at) - eventDayStartMs(a.at))

  return { upcoming, past }
}

/**
 * Upcoming catalyst + earnings rows for footer strips (no document-type filter).
 * @param {{ query?: string }} [opts]
 */
export function getDiscoverUpcomingEvents(opts = {}) {
  const q = String(opts.query ?? '')
    .trim()
    .toLowerCase()
  const today = todayStartMs()

  let rows = DISCOVER_EVENTS.filter((e) => {
    const ms = eventDayStartMs(e.at)
    return Number.isFinite(ms) && ms >= today
  })

  if (q) {
    rows = rows.filter((e) => {
      const mentioned =
        e.mentioned != null
          ? eventMentionedSearchText(e.ticker, e.mentioned)
          : eventMentionedSearchText(e.ticker, getEventMentioned(e.briefKey))
      const hay = `${e.ticker} ${e.companyName} ${e.title} ${e.programKey ?? ''} ${e.source ?? ''} ${e.summary ?? ''} ${mentioned}`.toLowerCase()
      return hay.includes(q)
    })
  }

  rows.sort((a, b) => eventDayStartMs(a.at) - eventDayStartMs(b.at))
  return rows
}

/** Upcoming catalyst rows for the watchlist column (strictly future + best tier). */
export function getDiscoverWatchlistEvents(opts = {}) {
  const { query, enabledFilters } = opts
  const today = todayStartMs()
  return buildDiscoverTimeline({ query, enabledFilters }).upcoming.filter(
    (e) => e.idea_best && eventDayStartMs(e.at) > today,
  )
}

/** Past cards eligible for Market Moves: green-highlight tier (same as Investigate feed). */
export function isDiscoverMarketMove(event) {
  if (!event) return false
  if (!event.idea_best) return false
  if (String(event.summary ?? '').trim()) return true
  if (event.kind === 'flow' && String(event.title ?? '').trim()) return true
  return false
}

function filterMarketMovesByQuery(events, query) {
  const q = String(query ?? '').trim().toLowerCase()
  if (!q) return events
  return events.filter((e) => {
    const mentioned =
      e.mentioned != null
        ? eventMentionedSearchText(e.ticker, e.mentioned)
        : eventMentionedSearchText(e.ticker, getEventMentioned(e.briefKey))
    const hay = `${e.ticker} ${e.companyName} ${e.title} ${e.programKey ?? ''} ${e.source ?? ''} ${e.summary ?? ''} ${mentioned}`.toLowerCase()
    return hay.includes(q)
  })
}

/**
 * Offline market_moves list — mirrors backend loadHighlightedMarketMoves():
 * green-highlight flow clusters + past research docs with analysis.
 * @param {{ query?: string; limit?: number; pastDays?: number }} [opts]
 */
export function buildHighlightedMarketMoves(opts = {}) {
  const limit = Math.max(10, Math.min(200, Number(opts.limit) || 80))
  const pastDays = Math.max(7, Math.min(365, Number(opts.pastDays) || 90))
  const today = todayStartMs()
  const minMs = today - pastDays * 86400000

  const researchMoves = DISCOVER_EVENTS.filter((e) => {
    const ms = eventDayStartMs(e.at)
    if (!Number.isFinite(ms) || ms >= today || ms < minMs) return false
    return isDiscoverMarketMove(e)
  })

  const flowMoves = DISCOVER_FLOW_MARKET_MOVES.filter((e) => {
    const ms = eventDayStartMs(e.at)
    return Number.isFinite(ms) && ms < today && ms >= minMs
  })

  let merged = [...flowMoves, ...researchMoves]
  merged = filterMarketMovesByQuery(merged, opts.query)
  merged.sort((a, b) => eventDayStartMs(b.at) - eventDayStartMs(a.at))
  return merged.slice(0, limit)
}

/** Past document rows with analysis text for market moves (best-graded only). */
export function getDiscoverMarketMoves(opts = {}) {
  return buildHighlightedMarketMoves(opts)
}

export function discoverImpactClass(impact) {
  if (impact === 'high') return 'discoverEventCard--impactHigh'
  if (impact === 'medium') return 'discoverEventCard--impactMed'
  return ''
}
