import { exploreInvestorSlug } from './exploreDirectoryNav.js'
import { exploreActorDocCode, exploreActorEventLabel, mapActorEventRows } from './exploreEventLabels.js'
import { isPlausibleExploreInvestorRow } from './exploreInvestorFilter.js'
import { resolveExploreRowTrail } from './exploreDirectoryMock.js'
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
  const tickers = ['NVDA', 'LRCX', 'MSFT', 'AMD', 'AVGO', 'AAPL']
  const altTicker = tickers[(tickers.indexOf(ticker) + index) % tickers.length] ?? ticker

  return {
    id: `wl-synth-${slug}-${index}`,
    date: isoDaysAgo(dayOffset),
    name: person.name,
    ticker: index === 0 ? ticker : altTicker,
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

function pickWatchlistTxns(person, events, count) {
  const unique = []
  const seen = new Set()
  for (const ev of events) {
    const key = `${ev.ticker}|${ev.date}|${ev.trail}|${ev.docType}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(ev)
    if (unique.length >= count) break
  }
  while (unique.length < count) {
    unique.push(syntheticWatchlistTxn(person, unique.length))
  }
  return unique.slice(0, count)
}

/** Pull raw investor events from an explore directory bundle. */
export function extractExploreInvestorEvents(directoryBundle) {
  const inner = directoryBundle?.directory ?? directoryBundle
  if (!inner) return []
  return inner.investorEvents ?? inner.directory?.investorEvents ?? []
}

/**
 * One home-style row per watchlist person (latest filing + "+N" when more activity).
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
    const slug = watchlistPersonSlug(person)
    const personEvents = sorted.filter((ev) => watchlistNameMatches(ev.name, person))
    const txns = pickWatchlistTxns(person, personEvents, txnsPerPerson)
    const lead = txns[0]
    if (!lead) continue

    const tickers = [...new Set(txns.map((t) => String(t.ticker ?? '').trim().toUpperCase()).filter(Boolean))]
    const modeCode = exploreActorDocCode(lead.docType)
    const { trail, muted } = resolveExploreRowTrail(lead, 'investor')

    rows.push({
      id: `wl-${slug}`,
      name: person.name,
      actorSlug: slug,
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
