import { exploreInvestorSlug, stripExploreInvestorHonorific, watchlistCatalogEntryMatchesSlug } from './exploreDirectoryNav.js'
import { exploreActorDocCode, exploreActorEventLabel, mapActorEventRows } from './exploreEventLabels.js'
import { isPlausibleExploreInvestorRow } from './exploreInvestorFilter.js'
import { resolveExploreRowTrail } from './exploreDirectoryMock.js'
import {
  EXPLORE_WATCHLIST_CATALOG,
  WATCHLIST_TXNS_PER_PERSON,
  watchlistPersonSlugs,
} from './exploreWatchlistCatalog.js'

function sortEventsNewestFirst(events) {
  return [...events].sort((a, b) => {
    const dateCmp = String(b.date ?? '').localeCompare(String(a.date ?? ''))
    if (dateCmp !== 0) return dateCmp
    return String(b.id ?? '').localeCompare(String(a.id ?? ''))
  })
}

function watchlistEventMatchesPerson(ev, person) {
  const eventSlug = String(ev?.actorSlug ?? exploreInvestorSlug(ev?.name))
    .trim()
    .toLowerCase()
  if (eventSlug && watchlistCatalogEntryMatchesSlug(person, eventSlug)) return true

  const eventName = String(ev?.name ?? '').trim()
  if (!eventName) return false

  const names = [person.name, ...(Array.isArray(person.matchNames) ? person.matchNames : [])]
  for (const raw of names) {
    const catalogName = String(raw ?? '').trim()
    if (!catalogName) continue
    if (exploreInvestorSlug(catalogName) === exploreInvestorSlug(eventName)) return true
    if (stripExploreInvestorHonorific(catalogName).toLowerCase() === stripExploreInvestorHonorific(eventName).toLowerCase()) {
      return true
    }
    if (catalogName.includes(',')) {
      const [last, rest] = catalogName.split(',').map((p) => p.trim())
      if (last && rest) {
        const flipped = `${rest} ${last}`
        if (exploreInvestorSlug(flipped) === exploreInvestorSlug(eventName)) return true
        if (stripExploreInvestorHonorific(flipped).toLowerCase() === stripExploreInvestorHonorific(eventName).toLowerCase()) {
          return true
        }
      }
    }
  }

  const catalogTokens = watchlistPersonSlugs(person).flatMap((s) => s.split('-').filter(Boolean))
  const eventTokens = eventSlug.split('-').filter(Boolean)
  const catalogLast = catalogTokens[catalogTokens.length - 1]
  const eventLast = eventTokens[eventTokens.length - 1]
  if (catalogLast && eventLast && catalogLast === eventLast && catalogLast.length >= 4) return true

  return false
}

function watchlistModeLabel(mode) {
  if (mode === 'politicians') return 'Politician'
  if (mode === 'insiders') return 'Insider'
  if (mode === 'institutions') return 'Institution'
  return 'Investor'
}

function mapWatchlistEventRow(ev) {
  const labeled = mapActorEventRows([ev]).filter(isPlausibleExploreInvestorRow)[0] ?? ev
  const { trail, muted } = resolveExploreRowTrail(labeled, 'investor')
  return {
    id: labeled.id ?? `${labeled.ticker}-${labeled.date}`,
    ticker: labeled.ticker,
    docType: labeled.docType,
    event: labeled.event ?? exploreActorEventLabel(labeled.docType),
    trail,
    trailMuted: muted,
    up: muted || trail === '$0' ? false : labeled.up ?? true,
    date: labeled.date,
    actorSlug: labeled.actorSlug,
  }
}

function recentEventsForPerson(directLatest, personEvents, txnsPerPerson) {
  const fromApi = Array.isArray(directLatest?.recentEvents) ? directLatest.recentEvents : null
  const source = fromApi?.length ? fromApi : personEvents
  return dedupeWatchlistEvents(
    mapActorEventRows(source).filter(isPlausibleExploreInvestorRow),
    txnsPerPerson,
  ).map(mapWatchlistEventRow)
}

function attachWatchlistEvents(row, events) {
  const lead = events[0]
  const preserveGroupedTicker = Array.isArray(row.tickers) && row.tickers.length > 1
  return {
    ...row,
    modeLabel: watchlistModeLabel(row.mode),
    events,
    ticker: preserveGroupedTicker ? row.ticker : lead?.ticker ?? row.ticker,
    docType: lead?.docType ?? row.docType,
    event: lead?.event ?? row.event,
    trail: lead?.trail ?? row.trail,
    trailMuted: lead?.trailMuted ?? row.trailMuted,
    up: lead?.up ?? row.up,
    date: lead?.date ?? row.date,
  }
}

function dedupeWatchlistEvents(events, limit) {
  const unique = []
  const seen = new Set()
  for (const ev of events) {
    const key = `${ev.id}|${ev.ticker}|${ev.date}|${ev.trail}|${ev.docType}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(ev)
    if (unique.length >= limit) break
  }
  return unique
}

function emptyWatchlistRow(person) {
  const actorSlug = watchlistPersonSlugs(person)[0]
  return {
    id: `wl-${actorSlug}`,
    name: person.name,
    feedName: person.name,
    actorSlug,
    mode: person.mode,
    typeKey: person.mode,
    ticker: '—',
    docType: person.docType,
    event: 'No filings yet',
    trail: '—',
    trailMuted: true,
    up: false,
    extraSameDay: 0,
    date: null,
    empty: true,
    events: [],
    modeLabel: watchlistModeLabel(person.mode),
  }
}

/** Pull raw investor events from an explore directory bundle. */
export function extractExploreInvestorEvents(directoryBundle) {
  const inner = directoryBundle?.directory ?? directoryBundle
  if (!inner) return []
  return inner.investorEvents ?? inner.directory?.investorEvents ?? []
}

/** Pull watchlist latest events from explore home API payload. */
export function extractExploreWatchlistEvents(directoryBundle) {
  if (Array.isArray(directoryBundle?.watchlistEvents)) return directoryBundle.watchlistEvents
  if (Array.isArray(directoryBundle?.watchlistLatest)) return directoryBundle.watchlistLatest
  return []
}

/**
 * One row per catalog person — real DB/API events only (no synthetic padding).
 * Prefers watchlistLatest from API (full history); falls back to directory window.
 * @param {Array} investorEvents
 * @param {{ people?: Array, txnsPerPerson?: number, watchlistLatest?: Array }} [opts]
 */
export function buildExploreWatchlistPeople(investorEvents = [], opts = {}) {
  const people = opts.people ?? EXPLORE_WATCHLIST_CATALOG
  const txnsPerPerson = opts.txnsPerPerson ?? WATCHLIST_TXNS_PER_PERSON
  const latestSource = opts.watchlistLatest?.length
    ? opts.watchlistLatest
    : investorEvents
  const labeled = mapActorEventRows(latestSource).filter(isPlausibleExploreInvestorRow)
  const sorted = sortEventsNewestFirst(labeled)
  const rows = []

  for (const person of people) {
    const fromLatest = Array.isArray(opts.watchlistLatest) ? opts.watchlistLatest : []
    const directLatest = fromLatest.find(
      (ev) =>
        String(ev?.name ?? '').trim() === person.name ||
        watchlistEventMatchesPerson(ev, person),
    )

    if (directLatest) {
      const lead = mapActorEventRows([directLatest]).filter(isPlausibleExploreInvestorRow)[0] ?? directLatest
      const { trail, muted } = resolveExploreRowTrail(lead, 'investor')
      const actorSlug =
        String(lead.actorSlug ?? '')
          .trim()
          .toLowerCase() || watchlistPersonSlugs(person)[0]
      const personEvents = sorted.filter((ev) => watchlistEventMatchesPerson(ev, person))
      const events = recentEventsForPerson(directLatest, personEvents, txnsPerPerson)
      rows.push(
        attachWatchlistEvents(
          {
            id: `wl-${actorSlug}`,
            name: person.name,
            feedName: String(lead.name ?? person.name).trim(),
            actorSlug,
            mode: person.mode,
            typeKey: person.mode,
            ticker: lead.ticker,
            docType: lead.docType,
            event: lead.event ?? exploreActorEventLabel(lead.docType),
            trail,
            trailMuted: muted,
            up: muted || trail === '$0' ? false : lead.up ?? true,
            extraSameDay: Math.max(0, Number(lead.extraSameDay ?? 0)),
            date: lead.date,
          },
          events,
        ),
      )
      continue
    }

    const personEvents = sorted.filter((ev) => watchlistEventMatchesPerson(ev, person))
    const txns = dedupeWatchlistEvents(personEvents, txnsPerPerson)
    if (!txns.length) {
      rows.push(emptyWatchlistRow(person))
      continue
    }

    const lead = txns[0]
    const events = txns.map(mapWatchlistEventRow)
    const tickers = [...new Set(txns.map((t) => String(t.ticker ?? '').trim().toUpperCase()).filter(Boolean))]
    const modeCode = exploreActorDocCode(lead.docType)
    const { trail, muted } = resolveExploreRowTrail(lead, 'investor')
    const actorSlug =
      String(lead.actorSlug ?? '')
        .trim()
        .toLowerCase() || watchlistPersonSlugs(person)[0]

    rows.push(
      attachWatchlistEvents(
        {
          id: `wl-${actorSlug}`,
          name: person.name,
          feedName: String(lead.name ?? person.name).trim(),
          actorSlug,
          mode: person.mode,
          typeKey: person.mode,
          ticker: tickers.length > 1 ? modeCode : lead.ticker,
          tickers: tickers.length > 1 ? tickers : undefined,
          docType: lead.docType,
          event: lead.event ?? exploreActorEventLabel(lead.docType),
          trail,
          trailMuted: muted,
          up: muted || trail === '$0' ? false : lead.up ?? true,
          extraSameDay: Math.max(0, lead.extraSameDay ?? txns.length - 1),
          date: lead.date,
        },
        events,
      ),
    )
  }

  return rows
}

/** @deprecated Use buildExploreWatchlistPeople */
export function buildExploreWatchlistRows(investorEvents = [], opts = {}) {
  return buildExploreWatchlistPeople(investorEvents, opts)
}
