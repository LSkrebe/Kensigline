/**
 * Annual-first Base Case forward projection for Analyse estimate columns.
 *
 * 1. Project fiscal-year revenue, margins, and OpEx (consensus Y1–Y2 when available).
 * 2. Split each year to quarters using long-run fiscal-quarter seasonality.
 * 3. Avoid quarter-over-quarter OpEx spirals that break seasonal businesses.
 */

import type { QuarterlyPnlPoint } from "./quarterly-pnl.js";
import type { ConsensusEstimates } from "./consensus-estimates.js";
import { toMillions } from "./quarterly-pnl.js";

export const BASE_CASE_LTGR_PCT = 2.5;
export const BASE_CASE_TAX_RATE = 0.23;
export const BASE_CASE_OPEX_LEVERAGE = 0.35;
export const GROWTH_PCT_MIN = -30;
export const GROWTH_PCT_MAX = 50;

const QUARTER_ORDER = ["Q1", "Q2", "Q3", "Q4"] as const;

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

type YearPnl = {
  revenueM: number;
  grossMarginPct: number;
  opexRatio: number;
  grossProfitM: number;
  opexM: number;
  opIncomeM: number;
  netIncomeM: number;
};

function avg(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function clampGrowthPct(n: number): number {
  if (!Number.isFinite(n)) return 6;
  return Math.max(GROWTH_PCT_MIN, Math.min(GROWTH_PCT_MAX, n));
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
  const raw = avg(ys.slice(-8));
  return raw != null ? clampGrowthPct(raw) : null;
}

function normalizedGrowthPct(
  historicalPoints: QuarterlyPnlPoint[],
  documentRevenueGrowthPct: number | null,
): number {
  const doc =
    documentRevenueGrowthPct != null ? clampGrowthPct(documentRevenueGrowthPct) : null;
  return doc ?? historicalRevenueYoYGrowthPct(historicalPoints) ?? 6;
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
    return clampGrowthPct(0.6 * cons + 0.4 * normalized);
  }

  const y3 = annualGrowthPct(3, consensus, normalized, year1Growth, year2Growth);
  const steps = forwardYear - 3;
  return clampGrowthPct(BASE_CASE_LTGR_PCT + (y3 - BASE_CASE_LTGR_PCT) * Math.pow(0.55, steps));
}

function resolveYearGrowthRates(
  consensus: ConsensusEstimates | null,
  documentRevenueGrowthPct: number | null,
  historicalPoints: QuarterlyPnlPoint[],
): { year1: number; year2: number; normalized: number } {
  const normalized = normalizedGrowthPct(historicalPoints, documentRevenueGrowthPct);
  const year1 = clampGrowthPct(
    consensus?.year1RevenueGrowthPct ?? documentRevenueGrowthPct ?? normalized,
  );
  const year2 = clampGrowthPct(
    consensus?.year2RevenueGrowthPct ??
      consensus?.year1RevenueGrowthPct ??
      documentRevenueGrowthPct ??
      year1 * 0.92,
  );
  return { year1, year2, normalized };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function fpAtOffset(anchorFp: string, offset: number): string {
  let idx = QUARTER_ORDER.indexOf(anchorFp.toUpperCase() as (typeof QUARTER_ORDER)[number]);
  if (idx < 0) idx = 0;
  return QUARTER_ORDER[(idx + offset) % 4]!;
}

/** Fiscal-quarter revenue weights from long history; blend toward equal when extreme. */
export function fiscalQuarterWeights(points: QuarterlyPnlPoint[]): Map<string, number> {
  const byFp: Record<string, number[]> = { Q1: [], Q2: [], Q3: [], Q4: [] };
  for (const p of points) {
    const rev = toMillions(p.revenueUsd);
    if (rev != null && rev > 0 && byFp[p.fp]) byFp[p.fp]!.push(rev);
  }

  const avgs = QUARTER_ORDER.map((fp) => avg(byFp[fp]!) ?? 0);
  const sum = avgs.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    return new Map(QUARTER_ORDER.map((fp) => [fp, 0.25]));
  }

  let weights = avgs.map((v) => v / sum);
  const maxW = Math.max(...weights);
  if (maxW > 0.42 || points.length < 4) {
    weights = weights.map((w) => 0.35 * w + 0.65 * 0.25);
    const s = weights.reduce((a, b) => a + b, 0);
    weights = weights.map((w) => w / s);
  }

  return new Map(QUARTER_ORDER.map((fp, i) => [fp, weights[i]!]));
}

function historicalOpexRatioBounds(points: QuarterlyPnlPoint[]): { avg: number; max: number; min: number } {
  const ratios: number[] = [];
  for (const p of points) {
    const rev = toMillions(p.revenueUsd);
    const opex = toMillions(p.operatingExpensesUsd);
    const gp = toMillions(p.grossProfitUsd);
    const oi = toMillions(p.operatingIncomeUsd);
    if (rev == null || rev <= 0) continue;
    if (opex != null) {
      ratios.push(opex / rev);
    } else if (gp != null && oi != null) {
      ratios.push(Math.max(0, (gp - oi) / rev));
    }
  }

  const valid = ratios.filter((r) => r > 0.05 && r < 0.55);
  if (!valid.length) {
    return { avg: 0.3, max: 0.38, min: 0.05 };
  }

  const a = avg(valid) ?? 0.3;
  return {
    avg: a,
    max: Math.min(0.48, Math.max(...valid) + 0.03),
    min: Math.max(0.05, Math.min(...valid)),
  };
}

function projectAnnualYears(input: {
  ltmRevM: number;
  latestGmPct: number;
  targetGmPct: number;
  opexBounds: { avg: number; max: number; min: number };
  yearCount: number;
  consensus: ConsensusEstimates | null;
  documentRevenueGrowthPct: number | null;
  hist: QuarterlyPnlPoint[];
}): YearPnl[] {
  const { year1, year2, normalized } = resolveYearGrowthRates(
    input.consensus,
    input.documentRevenueGrowthPct,
    input.hist,
  );

  let opexRatio = input.opexBounds.avg;
  let prevAnnualRev = input.ltmRevM;
  const years: YearPnl[] = [];

  for (let y = 1; y <= input.yearCount; y++) {
    const g = annualGrowthPct(y, input.consensus, normalized, year1, year2);
    const revenueM = Math.round(prevAnnualRev * (1 + g / 100));

    const revertProgress = Math.min(1, y / 4);
    const grossMarginPctNow = lerp(input.latestGmPct, input.targetGmPct, revertProgress);

    const annualGrowth = prevAnnualRev > 0 ? (revenueM - prevAnnualRev) / prevAnnualRev : 0;
    opexRatio = opexRatio * (1 + annualGrowth * (1 - BASE_CASE_OPEX_LEVERAGE) * 0.45);
    opexRatio = Math.max(
      input.opexBounds.min,
      Math.min(input.opexBounds.max + 0.08, opexRatio, 0.72),
    );

    const grossProfitM = Math.round(revenueM * (grossMarginPctNow / 100));
    const opexM = Math.round(revenueM * opexRatio);
    const opIncomeM = grossProfitM - opexM;
    const netIncomeM =
      opIncomeM > 0 ? Math.round(opIncomeM * (1 - BASE_CASE_TAX_RATE)) : Math.round(opIncomeM);

    years.push({
      revenueM,
      grossMarginPct: grossMarginPctNow,
      opexRatio,
      grossProfitM,
      opexM,
      opIncomeM,
      netIncomeM,
    });
    prevAnnualRev = revenueM;
  }

  return years;
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

  const anchor = [...hist].reverse().find((p) => (toMillions(p.revenueUsd) ?? 0) > 0) ?? hist[hist.length - 1];
  if (!anchor || estimateCount <= 0) return [];

  const historyForSeason = longHistoryPoints.length >= 4 ? longHistoryPoints : hist;
  const fpWeights = fiscalQuarterWeights(historyForSeason);
  const opexBounds = historicalOpexRatioBounds(hist.slice(-8));

  const lastFourRevM = hist.slice(-4).map((p) => toMillions(p.revenueUsd) ?? 0);
  const ltmRevM = lastFourRevM.reduce((a, b) => a + b, 0);

  const latestGmPct = grossMarginPct(anchor) ?? historicalGrossMarginAvg(longHistoryPoints);
  const targetGmPct = historicalGrossMarginAvg(longHistoryPoints);

  const anchorRevM = toMillions(anchor.revenueUsd) ?? ltmRevM / 4;
  const anchorFcfM = toMillions(anchor.fcfUsd) ?? anchorRevM * 0.12;
  const fcfRatio = anchorRevM > 0 ? anchorFcfM / anchorRevM : 0.12;

  let sharesM = anchor.shares != null ? Math.round(anchor.shares / 1e6) : 400;
  let cashM = toMillions(anchor.cashUsd);
  let debtM = toMillions(anchor.debtUsd);

  const yearCount = Math.ceil(estimateCount / 4) + 1;
  const annualYears = projectAnnualYears({
    ltmRevM,
    latestGmPct,
    targetGmPct,
    opexBounds,
    yearCount,
    consensus,
    documentRevenueGrowthPct,
    hist,
  });

  const out: ProjectedQuarterPnl[] = [];

  for (let i = 0; i < estimateCount; i++) {
    const forwardYear = Math.floor(i / 4) + 1;
    const ya = annualYears[forwardYear - 1] ?? annualYears[annualYears.length - 1]!;

    const fpOffset = (forwardYear - 1) * 4 + (i % 4) + 1;
    const fp = fpAtOffset(anchor.fp, fpOffset);
    const w = fpWeights.get(fp) ?? 0.25;

    const revM = Math.round(ya.revenueM * w);
    const grossProfitM = Math.round(ya.grossProfitM * w);
    const opexM = Math.round(ya.opexM * w);
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
      grossMarginPct: Math.round(ya.grossMarginPct * 10) / 10,
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
