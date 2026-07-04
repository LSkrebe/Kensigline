/** Mock analyse / financial-model payload (offline showcase). */

const QUARTERS = [
  "Q1'24",
  "Q2'24",
  "Q3'24",
  "Q4'24",
  "Q1'25",
  "Q2'25",
  "Q3'25E",
  "Q4'25E",
  "Q1'26E",
  "Q2'26E",
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
    { label: 'EUV revenue', driverKind: 'revenue', rollsUpToRevenue: true, values: [2100, 2280, 2450, 2580, 2720, 2890, 3020, 3150, 3240, 3330] },
    { label: 'DUV revenue', driverKind: 'revenue', rollsUpToRevenue: true, values: [1800, 1850, 1920, 1980, 2040, 2100, 2150, 2200, 2240, 2280] },
    { label: 'Immersion revenue', driverKind: 'revenue', rollsUpToRevenue: true, values: [980, 1020, 1080, 1120, 1160, 1220, 1260, 1300, 1330, 1360] },
    { label: 'Installed base (units)', driverKind: 'units', rollsUpToRevenue: false, values: [1200, 1220, 1250, 1280, 1310, 1340, 1370, 1400, 1430, 1460] },
  ],
  valuationConfig: {
    targetPe: 41.4,
    marketPrice: 748.5,
    marketCapBillions: 302.4,
    enterpriseValueBillions: 294.8,
    bridgeDriverLabels: ['EUV revenue', 'DUV revenue', 'Immersion revenue'],
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
  if (row.kind === 'pct' || row.kind === 'growth' || row.kind === 'eps' || row.kind === 'runway') return row
  if (row.readOnly || row.driverKind === 'enrollment' || row.driverKind === 'pos_pct') return row
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
    valuationConfig: {
      ...base.valuationConfig,
      marketPrice: Math.round(base.valuationConfig.marketPrice * factor * 100) / 100,
      marketCapBillions: Math.round(base.valuationConfig.marketCapBillions * factor * 10) / 10,
      enterpriseValueBillions:
        Math.round(base.valuationConfig.enterpriseValueBillions * factor * 10) / 10,
    },
  }
}

function pctStr(n) {
  return `${Number(n).toFixed(1)}%`
}

function growthYoYStr(curr, prior) {
  if (prior == null || prior === 0 || prior === '—') return '—'
  const g = ((curr - prior) / prior) * 100
  return `${g >= 0 ? '+' : ''}${g.toFixed(1)}%`
}

function findRow(rows, label) {
  return rows.find((r) => r.label === label)
}

export function isForecastEditableDriver(row) {
  if (row?.readOnly) return false
  return true
}

function revenueDriverSum(drivers, colIdx) {
  let sum = 0
  for (const row of drivers) {
    if (row.rollsUpToRevenue === false) continue
    const v = row.values[colIdx]
    if (typeof v === 'number') sum += v
  }
  return sum
}

function revenueResidualForColumn(baseModel, colIdx) {
  const baseRev = findRow(baseModel.historicalModel, 'Revenue')?.values[colIdx] ?? 0
  return baseRev - revenueDriverSum(baseModel.businessDrivers, colIdx)
}

function revenueFromDrivers(businessDrivers, baseModel, colIdx) {
  return Math.round(revenueDriverSum(businessDrivers, colIdx) + revenueResidualForColumn(baseModel, colIdx))
}

function propagateDriverOverridesForward(businessDrivers, baseDrivers, overrides, estFrom, colCount) {
  for (const [rowLabel, byCol] of Object.entries(overrides)) {
    const row = findRow(businessDrivers, rowLabel)
    const baseRow = findRow(baseDrivers, rowLabel)
    if (!row || !baseRow || row.readOnly) continue

    const editedCols = Object.keys(byCol)
      .map(Number)
      .filter((i) => i >= estFrom && i < colCount && byCol[i] != null)
      .sort((a, b) => a - b)

    for (const fromCol of editedCols) {
      const baseAt = baseRow.values[fromCol]
      const newAt = row.values[fromCol]
      if (typeof baseAt !== 'number' || baseAt === 0 || typeof newAt !== 'number') continue
      const scale = newAt / baseAt
      for (let j = fromCol + 1; j < colCount; j++) {
        const baseFuture = baseRow.values[j]
        if (typeof baseFuture === 'number') {
          row.values[j] = Math.round(baseFuture * scale)
        }
      }
    }
  }
}

const BASE_CASE_TAX_RATE = 0.23
const BASE_CASE_HIST_GROSS_MARGIN = 0.52

function forecastRatios(baseModel, colIdx) {
  const anchor = baseModel.estimateFromIndex - 1
  const rev = findRow(baseModel.historicalModel, 'Revenue')?.values[anchor] ?? 1
  const grossProfit = findRow(baseModel.historicalModel, 'Gross profit')?.values[anchor] ?? 0
  const opIncome = findRow(baseModel.historicalModel, 'Operating income')?.values[anchor] ?? 0
  const shares = findRow(baseModel.historicalModel, 'Shares outstanding (M)')?.values[anchor] ?? 404
  const estOffset = colIdx - baseModel.estimateFromIndex
  const revertProgress = Math.min(1, (estOffset + 1) / 8)
  const anchorGm = rev > 0 ? grossProfit / rev : BASE_CASE_HIST_GROSS_MARGIN
  const grossMargin = anchorGm + (BASE_CASE_HIST_GROSS_MARGIN - anchorGm) * revertProgress
  const opMargin = rev > 0 ? opIncome / rev : grossMargin * 0.52
  return {
    grossMargin,
    opMargin,
    netMargin: opMargin * (1 - BASE_CASE_TAX_RATE),
    shares,
  }
}

function recalcEstimateColumn(historicalModel, baseModel, colIdx, rev, ratios) {
  const revenue = findRow(historicalModel, 'Revenue')
  const grossProfit = findRow(historicalModel, 'Gross profit')
  const grossMargin = findRow(historicalModel, 'Gross margin')
  const opex = findRow(historicalModel, 'Operating expenses')
  const opIncome = findRow(historicalModel, 'Operating income')
  const opMargin = findRow(historicalModel, 'Operating margin')
  const netIncome = findRow(historicalModel, 'Net income')
  const eps = findRow(historicalModel, 'EPS ($)')
  const shares = findRow(historicalModel, 'Shares outstanding (M)')
  const cash = findRow(historicalModel, 'Cash & equivalents')
  const debt = findRow(historicalModel, 'Total debt')
  const fcf = findRow(historicalModel, 'Free cash flow')
  const revGrowth = findRow(historicalModel, 'Revenue growth (YoY)')
  const epsGrowth = findRow(historicalModel, 'EPS growth (YoY)')

  const baseRevenue = findRow(baseModel.historicalModel, 'Revenue')
  const baseFcf = findRow(baseModel.historicalModel, 'Free cash flow')
  const baseRevAt = baseRevenue?.values[colIdx] ?? rev
  const baseFcfAt = baseFcf?.values[colIdx] ?? 0

  revenue.values[colIdx] = rev
  if (grossProfit) grossProfit.values[colIdx] = Math.round(rev * ratios.grossMargin)
  if (grossMargin) grossMargin.values[colIdx] = pctStr(ratios.grossMargin * 100)
  if (opIncome) opIncome.values[colIdx] = Math.round(rev * ratios.opMargin)
  if (opMargin) opMargin.values[colIdx] = pctStr(ratios.opMargin * 100)
  if (opex && grossProfit && opIncome) opex.values[colIdx] = grossProfit.values[colIdx] - opIncome.values[colIdx]
  if (netIncome) {
    const oi = opIncome?.values[colIdx] ?? 0
    netIncome.values[colIdx] = oi > 0 ? Math.round(oi * (1 - BASE_CASE_TAX_RATE)) : Math.round(oi)
  }
  if (eps && netIncome && shares) eps.values[colIdx] = (netIncome.values[colIdx] / shares.values[colIdx]).toFixed(2)
  if (shares) shares.values[colIdx] = ratios.shares

  if (fcf) {
    const fcfScale = baseRevAt > 0 ? rev / baseRevAt : 1
    fcf.values[colIdx] = Math.round(baseFcfAt * fcfScale)
  }

  if (cash?.values[colIdx] != null && cash.values[colIdx - 1] != null && fcf) {
    cash.values[colIdx] = Math.round(cash.values[colIdx - 1] + fcf.values[colIdx] * 0.35)
  }
  if (debt?.values[colIdx] != null && debt.values[colIdx - 1] != null) {
    debt.values[colIdx] = Math.round(debt.values[colIdx - 1] * 0.985)
  }

  if (revGrowth) {
    const yoyIdx = colIdx - 4
    revGrowth.values[colIdx] = growthYoYStr(rev, yoyIdx >= 0 ? revenue.values[yoyIdx] : null)
  }
  if (epsGrowth && eps) {
    const epsPriorIdx = colIdx - 4
    const epsNum = parseFloat(eps.values[colIdx])
    const epsPrior = epsPriorIdx >= 0 ? parseFloat(eps.values[epsPriorIdx]) : null
    epsGrowth.values[colIdx] = growthYoYStr(epsNum, epsPrior)
  }
}

function shortenDriverLabel(label) {
  return String(label ?? '')
    .replace(/\s+revenue$/i, '')
    .replace(/\s+\(\$M\)$/i, '')
    .replace(/\s+\(%\)$/i, '')
    .trim()
}

function fmtUsd(n, decimals = 2) {
  return `$${Number(n).toFixed(decimals)}`
}

function fmtUsdMillions(n) {
  return `$${Math.round(n).toLocaleString('en-US')}M`
}

function fmtPctSigned(n) {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
}

function fmtUsdBillions(millions) {
  return `$${(millions / 1000).toFixed(1)}B`
}

function computeMarketValuationView(model, liveMarketPrice, forecastColumnIndex) {
  const cfg = model.valuationConfig
  if (!cfg) return null

  const estFrom = model.estimateFromIndex
  const defaultIdx = model.quarters.length - 1
  const colIdx =
    forecastColumnIndex != null &&
    forecastColumnIndex >= estFrom &&
    forecastColumnIndex < model.quarters.length
      ? forecastColumnIndex
      : defaultIdx
  const forecastPeriod = model.quarters[colIdx]

  const eps = parseFloat(findRow(model.historicalModel, 'EPS ($)')?.values[colIdx] ?? '0')
  const revenue = findRow(model.historicalModel, 'Revenue')?.values[colIdx] ?? 0
  const opIncome = findRow(model.historicalModel, 'Operating income')?.values[colIdx] ?? 0
  const cash = findRow(model.historicalModel, 'Cash & equivalents')?.values[colIdx] ?? 0
  const debt = findRow(model.historicalModel, 'Total debt')?.values[colIdx] ?? 0
  const shares = findRow(model.historicalModel, 'Shares outstanding (M)')?.values[colIdx] ?? 404

  const marketPrice = liveMarketPrice != null && Number.isFinite(liveMarketPrice)
    ? liveMarketPrice
    : cfg.marketPrice
  const targetPe = cfg.targetPe
  const priceTarget = eps * targetPe
  const upsidePct = marketPrice > 0 ? ((priceTarget - marketPrice) / marketPrice) * 100 : 0

  const forecastMcap = priceTarget * shares
  const marketMcap = marketPrice * shares
  const forecastEv = forecastMcap + debt - cash
  const marketEv = marketMcap + debt - cash
  const ebitdaProxy = Math.max(Math.round(opIncome * 1.15), 1)
  const forecastEvEbitda = forecastEv / ebitdaProxy
  const marketEvEbitda = marketEv / ebitdaProxy
  const marketPe = eps > 0 ? marketPrice / eps : null

  const bridgeSegments = (cfg.bridgeDriverLabels ?? [])
    .map((label) => {
      const row = findRow(model.businessDrivers, label)
      if (!row) return null
      return shortenDriverLabel(label)
    })
    .filter(Boolean)

  const bridgeLabels = bridgeSegments.join(' × ')

  return {
    valuationMode: 'market',
    headline: {
      priceTargetFmt: fmtUsd(priceTarget),
      marketPriceFmt: fmtUsd(marketPrice),
      upsidePct: fmtPctSigned(upsidePct),
      upsideUp: upsidePct >= 0,
      forecastPeriod,
      targetPeFmt: `${targetPe.toFixed(1)}x`,
    },
    bridge: {
      formulaLine: `${bridgeLabels} → Revenue → EPS × P/E → Price`,
      valuesLine: `${fmtUsdMillions(revenue)} → ${fmtUsd(eps)} × ${targetPe.toFixed(1)}x → ${fmtUsd(priceTarget)}`,
    },
    details: {
      rows: [
        { label: 'Price per share', model: fmtUsd(priceTarget), market: fmtUsd(marketPrice) },
        {
          label: 'Forward P/E',
          model: `${targetPe.toFixed(1)}x`,
          market: marketPe != null ? `${marketPe.toFixed(1)}x` : '—',
        },
        { label: 'Market cap', model: fmtUsdBillions(forecastMcap), market: fmtUsdBillions(marketMcap) },
        { label: 'Enterprise value', model: fmtUsdBillions(forecastEv), market: fmtUsdBillions(marketEv) },
        {
          label: 'EV / EBITDA',
          model: `${forecastEvEbitda.toFixed(1)}x`,
          market: `${marketEvEbitda.toFixed(1)}x`,
        },
      ],
    },
  }
}

/** Price target and cross-checks derived from the live model grid. */
export function computeValuationView(model, liveMarketPrice = null, forecastColumnIndex = null) {
  return computeMarketValuationView(model, liveMarketPrice, forecastColumnIndex)
}

function applyMarketForecastOverrides(baseModel, overrides) {
  const estFrom = baseModel.estimateFromIndex
  const colCount = baseModel.quarters.length

  const businessDrivers = baseModel.businessDrivers.map((row) => {
    const rowOverrides = overrides[row.label] ?? {}
    const valuesCopy = [...row.values]
    for (let i = estFrom; i < colCount; i++) {
      if (rowOverrides[i] != null) valuesCopy[i] = Math.round(rowOverrides[i])
    }
    return { ...row, values: valuesCopy }
  })

  propagateDriverOverridesForward(businessDrivers, baseModel.businessDrivers, overrides, estFrom, colCount)

  const historicalModel = baseModel.historicalModel.map((r) => ({
    ...r,
    values: [...r.values],
  }))

  for (let i = estFrom; i < colCount; i++) {
    const rev = revenueFromDrivers(businessDrivers, baseModel, i)
    recalcEstimateColumn(historicalModel, baseModel, i, rev, forecastRatios(baseModel, i))
  }

  return { ...baseModel, historicalModel, businessDrivers }
}

/**
 * Driver overrides in green columns roll up to revenue; the financial model is derived.
 */
export function applyForecastOverrides(baseModel, overrides = {}) {
  if (!Object.keys(overrides).length) return baseModel
  return applyMarketForecastOverrides(baseModel, overrides)
}

export function parseAnalyseGridInput(raw) {
  const n = parseFloat(String(raw ?? '').replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : null
}

export function analyseMockModelForTicker(ticker) {
  const t = String(ticker ?? 'ASML').trim().toUpperCase()
  if (t === 'ASML') return ASML_MODEL
  const factor = 0.82 + (seedFromTicker(t) % 28) / 100
  return scaleModel(ASML_MODEL, factor)
}

export function formatAnalyseGridValue(v, row = null) {
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

const REVENUE_OVERLAY_QUARTERS_BY_RANGE = { '1M': 1, '3M': 1, '6M': 2, '1Y': 4, ALL: 8 }

/** Latest visible YoY revenue growth for chart line + legend tone. */
export function analyseRevenueOverlayMeta(overlay, priceRange = '6M') {
  const values = overlay?.values
  if (!Array.isArray(values) || !values.length) {
    return { tone: 'up', latestPct: null }
  }

  const take = REVENUE_OVERLAY_QUARTERS_BY_RANGE[priceRange] ?? values.length
  const numeric = values
    .slice(-Math.min(take, values.length))
    .map((v) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null))
    .filter((v) => v != null)
  if (!numeric.length) return { tone: 'up', latestPct: null }

  const latest = numeric.at(-1)
  return {
    tone: latest >= 0 ? 'up' : 'down',
    latestPct: `${latest >= 0 ? '+' : ''}${latest.toFixed(1)}%`,
  }
}
