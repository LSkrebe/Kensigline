import type http from "node:http";
import { notFound, sendJson } from "../core/http.js";
import { db } from "../core/db.js";
import { computeScoreForTicker, saveTickerState } from "./market/score.js";
import { maybeEmitPaper } from "./market/paper.js";
import { buildResearchPresentation } from "../documents/presentation.js";
import {
  loadFilings13fForTicker,
  loadInsiderFlowsForTicker,
  loadPoliticianFlowsForTicker,
} from "../documents/store.js";
import { getTrackedInvestorsForTicker } from "./market/tracked-investors.js";
import { resolveResearchFeedCompanyName } from "./feed-display.js";

function clampInt(n: unknown, min: number, max: number, fallback: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

export async function handleResearchState(res: http.ServerResponse, ticker: string) {
  const t = String(ticker ?? "").trim().toUpperCase();
  if (!t) {
    sendJson(res, 400, { ok: false, error: "ticker_required" });
    return;
  }
  const row = await db.one<{ score: string; components: unknown; updated_at: string }>(
    `SELECT score::text, components, updated_at::text FROM ticker_feed_state WHERE ticker = $1 LIMIT 1`,
    [t],
  );
  if (!row) {
    sendJson(res, 200, { ok: true, ticker: t, empty: true, score: 0, components: {}, updated_at: null });
    return;
  }
  sendJson(res, 200, {
    ok: true,
    ticker: t,
    score: Number(row.score),
    components: row.components,
    updated_at: row.updated_at,
  });
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
    score: string;
    trigger_reason: string | null;
    created_at: string;
  }>(
    `
    SELECT id, title, thesis, key_points, presentation, score::text, trigger_reason, created_at::text
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
      score: Number(row.score),
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
  const st = await db.one<{ score: string; components: unknown; updated_at: string }>(
    `SELECT score::text, components, updated_at::text FROM ticker_feed_state WHERE ticker = $1 LIMIT 1`,
    [t],
  );
  const latestPaper = await db.one<{
    id: string;
    created_at: string;
    trigger_reason: string | null;
    score: string;
  }>(
    `
    SELECT id, created_at::text, trigger_reason, score::text
    FROM research_memos
    WHERE ticker = $1
    ORDER BY created_at DESC
    LIMIT 1
    `,
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
    score: st?.score != null ? Number(st.score) : 0,
    components: st?.components ?? {},
    state_updated_at: st?.updated_at ?? null,
    presentation,
    flows: { insiders, politicians, filings13f },
    tracked_investors,
    latest_paper: latestPaper
      ? {
          id: latestPaper.id,
          created_at: latestPaper.created_at,
          trigger_reason: latestPaper.trigger_reason,
          score: Number(latestPaper.score),
        }
      : null,
  });
}

export async function handleResearchFeed(res: http.ServerResponse, limit: number) {
  const lim = Math.max(1, Math.min(120, limit));
  const papers = await db.query<{
    id: string;
    ticker: string;
    title: string;
    score: string;
    created_at: string;
    company_name: string | null;
  }>(
    `
    SELECT p.id, p.ticker, p.title, p.score::text, p.created_at::text,
           COALESCE(NULLIF(trim(c.name), ''), p.ticker) AS company_name
    FROM research_memos p
    LEFT JOIN companies c ON upper(trim(c.ticker)) = upper(trim(p.ticker))
    ORDER BY p.created_at DESC
    LIMIT $1
    `,
    [lim],
  );

  const fill = Math.max(0, Math.min(25, lim - papers.length));
  const signals =
    fill > 0
      ? await db.query<{
          ticker: string;
          score: string;
          updated_at: string;
          company_name: string | null;
        }>(
          `
          SELECT s.ticker, s.score::text, s.updated_at::text,
                 COALESCE(c.name, s.ticker) AS company_name
          FROM ticker_feed_state s
          LEFT JOIN companies c ON upper(trim(c.ticker)) = s.ticker
          WHERE NOT EXISTS (SELECT 1 FROM research_memos p WHERE p.ticker = s.ticker)
          ORDER BY s.score DESC, s.updated_at DESC
          LIMIT $1
          `,
          [fill],
        )
      : [];

  const items = [
    ...papers.map((p) => {
      const displayName = resolveResearchFeedCompanyName(p.ticker, p.company_name, p.title);
      return {
        kind: "paper" as const,
        id: p.id,
        ticker: p.ticker,
        name: displayName,
        feed_label: p.title,
        score: Number(p.score),
        feed_at: p.created_at,
        company_name: displayName,
      };
    }),
    ...signals.map((s) => {
      const displayName = resolveResearchFeedCompanyName(s.ticker, s.company_name, null);
      return {
        kind: "signal" as const,
        id: null,
        ticker: s.ticker,
        name: displayName,
        feed_label: `Live research signals · ${s.ticker}`,
        score: Number(s.score),
        feed_at: s.updated_at,
        company_name: displayName,
      };
    }),
  ];

  sendJson(res, 200, { ok: true, items });
}

function truncLabel(s: string, n: number) {
  const t = String(s ?? "").trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1)}…`;
}

export async function handleResearchRefreshScore(res: http.ServerResponse, ticker: string) {
  const t = String(ticker ?? "").trim().toUpperCase();
  if (!t) {
    sendJson(res, 400, { ok: false, error: "ticker_required" });
    return;
  }
  const { score, components } = await computeScoreForTicker(t);
  await saveTickerState(t, score, components);
  const paper = await maybeEmitPaper(t, score);
  sendJson(res, 200, { ok: true, ticker: t, score, components, paper });
}

export function researchLimitFromSearchParams(sp: URLSearchParams) {
  return clampInt(sp.get("limit"), 1, 200, 40);
}
