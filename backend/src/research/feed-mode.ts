export type ResearchFeedMode = "market" | "clinical";

export function parseResearchFeedMode(raw: string | null | undefined): ResearchFeedMode {
  return String(raw ?? "").trim().toLowerCase() === "clinical" ? "clinical" : "market";
}

/** Tickers with at least one stored clinical document (pharma pipeline or tagged research). */
export const CLINICAL_TICKERS_SUBQUERY = `
  SELECT DISTINCT upper(trim(ticker)) AS ticker
  FROM documents
  WHERE ticker IS NOT NULL
    AND length(trim(ticker)) > 0
    AND analysis IS NOT NULL
    AND length(trim(analysis)) > 0
    AND (
      feed_kind = 'pharma'
      OR (
        feed_kind = 'research'
        AND show_on_ticker IS NOT FALSE
        AND (
          (program_keys IS NOT NULL AND cardinality(program_keys) > 0)
          OR source_key = 'ClinicalTrials.gov'
        )
      )
    )
`;
