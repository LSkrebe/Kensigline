import { loadTickerSecBundle, type TickerSecBundle } from "../../core/sec.js";
import { quarterlyPnlFromCompanyFacts } from "../../analyse/quarterly-pnl.js";
import { forwardRevenueGrowthFromDocuments } from "./guidance.js";

/** Context panel shows the latest N fiscal quarters (matches analyse 6M chart window). */
export const CONTEXT_FUNDAMENTAL_QUARTERS = 2;

export type MarketFundamentals = {
  periodLabels: string[];
  revenueGrowth: (number | null)[];
  grossMargin: (number | null)[];
  netMargin: (number | null)[];
  fcfMargin: (number | null)[];
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

const EMPTY: MarketFundamentals = {
  periodLabels: [],
  revenueGrowth: [null, null],
  grossMargin: [null, null],
  netMargin: [null, null],
  fcfMargin: [null, null],
  netIncomeGrowth: [null, null],
  fcfGrowth: [null, null],
  netCash: [null, null],
  sharesOutstanding: [null, null],
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

function marginPct(numerator: number | null, revenue: number | null): number | null {
  if (numerator == null || revenue == null || revenue === 0) return null;
  return Math.round((numerator / revenue) * 1000) / 10;
}

function fundamentalsSeriesFromQuarterlyFacts(companyFacts: unknown, periods = 4): MarketFundamentals | null {
  const quarters = quarterlyPnlFromCompanyFacts(companyFacts, { quarters: periods });
  if (quarters.length < 2) return null;

  const anchors = quarters.slice(-periods);
  const periodLabels = anchors.map((q) => q.label);
  const revenueGrowth: (number | null)[] = [];
  const grossMargin: (number | null)[] = [];
  const netMargin: (number | null)[] = [];
  const fcfMargin: (number | null)[] = [];
  const netIncomeGrowth: (number | null)[] = [];
  const fcfGrowth: (number | null)[] = [];
  const netCash: (number | null)[] = [];
  const sharesOutstanding: (number | null)[] = [];

  for (const anchor of anchors) {
    const prior = quarters.find((q) => q.fy === anchor.fy - 1 && q.fp === anchor.fp);
    revenueGrowth.push(pctChange(anchor.revenueUsd, prior?.revenueUsd ?? null));
    grossMargin.push(marginPct(anchor.grossProfitUsd, anchor.revenueUsd));
    netMargin.push(marginPct(anchor.netIncomeUsd, anchor.revenueUsd));
    fcfMargin.push(marginPct(anchor.fcfUsd, anchor.revenueUsd));
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
    revenueGrowth: padSeries(revenueGrowth, periods),
    grossMargin: padSeries(grossMargin, periods),
    netMargin: padSeries(netMargin, periods),
    fcfMargin: padSeries(fcfMargin, periods),
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
