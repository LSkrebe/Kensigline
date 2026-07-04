/**
 * Standalone public ticker preview mock (offline / SEO prototype).
 * Live: replace with delayed `/api/public/teaser/:ticker`.
 */

import { SHOWCASE_SPOT_PRICES } from './mockShowcasePrices.js'
import { MOCK_SEMIS_BY_TICKER } from './mockWeekData.js'
import { mockAtDaysAgo, mockDateOnlyDaysAgo } from './mockDates.js'

/** @typedef {'catalyst' | 'filing' | 'flow'} PublicTickerEventKind */

/**
 * @typedef {Object} PublicTickerEvent
 * @property {string} id
 * @property {string} atIso
 * @property {string} source
 * @property {PublicTickerEventKind} kind
 * @property {string} title
 * @property {string} summary
 * @property {boolean} [ideaBest]
 */

/**
 * @typedef {Object} PublicTickerPreview
 * @property {'sample' | 'delayed'} mode
 * @property {string} delayLabel
 * @property {string} delayNote
 * @property {string} ticker
 * @property {string} company
 * @property {string} sector
 * @property {string} country
 * @property {string} mcap
 * @property {number} price
 * @property {number} change
 * @property {number} changePct
 * @property {string} asOfLabel
 * @property {{ dateLabel: string; title: string; region: string; impact: string } | null} macro
 * @property {PublicTickerEvent[]} events
 * @property {number} lockedCount
 * @property {{ label: string; value: string }[]} stats
 */

const NVDA_EVENTS = [
  {
    id: 'nvda-8k-gb200',
    atIso: () => mockAtDaysAgo(4, 16, 5),
    source: '8-K',
    kind: 'filing',
    title: 'GB200 NVL72 rack deployment update',
    summary:
      'Management cites accelerating GB200 rack deployments at hyperscalers while CoWoS-L and HBM3e packaging remain the binding constraints on shipment cadence into fiscal Q2.',
    ideaBest: true,
  },
  {
    id: 'nvda-form4-cluster',
    atIso: () => mockAtDaysAgo(3, 11, 20),
    source: 'Form 4',
    kind: 'flow',
    title: 'Officer purchase cluster · 3 filings',
    summary:
      'Three open-market purchases by C-suite over five sessions — aggregate notional above the prior 12-month officer baseline; no 10b5-1 plan disclosed on the cluster.',
    ideaBest: true,
  },
  {
    id: 'nvda-pr-blackwell',
    atIso: () => mockAtDaysAgo(3, 8, 45),
    source: 'Press release',
    kind: 'catalyst',
    title: 'Blackwell Ultra platform availability for cloud partners',
    summary:
      'Product brief highlights rack-scale inference SKUs; no change to prior full-year data-center revenue framework or gross margin outlook.',
    ideaBest: false,
  },
  {
    id: 'nvda-earnings-transcript',
    atIso: () => mockAtDaysAgo(5, 17, 30),
    source: 'Earnings transcript',
    kind: 'catalyst',
    title: 'Q1 earnings call — supply vs demand commentary',
    summary:
      'Transcript emphasizes multi-quarter visibility on AI accelerators; packaging partners—not wafer starts—called out as the gating step for rack-scale systems.',
    ideaBest: true,
  },
  {
    id: 'nvda-13f-flow',
    atIso: () => mockAtDaysAgo(6, 9, 15),
    source: '13F',
    kind: 'flow',
    title: 'Top-tier allocator increased stake · Q1 filing',
    summary:
      'Institutional holder added shares in the quarter; position size still below top-five holder concentration — flow signal, not a standalone thesis.',
    ideaBest: false,
  },
]

/** @param {string} ticker */
export function publicTickerPreviewMock(ticker) {
  const t = String(ticker ?? '').trim().toUpperCase()
  if (t !== 'NVDA') return null

  const co = MOCK_SEMIS_BY_TICKER.NVDA
  const spot = SHOWCASE_SPOT_PRICES.NVDA ?? 135.2
  const changePct = 0.88
  const change = Math.round(spot * (changePct / 100) * 100) / 100

  return {
    mode: 'sample',
    delayLabel: 'Sample · 72h delay in production',
    delayNote:
      'Public preview only. Live Mercerline updates in real time with full feeds, Analyse, Investigate worksheets, and export.',
    ticker: co.ticker,
    company: co.name,
    sector: co.sector,
    country: 'United States',
    mcap: co.mcap,
    price: spot,
    change,
    changePct,
    asOfLabel: mockDateOnlyDaysAgo(2),
    macro: {
      dateLabel: 'Thu Jul 3 · 08:30 ET',
      title: 'Initial jobless claims',
      region: 'US',
      impact: 'high',
    },
    events: NVDA_EVENTS.slice(0, 3).map((e) => ({
      id: e.id,
      atIso: e.atIso(),
      source: e.source,
      kind: e.kind,
      title: e.title,
      summary: e.summary,
      ideaBest: e.ideaBest,
    })),
    lockedCount: 18,
    stats: [
      { label: 'Form 4 clusters (12m)', value: '68% positive 1M' },
      { label: 'Post-8-K drift (90d)', value: '+4.2% median' },
      { label: 'Earnings moves', value: '±8.1% avg' },
    ],
  }
}

/** @param {string} iso */
export function formatTickerEventWhen(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { date: '—', time: '' }
  return {
    date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
  }
}

/** @param {PublicTickerEventKind} kind */
export function tickerEventKindLabel(kind) {
  if (kind === 'flow') return 'Flow'
  if (kind === 'filing') return 'Filing'
  return 'Catalyst'
}

/** @param {string} ticker @param {number} points */
export function publicTickerSparklinePoints(ticker, points = 36) {
  const t = String(ticker ?? 'NVDA').toUpperCase()
  const spot = SHOWCASE_SPOT_PRICES[t] ?? 100
  const rand = (i) => 0.992 + (((i * 17) % 100) / 100) * 0.016 - 0.004
  const out = []
  let v = spot * 0.94
  for (let i = 0; i < points; i++) {
    v *= rand(i)
    out.push(v)
  }
  out[out.length - 1] = spot
  return out
}
