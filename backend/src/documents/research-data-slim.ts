import type { ResearchDocExtractV2 } from "./extract.js";
import { parseForwardRevenueGrowthFromText } from "../research/market/guidance-parse.js";

/** Source keys where forward guidance regex is worth keeping a short excerpt. */
const GUIDANCE_EXCERPT_SOURCES = new Set([
  "Earnings transcript",
  "8-K",
  "Press release",
  "10-Q",
  "10-K",
]);

const EXCERPT_CAP = 4_000;

type ResearchStoredExtras = {
  near_dup_key?: string;
  source_url?: string;
};

/**
 * Persist only fields that are not already first-class columns and that readers need.
 * Drops duplicate title/analysis/ticker/event_at and the fat 12k text_excerpt when possible.
 */
export function slimResearchDocumentData(
  out: ResearchDocExtractV2 & ResearchStoredExtras,
): Record<string, unknown> {
  const slim: Record<string, unknown> = {
    schema_type: out.schema_type ?? "research_doc_v2",
    schema_version: out.schema_version ?? "v2",
  };

  if (out.business_drivers?.length) slim.business_drivers = out.business_drivers;
  if (out.catalyst_at) slim.catalyst_at = out.catalyst_at;
  if (out.parse_meta) slim.parse_meta = out.parse_meta;
  if (out.near_dup_key) slim.near_dup_key = out.near_dup_key;
  if (out.source_url) slim.source_url = out.source_url;
  if (out.related_tickers) slim.related_tickers = out.related_tickers;
  if (out.program_keys?.length) slim.program_keys = out.program_keys;

  const excerpt = String(out.text_excerpt ?? "").trim();
  const fromExcerpt = excerpt.length > 40 ? parseForwardRevenueGrowthFromText(excerpt) : null;
  const fromAnalysis =
    fromExcerpt == null ? parseForwardRevenueGrowthFromText(String(out.analysis ?? "")) : null;
  const growth = fromExcerpt ?? fromAnalysis;
  if (growth != null) {
    slim.forward_revenue_growth_pct = growth;
  } else if (excerpt.length > 40 && GUIDANCE_EXCERPT_SOURCES.has(String(out.source_key ?? ""))) {
    slim.text_excerpt = excerpt.slice(0, EXCERPT_CAP);
  }

  return slim;
}
