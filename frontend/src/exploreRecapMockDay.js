/**
 * Offline "today's filings" universe for Explore recap evaluation.
 * Shape mirrors what a future /api/explore/recap builder would pull from
 * insider_transactions / politician_transactions / documents / bars /
 * earnings calendar.
 */

import { mockShowcasePriceSeries } from './mockShowcasePrices.js'
import { MOCK_SEMIS_BY_TICKER } from './mockWeekData.js'

function companyMeta(ticker) {
  const t = String(ticker ?? '').toUpperCase()
  const row = MOCK_SEMIS_BY_TICKER[t] ?? { ticker: t, name: t, sector: 'Equity' }
  return {
    ticker: t,
    name: row.name ?? t,
    sector: row.sector ?? 'Equity',
  }
}

function pctMoveFromSeries(series, lookback = 5) {
  const arr = Array.isArray(series) ? series.filter(Number.isFinite) : []
  if (arr.length < 2) return null
  const last = arr[arr.length - 1]
  const startIdx = Math.max(0, arr.length - 1 - lookback)
  const first = arr[startIdx]
  if (!first) return null
  return ((last - first) / first) * 100
}

function earningsDateLabel(daysAhead) {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + daysAhead)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function earningsProximityLabel(daysAhead) {
  const n = Number(daysAhead)
  if (!Number.isFinite(n) || n < 0) return null
  if (n === 0) return 'Today'
  if (n === 1) return '1d'
  return `${n}d`
}

/**
 * Mock flow + filing rows + near earnings watch for a single calendar day.
 * Intentionally uneven so some catalog types fire and others stay omitted.
 */
export function buildExploreRecapMockDay() {
  const nvda = companyMeta('NVDA')
  const amd = companyMeta('AMD')
  const asml = companyMeta('ASML')
  const avgo = companyMeta('AVGO')
  const tsm = companyMeta('TSM')
  const mu = companyMeta('MU')
  const lrcx = companyMeta('LRCX')
  const amat = companyMeta('AMAT')

  const nvdaSeries = mockShowcasePriceSeries('NVDA', 260)
  const amdSeries = mockShowcasePriceSeries('AMD', 260)
  const asmlSeries = mockShowcasePriceSeries('ASML', 260)
  const avgoSeries = mockShowcasePriceSeries('AVGO', 260)
  const tsmSeries = mockShowcasePriceSeries('TSM', 260)
  const muSeries = mockShowcasePriceSeries('MU', 260)
  const lrcxSeries = mockShowcasePriceSeries('LRCX', 260)
  const amatSeries = mockShowcasePriceSeries('AMAT', 260)

  /** @type {Array<Record<string, unknown>>} */
  const filings = [
    // NVDA insider buying cluster (3 buyers) — fires cluster + largest purchase
    {
      id: 'f4-nvda-huang',
      doc: 'Form 4',
      side: 'buy',
      ticker: 'NVDA',
      companyName: nvda.name,
      actorId: 'jensen-huang',
      actorName: 'Jensen Huang',
      actorRole: 'CEO at NVIDIA',
      actorMode: 'insider',
      amountUsd: 5_200_000,
      code: 'P',
      headline: null,
      priceSeries: nvdaSeries,
      dayMovePct: pctMoveFromSeries(nvdaSeries, 3),
    },
    {
      id: 'f4-nvda-kress',
      doc: 'Form 4',
      side: 'buy',
      ticker: 'NVDA',
      companyName: nvda.name,
      actorId: 'colette-kress',
      actorName: 'Colette Kress',
      actorRole: 'CFO at NVIDIA',
      actorMode: 'insider',
      amountUsd: 2_400_000,
      code: 'P',
      headline: null,
      priceSeries: nvdaSeries,
      dayMovePct: pctMoveFromSeries(nvdaSeries, 3),
    },
    {
      id: 'f4-nvda-debora',
      doc: 'Form 4',
      side: 'buy',
      ticker: 'NVDA',
      companyName: nvda.name,
      actorId: 'debora-shoemaker',
      actorName: 'Debora Shoemaker',
      actorRole: 'Director at NVIDIA',
      actorMode: 'insider',
      amountUsd: 480_000,
      code: 'P',
      headline: null,
      priceSeries: nvdaSeries,
      dayMovePct: pctMoveFromSeries(nvdaSeries, 3),
    },
    // AMD mixed — single sale (no sell cluster)
    {
      id: 'f4-amd-su-sale',
      doc: 'Form 4',
      side: 'sell',
      ticker: 'AMD',
      companyName: amd.name,
      actorId: 'lisa-su',
      actorName: 'Lisa Su',
      actorRole: 'CEO at AMD',
      actorMode: 'insider',
      amountUsd: 3_100_000,
      code: 'S',
      headline: null,
      priceSeries: amdSeries,
      dayMovePct: pctMoveFromSeries(amdSeries, 3),
    },
    // Same person, second ticker — multi-company person activity
    {
      id: 'f4-avgo-huang',
      doc: 'Form 4',
      side: 'buy',
      ticker: 'AVGO',
      companyName: avgo.name,
      actorId: 'jensen-huang',
      actorName: 'Jensen Huang',
      actorRole: 'CEO at NVIDIA',
      actorMode: 'insider',
      amountUsd: 910_000,
      code: 'P',
      headline: null,
      priceSeries: avgoSeries,
      dayMovePct: pctMoveFromSeries(avgoSeries, 3),
    },
    // PTR purchase
    {
      id: 'ptr-pelosi-nvda',
      doc: 'PTR',
      side: 'buy',
      ticker: 'NVDA',
      companyName: nvda.name,
      actorId: 'nancy-pelosi',
      actorName: 'Nancy Pelosi',
      actorRole: 'House PTR',
      actorMode: 'politicians',
      amountUsd: 1_000_000,
      code: 'P',
      headline: null,
      priceSeries: nvdaSeries,
      dayMovePct: pctMoveFromSeries(nvdaSeries, 3),
    },
    // Material 8-K + price move on ASML
    {
      id: '8k-asml',
      doc: '8-K',
      side: null,
      ticker: 'ASML',
      companyName: asml.name,
      actorId: null,
      actorName: null,
      actorRole: null,
      actorMode: null,
      amountUsd: null,
      code: null,
      headline: 'Orders and capacity take the spotlight',
      priceSeries: asmlSeries,
      dayMovePct: 4.2,
    },
    // Extra Form 4 on ASML so company_filing_burst can fire with 8-K
    {
      id: 'f4-asml-cfo',
      doc: 'Form 4',
      side: 'sell',
      ticker: 'ASML',
      companyName: asml.name,
      actorId: 'roger-dassen',
      actorName: 'Roger Dassen',
      actorRole: 'CFO at ASML',
      actorMode: 'insider',
      amountUsd: 720_000,
      code: 'S',
      headline: null,
      priceSeries: asmlSeries,
      dayMovePct: 4.2,
    },
  ]

  /** Near-term earnings watch — fires `earnings_watch` when 2+ names land in window. */
  const earningsSoon = [
    {
      id: 'er-tsm',
      ticker: 'TSM',
      companyName: tsm.name,
      daysAhead: 2,
      earningsLabel: earningsDateLabel(2),
      proximityLabel: earningsProximityLabel(2),
      priceSeries: tsmSeries,
      dayMovePct: pctMoveFromSeries(tsmSeries, 5),
    },
    {
      id: 'er-mu',
      ticker: 'MU',
      companyName: mu.name,
      daysAhead: 4,
      earningsLabel: earningsDateLabel(4),
      proximityLabel: earningsProximityLabel(4),
      priceSeries: muSeries,
      dayMovePct: pctMoveFromSeries(muSeries, 5),
    },
    {
      id: 'er-lrcx',
      ticker: 'LRCX',
      companyName: lrcx.name,
      daysAhead: 7,
      earningsLabel: earningsDateLabel(7),
      proximityLabel: earningsProximityLabel(7),
      priceSeries: lrcxSeries,
      dayMovePct: pctMoveFromSeries(lrcxSeries, 5),
    },
    {
      id: 'er-amat',
      ticker: 'AMAT',
      companyName: amat.name,
      daysAhead: 9,
      earningsLabel: earningsDateLabel(9),
      proximityLabel: earningsProximityLabel(9),
      priceSeries: amatSeries,
      dayMovePct: pctMoveFromSeries(amatSeries, 5),
    },
  ]

  return { dayKey: 'mock-today', filings, earningsSoon }
}
