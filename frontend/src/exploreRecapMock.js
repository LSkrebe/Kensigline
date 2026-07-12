import { mockShowcasePriceSeries } from './mockShowcasePrices.js'
import { MOCK_SEMIS_BY_TICKER } from './mockWeekData.js'

function companyMeta(ticker) {
  const t = String(ticker ?? '').toUpperCase()
  const row = MOCK_SEMIS_BY_TICKER[t] ?? { ticker: t, name: t, sector: 'Equity' }
  return {
    ticker: t,
    name: row.name ?? t,
    sector: row.sector ?? 'Equity',
    priceSeries: mockShowcasePriceSeries(t, 64),
  }
}

function pctMoveFromSeries(series) {
  const arr = Array.isArray(series) ? series.filter(Number.isFinite) : []
  if (arr.length < 2) return null
  const first = arr[0]
  const last = arr[arr.length - 1]
  if (!first) return null
  return ((last - first) / first) * 100
}

function formatPctMove(pct) {
  if (!Number.isFinite(pct)) return '—'
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}

/** Offline daily recap payload for Explore carousel. */
export function buildExploreDailyRecap() {
  const eventTicker = 'NVDA'
  const eventCompany = companyMeta(eventTicker)
  const eventSeries = eventCompany.priceSeries

  const companyTickers = ['NVDA', 'AMD']
  const companies = companyTickers.map((ticker) => {
    const meta = companyMeta(ticker)
    const pct = pctMoveFromSeries(meta.priceSeries)
    const headlines = {
      NVDA: 'CFO purchase cluster after Blackwell commentary',
      ASML: 'High-NA order commentary drives the tape',
      AMD: 'CEO open-market buys into MI300 ramp',
    }
    const sources = {
      NVDA: 'Form 4',
      AMD: 'Form 4',
    }
    return {
      ...meta,
      headline: headlines[ticker] ?? 'Notable catalyst flow today',
      source: sources[ticker] ?? 'Form 4',
      moveLabel: formatPctMove(pct),
      moveUp: Number.isFinite(pct) ? pct >= 0 : true,
    }
  })

  const actors = [
    {
      id: 'colette-kress',
      name: 'Colette Kress',
      role: 'CFO · NVIDIA',
      mode: 'insider',
      ticker: 'NVDA',
      headline: 'Three open-market purchase filings after Blackwell commentary',
      detail: 'Form 4 · Purchase',
      amount: '+$8.1M',
      up: true,
      priceSeries: mockShowcasePriceSeries('NVDA', 48),
    },
    {
      id: 'nancy-pelosi',
      name: 'Nancy Pelosi',
      role: 'House · PTR',
      mode: 'politicians',
      ticker: 'NVDA',
      headline: 'Disclosed semiconductor purchase window',
      detail: 'PTR · Purchase',
      amount: '+$2.4M',
      up: true,
      priceSeries: mockShowcasePriceSeries('NVDA', 48),
    },
  ]

  const eventPct = pctMoveFromSeries(eventSeries)

  return {
    event: {
      ticker: eventTicker,
      companyName: eventCompany.name,
      headline: 'Jensen Huang purchase cluster',
      summary:
        'CEO Jensen Huang filed a Code P purchase of 40,000 shares (~$5.2M notional) following product roadmap commentary.',
      source: 'Form 4',
      actorName: 'Jensen Huang',
      actorRole: 'CEO',
      actorMode: 'insider',
      moveLabel: formatPctMove(eventPct),
      moveUp: Number.isFinite(eventPct) ? eventPct >= 0 : true,
      priceSeries: eventSeries,
    },
    companies,
    actors,
  }
}
