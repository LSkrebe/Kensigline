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
    WHERE ticker_norm = $1
      AND url IS NOT NULL
      AND length(trim(url)) > 0
      AND feed_kind = 'research'
      AND show_on_ticker IS NOT FALSE
    ORDER BY COALESCE(feed_at, event_at) DESC NULLS LAST, parsed_at DESC
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

  const [companyRow, documents, insiderAgg, polAgg, sources] = await Promise.all([
    db.one<{ name: string | null }>(
      `SELECT name FROM companies WHERE upper(trim(ticker)) = $1 LIMIT 1`,
      [t],
    ),
    loadPaperDocumentsForTicker(t),
    db.one<{ n: string; usd: string | null }>(
      `
      SELECT COUNT(*)::text AS n, SUM(amount_usd)::text AS usd
      FROM insider_transactions
      WHERE ticker = $1 AND transaction_at >= now() - interval '90 days'
      `,
      [t],
    ),
    db.one<{ n: string; usd: string | null }>(
      `
      SELECT COUNT(*)::text AS n, SUM(amount_usd_mid)::text AS usd
      FROM politician_transactions
      WHERE ticker = $1 AND transaction_at >= now() - interval '180 days'
      `,
      [t],
    ),
    loadSourceRefs(t),
  ]);

  const name = String(companyRow?.name ?? t).trim() || t;
  const recentDocs = documents.slice(0, 6);

  const title =
    recentDocs[0]?.analysis?.trim() || recentDocs[0]?.source
      ? `${t} — ${trunc(recentDocs[0].analysis || recentDocs[0].source, 80)}`
      : `${t} — event timeline`;

  const subtitle = `${name} · ${t} · ${isoDate(new Date())}`;

  const docCount = documents.length;
  const insiderN = Number(insiderAgg?.n) || 0;
  const insiderUsd = insiderAgg?.usd != null ? Number(insiderAgg.usd) : 0;
  const polN = Number(polAgg?.n) || 0;

  const overview = `This page is anchored on ${name} (${t}). It is assembled from parsed filings, press releases, transcripts, registry updates, and flow data stored in this workspace - not from a relationship graph.`;

  const signalPara =
    docCount > 0
      ? `The timeline holds ${docCount} indexed document${docCount === 1 ? "" : "s"}. Latest: ${recentDocs
          .slice(0, 3)
          .map((d) => `[${d.source}] ${trunc(d.analysis, 120)}`)
          .join(" · ")}`
      : `No documents are on file for ${t} yet. Ingestion workers will populate the timeline as filings and allowlisted sources are indexed.`;

  const flowPara =
    insiderN > 0 || polN > 0
      ? `Flow overlay (stored rows): ${insiderN} insider transaction${insiderN === 1 ? "" : "s"}${
          insiderUsd > 0 ? ` (~${formatUsdCompact(insiderUsd)} gross)` : ""
        }; ${polN} politician PTR row${polN === 1 ? "" : "s"} in the lookback windows.`
      : `No insider or politician transaction rows are stored for ${t} in the current lookback windows.`;

  const blocks: ExploreBlock[] = [
    { type: "heading", text: "Company focus" },
    { type: "paragraph", text: overview },
    { type: "heading", text: "Price" },
    {
      type: "price",
      caption: `Daily closes for ${t}. Sparkline is informational, not a price target.`,
    },
    { type: "heading", text: "Document signals" },
    { type: "paragraph", text: signalPara },
    { type: "paragraph", text: flowPara },
  ];

  return {
    title,
    subtitle,
    blocks,
    explainer: [],
    sources,
    documents,
  };
}
