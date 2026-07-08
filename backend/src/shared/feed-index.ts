import { db } from "../core/db.js";
import {
  scoreInsiderCluster,
  scoreInstitutionCluster,
  scorePoliticianCluster,
  scoreResearchDocument,
} from "../core/idea-score.js";
import { sanitizeEventAtForFeed } from "./document-activity-at.js";
import { countWorksheetEventsToday, latestEventAtFromDoc } from "./feed-helpers.js";

export function normalizeTickerNorm(raw: string | null | undefined): string | null {
  const t = String(raw ?? "").trim().toUpperCase();
  return t.length ? t : null;
}

export function computeDocumentFeedAt(row: {
  event_at?: string | null;
  published_at?: string | null;
  parsed_at?: string | null;
}): string {
  return sanitizeEventAtForFeed({
    candidate: row.event_at,
    filedAt: row.published_at,
    parsedAt: row.parsed_at,
  });
}

type DocRow = {
  id: string;
  feed_kind: string | null;
  ticker: string | null;
  ticker_norm: string | null;
  event_at: string | null;
  published_at: string | null;
  parsed_at: string | null;
  feed_at: string | null;
  feed_label: string | null;
  company_name?: string | null;
  source_key: string | null;
  analysis: string | null;
  program_phase: string | null;
  show_on_ticker: boolean | null;
  data: unknown;
};

function buildInvestigateSummary(
  feedKind: "insider" | "politicians" | "institutions",
  data: unknown,
  feedAt: string,
): Record<string, unknown> {
  const rows = (data as { cluster?: { worksheet_rows?: unknown[] } })?.cluster?.worksheet_rows;
  let totalUsd = 0;
  let totalCount = 0;
  const insiders = new Set<string>();
  if (Array.isArray(rows)) {
    for (const raw of rows) {
      const r = raw as Record<string, unknown>;
      const v = Number(r?.amount_usd ?? r?.amount_usd_mid ?? 0);
      if (Number.isFinite(v) && v > 0) totalUsd += v;
      totalCount += 1;
      if (feedKind === "insider") {
        const sn = String(r?.surname ?? "").trim();
        if (sn) insiders.add(sn);
        const nm = String(r?.insider_name ?? "").trim();
        if (nm) insiders.add(nm);
      }
    }
  }
  const todayCount = countWorksheetEventsToday(
    rows,
    feedAt,
    feedKind === "politicians" ? "politicians" : feedKind === "institutions" ? "institutions" : "insider",
  );
  const eventAt = latestEventAtFromDoc(rows, feedAt);
  const scoreArgs = { data, eventAt, todayCount, totalUsd };
  const idea =
    feedKind === "politicians"
      ? scorePoliticianCluster(scoreArgs)
      : feedKind === "institutions"
        ? scoreInstitutionCluster(scoreArgs)
        : scoreInsiderCluster(scoreArgs);
  return {
    total_usd: totalUsd,
    total_count: totalCount,
    today_count: todayCount,
    event_at: eventAt,
    insiders: feedKind === "insider" ? Array.from(insiders).slice(0, 20) : [],
    idea_score: idea.idea_score,
    idea_best: idea.idea_best,
    idea_reasons: idea.idea_reasons,
  };
}

function marketEligible(row: DocRow): boolean {
  const fk = String(row.feed_kind ?? "").toLowerCase();
  if (["insider", "politicians", "institutions"].includes(fk)) return true;
  return (
    fk === "research" &&
    Boolean(row.analysis && String(row.analysis).trim().length > 0) &&
    row.show_on_ticker !== false
  );
}

export async function syncFeedIndexForDocument(documentId: string): Promise<void> {
  const row = await db.one<DocRow>(
    `
    SELECT
      d.id::text AS id,
      d.feed_kind,
      d.ticker,
      d.ticker_norm,
      d.event_at::text AS event_at,
      d.published_at::text AS published_at,
      d.parsed_at::text AS parsed_at,
      d.feed_at::text AS feed_at,
      d.feed_label,
      d.source_key,
      d.analysis,
      d.program_phase,
      d.show_on_ticker,
      d.data,
      COALESCE(NULLIF(trim(c.name), ''), NULLIF(trim(d.data->'issuer'->>'name'), '')) AS company_name
    FROM documents d
    LEFT JOIN companies c ON upper(trim(c.ticker)) = upper(trim(d.ticker))
    WHERE d.id = $1::uuid
    LIMIT 1
    `,
    [documentId],
  );
  if (!row?.id) return;

  const tickerNorm = row.ticker_norm ?? normalizeTickerNorm(row.ticker);
  const feedAt = row.feed_at ?? computeDocumentFeedAt(row);
  const feedKind = String(row.feed_kind ?? "").toLowerCase();

  if (!tickerNorm) return;

  await db.query(
    `
    UPDATE documents
    SET ticker_norm = COALESCE(ticker_norm, $2), feed_at = COALESCE(feed_at, $3::timestamptz)
    WHERE id = $1::uuid
    `,
    [documentId, tickerNorm, feedAt],
  );

  if (!["insider", "politicians", "institutions", "research"].includes(feedKind)) return;

  const summary =
    feedKind === "insider" || feedKind === "politicians" || feedKind === "institutions"
      ? buildInvestigateSummary(feedKind, row.data, feedAt)
      : (() => {
          const idea = scoreResearchDocument({
            analysis: row.analysis,
            source_key: row.source_key,
            feed_kind: row.feed_kind,
            program_phase: row.program_phase,
            event_at: row.event_at ?? feedAt,
            data: row.data,
          });
          return {
            idea_score: idea.idea_score,
            idea_best: idea.idea_best,
            idea_reasons: idea.idea_reasons,
          };
        })();

  await db.query(
    `
    INSERT INTO feed_ticker_latest (
      feed_kind, ticker_norm, document_id, feed_at, feed_label, company_name,
      source_key, analysis, program_phase, show_on_ticker, summary
    )
    VALUES ($1, $2, $3::uuid, $4::timestamptz, $5, $6, $7, $8, $9, $10, $11::jsonb)
    ON CONFLICT (feed_kind, ticker_norm) DO UPDATE SET
      document_id = EXCLUDED.document_id,
      feed_at = EXCLUDED.feed_at,
      feed_label = EXCLUDED.feed_label,
      company_name = EXCLUDED.company_name,
      source_key = EXCLUDED.source_key,
      analysis = EXCLUDED.analysis,
      program_phase = EXCLUDED.program_phase,
      show_on_ticker = EXCLUDED.show_on_ticker,
      summary = EXCLUDED.summary
    WHERE EXCLUDED.feed_at >= feed_ticker_latest.feed_at
    `,
    [
      feedKind,
      tickerNorm,
      documentId,
      feedAt,
      row.feed_label,
      row.company_name ?? null,
      row.source_key,
      row.analysis,
      row.program_phase,
      row.show_on_ticker !== false,
      JSON.stringify(summary),
    ],
  );

  if (!marketEligible(row)) return;

  await db.query(
    `
    INSERT INTO feed_market_latest (
      ticker_norm, feed_kind, document_id, feed_at, feed_label, company_name,
      source_key, analysis, program_phase, show_on_ticker, summary
    )
    VALUES ($1, $2, $3::uuid, $4::timestamptz, $5, $6, $7, $8, $9, $10, $11::jsonb)
    ON CONFLICT (ticker_norm) DO UPDATE SET
      feed_kind = EXCLUDED.feed_kind,
      document_id = EXCLUDED.document_id,
      feed_at = EXCLUDED.feed_at,
      feed_label = EXCLUDED.feed_label,
      company_name = EXCLUDED.company_name,
      source_key = EXCLUDED.source_key,
      analysis = EXCLUDED.analysis,
      program_phase = EXCLUDED.program_phase,
      show_on_ticker = EXCLUDED.show_on_ticker,
      summary = EXCLUDED.summary
    WHERE EXCLUDED.feed_at >= feed_market_latest.feed_at
    `,
    [
      tickerNorm,
      feedKind,
      documentId,
      feedAt,
      row.feed_label,
      row.company_name ?? null,
      row.source_key,
      row.analysis,
      row.program_phase,
      row.show_on_ticker !== false,
      JSON.stringify(summary),
    ],
  );
}

export async function rebuildFeedIndexFromDocuments(): Promise<void> {
  const rows = await db.query<{ id: string }>(
    `SELECT id::text AS id FROM documents WHERE ticker IS NOT NULL AND length(trim(ticker)) > 0 ORDER BY parsed_at ASC`,
  );
  for (const row of rows) {
    await syncFeedIndexForDocument(row.id);
  }
}

export async function loadFeedKindIndexPage(opts: {
  feedKind: string;
  days: number;
  limit: number;
  offset: number;
}): Promise<{
  rows: Array<{
    id: string;
    ticker: string;
    event_at: string;
    feed_label: string | null;
    company_name: string | null;
    company_id: string | null;
    source_key: string | null;
    data: unknown;
    summary: Record<string, unknown>;
  }>;
  hasMore: boolean;
  nextOffset: number;
}> {
  const probe = opts.limit + 1;
  const rows = await db.query<{
    id: string;
    ticker: string;
    event_at: string;
    feed_label: string | null;
    company_name: string | null;
    company_id: string | null;
    source_key: string | null;
    data: unknown;
    summary: Record<string, unknown>;
  }>(
    `
    SELECT
      f.document_id::text AS id,
      f.ticker_norm AS ticker,
      f.feed_at::text AS event_at,
      f.feed_label,
      f.company_name,
      d.company_id::text AS company_id,
      f.source_key,
      d.data,
      f.summary
    FROM feed_ticker_latest f
    JOIN documents d ON d.id = f.document_id
    WHERE f.feed_kind = $1
      AND f.feed_at >= now() - ($2 || ' days')::interval
    ORDER BY f.feed_at DESC
    LIMIT $3 OFFSET $4
    `,
    [opts.feedKind, String(opts.days), probe, opts.offset],
  );
  const hasMore = rows.length > opts.limit;
  return {
    rows: rows.slice(0, opts.limit),
    hasMore,
    nextOffset: opts.offset + Math.min(rows.length, opts.limit),
  };
}

export async function loadMarketFeedIndexPage(opts: {
  limit: number;
  offset: number;
}): Promise<{
  rows: Array<{
    id: string;
    ticker: string;
    feed_kind: string;
    feed_at: string;
    feed_label: string | null;
    company_name: string | null;
    source_key: string | null;
    analysis: string | null;
    program_phase: string | null;
    event_at: string | null;
    data: unknown;
    summary: Record<string, unknown>;
  }>;
  hasMore: boolean;
}> {
  const probe = opts.limit + 1;
  const rows = await db.query(
    `
    SELECT
      f.document_id::text AS id,
      f.ticker_norm AS ticker,
      f.feed_kind,
      f.feed_at::text AS feed_at,
      f.feed_label,
      f.company_name,
      f.source_key,
      f.analysis,
      f.program_phase,
      d.event_at::text AS event_at,
      d.data,
      f.summary
    FROM feed_market_latest f
    JOIN documents d ON d.id = f.document_id
    ORDER BY f.feed_at DESC
    LIMIT $1 OFFSET $2
    `,
    [probe, opts.offset],
  );
  const hasMore = rows.length > opts.limit;
  return { rows: rows.slice(0, opts.limit), hasMore };
}
