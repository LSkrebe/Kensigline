import { db } from "../core/db.js";

export type AttributionEvent = "visit" | "signup" | "checkout";

const REF_RE = /^[a-z0-9_-]{1,32}$/i;

export function normalizeRef(raw: unknown): string | null {
  const ref = String(raw ?? "")
    .trim()
    .slice(0, 32);
  if (!ref || !REF_RE.test(ref)) return null;
  return ref.toLowerCase();
}

export function normalizeVisitorId(raw: unknown): string | null {
  const id = String(raw ?? "")
    .trim()
    .slice(0, 64);
  if (!id) return null;
  return id;
}

let tablesReady: Promise<void> | null = null;

async function ensureAttributionTables(): Promise<void> {
  if (!tablesReady) {
    tablesReady = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS attribution_events (
          id bigserial PRIMARY KEY,
          ref text NOT NULL,
          event text NOT NULL CHECK (event IN ('visit', 'signup', 'checkout')),
          user_id text,
          visitor_id text,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await db.query(`
        CREATE INDEX IF NOT EXISTS attribution_events_ref_idx ON attribution_events (ref)
      `);
      await db.query(`
        CREATE INDEX IF NOT EXISTS attribution_events_ref_event_idx
          ON attribution_events (ref, event, created_at DESC)
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS user_attribution (
          user_id text PRIMARY KEY,
          ref text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await db.query(`
        CREATE INDEX IF NOT EXISTS user_attribution_ref_idx ON user_attribution (ref)
      `);
      await db.query(`ALTER TABLE attribution_events ENABLE ROW LEVEL SECURITY`);
      await db.query(`ALTER TABLE user_attribution ENABLE ROW LEVEL SECURITY`);
    })().catch((err) => {
      tablesReady = null;
      throw err;
    });
  }
  await tablesReady;
}

export async function logAttributionEvent(opts: {
  ref: string;
  event: AttributionEvent;
  userId?: string | null;
  visitorId?: string | null;
}): Promise<void> {
  await ensureAttributionTables();
  await db.query(
    `
    INSERT INTO attribution_events (ref, event, user_id, visitor_id)
    VALUES ($1, $2, $3, $4)
    `,
    [opts.ref, opts.event, opts.userId ?? null, opts.visitorId ?? null],
  );
}

/** First-touch ref on signup — no-op if user already attributed. */
export async function attachUserReferral(userId: string, ref: string): Promise<boolean> {
  await ensureAttributionTables();
  const row = await db.oneApi<{ user_id: string }>(
    `
    INSERT INTO user_attribution (user_id, ref)
    VALUES ($1, $2)
    ON CONFLICT (user_id) DO NOTHING
    RETURNING user_id
    `,
    [userId, ref],
    4_000,
  );
  return Boolean(row?.user_id);
}

export type AttributionSummaryRow = {
  ref: string;
  visits: number;
  signups: number;
  checkouts: number;
  paid: number;
};

export async function attributionSummary(): Promise<AttributionSummaryRow[]> {
  await ensureAttributionTables();
  return db.queryApi<AttributionSummaryRow>(
    `
    WITH refs AS (
      SELECT DISTINCT ref FROM attribution_events
      UNION
      SELECT DISTINCT referral_ref AS ref FROM billing_accounts
      WHERE referral_ref IS NOT NULL AND referral_ref <> ''
      UNION
      SELECT DISTINCT ref FROM user_attribution
      UNION
      SELECT 'direct'::text AS ref
    )
    SELECT
      r.ref,
      COALESCE((
        SELECT COUNT(*)::int FROM attribution_events e
        WHERE e.ref = r.ref AND e.event = 'visit'
      ), 0) AS visits,
      COALESCE((
        SELECT COUNT(*)::int FROM attribution_events e
        WHERE e.ref = r.ref AND e.event = 'signup'
      ), 0) AS signups,
      COALESCE((
        SELECT COUNT(*)::int FROM attribution_events e
        WHERE e.ref = r.ref AND e.event = 'checkout'
      ), 0) AS checkouts,
      COALESCE((
        SELECT COUNT(*)::int FROM billing_accounts b
        WHERE (
          (r.ref = 'direct' AND (b.referral_ref IS NULL OR b.referral_ref = '' OR b.referral_ref = 'direct'))
          OR b.referral_ref = r.ref
        )
          AND b.status IN ('active', 'trialing', 'completed')
      ), 0) AS paid
    FROM refs r
    WHERE r.ref IS NOT NULL AND r.ref <> ''
    ORDER BY paid DESC, signups DESC, checkouts DESC, visits DESC, r.ref ASC
    `,
    [],
    8_000,
  );
}

export type AttributionDayRow = {
  ref: string;
  visits: number;
  signups: number;
  checkouts: number;
};

/** Funnel counts for [start, end) by referral ref. */
export async function attributionDaySummary(
  start: Date,
  end: Date,
): Promise<AttributionDayRow[]> {
  await ensureAttributionTables();
  return db.queryApi<AttributionDayRow>(
    `
    SELECT
      e.ref,
      COUNT(*) FILTER (WHERE e.event = 'visit')::int AS visits,
      COUNT(*) FILTER (WHERE e.event = 'signup')::int AS signups,
      COUNT(*) FILTER (WHERE e.event = 'checkout')::int AS checkouts
    FROM attribution_events e
    WHERE e.created_at >= $1 AND e.created_at < $2
    GROUP BY e.ref
    ORDER BY visits DESC, signups DESC, checkouts DESC, e.ref ASC
    `,
    [start.toISOString(), end.toISOString()],
    8_000,
  );
}
