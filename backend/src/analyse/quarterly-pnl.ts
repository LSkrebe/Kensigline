/**
 * SEC Company Facts (XBRL) → trailing quarterly P&L points for the Analyse tab.
 */

import {
  pickFactSeries,
  pickQuarterlyRows,
  quarterShortLabel,
  roundOneDecimal,
  valueOnPeriod,
  type FactRow,
} from "../core/xbrl-facts.js";

const REVENUE_TAGS = [
  "Revenues",
  "SalesRevenueNet",
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "RevenuesNetOfInterestExpense",
];

const GROSS_PROFIT_TAGS = ["GrossProfit"];
const COGS_TAGS = ["CostOfGoodsAndServicesSold", "CostOfRevenue", "CostOfGoodsSold"];
const NET_INCOME_TAGS = ["NetIncomeLoss", "ProfitLoss", "NetIncomeLossAvailableToCommonStockholdersBasic"];
const OPEX_TAGS = ["OperatingExpenses", "CostsAndExpenses"];
const OP_INCOME_TAGS = ["OperatingIncomeLoss", "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest"];
const OCF_TAGS = ["NetCashProvidedByUsedInOperatingActivities"];
const CAPEX_TAGS = [
  "PaymentsToAcquirePropertyPlantAndEquipment",
  "PaymentsToAcquireProductiveAssets",
];
const FCF_TAGS = ["FreeCashFlow"];
const CASH_TAGS = [
  "CashCashEquivalentsAndShortTermInvestments",
  "CashAndCashEquivalentsAtCarryingValue",
  "CashAndShortTermInvestments",
];
const DEBT_TAGS = [
  "LongTermDebtAndCapitalLeaseObligations",
  "LongTermDebtNoncurrent",
  "LongTermDebt",
  "DebtCurrent",
];
const SHARES_TAGS = [
  "WeightedAverageNumberOfSharesOutstandingBasic",
  "EntityCommonStockSharesOutstanding",
];

export type QuarterlyPnlPoint = {
  label: string;
  end: string;
  fy: number;
  fp: string;
  revenueUsd: number | null;
  grossProfitUsd: number | null;
  operatingExpensesUsd: number | null;
  operatingIncomeUsd: number | null;
  netIncomeUsd: number | null;
  shares: number | null;
  cashUsd: number | null;
  debtUsd: number | null;
  fcfUsd: number | null;
};

function grossProfitOnPeriod(
  grossRows: FactRow[],
  cogsRows: FactRow[],
  revenueRows: FactRow[],
  end: string,
): number | null {
  const direct = valueOnPeriod(grossRows, end);
  if (direct != null) return direct;
  const revenue = valueOnPeriod(revenueRows, end);
  const cogs = valueOnPeriod(cogsRows, end);
  if (revenue != null && cogs != null) return revenue - Math.abs(cogs);
  return null;
}

function opexOnPeriod(
  opexRows: FactRow[],
  revenueRows: FactRow[],
  opIncomeRows: FactRow[],
  end: string,
): number | null {
  const direct = valueOnPeriod(opexRows, end);
  if (direct != null) return Math.abs(direct);
  const revenue = valueOnPeriod(revenueRows, end);
  const opIncome = valueOnPeriod(opIncomeRows, end);
  if (revenue != null && opIncome != null) return revenue - opIncome;
  return null;
}

function opIncomeOnPeriod(
  opIncomeRows: FactRow[],
  revenueRows: FactRow[],
  opexRows: FactRow[],
  grossRows: FactRow[],
  cogsRows: FactRow[],
  end: string,
): number | null {
  const direct = valueOnPeriod(opIncomeRows, end);
  if (direct != null) return direct;
  const revenue = valueOnPeriod(revenueRows, end);
  const opex = opexOnPeriod(opexRows, revenueRows, opIncomeRows, end);
  if (revenue != null && opex != null) return revenue - opex;
  const gp = grossProfitOnPeriod(grossRows, cogsRows, revenueRows, end);
  if (gp != null && opex != null) return gp - opex;
  return null;
}

function fcfOnPeriod(
  fcfRows: FactRow[],
  ocfRows: FactRow[],
  capexRows: FactRow[],
  end: string,
): number | null {
  let fcf: number | null = valueOnPeriod(fcfRows, end);
  if (fcf != null) return fcf;
  const ocf = valueOnPeriod(ocfRows, end);
  const capex = valueOnPeriod(capexRows, end);
  if (ocf != null && capex != null) return ocf - Math.abs(capex);
  return null;
}

function debtOnPeriod(debtRows: FactRow[], end: string): number | null {
  let sum = 0;
  let any = false;
  for (const row of debtRows) {
    const v = valueOnPeriod([row], end);
    if (v != null) {
      sum += Math.abs(v);
      any = true;
    }
  }
  return any ? sum : null;
}

function toMillions(usd: number | null): number | null {
  if (usd == null || !Number.isFinite(usd)) return null;
  return Math.round(usd / 1e6);
}

function pctStr(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(1)}%`;
}

function growthYoYStr(curr: number | null, prior: number | null): string {
  if (curr == null || prior == null || prior === 0) return "—";
  const g = ((curr - prior) / Math.abs(prior)) * 100;
  return `${g >= 0 ? "+" : ""}${g.toFixed(1)}%`;
}

function epsStr(netIncomeUsd: number | null, shares: number | null): string {
  if (netIncomeUsd == null || shares == null || shares === 0) return "—";
  const eps = netIncomeUsd / shares;
  return eps.toFixed(2);
}

const QUARTER_ORDER = ["Q1", "Q2", "Q3", "Q4"];

export function advanceFiscalQuarter(fy: number, fp: string, steps: number): { fy: number; fp: string } {
  let idx = QUARTER_ORDER.indexOf(fp.toUpperCase());
  if (idx < 0) idx = 3;
  let year = fy;
  for (let i = 0; i < steps; i++) {
    idx += 1;
    if (idx >= 4) {
      idx = 0;
      year += 1;
    }
  }
  return { fy: year, fp: QUARTER_ORDER[idx]! };
}

export function quarterlyPnlFromCompanyFacts(companyFacts: unknown, opts?: { quarters?: number }): QuarterlyPnlPoint[] {
  const count = Math.max(2, Math.min(40, opts?.quarters ?? 8));

  const revenueRows = pickFactSeries(companyFacts, REVENUE_TAGS);
  const anchors = pickQuarterlyRows(revenueRows, count);
  if (anchors.length < 2) return [];

  const grossRows = pickFactSeries(companyFacts, GROSS_PROFIT_TAGS);
  const cogsRows = pickFactSeries(companyFacts, COGS_TAGS);
  const netRows = pickFactSeries(companyFacts, NET_INCOME_TAGS);
  const opexRows = pickFactSeries(companyFacts, OPEX_TAGS);
  const opIncomeRows = pickFactSeries(companyFacts, OP_INCOME_TAGS);
  const ocfRows = pickFactSeries(companyFacts, OCF_TAGS);
  const capexRows = pickFactSeries(companyFacts, CAPEX_TAGS);
  const fcfRows = pickFactSeries(companyFacts, FCF_TAGS);
  const cashRows = pickFactSeries(companyFacts, CASH_TAGS);
  const debtRows = pickFactSeries(companyFacts, DEBT_TAGS);
  const sharesRows = pickFactSeries(companyFacts, SHARES_TAGS);

  return anchors.map((anchor) => {
    const end = anchor.end;
    const revenueUsd = valueOnPeriod(revenueRows, end);
    const grossProfitUsd = grossProfitOnPeriod(grossRows, cogsRows, revenueRows, end);
    const operatingExpensesUsd = opexOnPeriod(opexRows, revenueRows, opIncomeRows, end);
    const operatingIncomeUsd = opIncomeOnPeriod(
      opIncomeRows,
      revenueRows,
      opexRows,
      grossRows,
      cogsRows,
      end,
    );
    const netIncomeUsd = valueOnPeriod(netRows, end);
    const shares = valueOnPeriod(sharesRows, end);
    const cashUsd = valueOnPeriod(cashRows, end);
    const debtUsd = debtOnPeriod(debtRows, end);
    const fcfUsd = fcfOnPeriod(fcfRows, ocfRows, capexRows, end);

    return {
      label: quarterShortLabel(anchor),
      end,
      fy: anchor.fy,
      fp: anchor.fp,
      revenueUsd,
      grossProfitUsd,
      operatingExpensesUsd,
      operatingIncomeUsd,
      netIncomeUsd,
      shares,
      cashUsd,
      debtUsd,
      fcfUsd,
    };
  });
}

export function revenueYoYGrowthSeries(points: QuarterlyPnlPoint[]): number[] {
  const out: number[] = [];
  for (const p of points) {
    const prior = points.find((q) => q.fy === p.fy - 1 && q.fp === p.fp);
    const curr = p.revenueUsd;
    const priorRev = prior?.revenueUsd ?? null;
    if (curr != null && priorRev != null && priorRev !== 0) {
      out.push(roundOneDecimal(((curr - priorRev) / Math.abs(priorRev)) * 100));
    }
  }
  return out;
}

export {
  toMillions,
  pctStr,
  growthYoYStr,
  epsStr,
};
