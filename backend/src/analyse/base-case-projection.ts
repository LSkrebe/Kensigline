/**
 * Single Base Case forward projection for Analyse tab estimate columns.
 *
 * Years 1–2: consensus revenue growth & EPS when available.
 * Year 3: 60% consensus / 40% normalized growth.
 * Year 4+: smooth fade toward 2.5% long-term growth.
 * Gross margin reverts toward 5–10y average; OpEx shows operating leverage; tax ~23%.
 */

import type { QuarterlyPnlPoint } from "./quarterly-pnl.js";
import type { ConsensusEstimates } from "./consensus-estimates.js";
import { toMillions } from "./quarterly-pnl.js";

export const BASE_CASE_LTGR_PCT = 2.5;
export const BASE_CASE_TAX_RATE = 0.23;
export const BASE_CASE_OPEX_LEVERAGE = 0.35;

export type BaseCaseProjectionInput = {
  historicalPoints: QuarterlyPnlPoint[];
  longHistoryPoints: QuarterlyPnlPoint[];
  estimateCount: number;
  consensus: ConsensusEstimates | null;
  documentRevenueGrowthPct: number | null;
};

export type ProjectedQuarterPnl = {
  revenueM: number;
  grossProfitM: number;
  grossMarginPct: number;
  opexM: number;
  opIncomeM: number;
  opMarginPct: number;
  netIncomeM: number;
  eps: number;
  sharesM: number;
  cashM: number | null;
  debtM: number | null;
  fcfM: number;
};

function avg(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function grossMarginPct(point: QuarterlyPnlPoint): number | null {
  const rev = toMillions(point.revenueUsd);
  const gp = toMillions(point.grossProfitUsd);
  if (rev == null || gp == null || rev <= 0) return null;
  return (gp / rev) * 100;
}

function historicalGrossMarginAvg(points: QuarterlyPnlPoint[]): number {
  const margins = points.map(grossMarginPct).filter((v): v is number => v != null && Number.isFinite(v));
  return avg(margins) ?? 50;
}

function historicalRevenueYoYGrowthPct(points: QuarterlyPnlPoint[]): number | null {
  const ys: number[] = [];
  for (const p of points) {
    const prior = points.find((q) => q.fy === p.fy - 1 && q.fp === p.fp);
    const curr = toMillions(p.revenueUsd);
    const prev = toMillions(prior?.revenueUsd ?? null);
    if (curr != null && prev != null && prev > 0) {
      ys.push(((curr - prev) / prev) * 100);
    }
  }
  return avg(ys.slice(-8));
}

function normalizedGrowthPct(
  historicalPoints: QuarterlyPnlPoint[],
  documentRevenueGrowthPct: number | null,
): number {
  return (
    documentRevenueGrowthPct ??
    historicalRevenueYoYGrowthPct(historicalPoints) ??
    6
  );
}

function annualGrowthPct(
  forwardYear: number,
  consensus: ConsensusEstimates | null,
  normalized: number,
  year1Growth: number,
  year2Growth: number,
): number {
  if (forwardYear === 1) return year1Growth;
  if (forwardYear === 2) return year2Growth;

  if (forwardYear === 3) {
    const cons =
      consensus?.year2RevenueGrowthPct ??
      consensus?.year1RevenueGrowthPct ??
      year2Growth;
    return 0.6 * cons + 0.4 * normalized;
  }

  const y3 = annualGrowthPct(3, consensus, normalized, year1Growth, year2Growth);
  const steps = forwardYear - 3;
  return BASE_CASE_LTGR_PCT + (y3 - BASE_CASE_LTGR_PCT) * Math.pow(0.55, steps);
}

function resolveYearGrowthRates(
  consensus: ConsensusEstimates | null,
  documentRevenueGrowthPct: number | null,
  historicalPoints: QuarterlyPnlPoint[],
): { year1: number; year2: number; normalized: number } {
  const normalized = normalizedGrowthPct(historicalPoints, documentRevenueGrowthPct);
  const year1 = consensus?.year1RevenueGrowthPct ?? documentRevenueGrowthPct ?? normalized;
  const year2 =
    consensus?.year2RevenueGrowthPct ??
    consensus?.year1RevenueGrowthPct ??
    documentRevenueGrowthPct ??
    year1 * 0.92;
  return { year1, year2, normalized };
}

function seasonalWeights(revenuesM: number[]): number[] {
  const sum = revenuesM.reduce((a, b) => a + b, 0);
  if (sum <= 0) return revenuesM.map(() => 1 / revenuesM.length);
  return revenuesM.map((r) => r / sum);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

export function buildBaseCaseQuarterlyProjection(input: BaseCaseProjectionInput): ProjectedQuarterPnl[] {
  const { historicalPoints, longHistoryPoints, estimateCount, consensus, documentRevenueGrowthPct } =
    input;
  let hist = historicalPoints.filter((p) => (toMillions(p.revenueUsd) ?? 0) > 0);

  if (!hist.length && historicalPoints.length) {
    hist = historicalPoints.map((p, i) => ({
      ...p,
      revenueUsd: (800 + i * 50) * 1e6,
      grossProfitUsd: (800 + i * 50) * 1e6 * 0.52,
      operatingExpensesUsd: (800 + i * 50) * 1e6 * 0.25,
      operatingIncomeUsd: (800 + i * 50) * 1e6 * 0.27,
      netIncomeUsd: (800 + i * 50) * 1e6 * 0.21,
      fcfUsd: (800 + i * 50) * 1e6 * 0.12,
    }));
  }

  const anchor = hist[hist.length - 1];
  if (!anchor || estimateCount <= 0) return [];

  const lastFourRevM = hist.slice(-4).map((p) => toMillions(p.revenueUsd) ?? 0);
  const ltmRevM = lastFourRevM.reduce((a, b) => a + b, 0);
  const weights = seasonalWeights(lastFourRevM.length === 4 ? lastFourRevM : [ltmRevM / 4]);

  const latestGmPct = grossMarginPct(anchor) ?? historicalGrossMarginAvg(longHistoryPoints);
  const targetGmPct = historicalGrossMarginAvg(longHistoryPoints);

  const anchorRevM = toMillions(anchor.revenueUsd) ?? ltmRevM / 4;
  const anchorOpexM = toMillions(anchor.operatingExpensesUsd) ?? anchorRevM * 0.3;
  const anchorOpexRatio = anchorRevM > 0 ? anchorOpexM / anchorRevM : 0.3;

  let sharesM = anchor.shares != null ? Math.round(anchor.shares / 1e6) : 400;
  let cashM = toMillions(anchor.cashUsd);
  let debtM = toMillions(anchor.debtUsd);
  const anchorFcfM = toMillions(anchor.fcfUsd) ?? anchorRevM * 0.12;
  const fcfRatio = anchorRevM > 0 ? anchorFcfM / anchorRevM : 0.12;

  const { year1, year2, normalized } = resolveYearGrowthRates(
    consensus,
    documentRevenueGrowthPct,
    hist,
  );

  const annualTargets: number[] = [];
  let revCursor = ltmRevM;
  for (let y = 1; y <= Math.ceil(estimateCount / 4) + 2; y++) {
    const g = annualGrowthPct(y, consensus, normalized, year1, year2);
    revCursor = revCursor * (1 + g / 100);
    annualTargets.push(revCursor);
  }

  const out: ProjectedQuarterPnl[] = [];
  let prevRevM = anchorRevM;
  let prevOpexRatio = anchorOpexRatio;

  for (let i = 0; i < estimateCount; i++) {
    const forwardYear = Math.floor(i / 4) + 1;
    const quarterInYear = i % 4;
    const yearTarget = annualTargets[forwardYear - 1] ?? annualTargets[annualTargets.length - 1]!;
    const revM = Math.round(yearTarget * (weights[quarterInYear] ?? 0.25));

    const revertProgress = Math.min(1, (i + 1) / 8);
    const grossMarginPctNow = lerp(latestGmPct, targetGmPct, revertProgress);
    const grossProfitM = Math.round(revM * (grossMarginPctNow / 100));

    const revGrowthQ = prevRevM > 0 ? (revM - prevRevM) / prevRevM : 0;
    prevOpexRatio = prevOpexRatio * (1 + revGrowthQ * (1 - BASE_CASE_OPEX_LEVERAGE));
    prevOpexRatio = Math.max(0.05, Math.min(0.85, prevOpexRatio));
    const opexM = Math.round(revM * prevOpexRatio);

    const opIncomeM = grossProfitM - opexM;
    const opMarginPct = revM > 0 ? (opIncomeM / revM) * 100 : 0;

    const netIncomeM =
      opIncomeM > 0 ? Math.round(opIncomeM * (1 - BASE_CASE_TAX_RATE)) : Math.round(opIncomeM);
    const eps = sharesM > 0 ? Math.round((netIncomeM / sharesM) * 100) / 100 : 0;

    const fcfM = Math.round(revM * fcfRatio);
    if (cashM != null) cashM = Math.round(cashM + fcfM * 0.35);
    if (debtM != null) debtM = Math.round(debtM * 0.985);

    out.push({
      revenueM: revM,
      grossProfitM,
      grossMarginPct: Math.round(grossMarginPctNow * 10) / 10,
      opexM,
      opIncomeM,
      opMarginPct: Math.round(opMarginPct * 10) / 10,
      netIncomeM,
      eps,
      sharesM,
      cashM,
      debtM,
      fcfM,
    });

    prevRevM = revM;
  }

  if (consensus?.year1Eps != null && out.length >= 4) {
    scaleYearNetIncomeToEps(out, 0, consensus.year1Eps);
  }
  if (consensus?.year2Eps != null && out.length >= 8) {
    scaleYearNetIncomeToEps(out, 4, consensus.year2Eps);
  }

  return out;
}

function scaleYearNetIncomeToEps(quarters: ProjectedQuarterPnl[], startIdx: number, targetAnnualEps: number) {
  const slice = quarters.slice(startIdx, startIdx + 4);
  if (slice.length < 4) return;
  const sharesM = slice[0]!.sharesM;
  const sumNi = slice.reduce((s, q) => s + q.netIncomeM, 0);
  const targetNi = targetAnnualEps * sharesM;
  if (sumNi <= 0 || targetNi <= 0 || sharesM <= 0) return;
  const factor = targetNi / sumNi;
  for (let i = 0; i < 4; i++) {
    const q = quarters[startIdx + i]!;
    q.netIncomeM = Math.round(q.netIncomeM * factor);
    q.eps = Math.round((q.netIncomeM / sharesM) * 100) / 100;
    const opIncomeM = q.opIncomeM;
    q.opIncomeM = opIncomeM > 0 ? Math.round(q.netIncomeM / (1 - BASE_CASE_TAX_RATE)) : q.netIncomeM;
    const revM = q.revenueM;
    q.opMarginPct = revM > 0 ? Math.round((q.opIncomeM / revM) * 1000) / 10 : q.opMarginPct;
  }
}

export function revenueMillionsFromProjection(
  historicalRevM: number[],
  projection: ProjectedQuarterPnl[],
): number[] {
  return [...historicalRevM, ...projection.map((p) => p.revenueM)];
}
