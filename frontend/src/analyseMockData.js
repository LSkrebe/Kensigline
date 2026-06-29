/** Mock analyse / financial-model payload (offline showcase). */

const QUARTERS = [
  "Q1 '24",
  "Q2 '24",
  "Q3 '24",
  "Q4 '24",
  "Q1 '25",
  "Q2 '25",
  "Q3 '25E",
  "Q4 '25E",
  "Q1 '26E",
  "Q2 '26E",
]

const ESTIMATE_FROM_INDEX = 6

const ASML_MODEL = {
  currency: 'USD',
  unitNote: 'All financials in USD millions except per share data.',
  estimateFromIndex: ESTIMATE_FROM_INDEX,
  quarters: QUARTERS,
  historicalModel: [
    { label: 'Revenue', values: [5200, 5450, 5890, 6120, 6340, 6780, 7020, 7280, 7450, 7620] },
    { label: 'Gross profit', values: [2704, 2835, 3062, 3182, 3298, 3526, 3651, 3784, 3872, 3962] },
    { label: 'Gross margin', values: ['52.0%', '52.0%', '52.0%', '52.0%', '52.0%', '52.0%', '52.0%', '52.0%', '52.0%', '52.0%'], kind: 'pct' },
    { label: 'Operating expenses', values: [1300, 1363, 1472, 1530, 1585, 1695, 1755, 1820, 1863, 1905] },
    { label: 'Operating income', values: [1404, 1472, 1590, 1652, 1713, 1831, 1896, 1964, 2009, 2057] },
    { label: 'Operating margin', values: ['27.0%', '27.0%', '27.0%', '27.0%', '27.0%', '27.0%', '27.0%', '27.0%', '27.0%', '27.0%'], kind: 'pct' },
    { label: 'Net income', values: [1123, 1178, 1272, 1322, 1370, 1465, 1517, 1571, 1607, 1646] },
    { label: 'EPS ($)', values: ['2.78', '2.91', '3.15', '3.27', '3.39', '3.62', '3.75', '3.89', '3.98', '4.08'], kind: 'eps' },
    { label: 'Shares outstanding (M)', values: [404, 404, 404, 404, 404, 404, 404, 404, 404, 404] },
    { label: 'Cash & equivalents', values: [7200, 7450, 7890, 8120, 8340, 8780, 9020, 9280, 9450, 9620] },
    { label: 'Total debt', values: [3200, 3100, 3050, 2980, 2920, 2860, 2800, 2740, 2680, 2620] },
    { label: 'Free cash flow', values: [1250, 1320, 1450, 1520, 1580, 1680, 1740, 1810, 1850, 1890] },
    {
      label: 'Revenue growth (YoY)',
      values: ['—', '—', '+14.2%', '+12.8%', '+13.1%', '+11.8%', '+12.5%', '+14.0%', '+10.6%', '+12.7%'],
      kind: 'growth',
    },
    {
      label: 'EPS growth (YoY)',
      values: ['—', '—', '+15.3%', '+13.2%', '+13.5%', '+12.1%', '+12.9%', '+14.0%', '+10.9%', '+12.7%'],
      kind: 'growth',
    },
  ],
  businessDrivers: [
    { label: 'EUV revenue', values: [2100, 2280, 2450, 2580, 2720, 2890, 3020, 3150, 3240, 3330] },
    { label: 'DUV revenue', values: [1800, 1850, 1920, 1980, 2040, 2100, 2150, 2200, 2240, 2280] },
    { label: 'Immersion revenue', values: [980, 1020, 1080, 1120, 1160, 1220, 1260, 1300, 1330, 1360] },
    { label: 'Installed base (units)', values: [1200, 1220, 1250, 1280, 1310, 1340, 1370, 1400, 1430, 1460] },
  ],
  assumptions: [
    { label: 'Revenue growth (YoY)', value: '14.0%', change: '+0.5%' },
    { label: 'Gross margin', value: '52.0%', change: '0.0%' },
    { label: 'Operating margin', value: '27.0%', change: '0.0%' },
    { label: 'Net margin', value: '22.0%', change: '0.0%' },
    { label: 'Tax rate', value: '19.0%', change: '0.0%' },
    { label: 'Shares outstanding (M)', value: '404', change: '0' },
    { label: 'CapEx growth (YoY)', value: '8.0%', change: '0.0%' },
    { label: 'Depreciation (% of revenue)', value: '5.5%', change: '0.0%' },
    { label: 'Working capital (% of revenue)', value: '12.0%', change: '0.0%' },
  ],
  valuation: {
    method: 'Discounted cash flow (FCFF)',
    fairValuePerShare: '$168.72',
    upsidePct: '+24.9%',
    rows: [
      { label: 'Estimated EPS (FY1)', current: '$4.08', implied: '$4.12' },
      { label: 'Estimated free cash flow (FY1)', current: '$1,890M', implied: '$1,920M' },
      { label: 'Estimated revenue (FY1)', current: '$7,620M', implied: '$7,680M' },
      { label: 'Forward P/E (FY1)', current: '33.1x', implied: '32.8x' },
      { label: 'EV / EBITDA (FY1)', current: '24.5x', implied: '24.2x' },
      { label: 'EV / sales (FY1)', current: '8.2x', implied: '8.1x' },
    ],
    stats: [
      { label: 'Share price', value: '$135.09' },
      { label: 'Market cap', value: '$54.8B' },
      { label: 'Enterprise value', value: '$52.1B' },
      { label: 'WACC', value: '7.8%' },
      { label: 'Terminal growth', value: '2.5%' },
    ],
  },
}

function seedFromTicker(ticker) {
  const s = String(ticker ?? 'TICK')
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

function scaleNum(n, factor) {
  if (!Number.isFinite(n)) return n
  if (Math.abs(n) >= 1000) return Math.round(n * factor)
  if (Math.abs(n) >= 100) return Math.round(n * factor)
  return Math.round(n * factor * 10) / 10
}

function scaleRow(row, factor) {
  if (row.kind === 'pct' || row.kind === 'growth' || row.kind === 'eps') return row
  return {
    ...row,
    values: row.values.map((v) => (typeof v === 'number' ? scaleNum(v, factor) : v)),
  }
}

function scaleModel(base, factor) {
  return {
    ...base,
    historicalModel: base.historicalModel.map((r) => scaleRow(r, factor)),
    businessDrivers: base.businessDrivers.map((r) => scaleRow(r, factor)),
    valuation: {
      ...base.valuation,
      stats: base.valuation.stats.map((s) =>
        s.label === 'Market cap' || s.label === 'Enterprise value'
          ? s
          : s,
      ),
    },
  }
}

export function analyseMockModelForTicker(ticker) {
  const t = String(ticker ?? 'ASML').trim().toUpperCase()
  if (t === 'ASML') return ASML_MODEL
  const factor = 0.82 + (seedFromTicker(t) % 28) / 100
  return scaleModel(ASML_MODEL, factor)
}

export function formatAnalyseGridValue(v) {
  if (v == null || v === '') return '—'
  if (typeof v === 'number') return v.toLocaleString('en-US')
  return String(v)
}

export function analyseGridCellTone(value, kind) {
  if (kind !== 'growth') return null
  const s = String(value ?? '')
  if (s.startsWith('+')) return 'pos'
  if (s.startsWith('-')) return 'neg'
  return null
}
