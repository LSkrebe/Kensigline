/**
 * Resolve an Explore event brief from the day's filings + recap slide.
 * Mock-backed for now; same contract can wrap a live API later.
 */

import { EXPLORE_RECAP_CATALOG_BY_ID } from './exploreRecapCatalog.js'
import { buildExploreDailyRecap } from './exploreRecapMock.js'
import { buildExploreRecapMockDay } from './exploreRecapMockDay.js'

function formatUsd(n) {
  if (n == null || !Number.isFinite(Number(n))) return null
  const v = Number(n)
  const abs = Math.abs(v)
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}

function formatPct(pct) {
  if (!Number.isFinite(pct)) return null
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}

function sideLabel(side) {
  if (side === 'buy') return 'Purchase'
  if (side === 'sell') return 'Sale'
  return null
}

/** Short blue-label codes matching deep archive / flow rows. */
export function filingDocCode(doc) {
  const d = String(doc ?? '').trim().toUpperCase()
  if (!d) return '—'
  if (d === 'FORM 4' || d === 'FORM4') return 'F4'
  if (d === 'PTR') return 'PTR'
  if (d === '8-K' || d === '8K') return '8-K'
  if (d === '10-Q' || d === '10Q') return '10-Q'
  if (d === '10-K' || d === '10K') return '10-K'
  if (d === '13F') return '13F'
  if (d === 'EARNINGS' || d === 'ER') return 'ER'
  return d.length > 4 ? d.slice(0, 4) : d
}

function investorTypeKey(actorMode) {
  if (actorMode === 'politicians') return 'politicians'
  if (actorMode === 'institutions') return 'institutions'
  return 'insider'
}

function buildCompaniesFromMembers(members) {
  const companies = []
  const seenTickers = new Set()
  for (const f of members) {
    const t = String(f.ticker ?? '').toUpperCase()
    if (!t || seenTickers.has(t)) continue
    seenTickers.add(t)
    companies.push({
      ticker: t,
      name: f.companyName || t,
      dayMovePct: f.dayMovePct ?? null,
      priceSeries: Array.isArray(f.priceSeries) ? f.priceSeries : [],
    })
  }
  return companies
}

function resolveEarningsWatchBrief(slide, day) {
  const memberIds = new Set(Array.isArray(slide.memberIds) ? slide.memberIds : [])
  const pool = Array.isArray(day?.earningsSoon) ? day.earningsSoon : []
  const members = memberIds.size
    ? pool.filter((r) => memberIds.has(r.id))
    : pool.slice()

  const sorted = members
    .slice()
    .sort((a, b) => (a.daysAhead ?? 99) - (b.daysAhead ?? 99))

  const companies = buildCompaniesFromMembers(sorted)
  const primaryCompany = companies.find((c) => c.ticker === slide.ticker) ?? companies[0] ?? null
  const nearest = sorted[0] ?? null

  const filingRows = sorted.map((r) => ({
    id: r.id,
    doc: 'Earnings',
    docCode: 'ER',
    side: null,
    sideLabel: null,
    ticker: r.ticker,
    companyName: r.companyName,
    actorName: null,
    actorRole: null,
    actorMode: null,
    typeKey: null,
    amountUsd: null,
    amountLabel: formatPct(r.dayMovePct),
    movePct: r.dayMovePct,
    moveLabel: formatPct(r.dayMovePct),
    moveUp: (r.dayMovePct ?? 0) >= 0,
    headline: null,
    dateLabel: r.earningsLabel || r.proximityLabel || '—',
    code: String(r.ticker ?? '').toUpperCase(),
    hideTxn: true,
    openCompany: true,
  }))

  const catalog = EXPLORE_RECAP_CATALOG_BY_ID[slide.typeId] ?? null
  const facts = [
    { key: 'source', label: 'Source', value: 'Earnings', period: 'Calendar' },
    nearest
      ? {
          key: 'nearest',
          label: 'Nearest report',
          value: nearest.proximityLabel || nearest.earningsLabel || '—',
          period: nearest.ticker,
        }
      : null,
    {
      key: 'names',
      label: 'On the watchlist',
      value: String(sorted.length),
      period: 'Before earnings',
    },
    slide.moveLabel
      ? {
          key: 'lead',
          label: 'Lead name',
          value: slide.ticker || '—',
          period: slide.moveLabel,
          up: slide.moveUp,
        }
      : null,
  ].filter(Boolean)

  return {
    slide,
    catalog,
    summary: slide.summary,
    facts,
    companies,
    people: [],
    primaryCompany,
    singleTicker: false,
    filingRows,
    listLabel: 'Before earnings',
    listTitle: 'Watchlist',
    listCountLabel: `${sorted.length} name${sorted.length === 1 ? '' : 's'}`,
    hideCompaniesSection: true,
    chartSeries: slide.priceSeries?.length
      ? slide.priceSeries
      : (primaryCompany?.priceSeries ?? []),
    chartTicker: slide.ticker || primaryCompany?.ticker || null,
  }
}

/**
 * @param {string | null | undefined} eventId
 * @param {{ day?: object | null, slides?: object[] | null }} [ctx]
 * @returns {object | null}
 */
export function resolveExploreEventBrief(eventId, ctx = {}) {
  const id = String(eventId ?? '').trim()
  if (!id) return null

  const useMock = ctx.mock === true
  const slides = useMock
    ? ctx.slides ?? buildExploreDailyRecap()?.slides ?? []
    : ctx.slides ?? []
  const slide = slides.find((s) => s.id === id) ?? null
  if (!slide) return null

  const day = useMock ? ctx.day ?? buildExploreRecapMockDay() : ctx.day ?? { filings: [], earningsSoon: [] }

  if (slide.typeId === 'earnings_watch') {
    return resolveEarningsWatchBrief(slide, day)
  }

  const filings = Array.isArray(day?.filings) ? day.filings : []
  const memberIds = new Set(Array.isArray(slide.memberIds) ? slide.memberIds : [])
  const members = memberIds.size
    ? filings.filter((f) => memberIds.has(f.id))
    : filings.filter((f) => f.id === id)

  const catalog = EXPLORE_RECAP_CATALOG_BY_ID[slide.typeId] ?? null
  const totalUsd = members.reduce((s, f) => s + (Number(f.amountUsd) || 0), 0)
  const companies = buildCompaniesFromMembers(members)

  const people = []
  const seenPeople = new Set()
  for (const f of members) {
    const key = f.actorId || f.actorName
    if (!key || seenPeople.has(key)) continue
    seenPeople.add(key)
    people.push({
      id: f.actorId || key,
      name: f.actorName,
      role: f.actorRole,
      mode: f.actorMode,
      typeKey: investorTypeKey(f.actorMode),
    })
  }

  const primaryCompany = companies.find((c) => c.ticker === slide.ticker) ?? companies[0] ?? null
  /** One issuer → lead with doc type (like tracked investors). Many issuers → lead with ticker (like trade log). */
  const singleTicker = companies.length <= 1
  const filingDateLabel = 'Today'

  const filingRows = members
    .slice()
    .sort((a, b) => (b.amountUsd ?? 0) - (a.amountUsd ?? 0))
    .map((f) => {
      const docCode = filingDocCode(f.doc)
      return {
        id: f.id,
        doc: f.doc,
        docCode,
        side: f.side,
        sideLabel: sideLabel(f.side),
        ticker: f.ticker,
        companyName: f.companyName,
        actorName: f.actorName,
        actorRole: f.actorRole,
        actorMode: f.actorMode,
        typeKey: investorTypeKey(f.actorMode),
        amountUsd: f.amountUsd,
        amountLabel: formatUsd(f.amountUsd),
        movePct: f.dayMovePct,
        moveLabel: formatPct(f.dayMovePct),
        moveUp: (f.dayMovePct ?? 0) >= 0,
        headline: f.headline,
        dateLabel: filingDateLabel,
        /** First blue column: doc type when one ticker, else ticker. */
        code: singleTicker ? docCode : String(f.ticker ?? '').toUpperCase() || docCode,
        hideTxn: false,
        openCompany: !f.actorName,
      }
    })

  const facts = [
    slide.source
      ? { key: 'source', label: 'Source', value: slide.source, period: 'Document' }
      : null,
    slide.moveLabel
      ? {
          key: 'move',
          label: 'Session move',
          value: slide.moveLabel,
          period: 'Today',
          up: slide.moveUp,
        }
      : null,
    totalUsd > 0
      ? {
          key: 'notional',
          label: 'Disclosed notional',
          value: formatUsd(totalUsd),
          period: 'In event',
        }
      : null,
    {
      key: 'filings',
      label: 'Filings',
      value: String(Math.max(1, members.length)),
      period: people.length > 1 ? `${people.length} people` : 'In event',
    },
  ].filter(Boolean)

  return {
    slide,
    catalog,
    summary: slide.summary,
    facts,
    companies,
    people,
    primaryCompany,
    singleTicker,
    filingRows,
    listLabel: 'In this event',
    listTitle: 'Filings',
    listCountLabel: `${filingRows.length} filing${filingRows.length === 1 ? '' : 's'}`,
    hideCompaniesSection: false,
    chartSeries: slide.priceSeries?.length
      ? slide.priceSeries
      : (primaryCompany?.priceSeries ?? []),
    chartTicker: slide.ticker || primaryCompany?.ticker || null,
  }
}
