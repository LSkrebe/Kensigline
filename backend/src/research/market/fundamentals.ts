import { loadTickerSecBundle, type TickerSecBundle } from "../../core/sec.js";
import { fundamentalsSeriesFromCompanyFacts } from "../../core/fundamentals.js";
import { forwardRevenueGrowthFromDocuments } from "./guidance.js";

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
  revenueGrowth: [null, null, null, null],
  grossMargin: [null, null, null, null],
  netMargin: [null, null, null, null],
  fcfMargin: [null, null, null, null],
  netIncomeGrowth: [null, null, null, null],
  fcfGrowth: [null, null, null, null],
  netCash: [null, null, null, null],
  sharesOutstanding: [null, null, null, null],
  forwardRevenueGrowth: null,
  sources: { historical: null, forward: null },
};

function padSeries(values: (number | null)[], count: number): (number | null)[] {
  if (values.length >= count) return values.slice(-count);
  return [...Array.from({ length: count - values.length }, () => null), ...values];
}

/** Research CONTEXT panel fundamentals — SEC XBRL history + document guidance. */
export async function getMarketFundamentalsForTicker(opts: {
  ticker: string;
  secBundle?: TickerSecBundle | null;
}): Promise<MarketFundamentals> {
  const ticker = String(opts.ticker ?? "").trim().toUpperCase();
  if (!ticker) return { ...EMPTY };

  let series = EMPTY;
  try {
    const sec = opts.secBundle !== undefined ? opts.secBundle : await loadTickerSecBundle(ticker);
    if (sec) {
      const s = fundamentalsSeriesFromCompanyFacts(sec.facts, { periods: 4 });
      const hasHistorical = s.periodLabels.length > 0 && s.revenueGrowth.some((v) => v != null);
      series = {
        periodLabels: s.periodLabels,
        revenueGrowth: padSeries(s.revenueGrowth, 4),
        grossMargin: padSeries(s.grossMargin, 4),
        netMargin: padSeries(s.netMargin, 4),
        fcfMargin: padSeries(s.fcfMargin, 4),
        netIncomeGrowth: padSeries(s.netIncomeGrowth, 4),
        fcfGrowth: padSeries(s.fcfGrowth, 4),
        netCash: padSeries(s.netCash, 4),
        sharesOutstanding: padSeries(s.sharesOutstanding, 4),
        forwardRevenueGrowth: null,
        sources: { historical: hasHistorical ? "sec_companyfacts" : null, forward: null },
      };
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
