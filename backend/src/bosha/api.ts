import type http from "node:http";
import { notFound, sendJson } from "../core/http.js";
import { db } from "../core/db.js";
import { computeScoreForTicker, saveTickerState } from "./score.js";
import { maybeEmitPaper } from "./paper.js";
import { buildExplorePresentation } from "./explore-presentation.js";

function clampInt(n: unknown, min: number, max: number, fallback: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

export async function handleBoshaState(res: http.ServerResponse, ticker: string) {
  const t = String(ticker ?? "").trim().toUpperCase();
  if (!t) {
    sendJson(res, 400, { ok: false, error: "ticker_required" });
    return;
  }
  const row = await db.one<{
    score: string;
    components: unknown;
    updated_at: string;
  }>(
    `SELECT score::text, components, updated_at::text FROM bosha_ticker_state WHERE ticker = $1 LIMIT 1`,
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

export async function handleBoshaEvents(res: http.ServerResponse, ticker: string, limit: number) {
  const t = String(ticker ?? "").trim().toUpperCase();
  if (!t) {
    sendJson(res, 400, { ok: false, error: "ticker_required" });
    return;
  }
  const rows = await db.query<{
    id: string;
    summary: string;
    kind: string;
    event_at: string | null;
    magnitude: string;
    novelty: string;
    sentiment: string;
    created_at: string;
  }>(
    `
    SELECT id, summary, kind, event_at::text, magnitude::text, novelty::text, sentiment::text, created_at::text
    FROM bosha_events
    WHERE ticker = $1
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [t, limit],
  );
  sendJson(res, 200, { ok: true, ticker: t, items: rows });
}

export async function handleBoshaRelationships(res: http.ServerResponse, ticker: string) {
  const t = String(ticker ?? "").trim().toUpperCase();
  if (!t) {
    sendJson(res, 400, { ok: false, error: "ticker_required" });
    return;
  }
  const rows = await db.query<{
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
    ORDER BY r.created_at DESC
    LIMIT 200
    `,
    [t],
  );
  sendJson(res, 200, { ok: true, ticker: t, items: rows });
}

export async function handleBoshaPaper(res: http.ServerResponse, ticker: string) {
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
    FROM bosha_papers
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

/** Full Explore tab payload: live presentation + score + optional latest stored paper. */
export async function handleBoshaExplore(res: http.ServerResponse, ticker: string) {
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
    `SELECT score::text, components, updated_at::text FROM bosha_ticker_state WHERE ticker = $1 LIMIT 1`,
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
    FROM bosha_papers
    WHERE ticker = $1
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [t],
  );
  const presentation = await buildExplorePresentation(t);
  sendJson(res, 200, {
    ok: true,
    ticker: t,
    company_name: String(companyRow?.name ?? t).trim() || t,
    score: st?.score != null ? Number(st.score) : 0,
    components: st?.components ?? {},
    state_updated_at: st?.updated_at ?? null,
    presentation,
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

/** Feed column: recent Bosha papers + tickers with score but no paper yet. */
export async function handleBoshaFeed(res: http.ServerResponse, limit: number) {
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
           COALESCE(c.name, p.ticker) AS company_name
    FROM bosha_papers p
    LEFT JOIN companies c ON upper(trim(c.ticker)) = p.ticker
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
          FROM bosha_ticker_state s
          LEFT JOIN companies c ON upper(trim(c.ticker)) = s.ticker
          WHERE NOT EXISTS (SELECT 1 FROM bosha_papers p WHERE p.ticker = s.ticker)
          ORDER BY s.score DESC, s.updated_at DESC
          LIMIT $1
          `,
          [fill],
        )
      : [];

  const items = [
    ...papers.map((p) => ({
      kind: "paper" as const,
      id: p.id,
      ticker: p.ticker,
      name: truncLabel(p.title, 52),
      feed_label: p.title,
      score: Number(p.score),
      feed_at: p.created_at,
      company_name: p.company_name ?? p.ticker,
    })),
    ...signals.map((s) => ({
      kind: "signal" as const,
      id: null,
      ticker: s.ticker,
      name: `${truncLabel(s.company_name ?? s.ticker, 36)} · score ${Number(s.score).toFixed(1)}`,
      feed_label: `Live Bosha signals · ${s.ticker}`,
      score: Number(s.score),
      feed_at: s.updated_at,
      company_name: s.company_name ?? s.ticker,
    })),
  ];

  sendJson(res, 200, { ok: true, items });
}

function truncLabel(s: string, n: number) {
  const t = String(s ?? "").trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1)}…`;
}

/** Dev / manual: recompute score from DB signals. */
export async function handleBoshaRefreshScore(res: http.ServerResponse, ticker: string) {
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

export function boshaLimitFromSearchParams(sp: URLSearchParams) {
  return clampInt(sp.get("limit"), 1, 200, 40);
}
