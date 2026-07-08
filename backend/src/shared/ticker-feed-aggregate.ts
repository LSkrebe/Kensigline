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
};

export function parseFeedPageParams(
  url: URL,
  defaults: { limit: number; maxLimit: number },
): FeedPageParams {
  return {
    limit: clampInt(url.searchParams.get("limit"), 1, defaults.maxLimit, defaults.limit),
    offset: clampInt(url.searchParams.get("offset"), 0, 50_000, 0),
  };
}

/** Paginate tickers by latest activity, then load only those tickers' documents (not a global 5000-doc scan). */
export async function loadTickerFeedDocs(opts: {
  feedKind: string;
  days: number;
  limit: number;
  offset: number;
}): Promise<{
  docs: TickerFeedDoc[];
  hasMore: boolean;
  offset: number;
  nextOffset: number;
}> {
  const { feedKind, days, limit, offset } = opts;
  const probe = limit + 1;

  const tickerRows = await db.query<{ ticker: string }>(
    `
    SELECT upper(trim(ticker)) AS ticker
    FROM documents
    WHERE feed_kind = $1
      AND ticker IS NOT NULL
      AND event_at IS NOT NULL
      AND event_at >= now() - ($2 || ' days')::interval
    GROUP BY 1
    ORDER BY max(event_at) DESC
    LIMIT $3 OFFSET $4
    `,
    [feedKind, String(days), probe, offset],
  );

  const hasMore = tickerRows.length > limit;
  const pageTickers = tickerRows.slice(0, limit).map((r) => r.ticker);
  if (!pageTickers.length) {
    return { docs: [], hasMore: false, offset, nextOffset: offset };
  }

  const docs = await db.query<TickerFeedDoc>(
    `
    SELECT d.id::text AS id, d.event_at::text AS event_at, d.feed_label, d.ticker, d.company_id, d.data,
      d.url, d.source_key,
      COALESCE(
        NULLIF(trim(c.name), ''),
        NULLIF(trim(iss.issuer_name), '')
      ) AS company_name
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
    WHERE d.feed_kind = $1
      AND upper(trim(d.ticker)) = ANY($2::text[])
      AND d.event_at IS NOT NULL
      AND d.event_at >= now() - ($3 || ' days')::interval
    ORDER BY d.event_at DESC, d.parsed_at DESC
    `,
    [feedKind, pageTickers, String(days)],
  );

  return {
    docs,
    hasMore,
    offset,
    nextOffset: offset + pageTickers.length,
  };
}

/** Load docs for explicit tickers (Discover highlighted moves — capped ticker set). */
export async function loadTickerFeedDocsForTickers(opts: {
  feedKind: string;
  days: number;
  tickers: string[];
}): Promise<TickerFeedDoc[]> {
  const tickers = [...new Set(opts.tickers.map((t) => String(t).trim().toUpperCase()).filter(Boolean))];
  if (!tickers.length) return [];

  return db.query<TickerFeedDoc>(
    `
    SELECT d.id::text AS id, d.event_at::text AS event_at, d.feed_label, d.ticker, d.data, d.company_id,
      d.url, d.source_key,
      NULL::text AS company_name
    FROM documents d
    WHERE d.feed_kind = $1
      AND upper(trim(d.ticker)) = ANY($2::text[])
      AND d.event_at IS NOT NULL
      AND d.event_at >= now() - ($3 || ' days')::interval
    ORDER BY d.event_at DESC, d.parsed_at DESC
    `,
    [opts.feedKind, tickers, String(opts.days)],
  );
}
