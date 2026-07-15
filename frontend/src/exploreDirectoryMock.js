import { MOCK_SEMIS_BY_TICKER } from './mockWeekData.js'
import { exploreActorDocCode, mapActorEventRows, mapCompanyEventRows } from './exploreEventLabels.js'

const HOME_DIRECTORY_PREVIEW = 12
export const EXPLORE_DIRECTORY_BLOCK = 20

function companyName(ticker) {
  const t = String(ticker ?? '').toUpperCase()
  return MOCK_SEMIS_BY_TICKER[t]?.name ?? t
}

function isoDaysAgo(days) {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function todayIso() {
  return isoDaysAgo(0)
}

function formatExploreRecency(iso) {
  const date = String(iso ?? '').trim()
  if (!date) return null
  const today = todayIso()
  if (date === today) return 'Today'
  const then = new Date(`${date}T12:00:00`)
  const now = new Date(`${today}T12:00:00`)
  const days = Math.max(0, Math.round((now - then) / 86400000))
  if (days === 1) return '1d ago'
  if (days < 14) return `${days}d ago`
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Parse compact disclosure notional strings like +$5.2M or -$640K into signed USD. */
export function parseExploreTrailUsd(trail) {
  const raw = String(trail ?? '').trim()
  if (!raw || raw === '—') return null

  const match = raw.match(/^([+\-−])?\$?([\d,.]+)\s*([KMB])?$/i)
  if (!match) return null

  const signToken = match[1]
  const num = Number.parseFloat(String(match[2]).replace(/,/g, ''))
  if (!Number.isFinite(num)) return null

  const suffix = String(match[3] ?? '').toUpperCase()
  const scale = suffix === 'B' ? 1e9 : suffix === 'M' ? 1e6 : suffix === 'K' ? 1e3 : 1
  const sign = signToken === '-' || signToken === '−' ? -1 : 1

  return sign * num * scale
}

/** Signed net flow for directory rows: acquisitions/adds minus sales/trims. */
export function formatExploreNetFlowUsd(usd) {
  if (usd == null || !Number.isFinite(usd)) return '—'
  if (usd === 0) return '$0'

  const abs = Math.abs(usd)
  const sign = usd > 0 ? '+' : '−'

  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${sign}$${Math.round(abs / 1e3)}K`
  return `${sign}$${Math.round(abs)}`
}

function formatExplorePublishDate(iso) {
  const date = String(iso ?? '').trim()
  if (!date) return '—'
  const then = new Date(`${date}T12:00:00`)
  if (Number.isNaN(then.getTime())) return '—'
  return then.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function aggregateCompaniesByTicker(events) {
  const sorted = sortEventsNewestFirst(events)
  const byTicker = new Map()

  for (const ev of sorted) {
    if (!byTicker.has(ev.ticker)) byTicker.set(ev.ticker, [])
    byTicker.get(ev.ticker).push(ev)
  }

  const out = []

  for (const tickerEvents of byTicker.values()) {
    const newest = tickerEvents[0]
    const latestDate = newest.date
    const sameDayCount = tickerEvents.filter((ev) => ev.date === latestDate).length

    out.push({
      id: `co-${newest.ticker}`,
      ticker: newest.ticker,
      name: newest.name,
      event: newest.event,
      extraSameDay: Math.max(0, sameDayCount - 1),
      lastDate: latestDate,
      publishedDateLabel: formatExplorePublishDate(latestDate),
    })
  }

  return out.sort((a, b) => String(b.lastDate).localeCompare(String(a.lastDate)))
}

function aggregateActorsByName(events) {
  const sorted = sortEventsNewestFirst(events)
  const positionCounts = new Map()
  const tickerLists = new Map()
  const netFlows = new Map()

  for (const ev of sorted) {
    positionCounts.set(ev.name, (positionCounts.get(ev.name) ?? 0) + 1)
    if (!tickerLists.has(ev.name)) tickerLists.set(ev.name, [])
    const tickers = tickerLists.get(ev.name)
    if (!tickers.includes(ev.ticker)) tickers.push(ev.ticker)

    const signedUsd = parseExploreTrailUsd(ev.trail)
    if (signedUsd != null) {
      netFlows.set(ev.name, (netFlows.get(ev.name) ?? 0) + signedUsd)
    }
  }

  const seen = new Set()
  const out = []

  for (const ev of sorted) {
    if (seen.has(ev.name)) continue
    seen.add(ev.name)
    const netFlowUsd = netFlows.get(ev.name) ?? 0
    out.push({
      id: `ac-${String(ev.name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name: ev.name,
      ticker: ev.ticker,
      tickers: tickerLists.get(ev.name) ?? [ev.ticker],
      docType: ev.docType,
      modeCode: exploreActorDocCode(ev.docType),
      positionCount: positionCounts.get(ev.name) ?? 1,
      netFlowUsd,
      netFlowLabel: formatExploreNetFlowUsd(netFlowUsd),
      lastDate: ev.date,
      recency: formatExploreRecency(ev.date),
      trail: ev.trail,
      up: ev.up,
    })
  }

  return out
}

/** Company-level filings only (no Form 4, PTR, or 13F). */
function buildExploreCompanyEventSeed() {
  const today = todayIso()
  const d1 = isoDaysAgo(1)
  const d2 = isoDaysAgo(2)
  const d3 = isoDaysAgo(3)
  const d5 = isoDaysAgo(5)
  const d8 = isoDaysAgo(8)
  const d12 = isoDaysAgo(12)

  return mapCompanyEventRows(
    [
      { id: 'c-nvda-1', date: today, ticker: 'NVDA', docType: '8k_earnings', trail: '+2.4%', up: true },
      { id: 'c-nvda-2', date: today, ticker: 'NVDA', docType: '8k', trail: '+2.4%', up: true },
      { id: 'c-nvda-3', date: today, ticker: 'NVDA', docType: 'transcript', trail: '+2.4%', up: true },
      { id: 'c-nvda-4', date: today, ticker: 'NVDA', docType: 'press', trail: '+2.4%', up: true },
      { id: 'c-amd-1', date: today, ticker: 'AMD', docType: '8k', trail: '-1.1%', up: false },
      { id: 'c-amd-2', date: today, ticker: 'AMD', docType: 'guidance', trail: '-1.1%', up: false },
      { id: 'c-asml-1', date: today, ticker: 'ASML', docType: 'transcript', trail: '+0.8%', up: true },
      { id: 'c-avgo-1', date: today, ticker: 'AVGO', docType: 'earnings', trail: '+1.6%', up: true },
      { id: 'c-tsm-1', date: today, ticker: 'TSM', docType: 'guidance', trail: '-0.4%', up: false },
      { id: 'c-mu-1', date: today, ticker: 'MU', docType: '8k_earnings', trail: '+3.2%', up: true },
      { id: 'c-lrcx-1', date: today, ticker: 'LRCX', docType: 'transcript', trail: '+0.5%', up: true },
      { id: 'c-amat-1', date: today, ticker: 'AMAT', docType: '8k', trail: '-0.9%', up: false },
      { id: 'c-intc-1', date: today, ticker: 'INTC', docType: '10q', trail: '-2.1%', up: false },
      { id: 'c-qcom-1', date: today, ticker: 'QCOM', docType: 'earnings', trail: '+1.0%', up: true },
      { id: 'c-mrvl-1', date: today, ticker: 'MRVL', docType: '8k', trail: '+4.3%', up: true },
      { id: 'c-smci-1', date: today, ticker: 'SMCI', docType: '8k_earnings', trail: '+6.1%', up: true },
      { id: 'c-nvda-5', date: d1, ticker: 'NVDA', docType: '10q', trail: '+1.8%', up: true },
      { id: 'c-nvda-6', date: d1, ticker: 'NVDA', docType: 'press', trail: '+1.8%', up: true },
      { id: 'c-amd-3', date: d1, ticker: 'AMD', docType: 'transcript', trail: '+0.6%', up: true },
      { id: 'c-arm-1', date: d1, ticker: 'ARM', docType: 'earnings', trail: '+1.4%', up: true },
      { id: 'c-klac-1', date: d2, ticker: 'KLAC', docType: 'earnings', trail: '+0.3%', up: true },
      { id: 'c-on-1', date: d2, ticker: 'ON', docType: '8k', trail: '-1.8%', up: false },
      { id: 'c-avgo-2', date: d3, ticker: 'AVGO', docType: '8k', trail: '+0.9%', up: true },
      { id: 'c-tsm-2', date: d3, ticker: 'TSM', docType: '10q', trail: '-0.2%', up: false },
      { id: 'c-mu-2', date: d5, ticker: 'MU', docType: 'transcript', trail: '+2.1%', up: true },
      { id: 'c-lrcx-2', date: d5, ticker: 'LRCX', docType: 'guidance', trail: '+0.4%', up: true },
      { id: 'c-intc-2', date: d8, ticker: 'INTC', docType: '8k', trail: '-1.4%', up: false },
      { id: 'c-qcom-2', date: d8, ticker: 'QCOM', docType: 'transcript', trail: '+0.7%', up: true },
      { id: 'c-smci-2', date: d12, ticker: 'SMCI', docType: '10k', trail: '+3.8%', up: true },
      { id: 'c-asml-2', date: d12, ticker: 'ASML', docType: 'proxy', trail: '+1.1%', up: true },
    ].map((row) => ({
      ...row,
      name: companyName(row.ticker),
    })),
  )
}

/** Actor-level filings only (Form 4, PTR, 13F). */
function buildExploreActorEventSeed() {
  const today = todayIso()
  const d1 = isoDaysAgo(1)
  const d2 = isoDaysAgo(2)
  const d4 = isoDaysAgo(4)
  const d6 = isoDaysAgo(6)
  const d10 = isoDaysAgo(10)
  const d14 = isoDaysAgo(14)

  return mapActorEventRows([
    { id: 'a-jh-1', date: today, name: 'Jensen Huang', ticker: 'NVDA', docType: 'form4_purchase', trail: '+$5.2M', up: true },
    { id: 'a-jh-2', date: today, name: 'Jensen Huang', ticker: 'NVDA', docType: 'form4_purchase', trail: '+$5.2M', up: true },
    { id: 'a-ck-1', date: today, name: 'Colette Kress', ticker: 'NVDA', docType: 'form4_purchase', trail: '+$8.1M', up: true },
    { id: 'a-ck-2', date: today, name: 'Colette Kress', ticker: 'NVDA', docType: 'form4', trail: '+$8.1M', up: true },
    { id: 'a-ls-1', date: today, name: 'Lisa Su', ticker: 'AMD', docType: 'form4_purchase', trail: '+$1.9M', up: true },
    { id: 'a-np-1', date: today, name: 'Nancy Pelosi', ticker: 'NVDA', docType: 'ptr_purchase', trail: '+$2.4M', up: true },
    { id: 'a-dc-1', date: today, name: 'Dan Crenshaw', ticker: 'LRCX', docType: 'ptr_purchase', trail: '+$640K', up: true },
    { id: 'a-vg-1', date: today, name: 'Vanguard Group', ticker: 'NVDA', docType: '13f_add', trail: '+$412M', up: true },
    { id: 'a-br-1', date: today, name: 'BlackRock', ticker: 'AVGO', docType: '13f_trim', trail: '-$186M', up: false },
    { id: 'a-mb-1', date: today, name: 'Mary Barra', ticker: 'GM', docType: 'form4_purchase', trail: '+$920K', up: true },
    { id: 'a-tc-1', date: today, name: 'Tim Cook', ticker: 'AAPL', docType: 'form4', trail: '+$1.1M', up: true },
    { id: 'a-jg-1', date: today, name: 'Josh Gottheimer', ticker: 'MSFT', docType: 'ptr_sale', trail: '-$780K', up: false },
    { id: 'a-cw-1', date: today, name: 'Cathie Wood', ticker: 'AMD', docType: '13f_trim', trail: '-$42M', up: false },
    { id: 'a-mz-1', date: today, name: 'Mark Zuckerberg', ticker: 'META', docType: 'form4_sale', trail: '-$18M', up: false },
    { id: 'a-te-1', date: today, name: 'Tom Emmer', ticker: 'COIN', docType: 'ptr_purchase', trail: '+$310K', up: true },
    { id: 'a-jh-3', date: d1, name: 'Jensen Huang', ticker: 'NVDA', docType: 'form4_purchase', trail: '+$4.1M', up: true },
    { id: 'a-ck-3', date: d1, name: 'Colette Kress', ticker: 'NVDA', docType: 'form4_purchase', trail: '+$2.2M', up: true },
    { id: 'a-np-2', date: d2, name: 'Nancy Pelosi', ticker: 'NVDA', docType: 'ptr', trail: '+$1.8M', up: true },
    { id: 'a-vg-2', date: d2, name: 'Vanguard Group', ticker: 'NVDA', docType: '13f_add', trail: '+$220M', up: true },
    { id: 'a-ls-2', date: d4, name: 'Lisa Su', ticker: 'AMD', docType: 'form4_purchase', trail: '+$900K', up: true },
    { id: 'a-br-2', date: d4, name: 'BlackRock', ticker: 'TSM', docType: '13f_add', trail: '+$96M', up: true },
    { id: 'a-dc-2', date: d6, name: 'Dan Crenshaw', ticker: 'AMAT', docType: 'ptr_purchase', trail: '+$410K', up: true },
    { id: 'a-tc-2', date: d6, name: 'Tim Cook', ticker: 'AAPL', docType: 'form4_sale', trail: '-$4.2M', up: false },
    { id: 'a-cw-2', date: d10, name: 'Cathie Wood', ticker: 'COIN', docType: '13f_trim', trail: '-$18M', up: false },
    { id: 'a-mz-2', date: d10, name: 'Mark Zuckerberg', ticker: 'META', docType: 'form4_sale', trail: '-$22M', up: false },
    { id: 'a-jg-2', date: d14, name: 'Josh Gottheimer', ticker: 'NVDA', docType: 'ptr_purchase', trail: '+$520K', up: true },
    { id: 'a-mb-2', date: d14, name: 'Mary Barra', ticker: 'GM', docType: 'form4_purchase', trail: '+$640K', up: true },
  ])
}

function sortEventsNewestFirst(events) {
  return [...events].sort((a, b) => {
    const dateCmp = String(b.date).localeCompare(String(a.date))
    if (dateCmp !== 0) return dateCmp
    return String(b.id).localeCompare(String(a.id))
  })
}

/**
 * Collapse same-day events for one company or actor into one row with +N suffix.
 * @param {Array} events
 * @param {(row: object) => string} groupKey
 */
export function aggregateExploreSameDayEvents(events, groupKey) {
  const sorted = sortEventsNewestFirst(events)
  const groups = new Map()

  for (const ev of sorted) {
    const key = groupKey(ev)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(ev)
  }

  const out = []
  const seen = new Set()

  for (const ev of sorted) {
    const key = groupKey(ev)
    if (seen.has(key)) continue
    seen.add(key)
    const group = groups.get(key) ?? [ev]
    const extraSameDay = Math.max(0, group.length - 1)
    out.push({ ...group[0], extraSameDay })
  }

  return out
}

export function buildExploreCompanyEvents() {
  return sortEventsNewestFirst(buildExploreCompanyEventSeed())
}

export function buildExploreActorEvents() {
  return sortEventsNewestFirst(buildExploreActorEventSeed())
}

export function buildExploreDirectoryMock() {
  const companyEvents = buildExploreCompanyEvents()
  const actorEvents = buildExploreActorEvents()

  return {
    companyEvents,
    actorEvents,
    companies: aggregateExploreSameDayEvents(companyEvents, (row) => `${row.ticker}|${row.date}`),
    actors: aggregateExploreSameDayEvents(actorEvents, (row) => `${row.name}|${row.ticker}|${row.date}`),
  }
}

/** ~12 newest events from today for Explore home preview. */
export function buildExploreDirectoryHomePreview(directory = buildExploreDirectoryMock()) {
  const today = todayIso()

  const todayCompanyEvents = directory.companyEvents.filter((row) => row.date === today)
  const todayActorEvents = directory.actorEvents.filter((row) => row.date === today)

  return {
    companies: aggregateExploreSameDayEvents(todayCompanyEvents, (row) => `${row.ticker}|${row.date}`).slice(
      0,
      HOME_DIRECTORY_PREVIEW,
    ),
    actors: aggregateExploreSameDayEvents(todayActorEvents, (row) => `${row.name}|${row.ticker}|${row.date}`).slice(
      0,
      HOME_DIRECTORY_PREVIEW,
    ),
  }
}

export function buildExploreDirectoryFullList(kind, directory = buildExploreDirectoryMock()) {
  if (kind === 'actors') {
    return aggregateActorsByName(directory.actorEvents)
  }
  return aggregateCompaniesByTicker(directory.companyEvents)
}
