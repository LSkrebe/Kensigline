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
  | { type: "price"; caption: string }
  | { type: "diagram"; caption: string };

export type ExplorePresentation = {
  title: string;
  subtitle: string;
  blocks: ExploreBlock[];
  diagram: ExploreDiagramSpec;
  explainer: string[];
};

function trunc(s: string, n: number) {
  const t = String(s ?? "").trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1)}…`;
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Build fork/merge or loop diagram from relationships + events. */
export function buildDiagramSpec(
  ticker: string,
  events: Array<{ kind: string; summary: string }>,
  rels: Array<{ rel_type: string; from_ticker: string | null; to_ticker: string | null; from_name: string; to_name: string }>,
): ExploreDiagramSpec {
  const t = ticker.trim().toUpperCase();
  if (rels.length >= 2) {
    const r0 = rels[0]!;
    const r1 = rels[1]!;
    const left = trunc(r0.from_ticker || r0.from_name || "Upstream", 26);
    const right = trunc(r1.from_ticker || r1.to_name || r1.from_name || "Parallel track", 26);
    return {
      layout: "fork_merge",
      nodes: [
        { id: "n0", label: "Filings & feeds" },
        { id: "n1", label: left },
        { id: "n2", label: right },
        { id: "n3", label: "Strategic / regulatory read" },
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
      { id: "t0", label: trunc(e0?.kind || "Signal", 22) },
      { id: "t1", label: trunc(e1?.kind || "Positioning", 22) },
      { id: "t2", label: trunc(e2?.kind || "Catalyst", 22) },
      { id: "b0", label: "Confirmation" },
      { id: "b1", label: "Flows / liquidity" },
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

  const events = await db.query<{ summary: string; kind: string; sentiment: string }>(
    `
    SELECT summary, kind, sentiment::text AS sentiment
    FROM bosha_events
    WHERE ticker = $1
    ORDER BY created_at DESC
    LIMIT 14
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

  const title =
    events.length > 0
      ? `${t}: ${trunc(events[0]!.summary, 100)}`
      : `${t}: Bosha signal surface`;

  const subtitle = `${name} · ${t} · score ${score.toFixed(1)} · ${isoDate(new Date())}${st?.updated_at ? ` · state ${String(st.updated_at).slice(0, 10)}` : ""}`;

  let intro: string;
  if (events.length === 0) {
    intro = `No Bosha-extracted document events are on file yet for ${name}. The composite score still incorporates insider, pharma, and politician feeds from shared pipelines when those symbols overlap ${t}. As filings and headlines are processed, this section will populate with structured signals.`;
  } else {
    const bits = events
      .slice(0, 4)
      .map((e) => `${e.kind}: ${trunc(e.summary, 220)}`)
      .join(" ");
    intro = `${name} currently shows ${events.length} structured Bosha signal${events.length === 1 ? "" : "s"} ranked by recency. ${bits}`;
  }

  let middle: string;
  if (rels.length === 0) {
    middle = `Relationship edges between ${t} and counterparties are not populated yet in the graph store. When supplier, partner, or competitor links appear in processed documents, they will tighten the thesis and adjust the diagram below.`;
  } else {
    const lines = rels
      .slice(0, 6)
      .map((r) => {
        const a = r.from_ticker ?? trunc(r.from_name, 24);
        const b = r.to_ticker ?? trunc(r.to_name, 24);
        return `${r.rel_type} (${Number(r.confidence).toFixed(2)}): ${a} → ${b}`;
      })
      .join(" ");
    middle = `Counterparty graph highlights: ${lines}`;
  }

  const sentimentHint = events.length > 0 ? Number(events[0]!.sentiment) || 0 : 0;
  const action =
    sentimentHint > 0.15
      ? `Bias in the latest extracted signals skews constructive for ${t}. Treat this as a prompt to reconcile against price: trim into strength if the tape front-runs evidence, and size trades against your liquidity horizon rather than headline novelty alone.`
      : sentimentHint < -0.15
        ? `Latest Bosha signals lean defensive for ${t}. Cross-check filings and tape behavior before adding risk; hedged structures may dominate until evidence improves.`
        : `Signal mix is balanced or thin for ${t}. Next moves depend on whether upcoming disclosures reinforce direction; keep position size aligned with how much of the thesis is already in the price.`;

  const priceCaption = `${t} · Composite Bosha score ${score.toFixed(
    1,
  )} blends document extractions with insider, pharma, and politician feeds. Daily closes below are informational only.`;

  const diagramSpec = buildDiagramSpec(
    t,
    events.map((e) => ({ kind: e.kind, summary: e.summary })),
    rels,
  );

  const diagramCaption =
    diagramSpec.layout === "fork_merge"
      ? `Evidence chain: disclosures split into parallel tracks before converging on a regulatory or strategic read, then ${t} repricing.`
      : `Causal loop: early signals feed positioning, catalyst confirmation, flows, and repricing—with feedback when liquidity snaps back into the middle of the chain.`;

  /** Flexible block order: more paragraphs when rich; tighter when sparse. */
  const blocks: ExploreBlock[] = [];
  blocks.push({ type: "paragraph", text: intro });
  if (events.length >= 5 && middle.length > 80) {
    blocks.push({ type: "paragraph", text: middle });
    blocks.push({ type: "price", caption: priceCaption });
    blocks.push({ type: "paragraph", text: action });
    blocks.push({ type: "diagram", caption: diagramCaption });
  } else if (events.length >= 1) {
    blocks.push({ type: "price", caption: priceCaption });
    blocks.push({ type: "paragraph", text: `${middle} ${action}` });
    blocks.push({ type: "diagram", caption: diagramCaption });
  } else {
    blocks.push({ type: "paragraph", text: middle });
    blocks.push({ type: "price", caption: priceCaption });
    blocks.push({ type: "paragraph", text: action });
    blocks.push({ type: "diagram", caption: diagramCaption });
  }

  const explainer = events.slice(0, 3).map((e) => `${e.kind}: ${trunc(e.summary, 140)}`);
  while (explainer.length < 3) {
    explainer.push(`Watch ${t} for the next dated filing or Bosha extraction batch to sharpen this brief.`);
  }

  return {
    title,
    subtitle,
    blocks,
    diagram: diagramSpec,
    explainer: explainer.slice(0, 3),
  };
}
