import { db } from "../core/db.js";

export type ExploreDiagramEdge = { from: string; to: string };
export type ExploreDiagramNode = { id: string; label: string };

export type ExploreDiagramSpec = {
  layout: "fork_merge" | "causal_loop";
  nodes: ExploreDiagramNode[];
  edges: ExploreDiagramEdge[];
};

export type ExploreBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string }
  | { type: "price"; caption: string }
  | { type: "diagram"; caption: string };

/** Clickable provenance row for the paper footer. */
export type BoshaSourceRef = { label: string; url: string };

export type ExplorePresentation = {
  title: string;
  subtitle: string;
  blocks: ExploreBlock[];
  diagram: ExploreDiagramSpec;
  /** @deprecated Kept for JSON compatibility; live UI uses flowing blocks only. */
  explainer: string[];
  sources: BoshaSourceRef[];
};

function trunc(s: string, n: number) {
  const t = String(s ?? "").trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1)}…`;
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function claimKindWords(k: string) {
  const s = String(k ?? "").trim();
  if (!s) return "Signal";
  return s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function otherPartyLabel(
  ticker: string,
  r: { from_ticker: string | null; to_ticker: string | null; from_name: string; to_name: string },
): string {
  const t = ticker.trim().toUpperCase();
  if (r.from_ticker && r.from_ticker.toUpperCase() === t) {
    return trunc(r.to_ticker ?? r.to_name ?? "Entity", 28);
  }
  if (r.to_ticker && r.to_ticker.toUpperCase() === t) {
    return trunc(r.from_ticker ?? r.from_name ?? "Entity", 28);
  }
  return trunc(r.from_ticker ?? r.from_name ?? r.to_ticker ?? r.to_name ?? "Entity", 28);
}

/** Simple fork/merge or loop diagram compatible with `BoshaCausalDiagram` (5 or 6 nodes). */
export function buildDiagramSpec(
  ticker: string,
  events: Array<{ kind: string; summary: string }>,
  rels: Array<{ rel_type: string; from_ticker: string | null; to_ticker: string | null; from_name: string; to_name: string }>,
): ExploreDiagramSpec {
  const t = ticker.trim().toUpperCase();
  const anchored = rels.filter((r) => {
    const a = r.from_ticker?.toUpperCase() === t;
    const b = r.to_ticker?.toUpperCase() === t;
    return a || b;
  });

  if (anchored.length >= 2) {
    const r0 = anchored[0]!;
    const r1 = anchored[1]!;
    const left = otherPartyLabel(t, r0);
    const right = otherPartyLabel(t, r1);
    return {
      layout: "fork_merge",
      nodes: [
        { id: "n0", label: "Ingested signals" },
        { id: "n1", label: `${r0.rel_type}: ${left}` },
        { id: "n2", label: `${r1.rel_type}: ${right}` },
        { id: "n3", label: "Causal convergence" },
        { id: "n4", label: `${t} repricing` },
      ],
      edges: [
        { from: "n0", to: "n1" },
        { from: "n0", to: "n2" },
        { from: "n1", to: "n3" },
        { from: "n2", to: "n3" },
        { from: "n3", to: "n4" },
      ],
    };
  }

  const e0 = events[0];
  const e1 = events[1];
  const e2 = events[2];
  return {
    layout: "causal_loop",
    nodes: [
      { id: "t0", label: trunc(e0?.kind || "capacity", 22) },
      { id: "t1", label: trunc(e1?.kind || "supply_chain", 22) },
      { id: "t2", label: trunc(e2?.kind || "demand", 22) },
      { id: "b0", label: "Constraint" },
      { id: "b1", label: "Flow / capacity" },
      { id: "b2", label: "Repricing" },
    ],
    edges: [
      { from: "t0", to: "t1" },
      { from: "t1", to: "t2" },
      { from: "t2", to: "b0" },
      { from: "b0", to: "b1" },
      { from: "b1", to: "b2" },
      { from: "b2", to: "t1" },
    ],
  };
}

async function loadSourceRefs(ticker: string): Promise<BoshaSourceRef[]> {
  const t = ticker.trim().toUpperCase();
  const rows = await db.query<{ url: string; title: string | null; source_type: string; created_at: string }>(
    `
    SELECT * FROM (
      SELECT d.url, d.title, d.source_type, d.created_at::text
      FROM bosha_documents d
      INNER JOIN bosha_events e ON e.document_id = d.id AND e.ticker = $1
      WHERE d.url IS NOT NULL AND length(trim(d.url)) > 0
      UNION ALL
      SELECT d.url, d.title, d.source_type, d.created_at::text
      FROM bosha_documents d
      INNER JOIN bosha_claims c ON c.document_id = d.id AND c.ticker = $1 AND c.document_id IS NOT NULL
      WHERE c.document_id IS NOT NULL AND d.url IS NOT NULL AND length(trim(d.url)) > 0
    ) u
    ORDER BY u.created_at DESC
    LIMIT 32
    `,
    [t],
  );
  const seen = new Set<string>();
  const out: BoshaSourceRef[] = [];
  for (const r of rows) {
    const url = String(r.url ?? "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const raw = (r.title && r.title.trim()) || r.source_type || "Source";
    out.push({ label: trunc(raw, 56), url });
    if (out.length >= 14) break;
  }
  return out;
}

function metricsProse(score: number, components: Record<string, unknown>): string {
  const bits: string[] = [];
  if (components.baseline_score != null) bits.push(`the Bosha baseline sits near ${String(components.baseline_score)}`);
  if (components.bosha_events_14d != null) bits.push(`recent document signal mass is about ${String(components.bosha_events_14d)}`);
  if (components.relationship_boost != null) bits.push(`relationship boost contributes roughly ${String(components.relationship_boost)}`);
  if (components.cross_insider_log != null) bits.push(`insider activity contributes up to ${Number(components.cross_insider_log).toFixed(1)} points on the cross-feed scale`);
  if (components.cross_pharma_log != null) bits.push(`pharma overlap adds up to ${Number(components.cross_pharma_log).toFixed(1)}`);
  if (components.cross_politicians_log != null) bits.push(`politician mentions add up to ${Number(components.cross_politicians_log).toFixed(1)}`);
  const glue = bits.length ? `${bits.join(", ")}.` : "Cross-feed overlays are still thin for this symbol.";
  return `The composite Bosha score is ${score.toFixed(1)} on a 0–100 scale. Internally, ${glue} This is a machine-assembled index, not a price target.`;
}

function signalParagraphs(
  claims: Array<{ claim_type: string; confidence: string; evidence_snippet: string | null }>,
  events: Array<{ summary: string; kind: string }>,
): string[] {
  const paras: string[] = [];
  const sentences: string[] = [];
  for (const c of claims.slice(0, 5)) {
    const ev = trunc(c.evidence_snippet ?? "", 320);
    if (!ev) continue;
    sentences.push(
      `A ${claimKindWords(c.claim_type)} line in the store reads: ${ev} (confidence ${Number(c.confidence).toFixed(2)}).`,
    );
  }
  for (const e of events.slice(0, 6)) {
    sentences.push(`${claimKindWords(e.kind)} shows up as: ${trunc(e.summary, 320)}.`);
  }
  while (sentences.length && paras.length < 4) {
    const chunk = sentences.splice(0, 2).join(" ");
    if (chunk.trim()) paras.push(chunk);
  }
  if (!paras.length) {
    paras.push(
      "Once filings and allowlisted web sources are parsed into this workspace, structural claims and edges will appear here as short, sourced sentences rather than a narrative recap.",
    );
  }
  return paras;
}

export async function buildExplorePresentation(ticker: string): Promise<ExplorePresentation> {
  const t = ticker.trim().toUpperCase();

  const companyRow = await db.one<{ name: string | null }>(
    `SELECT name FROM companies WHERE upper(trim(ticker)) = $1 LIMIT 1`,
    [t],
  );
  const name = String(companyRow?.name ?? t).trim() || t;

  const st = await db.one<{ score: string; components: unknown; updated_at: string }>(
    `SELECT score::text, components, updated_at::text FROM bosha_ticker_state WHERE ticker = $1 LIMIT 1`,
    [t],
  );
  const score = st?.score != null ? Number(st.score) : 0;
  const components = (st?.components && typeof st.components === "object" ? st.components : {}) as Record<string, unknown>;

  const events = await db.query<{ summary: string; kind: string }>(
    `
    SELECT summary, kind
    FROM bosha_events
    WHERE ticker = $1
    ORDER BY created_at DESC
    LIMIT 14
    `,
    [t],
  );

  const claims = await db.query<{
    claim_type: string;
    confidence: string;
    evidence_snippet: string | null;
  }>(
    `
    SELECT claim_type, confidence::text, evidence_snippet
    FROM bosha_claims
    WHERE ticker = $1
    ORDER BY created_at DESC
    LIMIT 24
    `,
    [t],
  );

  const rels = await db.query<{
    rel_type: string;
    confidence: string;
    from_ticker: string | null;
    to_ticker: string | null;
    from_name: string;
    to_name: string;
  }>(
    `
    SELECT r.rel_type, r.confidence::text, fe.ticker AS from_ticker, te.ticker AS to_ticker, fe.name AS from_name, te.name AS to_name
    FROM bosha_relationships r
    JOIN bosha_entities fe ON fe.id = r.from_entity_id
    JOIN bosha_entities te ON te.id = r.to_entity_id
    WHERE fe.ticker = $1 OR te.ticker = $1
    ORDER BY r.confidence DESC NULLS LAST, r.created_at DESC
    LIMIT 12
    `,
    [t],
  );

  const claimConfAvg =
    claims.length > 0
      ? claims.reduce((a, c) => a + Number(c.confidence), 0) / claims.length
      : null;
  const score01 = Math.max(0, Math.min(1, score / 100));
  const reportConfidence =
    claimConfAvg != null ? Math.max(0, Math.min(1, (claimConfAvg + score01) / 2)) : score01;

  const topClaim = claims[0];
  const title = topClaim?.evidence_snippet?.trim()
    ? `${t} — ${trunc(topClaim.evidence_snippet, 110)}`
    : events[0]?.summary?.trim()
      ? `${t} — ${trunc(events[0]!.summary, 110)}`
      : `${t} — graph-backed structural read`;

  const subtitle = `${name} · ${t} · as of ${isoDate(new Date())} · synthesis confidence about ${reportConfidence.toFixed(2)} · not investment advice`;

  const highRels = rels.filter((r) => Number(r.confidence) >= 0.55);
  const counterpartyProse =
    highRels.length > 0
      ? `The highest-confidence edges on file run from ${highRels
          .slice(0, 6)
          .map((r) => {
            const a = r.from_ticker ?? trunc(r.from_name, 18);
            const b = r.to_ticker ?? trunc(r.to_name, 18);
            return `${String(a)} toward ${String(b)} under relation “${r.rel_type}” near ${Number(r.confidence).toFixed(2)}`;
          })
          .join("; ")}.`
      : `No counterparties above the 0.55 confidence cut are stored yet for ${t}; the exploration queue will attach names as new documents resolve.`;

  const evidenceProse =
    claims.length > 0
      ? `The strongest stored line items are written as short claims with provenance: ${claims
          .slice(0, 5)
          .map((c) => `${claimKindWords(c.claim_type)} (${Number(c.confidence).toFixed(2)}) — ${trunc(c.evidence_snippet ?? "", 200)}`)
          .join(" ")}`
      : events.length > 0
        ? `Event rows currently summarize: ${events
            .slice(0, 5)
            .map((e) => `${claimKindWords(e.kind)}: ${trunc(e.summary, 200)}`)
            .join(" ")}`
        : `No claim or event rows are on file for ${t} yet; the score still reflects any cross-feed overlap where this ticker appears in shared pipelines.`;

  const confidenceLine = `Under the current blend of claim confidence and the composite score scale, this read carries an aggregate confidence near ${reportConfidence.toFixed(2)}. Treat it as a filing-and-graph hygiene tool, not a recommendation.`;

  const diagramSpec = buildDiagramSpec(
    t,
    events.map((e) => ({ kind: e.kind, summary: e.summary })),
    rels,
  );

  const diagramCaption =
    diagramSpec.layout === "fork_merge"
      ? "Topology highlights two parallel causal tracks that merge before the anchor reprices."
      : "Topology loops capacity and flow pressure back into the middle of the chain.";

  const overview = `This page is anchored on ${name} (${t}). It is built only from structured rows in this database: Bosha extractions, relationship edges, and lightweight cross-feed counts where the same symbol appears in other Kensigline pipelines.`;

  const signalParas = signalParagraphs(claims, events);
  const sources = await loadSourceRefs(t);

  const blocks: ExploreBlock[] = [
    { type: "heading", text: "Company focus" },
    { type: "paragraph", text: overview },
    { type: "heading", text: "Price" },
    {
      type: "price",
      caption: `Daily closes for ${t}. The sparkline is informational; the composite Bosha score printed in the score rail is ${score.toFixed(1)}.`,
    },
    { type: "heading", text: "Scoreboard" },
    { type: "paragraph", text: metricsProse(score, components) },
    { type: "heading", text: "Structural signals" },
    ...signalParas.map((p) => ({ type: "paragraph" as const, text: p })),
    { type: "heading", text: "Entity map" },
    { type: "diagram", caption: diagramCaption },
    { type: "heading", text: "Counterparties" },
    { type: "paragraph", text: counterpartyProse },
    { type: "heading", text: "Traceability" },
    { type: "paragraph", text: evidenceProse },
    { type: "paragraph", text: confidenceLine },
  ];

  return {
    title,
    subtitle,
    blocks,
    diagram: diagramSpec,
    explainer: [],
    sources,
  };
}
