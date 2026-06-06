/**
 * SEC Company Facts (XBRL) → historical fundamentals for the Research context panel.
 */

import {
  fiscalPeriodLabel,
  pickFactSeries,
  pickLatestPeriodRow,
  priorYearRow,
  roundOneDecimal,
  valueOnPeriod,
} from "./xbrl-facts.js";

export type HistoricalFundamentals = {
  revenueGrowth: number | null;
  netMargin: number | null;
  fcfMargin: number | null;
  periodEnd: string | null;
  fiscalPeriod: string | null;
};

const REVENUE_TAGS = [
  "Revenues",
  "SalesRevenueNet",
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "RevenuesNetOfInterestExpense",
];

const NET_INCOME_TAGS = ["NetIncomeLoss", "ProfitLoss", "NetIncomeLossAvailableToCommonStockholdersBasic"];

const OCF_TAGS = ["NetCashProvidedByUsedInOperatingActivities"];

const CAPEX_TAGS = [
  "PaymentsToAcquirePropertyPlantAndEquipment",
  "PaymentsToAcquireProductiveAssets",
  "CapitalExpendituresIncurredButNotYetPaid",
];

const FCF_TAGS = ["FreeCashFlow"];

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

  let fcf: number | null = valueOnPeriod(fcfRows, latestRev.end);
  if (fcf == null) {
    const ocf = valueOnPeriod(ocfRows, latestRev.end);
    const capex = valueOnPeriod(capexRows, latestRev.end);
    if (ocf != null && capex != null) {
      fcf = ocf - Math.abs(capex);
    }
  }

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
