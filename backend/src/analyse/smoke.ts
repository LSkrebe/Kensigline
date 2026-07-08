import assert from "node:assert/strict";
import { BASE_CASE_LTGR_PCT, BASE_CASE_TAX_RATE, buildBaseCaseQuarterlyProjection } from "./base-case-projection.js";
import type { QuarterlyPnlPoint } from "./quarterly-pnl.js";

function mkPoint(
  label: string,
  fy: number,
  fp: string,
  revenueM: number,
  grossMargin = 0.52,
): QuarterlyPnlPoint {
  const revenueUsd = revenueM * 1e6;
  const grossProfitUsd = revenueUsd * grossMargin;
  const opexUsd = revenueUsd * 0.25;
  const operatingIncomeUsd = grossProfitUsd - opexUsd;
  const netIncomeUsd = operatingIncomeUsd * 0.77;
  return {
    label,
    end: `${fy}-03-31`,
    fy,
    fp,
    revenueUsd,
    grossProfitUsd,
    operatingExpensesUsd: opexUsd,
    operatingIncomeUsd,
    netIncomeUsd,
    shares: 404e6,
    cashUsd: 8e9,
    debtUsd: 3e9,
    fcfUsd: revenueUsd * 0.12,
  };
}

function histSix(): QuarterlyPnlPoint[] {
  return [
    mkPoint("Q1'24", 2024, "Q1", 5200),
    mkPoint("Q2'24", 2024, "Q2", 5450),
    mkPoint("Q3'24", 2024, "Q3", 5890),
    mkPoint("Q4'24", 2024, "Q4", 6120),
    mkPoint("Q1'25", 2025, "Q1", 6340),
    mkPoint("Q2'25", 2025, "Q2", 6780),
  ];
}

export function runAnalyseSmokeTests() {
  console.log("[analyse-smoke] base case projection");

  const hist = histSix();
  const projection = buildBaseCaseQuarterlyProjection({
    historicalPoints: hist,
    longHistoryPoints: hist,
    estimateCount: 4,
    consensus: {
      year1RevenueGrowthPct: 12,
      year2RevenueGrowthPct: 10,
      year1Eps: 16,
      year2Eps: null,
    },
    documentRevenueGrowthPct: null,
  });

  assert.equal(projection.length, 4);

  const ltmHist = hist.slice(-4).reduce((s, p) => s + p.revenueUsd! / 1e6, 0);
  const ltmEst = projection.reduce((s, q) => s + q.revenueM, 0);
  assert.ok(ltmEst > ltmHist, "forward year revenue should exceed trailing four quarters");

  const sumNi = projection.reduce((s, q) => s + q.netIncomeM, 0);
  const impliedEps = sumNi / projection[0]!.sharesM;
  assert.ok(Math.abs(impliedEps - 16) < 1.5, `expected ~16 EPS, got ${impliedEps}`);

  for (const q of projection) {
    assert.ok(q.grossMarginPct > 0 && q.grossMarginPct <= 100);
    assert.ok(q.opMarginPct < q.grossMarginPct);
  }

  const normalized = 8;
  const outer = buildBaseCaseQuarterlyProjection({
    historicalPoints: hist,
    longHistoryPoints: hist,
    estimateCount: 12,
    consensus: {
      year1RevenueGrowthPct: 20,
      year2RevenueGrowthPct: 18,
      year1Eps: null,
      year2Eps: null,
    },
    documentRevenueGrowthPct: normalized,
  });
  const revY1 = outer.slice(0, 4).reduce((s, q) => s + q.revenueM, 0);
  const revY4 = outer.slice(8, 12).reduce((s, q) => s + q.revenueM, 0);
  const gY4 = revY1 > 0 ? ((revY4 / revY1) ** (1 / 3) - 1) * 100 : 0;
  assert.ok(gY4 < 20, "outer-year growth should fade below year-1 consensus");
  assert.ok(gY4 >= BASE_CASE_LTGR_PCT - 2, "outer-year growth should approach LTGR");

  const taxCheck = buildBaseCaseQuarterlyProjection({
    historicalPoints: hist,
    longHistoryPoints: hist,
    estimateCount: 1,
    consensus: null,
    documentRevenueGrowthPct: 8,
  });
  const q0 = taxCheck[0]!;
  if (q0.opIncomeM > 0) {
    const impliedTax = 1 - q0.netIncomeM / q0.opIncomeM;
    assert.ok(Math.abs(impliedTax - BASE_CASE_TAX_RATE) < 0.02);
  }

  const seasonal = [
    mkPoint("Q1'24", 2024, "Q1", 2300),
    mkPoint("Q2'24", 2024, "Q2", 5000),
    mkPoint("Q3'24", 2024, "Q3", 7600),
    mkPoint("Q4'24", 2024, "Q4", 4500),
    mkPoint("Q1'25", 2025, "Q1", 1900),
    mkPoint("Q2'25", 2025, "Q2", 5100),
  ];
  const seasonalProj = buildBaseCaseQuarterlyProjection({
    historicalPoints: seasonal,
    longHistoryPoints: seasonal,
    estimateCount: 8,
    consensus: null,
    documentRevenueGrowthPct: 8,
  });
  for (const q of seasonalProj) {
    assert.ok(q.opIncomeM > -q.revenueM * 0.15, `seasonal op loss too extreme: ${q.opIncomeM}`);
    assert.ok(q.eps > -50, `seasonal eps too negative: ${q.eps}`);
  }
  const peakQ = seasonalProj.reduce((best, q) => (q.revenueM > best.revenueM ? q : best), seasonalProj[0]!);
  assert.ok(peakQ.opIncomeM > 0, "peak seasonal quarter should stay profitable");

  console.log("[analyse-smoke] ok");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAnalyseSmokeTests();
}
