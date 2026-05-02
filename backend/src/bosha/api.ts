import type http from "node:http";
import { notFound, sendJson } from "../core/http.js";
import { db } from "../core/db.js";
import { computeScoreForTicker, saveTickerState } from "./score.js";
import { maybeEmitPaper } from "./paper.js";

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
    score: string;
    trigger_reason: string | null;
    created_at: string;
  }>(
    `
    SELECT id, title, thesis, key_points, score::text, trigger_reason, created_at::text
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
      score: Number(row.score),
      trigger_reason: row.trigger_reason,
      created_at: row.created_at,
    },
  });
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
