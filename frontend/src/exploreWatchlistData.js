import { exploreInvestorSlug } from './exploreDirectoryNav.js'
import { exploreActorEventLabel, mapActorEventRows } from './exploreEventLabels.js'
import { isPlausibleExploreInvestorRow } from './exploreInvestorFilter.js'
import {
  EXPLORE_WATCHLIST_CATALOG,
  WATCHLIST_TXNS_PER_PERSON,
  watchlistPersonSlug,
} from './exploreWatchlistCatalog.js'

function sortEventsNewestFirst(events) {
  return [...events].sort((a, b) => {
    const dateCmp = String(b.date ?? '').localeCompare(String(a.date ?? ''))
    if (dateCmp !== 0) return dateCmp
    return String(b.id ?? '').localeCompare(String(a.id ?? ''))
  })
}

function isoDaysAgo(days) {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function watchlistNameMatches(eventName, person) {
  const eventSlug = exploreInvestorSlug(eventName)
  const targetSlug = watchlistPersonSlug(person)
  if (!eventSlug || !targetSlug) return false
  if (eventSlug === targetSlug) return true

  const names = [person.name, ...(Array.isArray(person.matchNames) ? person.matchNames : [])]
  for (const raw of names) {
    const name = String(raw ?? '').trim()
    if (!name) continue
    if (exploreInvestorSlug(name) === eventSlug) return true
    if (name.includes(',')) {
      const [last, rest] = name.split(',').map((p) => p.trim())
      if (last && rest && exploreInvestorSlug(`${rest} ${last}`) === eventSlug) return true
      if (last && rest && exploreInvestorSlug(`${last} ${rest}`) === eventSlug) return true
    }
  }
  return false
}

function syntheticWatchlistTxn(person, index) {
  const slug = watchlistPersonSlug(person)
  const docType = person.docType ?? 'form4'
  const ticker = String(person.defaultTicker ?? 'NVDA').trim().toUpperCase()
  const isInstitution = String(docType).startsWith('13f')
  const isSale = String(docType).includes('sale') || String(docType).includes('trim')
  const dayOffset = index * 4 + 1

  return {
    id: `wl-synth-${slug}-${index}`,
    date: isoDaysAgo(dayOffset),
    name: person.name,
    ticker,
    docType,
    event: exploreActorEventLabel(docType),
    trail: isInstitution
      ? isSale
        ? '-$48M'
        : '+$112M'
      : isSale
        ? '-$420K'
        : '+$680K',
    up: !isSale,
  }
}

function padWatchlistTxns(person, events, count) {
  const out = [...events]
  while (out.length < count) {
    out.push(syntheticWatchlistTxn(person, out.length))
  }
  return out.slice(0, count)
}

function eventToWatchlistRow(ev, person) {
  const slug = watchlistPersonSlug(person)
  return {
    id: `wl-${slug}-${ev.id}`,
    name: person.name,
    actorSlug: slug,
    ticker: ev.ticker,
    docType: ev.docType,
    event: ev.event ?? exploreActorEventLabel(ev.docType),
    trail: ev.trail ?? '—',
    up: ev.up ?? true,
    trailMuted: ev.trailMuted === true,
    date: ev.date,
    extraSameDay: ev.extraSameDay ?? 0,
  }
}

/** Pull raw investor events from an explore directory bundle. */
export function extractExploreInvestorEvents(directoryBundle) {
  const inner = directoryBundle?.directory ?? directoryBundle
  if (!inner) return []
  return inner.investorEvents ?? inner.directory?.investorEvents ?? []
}

/**
 * Build flat watchlist rows: N recent transactions per catalog person.
 * @param {Array} investorEvents
 * @param {{ people?: Array, txnsPerPerson?: number }} [opts]
 */
export function buildExploreWatchlistRows(investorEvents = [], opts = {}) {
  const people = opts.people ?? EXPLORE_WATCHLIST_CATALOG
  const txnsPerPerson = opts.txnsPerPerson ?? WATCHLIST_TXNS_PER_PERSON
  const labeled = mapActorEventRows(investorEvents).filter(isPlausibleExploreInvestorRow)
  const sorted = sortEventsNewestFirst(labeled)
  const rows = []

  for (const person of people) {
    const personEvents = sorted.filter((ev) => watchlistNameMatches(ev.name, person))
    const picked = padWatchlistTxns(person, personEvents, txnsPerPerson)
    for (const ev of picked) {
      rows.push(eventToWatchlistRow(ev, person))
    }
  }

  return rows
}
