/** Market Moves card footer — closest upcoming catalyst (earnings, trial, regulatory, etc.). */

import { DISCOVER_MOCK_UPCOMING_FALLBACK } from './discoverMockData.js'

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

function parseDayOnly(iso) {
  const raw = String(iso ?? '').trim()
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0)
  const d = new Date(raw.includes('T') ? raw : `${raw}T12:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

function truncateLabel(text, max = 48) {
  const t = String(text ?? '').trim().replace(/\s+/g, ' ')
  if (!t) return ''
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

export function formatDiscoverUpcomingDate(iso) {
  const d = parseDayOnly(iso)
  if (!d || Number.isNaN(d.getTime())) return '—'
  const month = d.toLocaleDateString(undefined, { month: 'short' })
  return `${month} ${d.getDate()}`
}

function upcomingLabelFromEvent(event) {
  const title = String(event?.title ?? '').trim()
  if (event?.kind === 'earnings') {
    if (!title || /^earnings\b/i.test(title)) return 'Earnings'
    return truncateLabel(title)
  }
  if (title) return truncateLabel(title)
  const program = String(event?.programKey ?? '').trim()
  if (program) return truncateLabel(program)
  return 'Upcoming'
}

function upcomingSoon(at) {
  const ms = eventDayStartMs(at)
  if (!Number.isFinite(ms)) return false
  const daysUntil = Math.round((ms - todayStartMs()) / 86_400_000)
  return daysUntil >= 0 && daysUntil <= 21
}

function upcomingForTicker(ticker, upcoming) {
  const t = String(ticker ?? '').trim().toUpperCase()
  if (!t) return []
  const today = todayStartMs()
  return (Array.isArray(upcoming) ? upcoming : [])
    .filter((e) => String(e?.ticker ?? '').trim().toUpperCase() === t && eventDayStartMs(e.at) >= today)
    .sort((a, b) => eventDayStartMs(a.at) - eventDayStartMs(b.at))
}

function daysUntilFromAt(at) {
  const ms = eventDayStartMs(at)
  if (!Number.isFinite(ms)) return Number.POSITIVE_INFINITY
  return Math.round((ms - todayStartMs()) / 86_400_000)
}

function mapNextUpcoming(event) {
  return {
    label: upcomingLabelFromEvent(event),
    at: event.at,
    soon: upcomingSoon(event.at),
  }
}

function mockUpcomingEvent(ticker) {
  const t = String(ticker ?? '').trim().toUpperCase()
  const spec = DISCOVER_MOCK_UPCOMING_FALLBACK[t] ?? DISCOVER_MOCK_UPCOMING_FALLBACK._default
  const daysAhead = spec?.daysAhead ?? 30
  const d = new Date()
  d.setDate(d.getDate() + daysAhead)
  d.setHours(0, 0, 0, 0)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return mapNextUpcoming({
    kind: spec?.kind ?? 'earnings',
    title: spec?.title ?? 'Earnings report',
    at: `${y}-${m}-${day}`,
  })
}

function footerFromMapped(mapped) {
  return {
    label: mapped.label,
    date: formatDiscoverUpcomingDate(mapped.at),
    soon: mapped.soon,
    daysUntil: daysUntilFromAt(mapped.at),
    at: mapped.at,
  }
}

/** @returns {{ label: string; date: string; soon: boolean; daysUntil: number; at: string } | null} */
export function resolveDiscoverMoveNextUpcoming(ticker, upcoming, { useMockFallback = false } = {}) {
  const hit = upcomingForTicker(ticker, upcoming)[0]
  if (hit) return footerFromMapped(mapNextUpcoming(hit))
  if (!useMockFallback) return null
  return footerFromMapped(mockUpcomingEvent(ticker))
}

/** @param {import('./discoverEvents.js').DiscoverEvent[]} marketMoves */
export function attachNextUpcomingToMarketMoves(marketMoves, upcomingPool) {
  return (Array.isArray(marketMoves) ? marketMoves : []).map((move) => {
    const rows = upcomingForTicker(move.ticker, upcomingPool)
    const next = rows[0]
    if (!next) return move
    return { ...move, next_upcoming: mapNextUpcoming(next) }
  })
}

/** Prefer API `next_upcoming`, else resolve client-side. */
export function resolveDiscoverMoveFooter(event, upcoming, opts = {}) {
  const fromApi = event?.next_upcoming
  if (fromApi?.label && fromApi?.at) {
    return footerFromMapped({
      label: fromApi.label,
      at: fromApi.at,
      soon: Boolean(fromApi.soon),
    })
  }
  return resolveDiscoverMoveNextUpcoming(event?.ticker, upcoming, opts)
}

/** Imminent catalyst window — Mercerline strip highlight on Market Moves cards. */
export const DISCOVER_CATALYST_BG_DAYS = 7

/**
 * Cards that earn the premium catalyst-strip background:
 * - any with next catalyst within DISCOVER_CATALYST_BG_DAYS, else
 * - the single nearest catalyst among visible moves (so never zero when footers exist).
 */
export function pickCatalystBgMoveIds(events, upcoming, opts = {}) {
  const ranked = []
  for (const event of Array.isArray(events) ? events : []) {
    const footer = resolveDiscoverMoveFooter(event, upcoming, opts)
    if (!footer || !Number.isFinite(footer.daysUntil) || footer.daysUntil < 0) continue
    ranked.push({ id: event.id, daysUntil: footer.daysUntil })
  }
  ranked.sort((a, b) => a.daysUntil - b.daysUntil || String(a.id).localeCompare(String(b.id)))
  if (!ranked.length) return new Set()

  const imminent = ranked.filter((row) => row.daysUntil <= DISCOVER_CATALYST_BG_DAYS)
  if (imminent.length) return new Set(imminent.map((row) => row.id))

  return new Set([ranked[0].id])
}
