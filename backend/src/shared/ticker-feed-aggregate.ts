import { db } from "../core/db.js";
import { clampInt } from "./feed-helpers.js";

export type TickerFeedDoc = {
  id: string;
  event_at: string | null;
  feed_label: string | null;
  ticker: string | null;
  company_id: string | null;
  company_name: string | null;
  url: string | null;
  source_key: string | null;
  data: unknown;
};

export type FeedPageParams = {
  limit: number;
  offset: number;
  cursor: { feedAt: string; ticker: string } | null;
};

/** Encode opaque feed cursor (feed_at + ticker). */
export function encodeFeedCursor(cursor: { feedAt: string; ticker: string } | null | undefined): string | null {
  if (!cursor?.feedAt || !cursor?.ticker) return null;
  return Buffer.from(`${cursor.feedAt}\n${cursor.ticker}`, "utf8").toString("base64url");
}

export function decodeFeedCursor(raw: string | null | undefined): { feedAt: string; ticker: string } | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  try {
    const text = Buffer.from(s, "base64url").toString("utf8");
    const idx = text.indexOf("\n");
    if (idx <= 0) return null;
    const feedAt = text.slice(0, idx).trim();
    const ticker = text.slice(idx + 1).trim().toUpperCase();
    if (!feedAt || !ticker) return null;
    return { feedAt, ticker };
  } catch {
    return null;
  }
}

export function parseFeedPageParams(
  url: URL,
  defaults: { limit: number; maxLimit: number },
): FeedPageParams {
  return {
    limit: clampInt(url.searchParams.get("limit"), 1, defaults.maxLimit, defaults.limit),
    // Deep OFFSET is intentionally capped — clients should use cursor after the first page.
    offset: clampInt(url.searchParams.get("offset"), 0, 500, 0),
    cursor: decodeFeedCursor(url.searchParams.get("cursor")),
  };
}

function normalizeTickers(tickers: string[]): string[] {
  return [...new Set(tickers.map((t) => String(t).trim().toUpperCase()).filter(Boolean))];
}

/** Paginate tickers by latest activity, then load only latest doc per ticker (fast feed list). */
export async function loadTickerFeedDocs(opts: {
  feedKind: string;
  days: number;
  limit: number;
  offset: number;
  /** When true, one row per ticker (feed rail). When false, all docs in window (cluster build). */
  latestOnly?: boolean;
}): Promise<{
  docs: TickerFeedDoc[];
  hasMore: boolean;
  offset: number;
  nextOffset: number;
}> {
  const { feedKind, days, limit, offset, latestOnly = true } = opts;
  const probe = limit + 1;
  const safeOffset = Math.max(0, Math.min(500, offset));

  const tickerRows = await db.queryApi<{ ticker: string }>(
    `
    SELECT ticker_norm AS ticker
    FROM documents
    WHERE feed_kind = $1
      AND ticker_norm IS NOT NULL
      AND feed_at IS NOT NULL
      AND feed_at >= now() - ($2 || ' days')::interval
    GROUP BY ticker_norm
    ORDER BY max(feed_at) DESC
    LIMIT $3 OFFSET $4
    `,
    [feedKind, String(days), probe, safeOffset],
  );

  const hasMore = tickerRows.length > limit;
  const pageTickers = tickerRows.slice(0, limit).map((r) => r.ticker);
  if (!pageTickers.length) {
    return { docs: [], hasMore: false, offset: safeOffset, nextOffset: safeOffset };
  }

  const docs = latestOnly
    ? await db.queryApi<TickerFeedDoc>(
        `
        SELECT DISTINCT ON (d.ticker_norm)
          d.id::text AS id,
          COALESCE(d.feed_at, d.event_at)::text AS event_at,
          d.feed_label,
          d.ticker,
          d.company_id,
          jsonb_build_object(
            'cluster', jsonb_build_object('worksheet_rows', COALESCE(d.data->'cluster'->'worksheet_rows', '[]'::jsonb)),
            'filing', d.data->'filing',
            'issuer', d.data->'issuer'
          ) AS data,
          d.url,
          d.source_key,
          COALESCE(
            NULLIF(trim(c.name), ''),
            NULLIF(trim(d.data->'issuer'->>'name'), '')
          ) AS company_name
        FROM documents d
        LEFT JOIN companies c ON upper(trim(c.ticker)) = d.ticker_norm
        WHERE d.feed_kind = $1
          AND d.ticker_norm = ANY($2::text[])
          AND d.feed_at IS NOT NULL
          AND d.feed_at >= now() - ($3 || ' days')::interval
        ORDER BY d.ticker_norm, d.feed_at DESC, d.parsed_at DESC
        `,
        [feedKind, pageTickers, String(days)],
      )
    : await db.queryApi<TickerFeedDoc>(
        `
        SELECT
          d.id::text AS id,
          COALESCE(d.feed_at, d.event_at)::text AS event_at,
          d.feed_label,
          d.ticker,
          d.company_id,
          jsonb_build_object(
            'cluster', jsonb_build_object('worksheet_rows', COALESCE(d.data->'cluster'->'worksheet_rows', '[]'::jsonb)),
            'filing', d.data->'filing',
            'issuer', d.data->'issuer'
          ) AS data,
          d.url,
          d.source_key,
          COALESCE(
            NULLIF(trim(c.name), ''),
            NULLIF(trim(d.data->'issuer'->>'name'), '')
          ) AS company_name
        FROM documents d
        LEFT JOIN companies c ON upper(trim(c.ticker)) = d.ticker_norm
        WHERE d.feed_kind = $1
          AND d.ticker_norm = ANY($2::text[])
          AND d.feed_at IS NOT NULL
          AND d.feed_at >= now() - ($3 || ' days')::interval
        ORDER BY d.feed_at DESC, d.parsed_at DESC
        `,
        [feedKind, pageTickers, String(days)],
      );

  return {
    docs,
    hasMore,
    offset: safeOffset,
    nextOffset: safeOffset + pageTickers.length,
  };
}

/** Load docs for explicit tickers (Discover highlighted moves — capped ticker set). */
export async function loadTickerFeedDocsForTickers(opts: {
  feedKind: string;
  days: number;
  tickers: string[];
}): Promise<TickerFeedDoc[]> {
  const tickers = normalizeTickers(opts.tickers);
  if (!tickers.length) return [];

  return db.queryApi<TickerFeedDoc>(
    `
    SELECT
      d.id::text AS id,
      COALESCE(d.feed_at, d.event_at)::text AS event_at,
      d.feed_label,
      d.ticker,
      jsonb_build_object(
        'cluster', jsonb_build_object('worksheet_rows', COALESCE(d.data->'cluster'->'worksheet_rows', '[]'::jsonb)),
        'filing', d.data->'filing',
        'issuer', d.data->'issuer'
      ) AS data,
      d.company_id,
      d.url,
      d.source_key,
      NULL::text AS company_name
    FROM documents d
    WHERE d.feed_kind = $1
      AND d.ticker_norm = ANY($2::text[])
      AND d.feed_at IS NOT NULL
      AND d.feed_at >= now() - ($3 || ' days')::interval
    ORDER BY d.feed_at DESC, d.parsed_at DESC
    `,
    [opts.feedKind, tickers, String(opts.days)],
  );
}
