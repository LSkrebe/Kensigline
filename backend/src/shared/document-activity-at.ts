/** How far ahead event_at may be and still sort/display as feed activity (near-term catalysts). */
export const FEED_FUTURE_GRACE_DAYS = 14;

export function parseEventTimeMs(iso: string | null | undefined): number {
  const t = new Date(String(iso ?? "")).getTime();
  return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
}

/**
 * Pick the timestamp used for feed ordering and "when" labels.
 * Future catalyst/maturity dates fall back to filing or ingest time.
 */
export function sanitizeEventAtForFeed(args: {
  candidate: string | null | undefined;
  filedAt: string | null | undefined;
  parsedAt?: string | null | undefined;
  now?: Date;
}): string {
  const now = args.now ?? new Date();
  const graceMs = FEED_FUTURE_GRACE_DAYS * 24 * 60 * 60 * 1000;
  const filedMs = parseEventTimeMs(args.filedAt);
  const parsedMs = parseEventTimeMs(args.parsedAt ?? now.toISOString());
  const fallbackMs = filedMs > Number.NEGATIVE_INFINITY ? filedMs : parsedMs;

  const candidateMs = parseEventTimeMs(args.candidate);
  if (candidateMs === Number.NEGATIVE_INFINITY) {
    return new Date(fallbackMs).toISOString();
  }

  const nowMs = now.getTime();
  if (candidateMs > nowMs + graceMs) {
    return new Date(fallbackMs).toISOString();
  }

  const tenYearsMs = 10 * 365 * 24 * 60 * 60 * 1000;
  if (candidateMs < nowMs - tenYearsMs) {
    return new Date(fallbackMs).toISOString();
  }

  return new Date(candidateMs).toISOString();
}

/** SQL expression: activity timestamp for feed sort (caps far-future event_at). */
export function documentFeedAtSql(alias = "d"): string {
  return `COALESCE(
  CASE
    WHEN ${alias}.event_at IS NOT NULL AND ${alias}.event_at <= now() + interval '${FEED_FUTURE_GRACE_DAYS} days'
      THEN ${alias}.event_at
    ELSE NULL
  END,
  ${alias}.published_at,
  ${alias}.parsed_at
)`;
}

/** @deprecated use documentFeedAtSql() */
export const DOCUMENT_FEED_AT_SQL = documentFeedAtSql("d");
