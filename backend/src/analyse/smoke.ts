import assert from "node:assert/strict";
import { BASE_CASE_TAX_RATE, buildBaseCaseQuarterlyProjection, historicalRevenueYoYGrowthPct } from "./base-case-projection.js";
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
  console.log("[analyse-smoke] quarterly projection");

  const hist = histSix();
  const revM = hist.map((p) => p.revenueUsd! / 1e6);
  const yoy = historicalRevenueYoYGrowthPct(revM);
  assert.ok(yoy > 0 && yoy < 50, `expected positive YoY growth, got ${yoy}`);

  const projection = buildBaseCaseQuarterlyProjection({
    historicalPoints: hist,
    estimateCount: 4,
  });

  assert.equal(projection.length, 4);

  const q1Base = revM[2]!;
  const q1Est = projection[0]!.revenueM;
  const expectedQ1 = Math.round(q1Base * (1 + yoy / 100));
  assert.equal(q1Est, expectedQ1, `Q+1 should be same-quarter-last-year × growth`);

  const q4Base = revM[5]!;
  const q4Est = projection[3]!.revenueM;
  assert.equal(q4Est, Math.round(q4Base * (1 + yoy / 100)));

  for (const q of projection) {
    assert.ok(q.grossMarginPct > 0 && q.grossMarginPct <= 100);
    assert.ok(q.opMarginPct < q.grossMarginPct);
    assert.ok(q.revenueM > 0);
  }

  const taxCheck = buildBaseCaseQuarterlyProjection({
    historicalPoints: hist,
    estimateCount: 1,
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
    estimateCount: 4,
  });
  for (const q of seasonalProj) {
    assert.ok(q.opIncomeM > -q.revenueM * 0.15, `seasonal op loss too extreme: ${q.opIncomeM}`);
    assert.ok(q.eps > -50, `seasonal eps too negative: ${q.eps}`);
  }

  console.log("[analyse-smoke] ok");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAnalyseSmokeTests();
}
