/**
 * SEC Company Facts (XBRL) → historical fundamentals for the Research context panel.
 */

import {
  fiscalPeriodLabel,
  fyShortLabel,
  nearestRowOnOrBefore,
  pickAnnualFyRows,
  pickFactSeries,
  pickLatestPeriodRow,
  priorYearRow,
  roundOneDecimal,
  valueOnPeriod,
  type FactRow,
} from "./xbrl-facts.js";

export type HistoricalFundamentals = {
  revenueGrowth: number | null;
  netMargin: number | null;
  fcfMargin: number | null;
  periodEnd: string | null;
  fiscalPeriod: string | null;
};

export type FundamentalsSeries = {
  periodLabels: string[];
  periodEnds: string[];
  revenueGrowth: (number | null)[];
  grossMargin: (number | null)[];
  netMargin: (number | null)[];
  fcfMargin: (number | null)[];
  netIncomeGrowth: (number | null)[];
  fcfGrowth: (number | null)[];
  netCash: (number | null)[];
  sharesOutstanding: (number | null)[];
};

const REVENUE_TAGS = [
  "Revenues",
  "SalesRevenueNet",
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "RevenuesNetOfInterestExpense",
];

const GROSS_PROFIT_TAGS = ["GrossProfit"];
const COGS_TAGS = ["CostOfGoodsAndServicesSold", "CostOfRevenue", "CostOfGoodsSold"];

const NET_INCOME_TAGS = ["NetIncomeLoss", "ProfitLoss", "NetIncomeLossAvailableToCommonStockholdersBasic"];

const OCF_TAGS = ["NetCashProvidedByUsedInOperatingActivities"];

const CAPEX_TAGS = [
  "PaymentsToAcquirePropertyPlantAndEquipment",
  "PaymentsToAcquireProductiveAssets",
  "CapitalExpendituresIncurredButNotYetPaid",
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
  "ShortTermBorrowings",
  "CommercialPaper",
];

const SHARES_TAGS = [
  "WeightedAverageNumberOfSharesOutstandingBasic",
  "EntityCommonStockSharesOutstanding",
  "CommonStockSharesOutstanding",
];

function pctChange(current: number | null, prior: number | null): number | null {
  if (current == null || prior == null || prior === 0) return null;
  return roundOneDecimal(((current - prior) / Math.abs(prior)) * 100);
}

function marginPct(numerator: number | null, revenue: number): number | null {
  if (numerator == null || revenue === 0) return null;
  return roundOneDecimal((numerator / revenue) * 100);
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

function grossProfitOnPeriod(grossRows: FactRow[], cogsRows: FactRow[], revenueRows: FactRow[], end: string): number | null {
  const direct = valueOnPeriod(grossRows, end);
  if (direct != null) return direct;
  const revenue = valueOnPeriod(revenueRows, end);
  const cogs = valueOnPeriod(cogsRows, end);
  if (revenue != null && cogs != null) return revenue - Math.abs(cogs);
  return null;
}

function netCashOnPeriod(cashRows: FactRow[], debtRows: FactRow[], end: string): number | null {
  const cash = valueOnPeriod(cashRows, end);
  if (cash == null) return null;
  const debt = valueOnPeriod(debtRows, end);
  return debt != null ? cash - Math.abs(debt) : cash;
}

function sharesOnPeriod(sharesRows: FactRow[], end: string): number | null {
  const direct = valueOnPeriod(sharesRows, end);
  if (direct != null) return direct;
  const hit = nearestRowOnOrBefore(sharesRows, end);
  return hit?.val ?? null;
}

function emptySeries(periods: number): FundamentalsSeries {
  return {
    periodLabels: [],
    periodEnds: [],
    revenueGrowth: Array.from({ length: periods }, () => null),
    grossMargin: Array.from({ length: periods }, () => null),
    netMargin: Array.from({ length: periods }, () => null),
    fcfMargin: Array.from({ length: periods }, () => null),
    netIncomeGrowth: Array.from({ length: periods }, () => null),
    fcfGrowth: Array.from({ length: periods }, () => null),
    netCash: Array.from({ length: periods }, () => null),
    sharesOutstanding: Array.from({ length: periods }, () => null),
  };
}

export function fundamentalsSeriesFromCompanyFacts(
  companyFacts: unknown,
  opts?: { periods?: number },
): FundamentalsSeries {
  const periods = Math.max(1, Math.min(8, opts?.periods ?? 4));

  const revenueRows = pickFactSeries(companyFacts, REVENUE_TAGS);
  const grossRows = pickFactSeries(companyFacts, GROSS_PROFIT_TAGS);
  const cogsRows = pickFactSeries(companyFacts, COGS_TAGS);
  const netRows = pickFactSeries(companyFacts, NET_INCOME_TAGS);
  const ocfRows = pickFactSeries(companyFacts, OCF_TAGS);
  const capexRows = pickFactSeries(companyFacts, CAPEX_TAGS);
  const fcfRows = pickFactSeries(companyFacts, FCF_TAGS);
  const cashRows = pickFactSeries(companyFacts, CASH_TAGS);
  const debtRows = pickFactSeries(companyFacts, DEBT_TAGS);
  const sharesRows = pickFactSeries(companyFacts, SHARES_TAGS);

  const anchors = pickAnnualFyRows(revenueRows, periods);
  if (!anchors.length) return emptySeries(periods);

  const periodLabels = anchors.map((a) => fyShortLabel(a.fy));
  const periodEnds = anchors.map((a) => a.end);

  const revenueGrowth: (number | null)[] = [];
  const grossMargin: (number | null)[] = [];
  const netMargin: (number | null)[] = [];
  const fcfMargin: (number | null)[] = [];
  const netIncomeGrowth: (number | null)[] = [];
  const fcfGrowth: (number | null)[] = [];
  const netCash: (number | null)[] = [];
  const sharesOutstanding: (number | null)[] = [];

  for (const anchor of anchors) {
    const priorRev = priorYearRow(revenueRows, anchor);
    const revenue = anchor.val;
    revenueGrowth.push(pctChange(revenue, priorRev?.val ?? null));

    const gp = grossProfitOnPeriod(grossRows, cogsRows, revenueRows, anchor.end);
    grossMargin.push(marginPct(gp, revenue));

    const netIncome = valueOnPeriod(netRows, anchor.end);
    netMargin.push(marginPct(netIncome, revenue));

    const fcf = fcfOnPeriod(fcfRows, ocfRows, capexRows, anchor.end);
    fcfMargin.push(marginPct(fcf, revenue));

    const priorNiRow = priorYearRow(netRows, anchor);
    netIncomeGrowth.push(pctChange(netIncome, priorNiRow?.val ?? null));

    const priorFcfAnchor = priorYearRow(revenueRows, anchor);
    const priorFcf = priorFcfAnchor ? fcfOnPeriod(fcfRows, ocfRows, capexRows, priorFcfAnchor.end) : null;
    fcfGrowth.push(pctChange(fcf, priorFcf));

    netCash.push(netCashOnPeriod(cashRows, debtRows, anchor.end));
    sharesOutstanding.push(sharesOnPeriod(sharesRows, anchor.end));
  }

  return {
    periodLabels,
    periodEnds,
    revenueGrowth,
    grossMargin,
    netMargin,
    fcfMargin,
    netIncomeGrowth,
    fcfGrowth,
    netCash,
    sharesOutstanding,
  };
}

export function historicalFundamentalsFromCompanyFacts(companyFacts: unknown): HistoricalFundamentals {
  const revenueRows = pickFactSeries(companyFacts, REVENUE_TAGS);
  const netRows = pickFactSeries(companyFacts, NET_INCOME_TAGS);
  const ocfRows = pickFactSeries(companyFacts, OCF_TAGS);
  const capexRows = pickFactSeries(companyFacts, CAPEX_TAGS);
  const fcfRows = pickFactSeries(companyFacts, FCF_TAGS);

  const latestRev = pickLatestPeriodRow(revenueRows);
  if (!latestRev) {
    return {
      revenueGrowth: null,
      netMargin: null,
      fcfMargin: null,
      periodEnd: null,
      fiscalPeriod: null,
    };
  }

  const priorRev = priorYearRow(revenueRows, latestRev);
  let revenueGrowth: number | null = null;
  if (priorRev && priorRev.val !== 0) {
    revenueGrowth = roundOneDecimal(((latestRev.val - priorRev.val) / Math.abs(priorRev.val)) * 100);
  }

  const revenue = latestRev.val;
  const netIncome = valueOnPeriod(netRows, latestRev.end);
  let netMargin: number | null = null;
  if (netIncome != null && revenue !== 0) {
    netMargin = roundOneDecimal((netIncome / revenue) * 100);
  }

  const fcf = fcfOnPeriod(fcfRows, ocfRows, capexRows, latestRev.end);

  let fcfMargin: number | null = null;
  if (fcf != null && revenue !== 0) {
    fcfMargin = roundOneDecimal((fcf / revenue) * 100);
  }

  return {
    revenueGrowth,
    netMargin,
    fcfMargin,
    periodEnd: latestRev.end,
    fiscalPeriod: fiscalPeriodLabel(latestRev),
  };
}
