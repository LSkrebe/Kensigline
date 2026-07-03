/**
 * Realistic offline daily close series for marketing / showcase terminals.
 * Geometric random walk scaled to ticker-specific spot prices (semis universe).
 */

import { MOCK_SEMIS_BY_TICKER } from './mockWeekData.js'

function seedFromTicker(ticker) {
  const t = String(ticker ?? '').toUpperCase()
  let s = 7
  for (let i = 0; i < t.length; i++) s = (s * 31 + t.charCodeAt(i)) % 10_000
  return s
}

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gaussian(rand) {
  return (rand() + rand() + rand() - 1.5) / Math.sqrt(1.5)
}

/** Spot-ish prices for mock semis (USD). */
export const SHOWCASE_SPOT_PRICES = {
  NVDA: 135.2,
  ASML: 748.5,
  TSM: 198.4,
  AMD: 162.3,
  LRCX: 82.6,
  AMAT: 178.9,
  MU: 98.7,
  AVGO: 178.4,
  KLAC: 72.8,
  INTC: 22.4,
  QCOM: 168.5,
  MRVL: 72.1,
}

/** Annualized drift + daily vol (fractions). */
const SHOWCASE_DYNAMICS = {
  NVDA: { annualReturn: 0.48, dailyVol: 0.026 },
  ASML: { annualReturn: 0.19, dailyVol: 0.017 },
  TSM: { annualReturn: 0.24, dailyVol: 0.015 },
  AMD: { annualReturn: 0.11, dailyVol: 0.024 },
  LRCX: { annualReturn: 0.16, dailyVol: 0.02 },
  AMAT: { annualReturn: 0.14, dailyVol: 0.019 },
  MU: { annualReturn: 0.22, dailyVol: 0.023 },
  AVGO: { annualReturn: 0.31, dailyVol: 0.018 },
  KLAC: { annualReturn: 0.13, dailyVol: 0.018 },
  INTC: { annualReturn: -0.08, dailyVol: 0.022 },
  QCOM: { annualReturn: 0.09, dailyVol: 0.016 },
  MRVL: { annualReturn: 0.17, dailyVol: 0.025 },
}

/**
 * ~16 months of trading-day closes ending at the ticker spot.
 * Includes earnings-style dips and recovery — no sine-wave artifacts.
 */
export function mockShowcasePriceSeries(ticker, points = 400) {
  const t = String(ticker ?? 'ASML').toUpperCase()
  const endPrice = SHOWCASE_SPOT_PRICES[t] ?? SHOWCASE_SPOT_PRICES.ASML
  const { annualReturn, dailyVol } = SHOWCASE_DYNAMICS[t] ?? SHOWCASE_DYNAMICS.ASML
  const rand = mulberry32(seedFromTicker(t) + 0x9e37)
  const mu = Math.log(1 + annualReturn) / 252

  const logReturns = []
  for (let i = 0; i < points - 1; i++) {
    let r = mu + dailyVol * gaussian(rand)
    // Quarterly earnings wobble (~63 trading days)
    const phase = i % 63
    if (phase === 0 && i > 0) r -= 0.018 + rand() * 0.022
    if (phase === 2) r += 0.012 + rand() * 0.016
    if (phase === 4) r += 0.006 + rand() * 0.01
    // Occasional macro risk-off
    if (i % 97 === 41) r -= 0.025 + rand() * 0.02
    logReturns.push(r)
  }

  const cum = [0]
  for (const r of logReturns) cum.push(cum[cum.length - 1] + r)

  const startLog = Math.log(endPrice) - cum[cum.length - 1]
  const out = cum.map((c) => Math.round(Math.exp(startLog + c) * 100) / 100)
  out[out.length - 1] = endPrice

  return out
}

export function showcaseSpotPrice(ticker) {
  const t = String(ticker ?? 'ASML').toUpperCase()
  return SHOWCASE_SPOT_PRICES[t] ?? SHOWCASE_SPOT_PRICES.ASML
}

export function showcaseCompanyName(ticker) {
  const t = String(ticker ?? 'ASML').toUpperCase()
  return MOCK_SEMIS_BY_TICKER[t]?.name ?? t
}
