import { db } from "../core/db.js";
import {
  computeInvestigateTickerRollup,
  type InvestigateRollupFeed,
  type InvestigateTickerRollup,
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
  const dataObj = data as {
    filing?: { pdf_url?: string | null; index_url?: string | null; accession_no?: string | null };
    issuer?: { name?: string | null; cik?: string | null };
  } | null;
  return {
    total_usd: totalUsd,
    total_count: totalCount,
    today_count: todayCount,
    event_at: eventAt,
    insiders: feedKind === "insider" ? Array.from(insiders).slice(0, 20) : [],
    idea_score: idea.idea_score,
    idea_best: idea.idea_best,
    idea_reasons: idea.idea_reasons,
    // Keep feed list off full documents.data toast reads when index is warm.
    worksheet_rows: Array.isArray(rows) ? rows.slice(0, 24) : [],
    filing: dataObj?.filing
      ? {
          pdf_url: dataObj.filing.pdf_url ?? null,
          index_url: dataObj.filing.index_url ?? null,
          accession_no: dataObj.filing.accession_no ?? null,
        }
      : null,
    issuer: dataObj?.issuer
      ? { name: dataObj.issuer.name ?? null, cik: dataObj.issuer.cik ?? null }
      : null,
  };
}

const INVESTIGATE_FEED_KINDS = ["insider", "politicians", "institutions"] as const;

function rollupFeedsFromSummaries(
  rows: Array<{ feed_kind: string; summary: Record<string, unknown> }>,
): InvestigateRollupFeed[] {
  return rows
    .map((row) => {
      const summary = row.summary ?? {};
      const idea_score = Number(summary.idea_score) || 0;
      if (idea_score <= 0) return null;
      const event_at = summary.event_at != null ? String(summary.event_at) : null;
      return {
        feed_kind: String(row.feed_kind ?? ""),
        idea_score,
        idea_reasons: Array.isArray(summary.idea_reasons) ? (summary.idea_reasons as string[]) : [],
        event_at,
      };
    })
    .filter((row): row is InvestigateRollupFeed => row != null);
}

export async function computeInvestigateRollupForTicker(tickerNorm: string): Promise<InvestigateTickerRollup> {
  const rows = await db.query<{ feed_kind: string; summary: Record<string, unknown> }>(
    `
    SELECT feed_kind, summary
    FROM feed_ticker_latest
    WHERE ticker_norm = $1
      AND feed_kind = ANY($2::text[])
    `,
    [tickerNorm, [...INVESTIGATE_FEED_KINDS]],
  );
  return computeInvestigateTickerRollup(rollupFeedsFromSummaries(rows));
}

export async function persistInvestigateRollupForTicker(tickerNorm: string): Promise<InvestigateTickerRollup> {
  const rollup = await computeInvestigateRollupForTicker(tickerNorm);
  await db.query(
    `
    UPDATE feed_market_latest
    SET summary = COALESCE(summary, '{}'::jsonb) || jsonb_build_object('investigate_rollup', $2::jsonb)
    WHERE ticker_norm = $1
    `,
    [tickerNorm, JSON.stringify(rollup)],
  );
  return rollup;
}

export async function loadInvestigateRollupsByTicker(
  tickers: string[],
): Promise<Map<string, InvestigateTickerRollup>> {
  const out = new Map<string, InvestigateTickerRollup>();
  const norms = [...new Set(tickers.map((t) => normalizeTickerNorm(t)).filter(Boolean))] as string[];
  if (!norms.length) return out;

  const rows = await db.query<{ ticker_norm: string; feed_kind: string; summary: Record<string, unknown> }>(
    `
    SELECT ticker_norm, feed_kind, summary
    FROM feed_ticker_latest
    WHERE ticker_norm = ANY($1::text[])
      AND feed_kind = ANY($2::text[])
    `,
    [norms, [...INVESTIGATE_FEED_KINDS]],
  );

  const byTicker = new Map<string, Array<{ feed_kind: string; summary: Record<string, unknown> }>>();
  for (const row of rows) {
    const bucket = byTicker.get(row.ticker_norm) ?? [];
    bucket.push({ feed_kind: row.feed_kind, summary: row.summary ?? {} });
    byTicker.set(row.ticker_norm, bucket);
  }
  for (const [ticker, feedRows] of byTicker) {
    out.set(ticker, computeInvestigateTickerRollup(rollupFeedsFromSummaries(feedRows)));
  }
  return out;
}

function withInvestigateRollup(
  summary: Record<string, unknown>,
  rollup: InvestigateTickerRollup,
): Record<string, unknown> {
  return { ...summary, investigate_rollup: rollup };
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

  const isInvestigateFeed = (INVESTIGATE_FEED_KINDS as readonly string[]).includes(feedKind);
  const investigateRollup = isInvestigateFeed
    ? await persistInvestigateRollupForTicker(tickerNorm)
    : await computeInvestigateRollupForTicker(tickerNorm);

  if (!marketEligible(row)) return;

  const marketSummary =
    investigateRollup.idea_score > 0 ? withInvestigateRollup(summary, investigateRollup) : summary;

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
      JSON.stringify(marketSummary),
    ],
  );
}

export async function rebuildFeedIndexFromDocuments(): Promise<void> {
  const batchSize = 500;
  let lastParsedAt: string | null = null;
  let lastId: string | null = null;
  for (;;) {
    const rows: Array<{ id: string; parsed_at: string }> = await db.query<{ id: string; parsed_at: string }>(
      `
      SELECT id::text AS id, parsed_at::text AS parsed_at
      FROM documents
      WHERE ticker_norm IS NOT NULL
        AND (
          $1::timestamptz IS NULL
          OR parsed_at > $1::timestamptz
          OR (parsed_at = $1::timestamptz AND id::text > $2)
        )
      ORDER BY parsed_at ASC, id ASC
      LIMIT $3
      `,
      [lastParsedAt, lastId, batchSize],
    );
    if (!rows.length) break;
    for (const row of rows) {
      await syncFeedIndexForDocument(row.id);
      lastParsedAt = row.parsed_at;
      lastId = row.id;
    }
    if (rows.length < batchSize) break;
  }
}

export async function loadFeedKindIndexPage(opts: {
  feedKind: string;
  days: number;
  limit: number;
  offset?: number;
  /** Keyset cursor: continue after this (feed_at, ticker_norm). Prefer over offset. */
  cursor?: { feedAt: string; ticker: string } | null;
}): Promise<{
  rows: Array<{
    id: string;
    ticker: string;
    event_at: string;
    feed_label: string | null;
    company_name: string | null;
    company_id: string | null;
    source_key: string | null;
    url: string | null;
    data: unknown;
    summary: Record<string, unknown>;
  }>;
  hasMore: boolean;
  nextOffset: number;
  nextCursor: { feedAt: string; ticker: string } | null;
}> {
  const probe = opts.limit + 1;
  const offset = Math.max(0, Math.min(500, Number(opts.offset) || 0));
  const cursorAt = opts.cursor?.feedAt ? String(opts.cursor.feedAt) : null;
  const cursorTicker = opts.cursor?.ticker ? String(opts.cursor.ticker).trim().toUpperCase() : null;
  const useCursor = Boolean(cursorAt && cursorTicker);

  const rows = await db.queryApi<{
    id: string;
    ticker: string;
    event_at: string;
    feed_label: string | null;
    company_name: string | null;
    company_id: string | null;
    source_key: string | null;
    url: string | null;
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
      d.url,
      CASE
        WHEN f.summary ? 'worksheet_rows' THEN
          jsonb_build_object(
            'cluster', jsonb_build_object('worksheet_rows', f.summary->'worksheet_rows'),
            'filing', f.summary->'filing',
            'issuer', f.summary->'issuer'
          )
        ELSE jsonb_build_object(
          'cluster', jsonb_build_object('worksheet_rows', COALESCE(d.data->'cluster'->'worksheet_rows', '[]'::jsonb)),
          'filing', d.data->'filing',
          'issuer', d.data->'issuer'
        )
      END AS data,
      f.summary
    FROM feed_ticker_latest f
    JOIN documents d ON d.id = f.document_id
    WHERE f.feed_kind = $1
      AND f.feed_at >= now() - ($2 || ' days')::interval
      AND (
        $5::timestamptz IS NULL
        OR (f.feed_at, f.ticker_norm) < ($5::timestamptz, $6::text)
      )
    ORDER BY f.feed_at DESC, f.ticker_norm DESC
    LIMIT $3 OFFSET $4
    `,
    [
      opts.feedKind,
      String(opts.days),
      probe,
      useCursor ? 0 : offset,
      useCursor ? cursorAt : null,
      useCursor ? cursorTicker : null,
    ],
  );
  const hasMore = rows.length > opts.limit;
  const page = rows.slice(0, opts.limit);
  const last = page[page.length - 1];
  return {
    rows: page,
    hasMore,
    nextOffset: offset + page.length,
    nextCursor: last ? { feedAt: last.event_at, ticker: last.ticker } : null,
  };
}

export async function loadMarketFeedIndexPage(opts: {
  limit: number;
  offset?: number;
  cursor?: { feedAt: string; ticker: string } | null;
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
  nextCursor: { feedAt: string; ticker: string } | null;
}> {
  const probe = opts.limit + 1;
  const offset = Math.max(0, Math.min(500, Number(opts.offset) || 0));
  const cursorAt = opts.cursor?.feedAt ? String(opts.cursor.feedAt) : null;
  const cursorTicker = opts.cursor?.ticker ? String(opts.cursor.ticker).trim().toUpperCase() : null;
  const useCursor = Boolean(cursorAt && cursorTicker);

  const rows = await db.queryApi<{
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
  }>(
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
      NULL::jsonb AS data,
      f.summary
    FROM feed_market_latest f
    JOIN documents d ON d.id = f.document_id
    WHERE (
      $3::timestamptz IS NULL
      OR (f.feed_at, f.ticker_norm) < ($3::timestamptz, $4::text)
    )
    ORDER BY f.feed_at DESC, f.ticker_norm DESC
    LIMIT $1 OFFSET $2
    `,
    [probe, useCursor ? 0 : offset, useCursor ? cursorAt : null, useCursor ? cursorTicker : null],
  );
  const hasMore = rows.length > opts.limit;
  const page = rows.slice(0, opts.limit);
  const last = page[page.length - 1];
  return {
    rows: page,
    hasMore,
    nextCursor: last ? { feedAt: last.feed_at, ticker: last.ticker } : null,
  };
}
