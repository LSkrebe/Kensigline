/** Mock analyse / financial-model payload (offline showcase). */

import { showcaseSpotPrice } from './mockShowcasePrices.js'

export const HISTORICAL_QUARTERS = 6
export const ESTIMATE_QUARTERS = 4

function calendarQuarterFromDate(date = new Date()) {
  return {
    calYear: date.getFullYear(),
    calQuarter: Math.floor(date.getMonth() / 3) + 1,
  }
}

function retreatCalendarQuarter(calYear, calQuarter, steps = 1) {
  let y = calYear
  let q = calQuarter
  for (let i = 0; i < steps; i++) {
    q -= 1
    if (q < 1) {
      q = 4
      y -= 1
    }
  }
  return { calYear: y, calQuarter: q }
}

function advanceCalendarQuarter(calYear, calQuarter, steps = 1) {
  let y = calYear
  let q = calQuarter
  for (let i = 0; i < steps; i++) {
    q += 1
    if (q > 4) {
      q = 1
      y += 1
    }
  }
  return { calYear: y, calQuarter: q }
}

function labelForCalendarQuarter(calYear, calQuarter, estimate = false) {
  const yy = String(calYear % 100).padStart(2, '0')
  return `Q${calQuarter}'${yy}${estimate ? 'E' : ''}`
}

/** Six reported quarters through the last complete quarter, plus four forward. */
export function buildAnalyseQuarterWindow(asOf = new Date()) {
  const { calYear, calQuarter } = calendarQuarterFromDate(asOf)
  const lastHist = retreatCalendarQuarter(calYear, calQuarter, 1)
  const slots = []

  let y = lastHist.calYear
  let q = lastHist.calQuarter
  for (let i = 0; i < HISTORICAL_QUARTERS; i++) {
    slots.push({
      label: labelForCalendarQuarter(y, q, false),
      isEstimate: false,
    })
    const prev = retreatCalendarQuarter(y, q, 1)
    y = prev.calYear
    q = prev.calQuarter
  }
  slots.reverse()

  y = calYear
  q = calQuarter
  for (let i = 0; i < ESTIMATE_QUARTERS; i++) {
    slots.push({
      label: labelForCalendarQuarter(y, q, true),
      isEstimate: true,
    })
    const next = advanceCalendarQuarter(y, q, 1)
    y = next.calYear
    q = next.calQuarter
  }

  return slots
}

function buildAsmlMockModel(asOf = new Date()) {
  const window = buildAnalyseQuarterWindow(asOf)
  const quarters = window.map((s) => s.label)
  const estimateFromIndex = HISTORICAL_QUARTERS
  const colCount = quarters.length

  const revenue = []
  let rev = 5200
  for (let i = 0; i < HISTORICAL_QUARTERS; i++) {
    if (i > 0) rev = Math.round(rev * (1.012 + (i % 4) * 0.002))
    revenue.push(rev)
  }

  const yoyGrowths = []
  for (let i = 4; i < revenue.length; i++) {
    const prev = revenue[i - 4]
    if (prev > 0) yoyGrowths.push(((revenue[i] - prev) / prev) * 100)
  }
  const yoyPct = yoyGrowths.length
    ? yoyGrowths.reduce((a, b) => a + b, 0) / yoyGrowths.length
    : 6
  const refOffset = HISTORICAL_QUARTERS - 4
  for (let i = 0; i < ESTIMATE_QUARTERS; i++) {
    const base = revenue[refOffset + i] ?? revenue[revenue.length - 1]
    revenue.push(Math.round(base * (1 + yoyPct / 100)))
  }

  const grossProfit = revenue.map((r) => Math.round(r * 0.52))
  const opIncome = revenue.map((r) => Math.round(r * 0.27))
  const opex = grossProfit.map((g, i) => g - opIncome[i])
  const netIncome = opIncome.map((o) => Math.round(o * 0.77))
  const eps = netIncome.map((n) => (n / 404).toFixed(2))
  const shares = Array(colCount).fill(404)
  const cash = revenue.map((r, i) => 7200 + i * 180 + Math.round(r * 0.05))
  const debt = revenue.map((_, i) => 3200 - i * 35)
  const fcf = revenue.map((r) => Math.round(r * 0.12))

  const revGrowth = revenue.map((r, i) => growthYoYStr(r, i >= 4 ? revenue[i - 4] : null))
  const epsGrowth = eps.map((e, i) =>
    growthYoYStr(parseFloat(e), i >= 4 ? parseFloat(eps[i - 4]) : null),
  )

  const estLabels = quarters.slice(estimateFromIndex, estimateFromIndex + ESTIMATE_QUARTERS)
  const marketPrice = 748.5
  const ltmEpsSum = eps
    .slice(estimateFromIndex - 4, estimateFromIndex)
    .reduce((s, e) => s + parseFloat(e), 0)
  const targetPe = clampPe(marketPrice / ltmEpsSum)

  const histRev = revenue.slice(0, HISTORICAL_QUARTERS)
  const dashForward = (histValues) => [...histValues, ...Array(ESTIMATE_QUARTERS).fill('—')]

  return finalizeMockModel({
    currency: 'USD',
    unitNote: 'All financials in USD millions except per share data.',
    estimateFromIndex,
    quarters,
    historicalModel: [
      { label: 'Revenue', values: revenue },
      { label: 'Gross profit', values: grossProfit },
      { label: 'Gross margin', values: revenue.map(() => '52.0%'), kind: 'pct' },
      { label: 'Operating expenses', values: opex },
      { label: 'Operating income', values: opIncome },
      { label: 'Operating margin', values: revenue.map(() => '27.0%'), kind: 'pct' },
      { label: 'Net income', values: netIncome },
      { label: 'EPS ($)', values: eps, kind: 'eps' },
      { label: 'Shares outstanding (M)', values: shares },
      { label: 'Cash & equivalents', values: cash },
      { label: 'Total debt', values: debt },
      { label: 'Free cash flow', values: fcf },
      { label: 'Revenue growth (YoY)', values: revGrowth, kind: 'growth' },
      { label: 'EPS growth (YoY)', values: epsGrowth, kind: 'growth' },
    ],
    businessDrivers: [
      {
        label: 'EUV revenue',
        driverKind: 'revenue',
        rollsUpToRevenue: true,
        readOnly: true,
        values: dashForward(histRev.map((r) => Math.round(r * 0.42))),
      },
      {
        label: 'DUV revenue',
        driverKind: 'revenue',
        rollsUpToRevenue: true,
        readOnly: true,
        values: dashForward(histRev.map((r) => Math.round(r * 0.35))),
      },
      {
        label: 'Immersion revenue',
        driverKind: 'revenue',
        rollsUpToRevenue: true,
        readOnly: true,
        values: dashForward(histRev.map((r) => Math.round(r * 0.18))),
      },
      {
        label: 'Installed base (units)',
        driverKind: 'units',
        rollsUpToRevenue: false,
        readOnly: true,
        values: dashForward(histRev.map((_, i) => (i === HISTORICAL_QUARTERS - 1 ? 1200 + i * 25 : '—'))),
      },
    ],
    valuationConfig: {
      targetPe,
      marketPrice,
      marketCapBillions: 302.4,
      enterpriseValueBillions: 294.8,
      bridgeDriverLabels: ['EUV revenue', 'DUV revenue', 'Immersion revenue'],
      ntmEps: null,
      ltmEps: null,
      priceTarget: null,
      valuationBasis: 'ntm',
      defaultColumnIndex: estimateFromIndex,
      valuationPeriodLabel:
        estLabels.length >= 2
          ? `NTM (${estLabels[0]}–${estLabels[estLabels.length - 1]})`
          : 'NTM',
      valuationAvailable: true,
    },
    projectionNote:
      'Reported SEC history; forward revenue and gross margin are editable — other lines derived with flat opex.',
    driverUnitHint: 'From filings — historical quarters only',
  })
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
  if (row.kind === 'pct' || row.kind === 'growth' || row.kind === 'runway') return row
  if (row.kind === 'eps') {
    return {
      ...row,
      values: row.values.map((v) => {
        const n = parseFloat(String(v ?? ''))
        return Number.isFinite(n) ? (Math.round(n * factor * 100) / 100).toFixed(2) : v
      }),
    }
  }
  if (row.readOnly || row.driverKind === 'enrollment' || row.driverKind === 'pos_pct') return row
  return {
    ...row,
    values: row.values.map((v) => (typeof v === 'number' ? scaleNum(v, factor) : v)),
  }
}

function clampPe(pe) {
  if (!Number.isFinite(pe)) return 20
  return Math.max(5, Math.min(80, Math.round(pe * 10) / 10))
}

function parseEpsAt(model, colIdx) {
  const raw = findRow(model.historicalModel, 'EPS ($)')?.values[colIdx]
  const n = parseFloat(String(raw ?? ''))
  return Number.isFinite(n) ? n : null
}

function sumOpIncomeRange(model, start, end) {
  const row = findRow(model.historicalModel, 'Operating income')
  if (!row || end <= start) return null
  let sum = 0
  for (let i = start; i < end && i < row.values.length; i++) {
    const v = Number(row.values[i])
    if (!Number.isFinite(v)) return null
    sum += v
  }
  return sum
}

function numAt(model, label, colIdx, fallback = 0) {
  const v = Number(findRow(model.historicalModel, label)?.values[colIdx])
  return Number.isFinite(v) ? v : fallback
}

/**
 * Quarter-aware valuation: model column follows selected estimate quarter;
 * market column stays on spot + LTM. Price uses NTM on first estimate col,
 * otherwise annualized quarter EPS (×4) × LTM P/E — not raw Q EPS × P/E.
 */
function valuationForQuarter(model, colIdx, marketPriceOverride = null) {
  const cfg = model.valuationConfig ?? {}
  const estFrom = model.estimateFromIndex
  const ntmStart = cfg.defaultColumnIndex ?? estFrom
  const ntmEnd = Math.min(ntmStart + ESTIMATE_QUARTERS, model.quarters.length)
  const histCol = Math.max(0, estFrom - 1)

  const ntmEps = sumEpsRange(model, ntmStart, ntmEnd)
  const ltmEps = sumEpsRange(model, Math.max(0, estFrom - 4), estFrom)
  const quarterEps = parseEpsAt(model, colIdx)

  const marketPrice =
    marketPriceOverride != null && Number.isFinite(marketPriceOverride)
      ? marketPriceOverride
      : cfg.marketPrice

  const targetPe =
    ltmEps != null && ltmEps > 0 && marketPrice != null && marketPrice > 0
      ? clampPe(marketPrice / ltmEps)
      : clampPe(cfg.targetPe ?? 20)

  const useNtm = colIdx === ntmStart && ntmEps != null && ntmEps > 0
  const annualizedQuarterEps =
    quarterEps != null && quarterEps > 0 ? Math.round(quarterEps * 4 * 100) / 100 : null
  const valuationEps = useNtm ? ntmEps : annualizedQuarterEps ?? ntmEps
  const earningsLabel = useNtm ? 'NTM EPS' : 'Ann. EPS'

  const valuationAvailable =
    valuationEps != null && valuationEps > 0 && marketPrice != null && marketPrice > 0
  const priceTarget =
    valuationAvailable && valuationEps != null
      ? Math.round(valuationEps * targetPe * 100) / 100
      : null

  const revenue = numAt(model, 'Revenue', colIdx)
  const opIncome = numAt(model, 'Operating income', colIdx)
  const cash = numAt(model, 'Cash & equivalents', colIdx)
  const debt = numAt(model, 'Total debt', colIdx)
  const shares = numAt(model, 'Shares outstanding (M)', colIdx, 404)

  const marketShares = numAt(model, 'Shares outstanding (M)', histCol, shares)
  const marketCash = numAt(model, 'Cash & equivalents', histCol, cash)
  const marketDebt = numAt(model, 'Total debt', histCol, debt)
  const ltmOpIncome = sumOpIncomeRange(model, Math.max(0, estFrom - 4), estFrom)

  const marketMcap = marketPrice * marketShares
  const marketEv = marketMcap + marketDebt - marketCash
  const marketEbitda = Math.max((ltmOpIncome ?? opIncome) * 1.15, 1)
  const marketEvEbitda = marketEv / marketEbitda
  const marketPe = ltmEps != null && ltmEps > 0 ? marketPrice / ltmEps : null

  const modelMcap = priceTarget != null ? priceTarget * shares : null
  const modelEv = modelMcap != null ? modelMcap + debt - cash : null
  const modelEbitda = Math.max(opIncome * 4 * 1.15, 1)
  const modelEvEbitda = modelEv != null ? modelEv / modelEbitda : null
  const modelPe =
    valuationEps != null && valuationEps > 0 && priceTarget != null
      ? priceTarget / valuationEps
      : targetPe

  return {
    ntmEps,
    ltmEps,
    quarterEps,
    valuationEps,
    earningsLabel,
    targetPe,
    modelPe,
    marketPrice,
    priceTarget,
    valuationAvailable,
    revenue,
    opIncome,
    shares,
    forecastPeriod: model.quarters[colIdx],
    marketMcap,
    marketEv,
    marketEvEbitda,
    marketPe,
    modelMcap,
    modelEv,
    modelEvEbitda,
  }
}

/** Keep valuation config aligned with NTM anchor (first estimate column). */
function valuationMetricsFromModel(model, marketPriceOverride = null) {
  const cfg = model.valuationConfig ?? {}
  const ntmStart = cfg.defaultColumnIndex ?? model.estimateFromIndex
  const v = valuationForQuarter(model, ntmStart, marketPriceOverride)
  const ntmEnd = Math.min(ntmStart + ESTIMATE_QUARTERS, model.quarters.length)
  const estLabels = model.quarters.slice(ntmStart, ntmEnd)
  return {
    ntmStart,
    ntmEnd,
    ntmEps: v.ntmEps != null ? Math.round(v.ntmEps * 100) / 100 : null,
    ltmEps: v.ltmEps != null ? Math.round(v.ltmEps * 100) / 100 : null,
    targetPe: v.targetPe,
    marketPrice: v.marketPrice,
    priceTarget: v.priceTarget,
    valuationAvailable: v.valuationAvailable,
    valuationPeriodLabel:
      estLabels.length >= 2
        ? `NTM (${estLabels[0]}–${estLabels[estLabels.length - 1]})`
        : 'NTM',
  }
}

function finalizeMockModel(model, marketPriceOverride = null) {
  const metrics = valuationMetricsFromModel(model, marketPriceOverride)
  const shares =
    findRow(model.historicalModel, 'Shares outstanding (M)')?.values[model.estimateFromIndex - 1] ?? 404
  const mcapB =
    metrics.marketPrice != null && shares > 0 ? (metrics.marketPrice * shares) / 1000 : null
  return {
    ...model,
    valuationConfig: {
      ...model.valuationConfig,
      targetPe: metrics.targetPe,
      marketPrice:
        metrics.marketPrice != null ? Math.round(metrics.marketPrice * 100) / 100 : null,
      marketCapBillions: mcapB != null ? Math.round(mcapB * 10) / 10 : null,
      enterpriseValueBillions: mcapB != null ? Math.round(mcapB * 0.95 * 10) / 10 : null,
      ntmEps: metrics.ntmEps,
      ltmEps: metrics.ltmEps,
      priceTarget: metrics.priceTarget,
      valuationBasis: 'ntm',
      defaultColumnIndex: metrics.ntmStart,
      valuationPeriodLabel: metrics.valuationPeriodLabel,
      valuationAvailable: metrics.valuationAvailable,
    },
  }
}

function scaleModel(base, factor) {
  const scaled = {
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
  return finalizeMockModel(scaled)
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

export function isForecastEditablePnlRow(row) {
  return row?.label === 'Revenue' || row?.label === 'Gross margin'
}

/** @deprecated Drivers are historical-only; use isForecastEditablePnlRow. */
export function isForecastEditableDriver() {
  return false
}

const BASE_CASE_TAX_RATE = 0.23
const BASE_CASE_HIST_GROSS_MARGIN = 0.52

function forecastRatios(baseModel, colIdx) {
  const anchor = baseModel.estimateFromIndex - 1
  const rev = findRow(baseModel.historicalModel, 'Revenue')?.values[anchor] ?? 1
  const grossProfit = findRow(baseModel.historicalModel, 'Gross profit')?.values[anchor] ?? 0
  const opIncome = findRow(baseModel.historicalModel, 'Operating income')?.values[anchor] ?? 0
  const shares = findRow(baseModel.historicalModel, 'Shares outstanding (M)')?.values[anchor] ?? 404
  const anchorGm = rev > 0 ? grossProfit / rev : BASE_CASE_HIST_GROSS_MARGIN
  const grossMargin = anchorGm
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

function sumEpsRange(model, start, end) {
  const epsRow = findRow(model.historicalModel, 'EPS ($)')
  if (!epsRow || end <= start) return null
  let sum = 0
  let count = 0
  for (let i = start; i < end && i < epsRow.values.length; i++) {
    const e = parseFloat(String(epsRow.values[i] ?? ''))
    if (!Number.isFinite(e)) return null
    sum += e
    count++
  }
  return count > 0 ? sum : null
}

function applyScenarioToModel(model, scenario) {
  if (!model || scenario === 'base') return model
  const estFrom = model.estimateFromIndex
  const colCount = model.quarters.length
  const revMult = scenario === 'bull' ? 1.05 : 0.95
  const marginBps = scenario === 'bull' ? 0.01 : -0.01

  const historicalModel = model.historicalModel.map((r) => ({ ...r, values: [...r.values] }))
  const businessDrivers = model.businessDrivers.map((r) => ({ ...r, values: [...r.values] }))

  for (let i = estFrom; i < colCount; i++) {
    const rev = findRow(historicalModel, 'Revenue')
    const ratios = forecastRatios(model, i)
    const adjustedRatios = {
      ...ratios,
      grossMargin: Math.max(0.05, Math.min(0.9, ratios.grossMargin + marginBps)),
      opMargin: Math.max(0.02, Math.min(0.85, ratios.opMargin + marginBps)),
      netMargin: Math.max(0.01, Math.min(0.8, ratios.netMargin + marginBps * (1 - BASE_CASE_TAX_RATE))),
    }
    const baseRev = rev?.values[i]
    const newRev = typeof baseRev === 'number' ? Math.round(baseRev * revMult) : baseRev
    if (typeof newRev === 'number') {
      recalcEstimateColumn(historicalModel, model, i, newRev, adjustedRatios)
    }
  }

  return { ...model, historicalModel, businessDrivers }
}

function computeMarketValuationView(model, liveMarketPrice, forecastColumnIndex) {
  const cfg = model.valuationConfig
  if (!cfg) return null

  const estFrom = model.estimateFromIndex
  const ntmStart = cfg.defaultColumnIndex ?? estFrom
  const colIdx =
    forecastColumnIndex != null &&
    forecastColumnIndex >= estFrom &&
    forecastColumnIndex < model.quarters.length
      ? forecastColumnIndex
      : ntmStart

  const v = valuationForQuarter(model, colIdx, liveMarketPrice ?? cfg.marketPrice)
  const upsidePct =
    v.priceTarget != null && v.marketPrice > 0
      ? ((v.priceTarget - v.marketPrice) / v.marketPrice) * 100
      : null

  const peLabel = v.earningsLabel === 'NTM EPS' ? 'NTM P/E' : 'Ann. P/E'

  return {
    valuationMode: 'market',
    headline: {
      priceTargetFmt: v.priceTarget != null ? fmtUsd(v.priceTarget) : 'N/M',
      marketPriceFmt: fmtUsd(v.marketPrice),
      upsidePct: upsidePct != null ? fmtPctSigned(upsidePct) : '—',
      upsideUp: upsidePct != null ? upsidePct >= 0 : false,
      forecastPeriod: v.forecastPeriod,
      targetPeFmt: `${v.targetPe.toFixed(1)}x`,
      valuationAvailable: v.valuationAvailable,
    },
    bridge: {
      formulaLine: `Revenue → ${v.earningsLabel} × P/E → Price`,
      valuesLine:
        v.priceTarget != null && v.valuationEps != null
          ? `${fmtUsdMillions(v.revenue)} · ${fmtUsd(v.valuationEps)} ${v.earningsLabel} × ${v.targetPe.toFixed(1)}x → ${fmtUsd(v.priceTarget)}`
          : `${fmtUsdMillions(v.revenue)} → ${v.earningsLabel} n/a`,
    },
    details: {
      rows: [
        {
          label: 'Price per share',
          model: v.priceTarget != null ? fmtUsd(v.priceTarget) : 'N/M',
          market: fmtUsd(v.marketPrice),
        },
        {
          label: peLabel,
          model: `${v.modelPe.toFixed(1)}x`,
          market: v.marketPe != null ? `${v.marketPe.toFixed(1)}x` : '—',
        },
        {
          label: v.earningsLabel,
          model: v.valuationEps != null ? fmtUsd(v.valuationEps) : '—',
          market: v.ltmEps != null ? `${fmtUsd(v.ltmEps)} LTM` : '—',
        },
        {
          label: 'Market cap',
          model: v.modelMcap != null ? fmtUsdBillions(v.modelMcap) : '—',
          market: fmtUsdBillions(v.marketMcap),
        },
        {
          label: 'Enterprise value',
          model: v.modelEv != null ? fmtUsdBillions(v.modelEv) : '—',
          market: fmtUsdBillions(v.marketEv),
        },
        {
          label: 'EV / EBITDA',
          model: v.modelEvEbitda != null ? `${v.modelEvEbitda.toFixed(1)}x` : '—',
          market: `${v.marketEvEbitda.toFixed(1)}x`,
        },
      ],
    },
  }
}

/** Price target and cross-checks derived from the live model grid. */
export function computeValuationView(model, liveMarketPrice = null, forecastColumnIndex = null) {
  return computeMarketValuationView(model, liveMarketPrice, forecastColumnIndex)
}

export function applyScenario(model, scenario = 'base') {
  return applyScenarioToModel(model, scenario)
}

function marginPctFromCell(value) {
  if (typeof value === 'number') return value
  return parseAnalyseMarginInput(value)
}

function applyPnlForecastOverrides(baseModel, overrides) {
  const estFrom = baseModel.estimateFromIndex
  const colCount = baseModel.quarters.length
  const revenueOverrides = overrides.Revenue ?? {}
  const marginOverrides = overrides['Gross margin'] ?? {}

  const historicalModel = baseModel.historicalModel.map((r) => ({
    ...r,
    values: [...r.values],
  }))

  for (let i = estFrom; i < colCount; i++) {
    const revOverride = revenueOverrides[i]
    const gmOverride = marginOverrides[i]
    if (revOverride == null && gmOverride == null) continue

    const baseRev = findRow(baseModel.historicalModel, 'Revenue')?.values[i]
    const rev =
      revOverride != null && revOverride > 0
        ? Math.round(revOverride)
        : Number(findRow(historicalModel, 'Revenue')?.values[i] ?? baseRev)
    if (!Number.isFinite(rev) || rev <= 0) continue

    const ratios = forecastRatios(baseModel, i)
    if (gmOverride != null && gmOverride > 0 && gmOverride <= 100) {
      ratios.grossMargin = gmOverride / 100
    } else {
      const gmCell = findRow(historicalModel, 'Gross margin')?.values[i]
      const parsed = marginPctFromCell(gmCell)
      if (parsed != null && parsed > 0) ratios.grossMargin = parsed / 100
    }
    ratios.netMargin = ratios.opMargin * (1 - BASE_CASE_TAX_RATE)

    recalcEstimateColumn(historicalModel, baseModel, i, rev, ratios)
  }

  return { ...baseModel, historicalModel }
}

/**
 * Forward revenue / gross margin edits recalc the P&L column; drivers stay independent.
 */
export function applyForecastOverrides(baseModel, overrides = {}) {
  if (!Object.keys(overrides).length) return baseModel
  return applyPnlForecastOverrides(baseModel, overrides)
}

export function parseAnalyseMarginInput(raw) {
  const n = parseFloat(String(raw ?? '').replace(/%/g, '').replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : null
}

export function parseAnalyseCellInput(row, raw) {
  if (row?.kind === 'pct' || row?.label === 'Gross margin') return parseAnalyseMarginInput(raw)
  return parseAnalyseGridInput(raw)
}

export function isValidAnalyseCellInput(row, n) {
  if (n == null || !Number.isFinite(n)) return false
  if (row?.kind === 'pct' || row?.label === 'Gross margin') return n > 0 && n <= 100
  return n > 0
}

export function analyseCellOverrideModified(row, baseVal, override) {
  if (override == null) return false
  if (row?.kind === 'pct' || row?.label === 'Gross margin') {
    const basePct = marginPctFromCell(baseVal)
    return basePct == null || Math.abs(basePct - override) >= 0.05
  }
  return baseVal !== override
}

export function parseAnalyseGridInput(raw) {
  const n = parseFloat(String(raw ?? '').replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : null
}

export function analyseMockModelForTicker(ticker) {
  const t = String(ticker ?? 'ASML').trim().toUpperCase()
  const base = buildAsmlMockModel()
  if (t === 'ASML') return finalizeMockModel(base, showcaseSpotPrice('ASML'))
  const asmlSpot = showcaseSpotPrice('ASML')
  const spot = showcaseSpotPrice(t)
  const factor = asmlSpot > 0 ? spot / asmlSpot : 1
  return finalizeMockModel(scaleModel(base, factor), spot)
}

/** Recompute headline valuation from grid + optional live spot (after scenario edits). */
export function refreshModelValuation(model, liveMarketPrice = null) {
  return finalizeMockModel(model, liveMarketPrice)
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
