export type ResearchFeedMode = "market" | "clinical";

export function parseResearchFeedMode(raw: string | null | undefined): ResearchFeedMode {
  return String(raw ?? "").trim().toLowerCase() === "clinical" ? "clinical" : "market";
}

/** True when a company industry string indicates biotech / pharma. */
export function isClinicalIndustry(industry: string | null | undefined): boolean {
  const ind = String(industry ?? "").toLowerCase();
  return (
    ind.includes("biotech") ||
    ind.includes("biopharm") ||
    ind.includes("pharma") ||
    ind.includes("drug") ||
    ind.includes("life science")
  );
}

export type ClinicalDocumentSignals = {
  feedKind?: string | null | undefined;
  docKind?: string | null | undefined;
  sourceKey?: string | null | undefined;
  url?: string | null | undefined;
  programDrug?: string | null | undefined;
  programPhase?: string | null | undefined;
  programKeys?: string[] | null | undefined;
  data?: unknown;
};

/**
 * True when a stored document is trial / clinical-specific (not a general SEC filing).
 * General 8-K / 10-Q research cards alone do not qualify.
 */
export function isClinicalDocumentSignals(signals: ClinicalDocumentSignals): boolean {
  if (String(signals.feedKind ?? "").toLowerCase() === "pharma") return true;
  if (String(signals.docKind ?? "").toLowerCase() === "trial_event") return true;

  const src = String(signals.sourceKey ?? "");
  if (/clinicaltrials/i.test(src)) return true;
  if (/clinicaltrials\.gov/i.test(String(signals.url ?? ""))) return true;

  if (String(signals.programDrug ?? "").trim()) return true;
  if (String(signals.programPhase ?? "").trim()) return true;
  if (Array.isArray(signals.programKeys) && signals.programKeys.some((k) => String(k ?? "").trim())) {
    return true;
  }

  const data = signals.data;
  if (data && typeof data === "object" && String((data as { nct_id?: unknown }).nct_id ?? "").trim()) {
    return true;
  }

  return false;
}

/** SQL predicate on a `companies.industry` column (or alias). */
export const CLINICAL_INDUSTRY_WHERE_SQL = `
  industry ILIKE '%biotech%'
  OR industry ILIKE '%biopharm%'
  OR industry ILIKE '%pharma%'
  OR industry ILIKE '%drug%'
  OR industry ILIKE '%life science%'
`;

/**
 * SQL predicate: document row carries trial / clinical evidence (excludes general filings).
 * Requires analyzed content so empty queue rows do not classify tickers.
 */
export const CLINICAL_DOCUMENT_WHERE_SQL = `
  feed_kind = 'pharma'
  OR doc_kind = 'trial_event'
  OR source_key ILIKE '%clinicaltrials%'
  OR url ILIKE '%clinicaltrials.gov%'
  OR (program_drug IS NOT NULL AND length(trim(program_drug)) > 0)
  OR (program_phase IS NOT NULL AND length(trim(program_phase)) > 0)
  OR cardinality(program_keys) > 0
  OR COALESCE(nullif(trim(data->>'nct_id'), ''), '') <> ''
`;

/**
 * Tickers treated as clinical/pharma for Research feed mode.
 * Default is market — qualify via biotech industry or trial-specific documents only.
 */
export const CLINICAL_TICKERS_SUBQUERY = `
  SELECT DISTINCT upper(trim(ticker)) AS ticker
  FROM (
    SELECT upper(trim(ticker)) AS ticker
    FROM documents
    WHERE ticker IS NOT NULL
      AND length(trim(ticker)) > 0
      AND analysis IS NOT NULL
      AND length(trim(analysis)) > 0
      AND show_on_ticker IS NOT FALSE
      AND (${CLINICAL_DOCUMENT_WHERE_SQL})
    UNION
    SELECT upper(trim(ticker)) AS ticker
    FROM companies
    WHERE ticker IS NOT NULL
      AND length(trim(ticker)) > 0
      AND (${CLINICAL_INDUSTRY_WHERE_SQL})
  ) clinical_tickers
  WHERE ticker IS NOT NULL
    AND length(trim(ticker)) > 0
`;
