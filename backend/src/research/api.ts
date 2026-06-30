import type http from "node:http";
import { sendJson } from "../core/http.js";
import { db } from "../core/db.js";
import { buildResearchPresentation } from "../documents/presentation.js";
import { scoreResearchDocument, scoreInsiderCluster, scoreInstitutionCluster, scorePoliticianCluster } from "../core/idea-score.js";
import {
  loadFilings13fForTicker,
  loadInsiderFlowsForTicker,
  loadPoliticianFlowsForTicker,
} from "../documents/store.js";
import { getTrackedInvestorsForTicker } from "./market/tracked-investors.js";
import { resolveResearchFeedCompanyName } from "./feed-display.js";
import { parseResearchFeedMode } from "./feed-mode.js";
import { getSecTickerTitleMap } from "../core/sec.js";

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
  let secTitles = new Map<string, string>();
  try {
    secTitles = await getSecTickerTitleMap();
  } catch {
    secTitles = new Map();
  }
  try {
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
      company_name: resolveResearchFeedCompanyName(t, companyRow?.name, secTitles.get(t) ?? null),
      presentation,
      flows: { insiders, politicians, filings13f },
      tracked_investors,
    });
  } catch (err) {
    console.error("research_explore_failed", t, err);
    sendJson(res, 200, {
      ...emptyExplorePayload(t, companyRow?.name),
      company_name: resolveResearchFeedCompanyName(t, companyRow?.name, secTitles.get(t) ?? null),
    });
  }
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

export async function handleResearchFeed(res: http.ServerResponse, limit: number, modeRaw?: string | null) {
  const lim = Math.max(1, Math.min(120, limit));
  const mode = parseResearchFeedMode(modeRaw);

  const rows = await db.query<{
    id: string;
    ticker: string;
    analysis: string | null;
    feed_label: string | null;
    feed_at: string;
    company_name: string | null;
    source_key: string | null;
    feed_kind: string;
    program_phase: string | null;
    event_at: string | null;
    data: any;
    paper_doc_count: number;
  }>(
    `
    SELECT sub.id, sub.ticker, sub.analysis, sub.feed_label, sub.feed_at, sub.company_name, sub.source_key, sub.feed_kind, sub.program_phase, sub.event_at, sub.data,
      (
        SELECT COUNT(*)::int
        FROM documents d2
        WHERE upper(trim(d2.ticker)) = sub.ticker
          AND d2.analysis IS NOT NULL
          AND length(trim(d2.analysis)) > 0
          AND d2.feed_kind = 'research'
          AND d2.show_on_ticker IS NOT FALSE
      ) AS paper_doc_count
    FROM (
      SELECT DISTINCT ON (upper(trim(d.ticker)))
        d.id::text,
        upper(trim(d.ticker)) AS ticker,
        d.analysis,
        d.feed_label,
        COALESCE(d.event_at, d.parsed_at)::text AS feed_at,
        COALESCE(
          NULLIF(trim(c.name), ''),
          NULLIF(trim(iss.issuer_name), ''),
          upper(trim(d.ticker))
        ) AS company_name,
        d.source_key,
        d.feed_kind,
        d.program_phase,
        d.event_at::text,
        d.data
      FROM documents d
      LEFT JOIN companies c ON upper(trim(c.ticker)) = upper(trim(d.ticker))
      LEFT JOIN LATERAL (
        SELECT NULLIF(trim(d2.data->'issuer'->>'name'), '') AS issuer_name
        FROM documents d2
        WHERE upper(trim(d2.ticker)) = upper(trim(d.ticker))
          AND NULLIF(trim(d2.data->'issuer'->>'name'), '') IS NOT NULL
        ORDER BY COALESCE(d2.event_at, d2.parsed_at) DESC NULLS LAST, d2.parsed_at DESC
        LIMIT 1
      ) iss ON true
      WHERE d.ticker IS NOT NULL
        AND length(trim(d.ticker)) > 0
        AND (
          d.feed_kind IN ('insider', 'politicians', 'institutions')
          OR (
            d.analysis IS NOT NULL
            AND length(trim(d.analysis)) > 0
            AND d.feed_kind = 'research'
            AND d.show_on_ticker IS NOT FALSE
          )
        )
      ORDER BY upper(trim(d.ticker)), COALESCE(d.event_at, d.parsed_at) DESC NULLS LAST, d.parsed_at DESC
    ) sub
    ORDER BY sub.feed_at DESC NULLS LAST
    LIMIT $1
    `,
    [lim],
  );

  const secTitles = await getSecTickerTitleMap().catch(() => new Map<string, string>());

  const items = rows.map((r) => {
    const displayName = resolveResearchFeedCompanyName(r.ticker, r.company_name, secTitles.get(r.ticker) ?? null);
    const idea = scoreResearchFeedRow(r);
    const feedLabel = String(r.analysis ?? r.feed_label ?? "").trim();
    return {
      kind: "document" as const,
      id: r.id,
      ticker: r.ticker,
      name: displayName,
      feed_label: feedLabel,
      feed_at: r.feed_at,
      company_name: displayName,
      source_key: r.source_key,
      feed_kind: r.feed_kind,
      intel_mode: mode,
      paper_doc_count: Number(r.paper_doc_count) || 0,
      idea_score: idea.idea_score,
      idea_best: idea.idea_best,
      idea_reasons: idea.idea_reasons,
    };
  });

  sendJson(res, 200, { ok: true, mode, items });
}

export function researchLimitFromSearchParams(sp: URLSearchParams) {
  return clampInt(sp.get("limit"), 1, 200, 40);
}
