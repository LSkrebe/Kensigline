import { fetchSecJson, resolveCikForTicker } from "../../core/sec.js";
import { historicalFundamentalsFromCompanyFacts } from "../../core/fundamentals.js";
import { forwardRevenueGrowthFromDocuments } from "./guidance.js";

export type MarketFundamentals = {
  revenueGrowth: number | null;
  netMargin: number | null;
  fcfMargin: number | null;
  forwardRevenueGrowth: number | null;
  periodEnd: string | null;
  fiscalPeriod: string | null;
  sources: {
    historical: "sec_companyfacts" | null;
    forward: "documents" | null;
  };
};

/** Research CONTEXT panel fundamentals — SEC XBRL history + document guidance. */
export async function getMarketFundamentalsForTicker(opts: {
  ticker: string;
}): Promise<MarketFundamentals> {
  const ticker = String(opts.ticker ?? "").trim().toUpperCase();
  const empty: MarketFundamentals = {
    revenueGrowth: null,
    netMargin: null,
    fcfMargin: null,
    forwardRevenueGrowth: null,
    periodEnd: null,
    fiscalPeriod: null,
    sources: { historical: null, forward: null },
  };

  if (!ticker) return empty;

  let historical = empty;
  try {
    const { cik } = await resolveCikForTicker(ticker);
    const facts = await fetchSecJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`);
    const h = historicalFundamentalsFromCompanyFacts(facts);
    const hasHistorical =
      h.revenueGrowth != null || h.netMargin != null || h.fcfMargin != null;
    historical = {
      ...empty,
      revenueGrowth: h.revenueGrowth,
      netMargin: h.netMargin,
      fcfMargin: h.fcfMargin,
      periodEnd: h.periodEnd,
      fiscalPeriod: h.fiscalPeriod,
      sources: { historical: hasHistorical ? "sec_companyfacts" : null, forward: null },
    };
  } catch {
    // best-effort — forward guidance may still apply
  }

  let forwardRevenueGrowth: number | null = null;
  try {
    forwardRevenueGrowth = await forwardRevenueGrowthFromDocuments(ticker);
  } catch {
    forwardRevenueGrowth = null;
  }

  return {
    ...historical,
    forwardRevenueGrowth,
    sources: {
      historical: historical.sources.historical,
      forward: forwardRevenueGrowth != null ? "documents" : null,
    },
  };
}
