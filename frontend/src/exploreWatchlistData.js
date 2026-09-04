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

/** Pull raw investor events from an explore directory bundle. */
export function extractExploreInvestorEvents(directoryBundle) {
  const inner = directoryBundle?.directory ?? directoryBundle
  if (!inner) return []
  return inner.investorEvents ?? inner.directory?.investorEvents ?? []
}

/**
 * One row per catalog person with real directory events only (no synthetic padding).
 * @param {Array} investorEvents
 * @param {{ people?: Array, txnsPerPerson?: number }} [opts]
 */
export function buildExploreWatchlistPeople(investorEvents = [], opts = {}) {
  const people = opts.people ?? EXPLORE_WATCHLIST_CATALOG
  const txnsPerPerson = opts.txnsPerPerson ?? WATCHLIST_TXNS_PER_PERSON
  const labeled = mapActorEventRows(investorEvents).filter(isPlausibleExploreInvestorRow)
  const sorted = sortEventsNewestFirst(labeled)
  const rows = []

  for (const person of people) {
    const personEvents = sorted.filter((ev) => watchlistEventMatchesPerson(ev, person))
    const txns = dedupeWatchlistEvents(personEvents, txnsPerPerson)
    if (!txns.length) continue

    const lead = txns[0]
    const tickers = [...new Set(txns.map((t) => String(t.ticker ?? '').trim().toUpperCase()).filter(Boolean))]
    const modeCode = exploreActorDocCode(lead.docType)
    const { trail, muted } = resolveExploreRowTrail(lead, 'investor')
    const actorSlug =
      String(lead.actorSlug ?? '')
        .trim()
        .toLowerCase() || watchlistPersonSlugs(person)[0]

    rows.push({
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
      extraSameDay: Math.max(0, txns.length - 1),
      date: lead.date,
    })
  }

  return rows
}

/** @deprecated Use buildExploreWatchlistPeople */
export function buildExploreWatchlistRows(investorEvents = [], opts = {}) {
  return buildExploreWatchlistPeople(investorEvents, opts)
}
