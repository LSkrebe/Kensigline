import type http from "node:http";
import { sendJson } from "../core/http.js";
import { db } from "../core/db.js";
import { buildResearchPresentation } from "../documents/presentation.js";
import { scoreResearchDocument, scoreInsiderCluster, scoreInstitutionCluster, scorePoliticianCluster, mergeResearchFeedIdea, investigateRollupFromSummary } from "../core/idea-score.js";
import {
  loadFilings13fForTicker,
  loadInsiderFlowsForTicker,
  loadPoliticianFlowsForTicker,
} from "../documents/store.js";
import { getTrackedInvestorsForTicker } from "./market/tracked-investors.js";
import { resolveResearchFeedCompanyName } from "./feed-display.js";
import { parseResearchFeedMode } from "./feed-mode.js";
import { getSecTickerTitleMap } from "../core/sec.js";
import {
  feedCacheKey,
  readFeedResponseCache,
  writeFeedResponseCache,
} from "../shared/feed-response-cache.js";
import { loadMarketFeedIndexPage, loadInvestigateRollupsByTicker } from "../shared/feed-index.js";
import { decodeFeedCursor, encodeFeedCursor } from "../shared/ticker-feed-aggregate.js";

function clampInt(n: unknown, min: number, max: number, fallback: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

/** Legacy route — returns recent analyzed documents as pseudo-events. */
export async function handleResearchEvents(res: http.ServerResponse, ticker: string, limit: number) {
  const t = String(ticker ?? "").trim().toUpperCase();
  if (!t) {
    sendJson(res, 400, { ok: false, error: "ticker_required" });
    return;
  }
  const rows = await db.query<{
    id: string;
    source_key: string | null;
    analysis: string | null;
    event_at: string | null;
    created_at: string;
  }>(
    `
    SELECT id, source_key, analysis, event_at::text, parsed_at::text AS created_at
    FROM documents
    WHERE ticker_norm = $1
      AND (
        (analysis IS NOT NULL AND length(trim(analysis)) > 0)
        OR (title IS NOT NULL AND length(trim(title)) > 0)
      )
    ORDER BY COALESCE(feed_at, event_at) DESC NULLS LAST, parsed_at DESC
    LIMIT $2
    `,
    [t, limit],
  );
  const items = rows.map((r) => ({
    id: r.id,
    summary: String(r.analysis ?? "").slice(0, 500),
    kind: String(r.source_key ?? "document"),
    event_at: r.event_at,
    magnitude: "0.5",
    novelty: "0.5",
    sentiment: "0",
    created_at: r.created_at,
  }));
  sendJson(res, 200, { ok: true, ticker: t, items });
}

/** Legacy route — graph removed; returns empty list. */
export async function handleResearchRelationships(res: http.ServerResponse, ticker: string) {
  const t = String(ticker ?? "").trim().toUpperCase();
  if (!t) {
    sendJson(res, 400, { ok: false, error: "ticker_required" });
    return;
  }
  sendJson(res, 200, { ok: true, ticker: t, items: [] });
}

export async function handleResearchPaper(res: http.ServerResponse, ticker: string) {
  const t = String(ticker ?? "").trim().toUpperCase();
  if (!t) {
    sendJson(res, 400, { ok: false, error: "ticker_required" });
    return;
  }
  const presentation = await buildResearchPresentation(t);
  const leadDoc = presentation.documents[0];
  sendJson(res, 200, {
    ok: true,
    ticker: t,
    paper: {
      id: leadDoc?.id ?? t,
      title: presentation.title,
      thesis: presentation.blocks
        .filter((b) => b.type === "paragraph")
        .map((b) => b.text)
        .join(" ")
        .slice(0, 4000),
      key_points: presentation.documents.slice(0, 8).map((d) => d.analysis),
      presentation,
      trigger_reason: null,
      created_at: leadDoc?.filedAt ?? new Date().toISOString(),
    },
  });
}

function emptyExplorePayload(ticker: string, companyName?: string | null) {
  const t = String(ticker ?? "").trim().toUpperCase();
  const name = String(companyName ?? t).trim() || t;
  return {
    ok: true as const,
    ticker: t,
    company_name: name,
    presentation: {
      title: `${t} - ${name}`,
      subtitle: `${name} · ${t}`,
      blocks: [] as const,
      explainer: [] as const,
      sources: [] as const,
      documents: [] as const,
    },
    flows: { insiders: [] as const, politicians: [] as const, filings13f: [] as const },
    tracked_investors: [] as const,
  };
}

async function settledValue<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (err) {
    console.warn("research_explore_part_failed", err);
    return fallback;
  }
}

const exploreMemoryCache = new Map<string, { at: number; payload: Record<string, unknown> }>();
const EXPLORE_CACHE_TTL_MS = 120_000;

/** Build explore payload (memory-cached). Shared by /api/research/explore and /api/dossier/company. */
export async function buildCompanyExplorePayload(ticker: string): Promise<Record<string, unknown>> {
  const t = String(ticker ?? "").trim().toUpperCase();
  if (!t) return emptyExplorePayload("");

  const cached = exploreMemoryCache.get(t);
  if (cached && Date.now() - cached.at < EXPLORE_CACHE_TTL_MS) {
    return cached.payload;
  }

  try {
    const { buildIssuerExplorePayload } = await import("../v2/reads.js");
    const payload = await buildIssuerExplorePayload(t);
    exploreMemoryCache.set(t, { at: Date.now(), payload });
    return payload;
  } catch (err) {
    console.error("research_explore_failed", t, err);
    return emptyExplorePayload(t);
  }
}

/**
 * Company dossier shell in ONE response (presentation + flows + tracked).
 * Always HTTP 200 — soft ok:false on partial miss — so FE never 500-spins.
 * Skips SEC title map + caches warm hits to stop pool starvation under FE storms.
 */
export async function handleResearchExplore(res: http.ServerResponse, ticker: string) {
  const t = String(ticker ?? "").trim().toUpperCase();
  if (!t) {
    sendJson(res, 400, { ok: false, error: "ticker_required" });
    return;
  }
  const payload = await buildCompanyExplorePayload(t);
  sendJson(res, 200, payload);
}

function clusterTotalUsd(data: unknown): number {
  const rows = Array.isArray((data as any)?.cluster?.worksheet_rows) ? (data as any).cluster.worksheet_rows : [];
  return rows.reduce((sum: number, r: any) => {
    const amt = Number(r?.amount_usd ?? r?.amount_usd_mid ?? r?.value_usd ?? 0);
    return sum + (Number.isFinite(amt) ? amt : 0);
  }, 0);
}

function scoreResearchFeedRow(row: {
  analysis: string | null;
  source_key: string | null;
  feed_kind: string;
  program_phase: string | null;
  event_at: string | null;
  feed_at: string;
  data: any;
}) {
  const fk = String(row.feed_kind ?? "").toLowerCase();
  const eventAt = row.event_at ?? row.feed_at;
  const totalUsd = clusterTotalUsd(row.data);
  if (fk === "insider") {
    return scoreInsiderCluster({ data: row.data, eventAt, totalUsd });
  }
  if (fk === "politicians") {
    return scorePoliticianCluster({ data: row.data, eventAt, totalUsd });
  }
  if (fk === "institutions") {
    return scoreInstitutionCluster({ data: row.data, eventAt, totalUsd });
  }
  return scoreResearchDocument({
    analysis: row.analysis,
    source_key: row.source_key,
    feed_kind: row.feed_kind,
    program_phase: row.program_phase,
    event_at: eventAt,
    data: row.data,
  });
}

function docIdeaFromSummary(
  summary: Record<string, unknown>,
  row: {
    analysis: string | null;
    source_key: string | null;
    feed_kind: string;
    program_phase: string | null;
    event_at: string | null;
    feed_at: string;
    data: any;
  },
) {
  if (summary.idea_score != null) {
    return {
      idea_score: Number(summary.idea_score),
      idea_best: Boolean(summary.idea_best),
      idea_reasons: Array.isArray(summary.idea_reasons) ? (summary.idea_reasons as string[]) : [],
    };
  }
  return scoreResearchFeedRow(row);
}

function resolveResearchFeedIdea(
  summary: Record<string, unknown>,
  row: {
    analysis: string | null;
    source_key: string | null;
    feed_kind: string;
    program_phase: string | null;
    event_at: string | null;
    feed_at: string;
    data: any;
  },
  rollupFallback?: ReturnType<typeof investigateRollupFromSummary>,
) {
  const docIdea = docIdeaFromSummary(summary, row);
  const rollup = investigateRollupFromSummary(summary) ?? rollupFallback ?? null;
  return mergeResearchFeedIdea(docIdea, rollup);
}

export async function handleResearchFeed(
  res: http.ServerResponse,
  limit: number,
  modeRaw?: string | null,
  offsetRaw = 0,
  cursorRaw?: string | null,
) {
  const lim = Math.max(1, Math.min(120, limit));
  // Deep OFFSET capped — clients should pass cursor after the first page.
  const offset = Math.max(0, Math.min(500, Math.floor(Number(offsetRaw) || 0)));
  const cursor = decodeFeedCursor(cursorRaw);
  const mode = parseResearchFeedMode(modeRaw);
  const cacheKey = feedCacheKey({
    route: "research_feed",
    mode,
    lim,
    offset: cursor ? 0 : offset,
    cursor: cursor ? `${cursor.feedAt}|${cursor.ticker}` : "",
  });
  const cached = readFeedResponseCache<{
    ok: boolean;
    mode: string;
    items: unknown[];
    offset: number;
    limit: number;
    has_more: boolean;
    next_offset: number;
    next_cursor: string | null;
  }>(cacheKey);
  if (cached) {
    sendJson(res, 200, cached);
    return;
  }

  const { loadFeedEntriesPage } = await import("../v2/reads.js");
  const page = await loadFeedEntriesPage({ feedKind: "research", limit: lim, offset });
  const payload = {
    ok: true,
    mode,
    items: page.items,
    offset,
    limit: lim,
    has_more: page.has_more,
    next_offset: page.next_offset ?? offset + page.items.length,
    next_cursor: null as string | null,
  };
  writeFeedResponseCache(cacheKey, payload);
  sendJson(res, 200, payload);
}

export function researchLimitFromSearchParams(sp: URLSearchParams) {
  return clampInt(sp.get("limit"), 1, 200, 40);
}
