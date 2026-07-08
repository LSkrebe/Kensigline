/**
 * Model eligibility, sanity checks, and NTM/LTM earnings helpers for Analyse.
 */

import type { AnalyseModel, AnalyseModelRow } from "./types.js";

export type ModelQualityGrade = "full" | "limited" | "unavailable";

export type ModelQuality = {
  grade: ModelQualityGrade;
  warnings: string[];
  valuationAvailable: boolean;
};

const BANK_INDUSTRY_RE =
  /\b(bank|bancorp|financial\s+services|insurance|reit|mortgage|credit\s+union)\b/i;

export function isBankLikeIndustry(industry: string | null | undefined): boolean {
  return BANK_INDUSTRY_RE.test(String(industry ?? ""));
}

export function parseEpsValue(raw: unknown): number | null {
  const n = parseFloat(String(raw ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function sumEpsRange(rows: AnalyseModelRow[], start: number, end: number): number | null {
  const epsRow = rows.find((r) => r.label === "EPS ($)");
  if (!epsRow || end <= start) return null;
  let sum = 0;
  let count = 0;
  for (let i = start; i < end && i < epsRow.values.length; i++) {
    const e = parseEpsValue(epsRow.values[i]);
    if (e == null) return null;
    sum += e;
    count++;
  }
  return count > 0 ? sum : null;
}

export function resolveNtmColumnRange(model: Pick<AnalyseModel, "estimateFromIndex" | "quarters">): {
  start: number;
  end: number;
  label: string;
} {
  const start = model.estimateFromIndex;
  const end = Math.min(start + 4, model.quarters.length);
  const labels = model.quarters.slice(start, end);
  const label =
    labels.length >= 4
      ? `NTM (${labels[0]}–${labels[labels.length - 1]})`
      : labels.length
        ? `NTM (${labels.join("–")})`
        : "NTM";
  return { start, end, label };
}

export function assessModelQuality(args: {
  model: AnalyseModel;
  partial: boolean;
  hasSec: boolean;
  industry: string | null;
  price: number | null;
  sharesOutstanding: number | null;
}): ModelQuality {
  const warnings: string[] = [];
  const { model, partial, hasSec, industry, price, sharesOutstanding } = args;
  const estFrom = model.estimateFromIndex;
  const histCols = estFrom;

  if (partial || !hasSec) {
    warnings.push("Limited SEC history — projections use placeholders or sparse data.");
  }

  if (isBankLikeIndustry(industry)) {
    warnings.push("Bank / financial — standard industrial P&L model may not apply.");
  }

  const ltmEps = sumEpsRange(model.historicalModel, Math.max(0, histCols - 4), histCols);
  const ntmEps = sumEpsRange(model.historicalModel, estFrom, Math.min(estFrom + 4, model.quarters.length));

  if (price != null && ltmEps != null && ltmEps > 0) {
    const impliedPe = price / ltmEps;
    if (impliedPe > 150 || impliedPe < 2) {
      warnings.push("Share count or EPS scale may not match the listed price (check share class).");
    }
  }

  if (sharesOutstanding != null && price != null && sharesOutstanding > 0) {
    const mcapB = (price * sharesOutstanding) / 1e9;
    if (mcapB > 5000 || mcapB < 0.01) {
      warnings.push("Market cap implied by shares × price looks inconsistent with SEC data.");
    }
  }

  const epsRow = model.historicalModel.find((r) => r.label === "EPS ($)");
  if (epsRow) {
    let signFlips = 0;
    let prevSign: number | null = null;
    for (let i = estFrom; i < epsRow.values.length; i++) {
      const e = parseEpsValue(epsRow.values[i]);
      if (e == null) continue;
      const sign = Math.sign(e);
      if (prevSign != null && sign !== 0 && prevSign !== 0 && sign !== prevSign) signFlips++;
      if (sign !== 0) prevSign = sign;
    }
    if (signFlips >= 2) {
      warnings.push("Estimate EPS changes sign multiple times — treat outer quarters with caution.");
    }
  }

  const opRow = model.historicalModel.find((r) => r.label === "Operating income");
  if (opRow) {
    for (let i = estFrom; i < opRow.values.length; i++) {
      const revRow = model.historicalModel.find((r) => r.label === "Revenue");
      const rev = Number(revRow?.values[i]);
      const op = Number(opRow.values[i]);
      if (Number.isFinite(rev) && rev > 0 && Number.isFinite(op) && op < -rev * 0.5) {
        warnings.push("One or more estimate quarters show extreme operating losses.");
        break;
      }
    }
  }

  let grade: ModelQualityGrade = "full";
  if (!hasSec || partial) grade = "limited";
  if (isBankLikeIndustry(industry) && !hasSec) grade = "unavailable";

  const valuationAvailable =
    grade !== "unavailable" &&
    ntmEps != null &&
    ntmEps > 0 &&
    price != null &&
    Number.isFinite(price) &&
    price > 0;

  if (ntmEps != null && ntmEps <= 0) {
    warnings.push("NTM EPS is not positive — price target not shown.");
  }

  return {
    grade,
    warnings: [...new Set(warnings)],
    valuationAvailable,
  };
}

export function buildValuationMetrics(args: {
  model: AnalyseModel;
  price: number | null;
  sharesOutstanding: number | null;
}): {
  ltmEps: number | null;
  ntmEps: number | null;
  ntmRange: { start: number; end: number; label: string };
  targetPe: number;
  priceTarget: number | null;
  defaultColumnIndex: number;
} {
  const estFrom = args.model.estimateFromIndex;
  const ntmRange = resolveNtmColumnRange(args.model);
  const ltmEps = sumEpsRange(args.model.historicalModel, Math.max(0, estFrom - 4), estFrom);
  const ntmEps = sumEpsRange(args.model.historicalModel, ntmRange.start, ntmRange.end);

  let targetPe = 20;
  if (args.price != null && ltmEps != null && ltmEps > 0) {
    targetPe = args.price / ltmEps;
  } else if (ntmEps != null && ntmEps > 0 && args.price != null) {
    targetPe = args.price / ntmEps;
  }
  targetPe = Math.max(5, Math.min(80, Math.round(targetPe * 10) / 10));

  const priceTarget =
    ntmEps != null && ntmEps > 0 ? Math.round(ntmEps * targetPe * 100) / 100 : null;

  return {
    ltmEps: ltmEps != null ? Math.round(ltmEps * 100) / 100 : null,
    ntmEps: ntmEps != null ? Math.round(ntmEps * 100) / 100 : null,
    ntmRange,
    targetPe,
    priceTarget,
    defaultColumnIndex: ntmRange.start,
  };
}
