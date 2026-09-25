/**
 * Curated full-history targets — issuer tickers (Form 3/4/5) + 13F filer CIKs.
 * Parse still gates on shouldIngestFiler; these only scope SEC submissions pulls.
 */
import { EXPLORE_WATCHLIST_CATALOG } from "./watchlist-catalog.js";

/** Insider catalog id → primary issuer ticker(s) whose submissions hold their Form 4s. */
export const CURATED_INSIDER_ISSUER_TICKERS: Record<string, string[]> = {
  "jensen-huang": ["NVDA"],
  "colette-kress": ["NVDA"],
  "elon-musk": ["TSLA"],
  "tim-cook": ["AAPL"],
  "satya-nadella": ["MSFT"],
  "mark-zuckerberg": ["META"],
  "larry-ellison": ["ORCL"],
  "lisa-su": ["AMD"],
  "andy-jassy": ["AMZN"],
  "alex-karp": ["PLTR"],
  "hock-tan": ["AVGO"],
  "marc-benioff": ["CRM"],
  "jamie-dimon": ["JPM"],
  "mary-barra": ["GM"],
  "reed-hastings": ["NFLX"],
};

/**
 * Institution catalog id → known 13F reporting CIK(s).
 * Verified against common EDGAR filer identities; parse still name-gates.
 */
export const CURATED_INSTITUTION_CIKS: Record<string, string[]> = {
  "berkshire-hathaway": ["0001067983"],
  "pershing-square": ["0001336528"],
  "duquesne-family-office": ["0001536411"],
  "appaloosa": ["0001656456", "0001029205"],
  "citadel-advisors": ["0001423053"],
  "renaissance-technologies": ["0001037389"],
  "bridgewater": ["0001350694"],
  "elliott-management": ["0001791786", "0001048445"],
  "third-point": ["0001040273"],
  "baupost": ["0001061768"],
  "tiger-global": ["0001167483"],
  "coatue": ["0001535392"],
  "viking-global": ["0001107973"],
  "lone-pine": ["0001066107"],
  "icahn-capital": ["0000921669"],
};

export function curatedInsiderIssuerTickers(): string[] {
  return [...new Set(Object.values(CURATED_INSIDER_ISSUER_TICKERS).flat().map((t) => t.toUpperCase()))];
}

export function curatedInstitutionCiks(): Array<{ id: string; cik: string }> {
  const out: Array<{ id: string; cik: string }> = [];
  for (const [id, ciks] of Object.entries(CURATED_INSTITUTION_CIKS)) {
    for (const cik of ciks) out.push({ id, cik });
  }
  return out;
}

export function curatedPoliticianLastNames(): Array<{ id: string; lastName: string }> {
  return EXPLORE_WATCHLIST_CATALOG.filter((e) => e.mode === "politicians").map((e) => {
    const parts = e.name.trim().split(/\s+/);
    return { id: e.id, lastName: parts[parts.length - 1] ?? e.name };
  });
}

export function curatedCatalogCounts(): { politicians: number; insiders: number; institutions: number; total: number } {
  const politicians = EXPLORE_WATCHLIST_CATALOG.filter((e) => e.mode === "politicians").length;
  const insiders = EXPLORE_WATCHLIST_CATALOG.filter((e) => e.mode === "insiders").length;
  const institutions = EXPLORE_WATCHLIST_CATALOG.filter((e) => e.mode === "institutions").length;
  return { politicians, insiders, institutions, total: politicians + insiders + institutions };
}
