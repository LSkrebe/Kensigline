import { fetchSecJson, resolveCikForTicker } from "../../core/sec.js";
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
export async function getClinicalRunwayForTicker(opts: { ticker: string }): Promise<ClinicalRunway> {
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
    const { cik } = await resolveCikForTicker(ticker);
    const facts = await fetchSecJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`);
    const r = historicalRunwayFromCompanyFacts(facts);
    const hasData = r.cashUsd != null || r.quarterlyBurnUsd != null || r.runwayQuarters != null;
    return {
      ...r,
      source: hasData ? "sec_companyfacts" : null,
    };
  } catch {
    return empty;
  }
}
