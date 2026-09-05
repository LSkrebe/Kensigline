/**
 * Simple quarter-by-quarter forward projection for Analyse estimate columns.
 *
 * Forward revenue = same calendar quarter last year × (1 + avg reported YoY growth).
 * Margins and opex ratios held flat from the latest reported quarter.
 */

import type { QuarterlyPnlPoint } from "./quarterly-pnl.js";
import { toMillions } from "./quarterly-pnl.js";
import { pickProjectionAnchor } from "./quarter-window.js";

export const BASE_CASE_TAX_RATE = 0.23;
export const GROWTH_PCT_MIN = -30;
export const GROWTH_PCT_MAX = 50;

export type BaseCaseProjectionInput = {
  historicalPoints: QuarterlyPnlPoint[];
  estimateCount: number;
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

export function clampGrowthPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(GROWTH_PCT_MIN, Math.min(GROWTH_PCT_MAX, n));
}

function grossMarginPct(point: QuarterlyPnlPoint): number | null {
  const rev = toMillions(point.revenueUsd);
  const gp = toMillions(point.grossProfitUsd);
  if (rev == null || gp == null || rev <= 0) return null;
  return (gp / rev) * 100;
}

function opexRatio(point: QuarterlyPnlPoint): number | null {
  const rev = toMillions(point.revenueUsd);
  const opex = toMillions(point.operatingExpensesUsd);
  const gp = toMillions(point.grossProfitUsd);
  const oi = toMillions(point.operatingIncomeUsd);
  if (rev == null || rev <= 0) return null;
  if (opex != null) return opex / rev;
  if (gp != null && oi != null) return Math.max(0, (gp - oi) / rev);
  return null;
}

/** Average YoY revenue growth % across same-quarter pairs in the window. */
export function historicalRevenueYoYGrowthPct(revM: number[]): number {
  const growths: number[] = [];
  for (let i = 4; i < revM.length; i++) {
    const prev = revM[i - 4]!;
    const curr = revM[i]!;
    if (prev > 0 && curr > 0) {
      growths.push(((curr - prev) / prev) * 100);
    }
  }
  const raw = avg(growths);
  return raw != null ? clampGrowthPct(raw) : 0;
}

export function buildBaseCaseQuarterlyProjection(input: BaseCaseProjectionInput): ProjectedQuarterPnl[] {
  const { historicalPoints, estimateCount } = input;
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

  const anchor = pickProjectionAnchor(historicalPoints.length ? historicalPoints : hist);
  if (!anchor || estimateCount <= 0) return [];

  const revM = hist.map((p) => toMillions(p.revenueUsd) ?? 0);
  const yoyGrowth = historicalRevenueYoYGrowthPct(revM);
  const growthFactor = 1 + yoyGrowth / 100;

  const gmPct = grossMarginPct(anchor) ?? 50;
  const opexPct = opexRatio(anchor) ?? 0.3;

  const anchorRevM = toMillions(anchor.revenueUsd) ?? revM[revM.length - 1] ?? 1000;
  const anchorFcfM = toMillions(anchor.fcfUsd) ?? anchorRevM * 0.12;
  const fcfRatio = anchorRevM > 0 ? anchorFcfM / anchorRevM : 0.12;

  let sharesM = anchor.shares != null ? Math.round(anchor.shares / 1e6) : 400;
  let cashM = toMillions(anchor.cashUsd);
  let debtM = toMillions(anchor.debtUsd);

  const refOffset = Math.max(0, hist.length - 4);
  const out: ProjectedQuarterPnl[] = [];

  for (let i = 0; i < estimateCount; i++) {
    const refIdx = Math.min(refOffset + i, revM.length - 1);
    let baseRev = revM[refIdx] ?? anchorRevM;
    if (baseRev <= 0) baseRev = anchorRevM;

    const revenueM = Math.round(baseRev * growthFactor);
    const grossProfitM = Math.round(revenueM * (gmPct / 100));
    const opexM = Math.round(revenueM * opexPct);
    const opIncomeM = grossProfitM - opexM;
    const opMarginPct = revenueM > 0 ? (opIncomeM / revenueM) * 100 : 0;
    const netIncomeM =
      opIncomeM > 0 ? Math.round(opIncomeM * (1 - BASE_CASE_TAX_RATE)) : Math.round(opIncomeM);
    const eps = sharesM > 0 ? Math.round((netIncomeM / sharesM) * 100) / 100 : 0;
    const fcfM = Math.round(revenueM * fcfRatio);

    if (cashM != null) cashM = Math.round(cashM + fcfM * 0.35);
    if (debtM != null) debtM = Math.round(debtM * 0.985);

    out.push({
      revenueM,
      grossProfitM,
      grossMarginPct: Math.round(gmPct * 10) / 10,
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

  return out;
}

export function revenueMillionsFromProjection(
  historicalRevM: (number | null)[],
  projection: ProjectedQuarterPnl[],
): (number | null)[] {
  return [...historicalRevM, ...projection.map((p) => p.revenueM)];
}
