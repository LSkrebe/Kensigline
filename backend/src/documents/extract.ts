import { llmChat } from "../core/llm.js";
import {
  normalizeSourceKey,
  SOURCE_KEYS,
  sourceKeyFromQueueType,
} from "../shared/source-keys.js";

export type ResearchDocExtractV1 = {
  schema_type: "research_doc_v1";
  schema_version: "v1";
  title: string | null;
  primary_ticker: string | null;
  source_key: string;
  analysis: string;
  event_at: string | null;
  program_keys: string[];
  link_confidence: number | null;
  related_tickers?: {
    upstream?: string[];
    downstream?: string[];
  } | null;
};

function extractJsonObject(text: string): any {
  let raw = String(text ?? "").trim();
  if (!raw) throw new Error("empty_llm_response");
  raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
    throw new Error("llm_output_not_json");
  }
}

function sourceKeyFromQueueTypeLocal(sourceType: string): string | null {
  return sourceKeyFromQueueType(sourceType);
}

function normalizeSourceKeyLocal(raw: unknown, fallback: string): string {
  return normalizeSourceKey(raw, fallback);
}

function isResearchDocExtract(out: any): out is ResearchDocExtractV1 {
  return (
    out &&
    out.schema_type === "research_doc_v1" &&
    typeof out.analysis === "string" &&
    out.analysis.trim().length > 20
  );
}

export async function runResearchDocExtract(args: {
  text: string;
  url: string;
  sourceType: string;
  hintedTicker: string | null;
  hintedName: string | null;
}): Promise<{ out: ResearchDocExtractV1; model: string }> {
  const { text, url, sourceType, hintedTicker, hintedName } = args;
  const defaultSource = sourceKeyFromQueueTypeLocal(sourceType) ?? "Other";

  const messages = [
    {
      role: "system" as const,
      content: [
        "You extract structured research cards for an equity research timeline.",
        "Return ONLY valid JSON (no markdown).",
        "Write analysis as 1-3 dense sentences an investor can scan; no bullet lists.",
        "Do not invent tickers. Use null when uncertain.",
        `source_key must be one of: ${SOURCE_KEYS.join(", ")}.`,
        "For government contract text use source_key Gov contract and set link_confidence 0-1 for ticker linkage.",
        "For clinical trial registry pages use ClinicalTrials.gov and populate program_keys with drug names when explicit.",
        "When the text names related public tickers (suppliers, customers, peers), set related_tickers.upstream and related_tickers.downstream as string arrays of US tickers only.",
      ].join("\n"),
    },
    {
      role: "user" as const,
      content: [
        "Return exactly this JSON shape:",
        JSON.stringify({
          schema_type: "research_doc_v1",
          schema_version: "v1",
          title: "string|null",
          primary_ticker: "string|null",
          source_key: defaultSource,
          analysis: "string (required, 40+ chars)",
          event_at: "ISO8601 string|null",
          program_keys: ["string"],
          link_confidence: "number|null",
          related_tickers: { upstream: ["string"], downstream: ["string"] },
        }),
        `source_type: ${sourceType}`,
        `hinted_ticker: ${hintedTicker ?? "null"}`,
        `hinted_name: ${hintedName ?? "null"}`,
        `url: ${url}`,
        "document text:",
        text.slice(0, 95_000),
      ].join("\n\n"),
    },
  ];

  const { content, model } = await llmChat(messages, { temperature: 0, max_tokens: 1200 });
  const out = extractJsonObject(content);
  if (!isResearchDocExtract(out)) {
    throw new Error("llm_output_schema_mismatch");
  }

  const relatedTickers = normalizeRelatedTickers(out.related_tickers);

  return {
    out: {
      schema_type: "research_doc_v1",
      schema_version: "v1",
      title: out.title != null ? String(out.title) : null,
      primary_ticker: out.primary_ticker ? String(out.primary_ticker).trim().toUpperCase() : null,
      source_key: normalizeSourceKeyLocal(out.source_key, defaultSource),
      analysis: out.analysis.trim(),
      event_at: out.event_at ? String(out.event_at) : null,
      program_keys: Array.isArray(out.program_keys)
        ? out.program_keys.map((k) => String(k).trim()).filter(Boolean).slice(0, 8)
        : [],
      link_confidence:
        out.link_confidence != null && Number.isFinite(Number(out.link_confidence))
          ? Math.max(0, Math.min(1, Number(out.link_confidence)))
          : null,
      ...(relatedTickers != null ? { related_tickers: relatedTickers } : {}),
    },
    model,
  };
}

function normalizeRelatedTickers(raw: unknown): ResearchDocExtractV1["related_tickers"] {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const upstream = Array.isArray(r.upstream)
    ? r.upstream.map((t) => String(t).trim().toUpperCase()).filter(Boolean).slice(0, 8)
    : [];
  const downstream = Array.isArray(r.downstream)
    ? r.downstream.map((t) => String(t).trim().toUpperCase()).filter(Boolean).slice(0, 8)
    : [];
  if (!upstream.length && !downstream.length) return null;
  return { upstream, downstream };
}
