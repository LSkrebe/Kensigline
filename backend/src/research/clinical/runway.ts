import { loadTickerSecBundle, type TickerSecBundle } from "../../core/sec.js";
import { historicalRunwayFromCompanyFacts } from "../../core/runway.js";

export type ClinicalRunway = {
  cashUsd: number | null;
  quarterlyBurnUsd: number | null;
  runwayQuarters: number | null;
  periodEnd: string | null;
  fiscalPeriod: string | null;
  source: "sec_companyfacts" | null;
};

/** Research clinical CONTEXT panel — cash, burn, runway from SEC XBRL. */
export async function getClinicalRunwayForTicker(opts: {
  ticker: string;
  secBundle?: TickerSecBundle | null;
}): Promise<ClinicalRunway> {
  const ticker = String(opts.ticker ?? "").trim().toUpperCase();
  const empty: ClinicalRunway = {
    cashUsd: null,
    quarterlyBurnUsd: null,
    runwayQuarters: null,
    periodEnd: null,
    fiscalPeriod: null,
    source: null,
  };

  if (!ticker) return empty;

  try {
    const sec = opts.secBundle !== undefined ? opts.secBundle : await loadTickerSecBundle(ticker);
    if (!sec) return empty;
    const r = historicalRunwayFromCompanyFacts(sec.facts);
    const hasData = r.cashUsd != null || r.quarterlyBurnUsd != null || r.runwayQuarters != null;
    return {
      ...r,
      source: hasData ? "sec_companyfacts" : null,
    };
  } catch {
    return empty;
  }
}
