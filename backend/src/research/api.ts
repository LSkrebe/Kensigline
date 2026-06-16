import type http from "node:http";
import { notFound, sendJson } from "../core/http.js";
import { db } from "../core/db.js";
import { buildResearchPresentation } from "../documents/presentation.js";
import { scoreResearchDocument } from "../core/idea-score.js";
import {
  loadFilings13fForTicker,
  loadInsiderFlowsForTicker,
  loadPoliticianFlowsForTicker,
} from "../documents/store.js";
import { getTrackedInvestorsForTicker } from "./market/tracked-investors.js";
import { resolveResearchFeedCompanyName } from "./feed-display.js";
import { CLINICAL_TICKERS_SUBQUERY, parseResearchFeedMode, type ResearchFeedMode } from "./feed-mode.js";

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
    WHERE upper(trim(ticker)) = $1
      AND analysis IS NOT NULL
    ORDER BY event_at DESC NULLS LAST, parsed_at DESC
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
  const row = await db.one<{
    id: string;
    title: string;
    thesis: string;
    key_points: unknown;
    presentation: unknown;
    trigger_reason: string | null;
    created_at: string;
  }>(
    `
    SELECT id, title, thesis, key_points, presentation, trigger_reason, created_at::text
    FROM research_memos
    WHERE ticker = $1
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [t],
  );
  if (!row) {
    notFound(res);
    return;
  }
  sendJson(res, 200, {
    ok: true,
    ticker: t,
    paper: {
      id: row.id,
      title: row.title,
      thesis: row.thesis,
      key_points: row.key_points,
      presentation: row.presentation,
      trigger_reason: row.trigger_reason,
      created_at: row.created_at,
    },
  });
}

export async function handleResearchExplore(res: http.ServerResponse, ticker: string) {
  const t = String(ticker ?? "").trim().toUpperCase();
  if (!t) {
    sendJson(res, 400, { ok: false, error: "ticker_required" });
    return;
  }
  const companyRow = await db.one<{ name: string | null }>(
    `SELECT name FROM companies WHERE upper(trim(ticker)) = $1 LIMIT 1`,
    [t],
  );
  const presentation = await buildResearchPresentation(t);
  const [insiders, politicians, filings13f, tracked_investors] = await Promise.all([
    loadInsiderFlowsForTicker(t),
    loadPoliticianFlowsForTicker(t),
    loadFilings13fForTicker(t),
    getTrackedInvestorsForTicker(t),
  ]);
  sendJson(res, 200, {
    ok: true,
    ticker: t,
    company_name: String(companyRow?.name ?? t).trim() || t,
    presentation,
    flows: { insiders, politicians, filings13f },
    tracked_investors,
  });
}

export async function handleResearchFeed(res: http.ServerResponse, limit: number, modeRaw?: string | null) {
  const lim = Math.max(1, Math.min(120, limit));
  const mode: ResearchFeedMode = parseResearchFeedMode(modeRaw);

  const modeFilter =
    mode === "clinical"
      ? `
        AND upper(trim(d.ticker)) IN (${CLINICAL_TICKERS_SUBQUERY})
        AND (
          d.feed_kind = 'pharma'
          OR (d.feed_kind = 'research' AND d.show_on_ticker IS NOT FALSE)
        )
      `
      : `
        AND upper(trim(d.ticker)) NOT IN (${CLINICAL_TICKERS_SUBQUERY})
        AND d.feed_kind = 'research'
        AND d.show_on_ticker IS NOT FALSE
      `;

  const rows = await db.query<{
    id: string;
    ticker: string;
    analysis: string | null;
    feed_at: string;
    company_name: string | null;
    source_key: string | null;
    feed_kind: string;
    program_phase: string | null;
    event_at: string | null;
    data: any;
  }>(
    `
    SELECT sub.id, sub.ticker, sub.analysis, sub.feed_at, sub.company_name, sub.source_key, sub.feed_kind, sub.program_phase, sub.event_at, sub.data
    FROM (
      SELECT DISTINCT ON (upper(trim(d.ticker)))
        d.id::text,
        upper(trim(d.ticker)) AS ticker,
        d.analysis,
        COALESCE(d.event_at, d.parsed_at)::text AS feed_at,
        COALESCE(NULLIF(trim(c.name), ''), upper(trim(d.ticker))) AS company_name,
        d.source_key,
        d.feed_kind,
        d.program_phase,
        d.event_at::text,
        d.data
      FROM documents d
      LEFT JOIN companies c ON upper(trim(c.ticker)) = upper(trim(d.ticker))
      WHERE d.ticker IS NOT NULL
        AND length(trim(d.ticker)) > 0
        AND d.analysis IS NOT NULL
        AND length(trim(d.analysis)) > 0
        ${modeFilter}
      ORDER BY upper(trim(d.ticker)), COALESCE(d.event_at, d.parsed_at) DESC NULLS LAST, d.parsed_at DESC
    ) sub
    ORDER BY sub.feed_at DESC NULLS LAST
    LIMIT $1
    `,
    [lim],
  );

  const items = rows.map((r) => {
    const displayName = resolveResearchFeedCompanyName(r.ticker, r.company_name);
    const idea = scoreResearchDocument({
      analysis: r.analysis,
      source_key: r.source_key,
      feed_kind: r.feed_kind,
      program_phase: r.program_phase,
      event_at: r.event_at ?? r.feed_at,
      data: r.data,
    });
    return {
      kind: "document" as const,
      id: r.id,
      ticker: r.ticker,
      name: displayName,
      feed_label: String(r.analysis ?? "").trim(),
      feed_at: r.feed_at,
      company_name: displayName,
      source_key: r.source_key,
      feed_kind: r.feed_kind,
      intel_mode: mode,
      idea_score: idea.idea_score,
      idea_grade: idea.idea_grade,
      idea_reasons: idea.idea_reasons,
    };
  });

  sendJson(res, 200, { ok: true, mode, items });
}

export function researchLimitFromSearchParams(sp: URLSearchParams) {
  return clampInt(sp.get("limit"), 1, 200, 40);
}
