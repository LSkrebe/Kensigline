import { db } from "../core/db.js";
import { loadPaperDocumentsForTicker, type PaperDocumentRow } from "./store.js";

export type ExploreBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string }
  | { type: "price"; caption: string }
  | { type: "diagram"; caption: string };

export type ResearchSourceRef = { label: string; url: string };

export type ExplorePresentation = {
  title: string;
  subtitle: string;
  blocks: ExploreBlock[];
  diagram?: {
    layout: "fork_merge" | "causal_loop";
    nodes: Array<{ id: string; label: string }>;
    edges: Array<{ from: string; to: string }>;
  } | undefined;
  explainer: string[];
  sources: ResearchSourceRef[];
  documents: PaperDocumentRow[];
};

function trunc(s: string, n: number) {
  const t = String(s ?? "").trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1)}…`;
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function formatUsdCompact(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`;
  return `${sign}$${Math.round(abs)}`;
}

async function loadSourceRefs(ticker: string): Promise<ResearchSourceRef[]> {
  const t = ticker.trim().toUpperCase();
  const rows = await db.query<{ url: string; source_key: string | null; title: string | null }>(
    `
    SELECT url, source_key, title
    FROM documents
    WHERE upper(trim(ticker)) = $1
      AND url IS NOT NULL
      AND length(trim(url)) > 0
    ORDER BY event_at DESC NULLS LAST, parsed_at DESC
    LIMIT 24
    `,
    [t],
  );
  const seen = new Set<string>();
  const out: ResearchSourceRef[] = [];
  for (const r of rows) {
    const url = String(r.url ?? "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const label = trunc(r.title ?? r.source_key ?? "Source", 56);
    out.push({ label, url });
    if (out.length >= 14) break;
  }
  return out;
}

export async function buildResearchPresentation(ticker: string): Promise<ExplorePresentation> {
  const t = ticker.trim().toUpperCase();

  const companyRow = await db.one<{ name: string | null }>(
    `SELECT name FROM companies WHERE upper(trim(ticker)) = $1 LIMIT 1`,
    [t],
  );
  const name = String(companyRow?.name ?? t).trim() || t;

  const st = await db.one<{ score: string; components: unknown }>(
    `SELECT score::text, components FROM ticker_feed_state WHERE ticker = $1 LIMIT 1`,
    [t],
  );
  const score = st?.score != null ? Number(st.score) : 0;
  const components = (st?.components && typeof st.components === "object" ? st.components : {}) as Record<
    string,
    unknown
  >;

  const memo = await db.one<{ title: string; presentation: unknown }>(
    `
    SELECT title, presentation
    FROM research_memos
    WHERE ticker = $1
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [t],
  );
  const storedPres = memo?.presentation as Partial<ExplorePresentation> | null;
  if (storedPres?.title && Array.isArray(storedPres.blocks) && storedPres.blocks.length) {
    const documents = await loadPaperDocumentsForTicker(t);
    return {
      title: String(storedPres.title),
      subtitle: String(storedPres.subtitle ?? `${name} · ${t} · ${isoDate(new Date())}`),
      blocks: storedPres.blocks as ExploreBlock[],
      ...(storedPres.diagram ? { diagram: storedPres.diagram as ExplorePresentation["diagram"] } : {}),
      explainer: [],
      sources: Array.isArray(storedPres.sources) ? (storedPres.sources as ResearchSourceRef[]) : await loadSourceRefs(t),
      documents,
    };
  }

  const documents = await loadPaperDocumentsForTicker(t);
  const recentDocs = documents.slice(0, 6);

  const insiderAgg = await db.one<{ n: string; usd: string | null }>(
    `
    SELECT COUNT(*)::text AS n, SUM(amount_usd)::text AS usd
    FROM insider_transactions
    WHERE ticker = $1 AND transaction_at >= now() - interval '90 days'
    `,
    [t],
  );
  const polAgg = await db.one<{ n: string; usd: string | null }>(
    `
    SELECT COUNT(*)::text AS n, SUM(amount_usd_mid)::text AS usd
    FROM politician_transactions
    WHERE ticker = $1 AND transaction_at >= now() - interval '180 days'
    `,
    [t],
  );

  const title =
    recentDocs[0]?.analysis?.trim()
      ? `${t} — ${trunc(recentDocs[0].analysis, 110)}`
      : `${t} — document-backed research read`;

  const subtitle = `${name} · ${t} · ${isoDate(new Date())}`;

  const docCount = documents.length;
  const insiderN = Number(insiderAgg?.n) || 0;
  const insiderUsd = insiderAgg?.usd != null ? Number(insiderAgg.usd) : 0;
  const polN = Number(polAgg?.n) || 0;

  const overview = `This page is anchored on ${name} (${t}). It is assembled from parsed filings, press releases, transcripts, registry updates, and flow data stored in this workspace — not from a relationship graph.`;

  const signalPara =
    docCount > 0
      ? `The timeline holds ${docCount} analyzed document${docCount === 1 ? "" : "s"}. Latest: ${recentDocs
          .slice(0, 3)
          .map((d) => `[${d.source}] ${trunc(d.analysis, 180)}`)
          .join(" ")}`
      : `No analyzed documents are on file for ${t} yet. Ingestion workers will populate the timeline as filings and allowlisted sources are parsed.`;

  const flowPara =
    insiderN > 0 || polN > 0
      ? `Flow overlay (stored rows): ${insiderN} insider transaction${insiderN === 1 ? "" : "s"}${
          insiderUsd > 0 ? ` (~${formatUsdCompact(insiderUsd)} gross)` : ""
        }; ${polN} politician PTR row${polN === 1 ? "" : "s"} in the lookback windows.`
      : `No insider or politician transaction rows are stored for ${t} in the current lookback windows.`;

  const scorePara = `Research feed score is ${score.toFixed(1)} on a 0–100 scale (document velocity + cross-feed overlap). ${
    components.research_docs_14d != null ? `Documents in the last 14 days: ${String(components.research_docs_14d)}.` : ""
  }`;

  const blocks: ExploreBlock[] = [
    { type: "heading", text: "Company focus" },
    { type: "paragraph", text: overview },
    { type: "heading", text: "Price" },
    {
      type: "price",
      caption: `Daily closes for ${t}. Sparkline is informational; score rail reflects document + flow activity, not a price target.`,
    },
    { type: "heading", text: "Document signals" },
    { type: "paragraph", text: signalPara },
    { type: "paragraph", text: flowPara },
    { type: "heading", text: "Scoreboard" },
    { type: "paragraph", text: scorePara },
  ];

  const sources = await loadSourceRefs(t);

  return {
    title,
    subtitle,
    blocks,
    explainer: [],
    sources,
    documents,
  };
}
