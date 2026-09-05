import { loadTickerSecBundle, type TickerSecBundle } from "../../core/sec.js";
import { quarterlyPnlFromCompanyFacts } from "../../analyse/quarterly-pnl.js";
import { marginPctIfMeaningful, fcfMarginPctIfMeaningful } from "../../core/margin-utils.js";
import { forwardRevenueGrowthFromDocuments } from "./guidance.js";

/** Context panel + key metrics — trailing SEC quarters (8 ≈ 2Y history). */
export const CONTEXT_FUNDAMENTAL_QUARTERS = 8;

export type MarketFundamentals = {
  periodLabels: string[];
  revenueUsd: (number | null)[];
  revenueGrowth: (number | null)[];
  grossMargin: (number | null)[];
  netMargin: (number | null)[];
  fcfMargin: (number | null)[];
  fcfUsd: (number | null)[];
  netIncomeGrowth: (number | null)[];
  fcfGrowth: (number | null)[];
  netCash: (number | null)[];
  sharesOutstanding: (number | null)[];
  forwardRevenueGrowth: number | null;
  sources: {
    historical: "sec_companyfacts" | null;
    forward: "documents" | null;
  };
};

const EMPTY_PERIODS = CONTEXT_FUNDAMENTAL_QUARTERS;

const EMPTY: MarketFundamentals = {
  periodLabels: [],
  revenueUsd: Array.from({ length: EMPTY_PERIODS }, () => null),
  revenueGrowth: Array.from({ length: EMPTY_PERIODS }, () => null),
  grossMargin: Array.from({ length: EMPTY_PERIODS }, () => null),
  netMargin: Array.from({ length: EMPTY_PERIODS }, () => null),
  fcfMargin: Array.from({ length: EMPTY_PERIODS }, () => null),
  fcfUsd: Array.from({ length: EMPTY_PERIODS }, () => null),
  netIncomeGrowth: Array.from({ length: EMPTY_PERIODS }, () => null),
  fcfGrowth: Array.from({ length: EMPTY_PERIODS }, () => null),
  netCash: Array.from({ length: EMPTY_PERIODS }, () => null),
  sharesOutstanding: Array.from({ length: EMPTY_PERIODS }, () => null),
  forwardRevenueGrowth: null,
  sources: { historical: null, forward: null },
};

function padSeries(values: (number | null)[], count: number): (number | null)[] {
  if (values.length >= count) return values.slice(-count);
  return [...Array.from({ length: count - values.length }, () => null), ...values];
}

function pctChange(current: number | null, prior: number | null): number | null {
  if (current == null || prior == null || prior === 0) return null;
  return Math.round(((current - prior) / Math.abs(prior)) * 1000) / 10;
}


function fundamentalsSeriesFromQuarterlyFacts(companyFacts: unknown, periods = CONTEXT_FUNDAMENTAL_QUARTERS): MarketFundamentals | null {
  const quarters = quarterlyPnlFromCompanyFacts(companyFacts, { quarters: periods });
  if (quarters.length < 2) return null;

  const anchors = quarters.slice(-periods);
  const periodLabels = anchors.map((q) => q.label);
  const revenueUsd: (number | null)[] = [];
  const revenueGrowth: (number | null)[] = [];
  const grossMargin: (number | null)[] = [];
  const netMargin: (number | null)[] = [];
  const fcfMargin: (number | null)[] = [];
  const fcfUsd: (number | null)[] = [];
  const netIncomeGrowth: (number | null)[] = [];
  const fcfGrowth: (number | null)[] = [];
  const netCash: (number | null)[] = [];
  const sharesOutstanding: (number | null)[] = [];

  for (const anchor of anchors) {
    const prior = quarters.find((q) => q.fy === anchor.fy - 1 && q.fp === anchor.fp);
    revenueUsd.push(anchor.revenueUsd);
    revenueGrowth.push(pctChange(anchor.revenueUsd, prior?.revenueUsd ?? null));
    grossMargin.push(marginPctIfMeaningful(anchor.grossProfitUsd, anchor.revenueUsd));
    netMargin.push(marginPctIfMeaningful(anchor.netIncomeUsd, anchor.revenueUsd));
    fcfMargin.push(fcfMarginPctIfMeaningful(anchor.fcfUsd, anchor.revenueUsd));
    fcfUsd.push(anchor.fcfUsd);
    netIncomeGrowth.push(pctChange(anchor.netIncomeUsd, prior?.netIncomeUsd ?? null));
    fcfGrowth.push(pctChange(anchor.fcfUsd, prior?.fcfUsd ?? null));
    const cash = anchor.cashUsd;
    const debt = anchor.debtUsd;
    netCash.push(cash != null && debt != null ? cash - Math.abs(debt) : cash);
    sharesOutstanding.push(anchor.shares ?? null);
  }

  const hasHistorical = revenueGrowth.some((v) => v != null) || grossMargin.some((v) => v != null);
  if (!hasHistorical) return null;

  return {
    periodLabels,
    revenueUsd: padSeries(revenueUsd, periods),
    revenueGrowth: padSeries(revenueGrowth, periods),
    grossMargin: padSeries(grossMargin, periods),
    netMargin: padSeries(netMargin, periods),
    fcfMargin: padSeries(fcfMargin, periods),
    fcfUsd: padSeries(fcfUsd, periods),
    netIncomeGrowth: padSeries(netIncomeGrowth, periods),
    fcfGrowth: padSeries(fcfGrowth, periods),
    netCash: padSeries(netCash, periods),
    sharesOutstanding: padSeries(sharesOutstanding, periods),
    forwardRevenueGrowth: null,
    sources: { historical: "sec_companyfacts", forward: null },
  };
}

/** Research CONTEXT panel fundamentals — SEC XBRL history + document guidance. */
export async function getMarketFundamentalsForTicker(opts: {
  ticker: string;
  secBundle?: TickerSecBundle | null;
}): Promise<MarketFundamentals> {
  const ticker = String(opts.ticker ?? "").trim().toUpperCase();
  if (!ticker) return { ...EMPTY };

  let series = EMPTY;
  const periods = CONTEXT_FUNDAMENTAL_QUARTERS;
  try {
    const sec = opts.secBundle !== undefined ? opts.secBundle : await loadTickerSecBundle(ticker);
    if (sec) {
      const quarterly = fundamentalsSeriesFromQuarterlyFacts(sec.facts, periods);
      if (quarterly) series = quarterly;
    }
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
    ...series,
    forwardRevenueGrowth,
    sources: {
      historical: series.sources.historical,
      forward: forwardRevenueGrowth != null ? "documents" : null,
    },
  };
}
