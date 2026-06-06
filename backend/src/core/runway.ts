/**
 * SEC Company Facts (XBRL) → cash / burn / runway for the clinical context panel.
 */

import {
  fiscalPeriodLabel,
  pickFactSeries,
  pickLatestPeriodRow,
  roundOneDecimal,
  valueOnPeriod,
  type FactRow,
} from "./xbrl-facts.js";

export type HistoricalRunway = {
  cashUsd: number | null;
  quarterlyBurnUsd: number | null;
  runwayQuarters: number | null;
  periodEnd: string | null;
  fiscalPeriod: string | null;
};

const CASH_TAGS = [
  "CashCashEquivalentsAndShortTermInvestments",
  "CashAndCashEquivalentsAtCarryingValue",
  "CashAndShortTermInvestments",
];

const OCF_TAGS = ["NetCashProvidedByUsedInOperatingActivities"];

function pickAnchorPeriod(ocfRows: FactRow[], cashRows: FactRow[]): FactRow | null {
  const ocfLatest = pickLatestPeriodRow(ocfRows);
  if (ocfLatest) return ocfLatest;
  return pickLatestPeriodRow(cashRows);
}

export function historicalRunwayFromCompanyFacts(companyFacts: unknown): HistoricalRunway {
  const cashRows = pickFactSeries(companyFacts, CASH_TAGS);
  const ocfRows = pickFactSeries(companyFacts, OCF_TAGS);
  const anchor = pickAnchorPeriod(ocfRows, cashRows);

  if (!anchor) {
    return {
      cashUsd: null,
      quarterlyBurnUsd: null,
      runwayQuarters: null,
      periodEnd: null,
      fiscalPeriod: null,
    };
  }

  const cashUsd = valueOnPeriod(cashRows, anchor.end);
  const ocf = valueOnPeriod(ocfRows, anchor.end);

  let quarterlyBurnUsd: number | null = null;
  if (ocf != null && ocf < 0) {
    quarterlyBurnUsd = roundOneDecimal(Math.abs(ocf));
  }

  let runwayQuarters: number | null = null;
  if (cashUsd != null && quarterlyBurnUsd != null && quarterlyBurnUsd > 0) {
    runwayQuarters = roundOneDecimal(cashUsd / quarterlyBurnUsd);
  }

  return {
    cashUsd,
    quarterlyBurnUsd,
    runwayQuarters,
    periodEnd: anchor.end,
    fiscalPeriod: fiscalPeriodLabel(anchor),
  };
}
