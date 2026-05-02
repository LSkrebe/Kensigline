import { llmChat } from "../core/llm.js";

/**
 * "MiroShark" structured extraction: one JSON blob per document.
 * Keep fields small and stable for scoring and UI.
 */
export type MiroSharkCompany = { name: string; ticker: string | null };

export type MiroSharkEvent = {
  label: string;
  kind: string;
  event_at: string | null;
  magnitude: number;
  novelty: number;
  sentiment: number;
};

export type MiroSharkRelationship = {
  from_ticker: string | null;
  from_name: string | null;
  to_ticker: string | null;
  to_name: string | null;
  type: "supplier" | "partner" | "competitor" | "customer" | "other";
  confidence: number;
};

export type MiroSharkV1 = {
  schema_type: "miroshark_v1";
  schema_version: "v1";
  title: string | null;
  primary_ticker: string | null;
  events: MiroSharkEvent[];
  companies: MiroSharkCompany[];
  relationships: MiroSharkRelationship[];
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

function buildPrompt(args: { text: string; url: string; hintedTicker: string | null; hintedName: string | null }) {
  const { text, url, hintedTicker, hintedName } = args;
  return [
    {
      role: "system" as const,
      content: [
        "You are a document-to-signals extractor for public market research.",
        "Read the text and return ONLY valid JSON (no markdown).",
        "Do not invent tickers. If uncertain, use null.",
        "magnitude, novelty: numbers between 0 and 1 (2 decimals).",
        "sentiment: -1 bearish to +1 bullish.",
        "events: at most 6 high-signal items; each has a short label (under 120 chars).",
        "companies: key mentioned issuers or peers (name + optional ticker).",
        "relationships: at most 8 edges between those companies; type must be one of supplier, partner, competitor, customer, other.",
        "confidence: 0 to 1 for each relationship.",
      ].join("\n"),
    },
    {
      role: "user" as const,
      content: [
        "Return exactly this JSON shape:",
        JSON.stringify({
          schema_type: "miroshark_v1",
          schema_version: "v1",
          title: "string|null",
          primary_ticker: "string|null",
          events: [
            {
              label: "string",
              kind: "string",
              event_at: "string|null",
              magnitude: 0.5,
              novelty: 0.5,
              sentiment: 0,
            },
          ],
          companies: [{ name: "string", ticker: "string|null" }],
          relationships: [
            {
              from_ticker: "string|null",
              from_name: "string|null",
              to_ticker: "string|null",
              to_name: "string|null",
              type: "partner",
              confidence: 0.6,
            },
          ],
        }),
        "",
        "HINTS (may be null):",
        JSON.stringify({ url, issuer_ticker: hintedTicker, issuer_name: hintedName }),
        "",
        "DOCUMENT TEXT (truncated):",
        text.slice(0, 100_000),
      ].join("\n"),
    },
  ];
}

function normalizeExtraction(raw: any): MiroSharkV1 {
  const events: MiroSharkEvent[] = Array.isArray(raw?.events) ? raw.events : [];
  const companies: MiroSharkCompany[] = Array.isArray(raw?.companies) ? raw.companies : [];
  const rels: MiroSharkRelationship[] = Array.isArray(raw?.relationships) ? raw.relationships : [];

  const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
  const ev = events.slice(0, 8).map((e: Record<string, unknown>) => ({
    label: String(e?.label ?? e?.summary ?? "Event").trim().slice(0, 500) || "Event",
    kind: String(e?.kind ?? "other").trim().slice(0, 64) || "other",
    event_at: e?.event_at != null ? String(e.event_at) : null,
    magnitude: clamp(Number(e?.magnitude ?? 0.3), 0, 1),
    novelty: clamp(Number(e?.novelty ?? 0.3), 0, 1),
    sentiment: clamp(Number(e?.sentiment ?? 0), -1, 1),
  }));

  const co = companies
    .slice(0, 20)
    .map((c) => ({
      name: String(c?.name ?? "").trim() || "Unknown",
      ticker: c?.ticker != null ? String(c.ticker).replace(/[^A-Z]/gi, "").toUpperCase().slice(0, 5) || null : null,
    }))
    .filter((c) => c.name.length > 0);

  const allowed = new Set(["supplier", "partner", "competitor", "customer", "other"]);
  const rs = rels.slice(0, 12).map((r) => {
    const t = String(r?.type ?? "other").toLowerCase();
    const type = (allowed.has(t) ? t : "other") as MiroSharkRelationship["type"];
    return {
      from_ticker: r?.from_ticker != null ? String(r.from_ticker).toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5) || null : null,
      from_name: r?.from_name != null ? String(r.from_name).trim().slice(0, 200) : null,
      to_ticker: r?.to_ticker != null ? String(r.to_ticker).toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5) || null : null,
      to_name: r?.to_name != null ? String(r.to_name).trim().slice(0, 200) : null,
      type,
      confidence: clamp(Number(r?.confidence ?? 0.5), 0, 1),
    };
  });

  const primary =
    raw?.primary_ticker != null
      ? String(raw.primary_ticker).toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5) || null
      : null;

  return {
    schema_type: "miroshark_v1",
    schema_version: "v1",
    title: raw?.title != null ? String(raw.title).trim().slice(0, 300) : null,
    primary_ticker: primary,
    events: ev,
    companies: co,
    relationships: rs,
  };
}

export async function runMiroSharkExtract(args: {
  text: string;
  url: string;
  hintedTicker: string | null;
  hintedName: string | null;
}): Promise<{ out: MiroSharkV1; model: string }> {
  const messages = buildPrompt(args);
  const { content, model } = await llmChat(messages, { temperature: 0, max_tokens: 2200, response_format: "json_object" });
  const raw = extractJsonObject(content);
  return { out: normalizeExtraction(raw), model };
}
