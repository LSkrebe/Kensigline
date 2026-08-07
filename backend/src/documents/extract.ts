import { llmChat } from "../core/llm.js";
import { LLM_BUDGETS } from "../core/llm-budgets.js";
import {
  normalizeSourceKey,
  SOURCE_KEYS,
  sourceKeyFromQueueType,
} from "../shared/source-keys.js";

export type ResearchBusinessDriver = {
  label: string;
  driver_kind?: string;
  rolls_up_to_revenue?: boolean;
  value_usd_millions?: number | null;
  value?: number | null;
  unit?: string | null;
  period?: string | null;
};

export type ResearchDocExtractV2 = {
  schema_type: "research_doc_v2";
  schema_version: "v2";
  title: string;
  primary_ticker: string | null;
  source_key: string;
  analysis: string;
  event_at: string | null;
  catalyst_at?: string | null;
  program_keys: string[];
  link_confidence: number | null;
  related_tickers?: {
    upstream?: string[];
    downstream?: string[];
  } | null;
  business_drivers?: ResearchBusinessDriver[];
  /** Compact source text for regex guidance — no LLM required. */
  text_excerpt?: string;
  /** How this card was built (template / LLM / reuse). Optional; stored for audits. */
  parse_meta?: import("../shared/parse-meta.js").DocumentParseMeta;
};

/** @deprecated Use ResearchDocExtractV2 */
export type ResearchDocExtractV1 = ResearchDocExtractV2;

const RESEARCH_LLM_MAX_CHARS = LLM_BUDGETS.researchExtractCap();

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

function normalizeBusinessDrivers(raw: unknown): ResearchBusinessDriver[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ResearchBusinessDriver[] = [];
  for (const item of raw.slice(0, 8)) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const label = String(r.label ?? "").trim();
    if (label.length < 2 || label.length > 80) continue;
    const driverKind = String(r.driver_kind ?? r.driverKind ?? "other").trim().toLowerCase() || "other";
    const valueUsd = r.value_usd_millions != null ? Number(r.value_usd_millions) : null;
    const value = r.value != null ? Number(r.value) : null;
    out.push({
      label,
      driver_kind: driverKind,
      ...(r.rolls_up_to_revenue === false || r.rollsUpToRevenue === false ? { rolls_up_to_revenue: false } : {}),
      value_usd_millions: Number.isFinite(valueUsd as number) ? (valueUsd as number) : null,
      value: Number.isFinite(value as number) ? (value as number) : null,
      unit: r.unit != null ? String(r.unit).trim().slice(0, 40) : null,
      period: r.period != null ? String(r.period).trim().slice(0, 40) : null,
    });
  }
  return out.length ? out : undefined;
}

const STRUCTURED_EXTRACT_SCHEMA = {
  schema_type: "research_doc_v2",
  schema_version: "v2",
  primary_ticker: "string|null",
  source_key: "string",
  event_at: "ISO8601|null",
  catalyst_at: "ISO8601|null",
  program_keys: ["string"],
  link_confidence: "number|null",
  business_drivers: [
    {
      label: "string (segment/product line/metric name, 2-6 words)",
      driver_kind: "revenue|units|enrollment|volume|other",
      rolls_up_to_revenue: "boolean (true when this driver is part of total revenue)",
      value_usd_millions: "number|null (segment revenue in USD millions when disclosed)",
      value: "number|null (non-revenue metric count when disclosed)",
      unit: "string|null",
      period: "string|null (e.g. Q2 FY2025)",
    },
  ],
};

function buildStructuredExtractSystemPrompt(defaultSource: string): string {
  return [
    "Extract structured operating metrics from an earnings SEC filing or earnings call transcript.",
    "Return ONLY valid JSON matching the schema — no title, no analysis, no summary prose.",
    `Schema: ${JSON.stringify({ ...STRUCTURED_EXTRACT_SCHEMA, source_key: defaultSource })}`,
    "Extract disclosed segment revenues and KPIs into business_drivers when numbers are explicit.",
    "Do not invent tickers, numbers, or dates. Use null when uncertain.",
    `source_key must be one of: ${SOURCE_KEYS.join(", ")}.`,
  ].join("\n");
}

function isStructuredResearchExtract(out: any): boolean {
  const schema = String(out?.schema_type ?? "");
  return (
    out &&
    (schema === "research_doc_v2" || schema === "research_doc_v1") &&
    (Array.isArray(out.business_drivers) || out.event_at != null || out.primary_ticker != null)
  );
}

/** Structured fields only — used for Analyse drivers; display copy comes from templates. */
export async function runStructuredResearchExtract(args: {
  text: string;
  url: string;
  sourceType: string;
  hintedTicker: string | null;
  hintedName: string | null;
}): Promise<{
  primary_ticker: string | null;
  source_key: string;
  event_at: string | null;
  catalyst_at?: string | null;
  program_keys: string[];
  link_confidence: number | null;
  business_drivers?: ResearchBusinessDriver[];
  model: string | null;
}> {
  const defaultSource = sourceKeyFromQueueType(args.sourceType) ?? "Other";
  const body = String(args.text ?? "").slice(0, RESEARCH_LLM_MAX_CHARS);

  const messages = [
    { role: "system" as const, content: buildStructuredExtractSystemPrompt(defaultSource) },
    {
      role: "user" as const,
      content: [
        `source_type: ${args.sourceType}`,
        `hinted_ticker: ${args.hintedTicker ?? "null"}`,
        `hinted_name: ${args.hintedName ?? "null"}`,
        `url: ${args.url}`,
        "document text:",
        body,
      ].join("\n\n"),
    },
  ];

  const { content, model } = await llmChat(messages, {
    temperature: 0,
    max_tokens: 700,
    log_context: "research/structured",
  });
  const out = extractJsonObject(content);
  if (!isStructuredResearchExtract(out)) {
    throw new Error("llm_output_schema_mismatch");
  }

  const businessDrivers = normalizeBusinessDrivers(out.business_drivers);
  const catalyst_at = out.catalyst_at ? String(out.catalyst_at) : null;

  return {
    primary_ticker: out.primary_ticker ? String(out.primary_ticker).trim().toUpperCase() : null,
    source_key: normalizeSourceKey(out.source_key, defaultSource),
    event_at: out.event_at ? String(out.event_at) : null,
    ...(catalyst_at ? { catalyst_at } : {}),
    program_keys: Array.isArray(out.program_keys)
      ? out.program_keys.map((k: unknown) => String(k).trim()).filter(Boolean).slice(0, 8)
      : [],
    link_confidence:
      out.link_confidence != null && Number.isFinite(Number(out.link_confidence))
        ? Math.max(0, Math.min(1, Number(out.link_confidence)))
        : null,
    ...(businessDrivers != null ? { business_drivers: businessDrivers } : {}),
    model: model ?? null,
  };
}
