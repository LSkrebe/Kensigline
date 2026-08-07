import type { ResearchDocExtractV2 } from "./extract.js";
import { normalizeSourceKey } from "../shared/source-keys.js";

export function guessSecFormFromFilingText(text: string): string {
  const head = text.slice(0, 8000);
  const sub = head.match(/CONFORMED SUBMISSION TYPE:\s*([A-Z0-9\-/\s]+)/i);
  if (sub?.[1]) {
    const raw = sub[1].trim().replace(/\s+/g, " ").toUpperCase().replace(/\/A$/, "");
    if (raw.startsWith("10-Q")) return "10-Q";
    if (raw.startsWith("10-K")) return "10-K";
    if (raw.startsWith("8-K")) return "8-K";
    if (raw.startsWith("6-K")) return "6-K";
    if (raw.startsWith("20-F")) return "20-F";
    return raw.split(/\s/)[0] ?? "8-K";
  }
  const inline = head.match(/\b(8-K|10-Q|10-K|6-K|20-F)\b/i);
  return inline?.[1] ? inline[1].toUpperCase() : "8-K";
}

export function secFilingEventAtFromText(text: string): string | null {
  const filed = text.match(/FILED AS OF DATE:\s*(\d{8})/i);
  if (!filed?.[1]) return null;
  const d = filed[1];
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00.000Z`;
}

function formatDisplayDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/** One-line event label for paper panel / feeds — no LLM prose. */
export function buildDocumentDisplayLine(args: {
  sourceKey: string;
  ticker?: string | null;
  companyName?: string | null;
  eventAt?: string | null;
  headline?: string | null;
}): string {
  const source = normalizeSourceKey(args.sourceKey, "Other");
  const ticker = args.ticker?.trim().toUpperCase() ?? null;
  const headline = String(args.headline ?? "").trim();
  if (headline && headline.length >= 8 && headline.length <= 140) {
    return headline;
  }
  const who = ticker ?? (args.companyName?.trim() || "issuer");
  const date = formatDisplayDate(args.eventAt ?? null);
  return date ? `${source} · ${who} · ${date}` : `${source} · ${who}`;
}

export function buildTemplateResearchExtract(args: {
  sourceKey: string;
  ticker: string | null;
  companyName: string | null;
  eventAt: string | null;
  url?: string | null;
  textExcerpt?: string | null;
  headline?: string | null;
}): ResearchDocExtractV2 {
  const source_key = normalizeSourceKey(args.sourceKey, "Other");
  const ticker = args.ticker?.trim().toUpperCase() ?? null;
  const headline = args.headline !== undefined ? args.headline : null;
  const display = buildDocumentDisplayLine({
    sourceKey: source_key,
    ticker,
    companyName: args.companyName,
    eventAt: args.eventAt,
    headline,
  });
  return {
    schema_type: "research_doc_v2",
    schema_version: "v2",
    title: display,
    primary_ticker: ticker,
    source_key,
    analysis: display,
    event_at: args.eventAt,
    program_keys: [],
    link_confidence: ticker ? 0.9 : 0.4,
  ...(args.textExcerpt ? { text_excerpt: args.textExcerpt.slice(0, 4_000) } : {}),
};
}

export function filingTextExcerpt(text: string, max = 12_000): string {
  return String(text ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}
