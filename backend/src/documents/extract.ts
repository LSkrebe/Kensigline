import { llmChat } from "../core/llm.js";
import { LLM_BUDGETS } from "../core/llm-budgets.js";
import {
  normalizeSourceKey,
  SOURCE_KEYS,
  sourceKeyFromQueueType,
} from "../shared/source-keys.js";
export type ResearchDocExtractV2 = {
  schema_type: "research_doc_v2";
  schema_version: "v2";
  title: string;
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

/** @deprecated Use ResearchDocExtractV2 */
export type ResearchDocExtractV1 = ResearchDocExtractV2;

const RESEARCH_LLM_MAX_CHARS = LLM_BUDGETS.researchExtractCap();

const RESEARCH_EXTRACT_SCHEMA = {
  schema_type: "research_doc_v2",
  schema_version: "v2",
  title: "string (4-12 word catalyst headline; numbers/dates when material)",
  primary_ticker: "string|null",
  source_key: "string",
  analysis: "string (1 sentence, ~70-220 chars; trade-relevant delta only)",
  event_at: "ISO8601|null",
  program_keys: ["string"],
  link_confidence: "number|null",
  related_tickers: { upstream: ["string"], downstream: ["string"] },
};

function buildResearchExtractSystemPrompt(defaultSource: string): string {
  return [
    "You write catalyst cards for Mercerline — an event-driven equity research terminal used by traders scanning filings, PR, and transcripts for stock-moving facts.",
    "Return ONLY valid JSON (no markdown) matching the schema.",
    `Schema: ${JSON.stringify({ ...RESEARCH_EXTRACT_SCHEMA, source_key: defaultSource })}`,
    "",
    "TITLE (4–12 words):",
    "- Headline the market-moving event, not the filing mechanics.",
    "- Put the hardest fact first: $ amounts, % changes, beats/misses, dates, regulatory gates.",
    "- Do not start with the company name — the user already has the ticker.",
    "- Bad: 'Files 2028 general rate case with CPUC'. Good: 'Seeks +8% 2028 revenue requirement; CPUC decision ~H2 2027'.",
    "",
    "ANALYSIS (one sentence, ~70–220 chars):",
    "- Answer: what changed, by how much, and what happens next — only if it matters for the stock.",
    "- Lead with deltas vs prior guidance, consensus, prior rate case, or prior period — not with 'filed/announced/submitted'.",
    "- Extract specific numbers, dates, vote/approval milestones, guidance ranges, deal terms, capex, enrollment, FDA actions when present.",
    "- Implied investor angle in the same breath: revenue/margin/cash/regulatory/capacity/timing risk.",
    "",
    "NEVER write:",
    "- Company legal name or 'the company' opener",
    "- Process filler: 'filed with', 'announced that', 'subject to approval', 'may differ from what is requested', 'pursuant to', 'in accordance with'",
    "- Restating the document type without a new fact ('filed an 8-K', 'issued a press release')",
    "- Disclaimers, boilerplate, or repeating info obvious from the title",
    "",
    "If the document is purely procedural with no quantified change, give the one non-obvious gate: decision body, next milestone date, or what binary outcome investors are waiting on — skip the filing wrapper.",
    "If nothing material exists, still return JSON but make analysis the sharpest possible fact from the text — never generic summary prose.",
    "",
    "Do not invent tickers, numbers, or dates. Use null when uncertain.",
    `source_key must be one of: ${SOURCE_KEYS.join(", ")}.`,
    "Gov contract: source_key Gov contract + link_confidence 0-1.",
    "Clinical registry: ClinicalTrials.gov + program_keys when explicit.",
    "related_tickers: US tickers only when explicitly named in the document.",
  ].join("\n");
}

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

function normalizeHeadline(raw: unknown): string | null {
  const t = String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (t.length < 8) return null;
  if (t.length > 120) return t.slice(0, 119).trim();
  return t;
}

function isResearchDocExtract(out: any): out is ResearchDocExtractV2 {
  const schema = String(out?.schema_type ?? "");
  const versionOk = schema === "research_doc_v2" || schema === "research_doc_v1";
  return (
    out &&
    versionOk &&
    typeof out.analysis === "string" &&
    out.analysis.trim().length >= 40 &&
    normalizeHeadline(out.title) != null
  );
}

export async function runResearchDocExtract(args: {
  text: string;
  url: string;
  sourceType: string;
  hintedTicker: string | null;
  hintedName: string | null;
}): Promise<{ out: ResearchDocExtractV2; model: string }> {
  const { text, url, sourceType, hintedTicker, hintedName } = args;
  const defaultSource = sourceKeyFromQueueTypeLocal(sourceType) ?? "Other";
  const body = String(text ?? "").slice(0, RESEARCH_LLM_MAX_CHARS);

  const messages = [
    {
      role: "system" as const,
      content: buildResearchExtractSystemPrompt(defaultSource),
    },
    {
      role: "user" as const,
      content: [
        `source_type: ${sourceType}`,
        `hinted_ticker: ${hintedTicker ?? "null"}`,
        `hinted_name: ${hintedName ?? "null"}`,
        `url: ${url}`,
        "document text:",
        body,
      ].join("\n\n"),
    },
  ];

  const { content, model } = await llmChat(messages, {
    temperature: 0,
    max_tokens: 800,
    log_context: "research/extract",
  });
  const out = extractJsonObject(content);
  if (!isResearchDocExtract(out)) {
    throw new Error("llm_output_schema_mismatch");
  }

  const relatedTickers = normalizeRelatedTickers(out.related_tickers);
  const title = normalizeHeadline(out.title)!;
  const analysis = out.analysis.trim();

  return {
    out: {
      schema_type: "research_doc_v2",
      schema_version: "v2",
      title,
      primary_ticker: out.primary_ticker ? String(out.primary_ticker).trim().toUpperCase() : null,
      source_key: normalizeSourceKeyLocal(out.source_key, defaultSource),
      analysis,
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

function normalizeRelatedTickers(raw: unknown): ResearchDocExtractV2["related_tickers"] {
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
