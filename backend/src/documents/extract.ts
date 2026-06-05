import { llmChat } from "../core/llm.js";

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
};

const SOURCE_KEYS = [
  "8-K",
  "10-K",
  "10-Q",
  "6-K",
  "20-F",
  "S-1",
  "S-3",
  "S-4",
  "DEF 14A",
  "424B",
  "SC 13D",
  "SC 13G",
  "Press release",
  "Earnings transcript",
  "Investor presentation",
  "Annual report",
  "Gov contract",
  "ClinicalTrials.gov",
  "Form 4",
  "Form 3",
  "Form 5",
  "13F",
  "PTR",
  "Other",
];

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

function sourceKeyFromQueueType(sourceType: string): string | null {
  const s = String(sourceType ?? "").toLowerCase();
  if (s === "research_press_rss" || s === "bosha_press_rss") return "Press release";
  if (s === "research_transcript_rss" || s === "bosha_transcript_rss") return "Earnings transcript";
  if (s === "research_gov_contract" || s === "bosha_gov_contract") return "Gov contract";
  return null;
}

function normalizeSourceKey(raw: unknown, fallback: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return fallback;
  const hit = SOURCE_KEYS.find((k) => k.toLowerCase() === s.toLowerCase());
  return hit ?? s;
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
  const defaultSource = sourceKeyFromQueueType(sourceType) ?? "Other";

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

  return {
    out: {
      schema_type: "research_doc_v1",
      schema_version: "v1",
      title: out.title != null ? String(out.title) : null,
      primary_ticker: out.primary_ticker ? String(out.primary_ticker).trim().toUpperCase() : null,
      source_key: normalizeSourceKey(out.source_key, defaultSource),
      analysis: out.analysis.trim(),
      event_at: out.event_at ? String(out.event_at) : null,
      program_keys: Array.isArray(out.program_keys)
        ? out.program_keys.map((k) => String(k).trim()).filter(Boolean).slice(0, 8)
        : [],
      link_confidence:
        out.link_confidence != null && Number.isFinite(Number(out.link_confidence))
          ? Math.max(0, Math.min(1, Number(out.link_confidence)))
          : null,
    },
    model,
  };
}
