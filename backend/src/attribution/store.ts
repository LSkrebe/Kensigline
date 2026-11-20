import { db } from "../core/db.js";

export type AttributionEvent = "visit" | "signup" | "checkout" | "paid";

const REF_RE = /^[a-z0-9_-]{1,32}$/i;
const SESSION_RE = /^[a-zA-Z0-9_-]{8,64}$/;
const VISITOR_RE = /^[a-zA-Z0-9_.-]{8,64}$/;

/** Client-ingestible engagement events (never purchases). */
export const CLIENT_TRACK_EVENTS = new Set([
  "scroll_milestone",
  "section_viewed",
  "buy_clicked",
  "cta_clicked",
  "login_clicked",
]);

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
  if (!id || !VISITOR_RE.test(id)) return null;
  return id;
}

export function normalizeSessionId(raw: unknown): string | null {
  const id = String(raw ?? "")
    .trim()
    .slice(0, 64);
  if (!id || !SESSION_RE.test(id)) return null;
  return id;
}

function normalizeShortText(raw: unknown, max: number): string | null {
  const s = String(raw ?? "")
    .trim()
    .slice(0, max);
  return s || null;
}

let tablesReady: Promise<void> | null = null;

async function ensureAttributionTables(): Promise<void> {
  if (!tablesReady) {
    tablesReady = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS attribution_events (
          id bigserial PRIMARY KEY,
          ref text NOT NULL,
          event text NOT NULL,
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
        CREATE INDEX IF NOT EXISTS attribution_events_created_idx
          ON attribution_events (created_at DESC)
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

      // Widen event check to include paid (webhook-only).
      await db.query(`
        ALTER TABLE attribution_events DROP CONSTRAINT IF EXISTS attribution_events_event_check
      `);
      await db.query(`
        ALTER TABLE attribution_events
          ADD CONSTRAINT attribution_events_event_check
          CHECK (event IN ('visit', 'signup', 'checkout', 'paid'))
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS analytics_sessions (
          id text PRIMARY KEY,
          visitor_id text NOT NULL,
          user_id text,
          ref text,
          started_at timestamptz NOT NULL,
          ended_at timestamptz,
          duration_ms integer NOT NULL DEFAULT 0,
          active_ms integer NOT NULL DEFAULT 0,
          max_scroll_pct smallint NOT NULL DEFAULT 0,
          device text,
          landing_path text,
          referrer_host text,
          utm_source text,
          utm_medium text,
          utm_campaign text,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await db.query(`
        CREATE INDEX IF NOT EXISTS analytics_sessions_visitor_idx
          ON analytics_sessions (visitor_id, started_at DESC)
      `);
      await db.query(`
        CREATE INDEX IF NOT EXISTS analytics_sessions_started_idx
          ON analytics_sessions (started_at DESC)
      `);
      await db.query(`
        CREATE INDEX IF NOT EXISTS analytics_sessions_ref_idx
          ON analytics_sessions (ref) WHERE ref IS NOT NULL
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS analytics_events (
          id bigserial PRIMARY KEY,
          visitor_id text NOT NULL,
          session_id text,
          user_id text,
          ref text,
          event text NOT NULL,
          meta jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await db.query(`
        CREATE INDEX IF NOT EXISTS analytics_events_created_idx
          ON analytics_events (created_at DESC)
      `);
      await db.query(`
        CREATE INDEX IF NOT EXISTS analytics_events_event_idx
          ON analytics_events (event, created_at DESC)
      `);
      await db.query(`
        CREATE INDEX IF NOT EXISTS analytics_events_visitor_idx
          ON analytics_events (visitor_id, created_at DESC)
      `);
      await db.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS analytics_events_scroll_uniq
          ON analytics_events (session_id, event, ((meta->>'pct')))
          WHERE event = 'scroll_milestone' AND session_id IS NOT NULL
      `);
      await db.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS analytics_events_section_uniq
          ON analytics_events (session_id, event, ((meta->>'section')))
          WHERE event = 'section_viewed' AND session_id IS NOT NULL
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS attribution_report_sends (
          day_key text PRIMARY KEY,
          message_id text,
          sent_at timestamptz NOT NULL DEFAULT now()
        )
      `);

      await db.query(`ALTER TABLE attribution_events ENABLE ROW LEVEL SECURITY`);
      await db.query(`ALTER TABLE user_attribution ENABLE ROW LEVEL SECURITY`);
      await db.query(`ALTER TABLE analytics_sessions ENABLE ROW LEVEL SECURITY`);
      await db.query(`ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY`);
      await db.query(`ALTER TABLE attribution_report_sends ENABLE ROW LEVEL SECURITY`);
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

/** Attach prior anonymous sessions/events to a logged-in user. */
export async function linkVisitorToUser(visitorId: string, userId: string): Promise<void> {
  await ensureAttributionTables();
  await db.query(
    `
    UPDATE analytics_sessions
    SET user_id = $2, updated_at = now()
    WHERE visitor_id = $1 AND (user_id IS NULL OR user_id = '')
    `,
    [visitorId, userId],
  );
  await db.query(
    `
    UPDATE analytics_events
    SET user_id = $2
    WHERE visitor_id = $1 AND (user_id IS NULL OR user_id = '')
    `,
    [visitorId, userId],
  );
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
  paid: number;
};

/** Funnel counts for [start, end) by referral ref (includes paid events). */
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
      COUNT(*) FILTER (WHERE e.event = 'checkout')::int AS checkouts,
      COUNT(*) FILTER (WHERE e.event = 'paid')::int AS paid
    FROM attribution_events e
    WHERE e.created_at >= $1 AND e.created_at < $2
    GROUP BY e.ref
    ORDER BY visits DESC, signups DESC, checkouts DESC, e.ref ASC
    `,
    [start.toISOString(), end.toISOString()],
    8_000,
  );
}

export type SessionUpsert = {
  id: string;
  visitorId: string;
  userId?: string | null;
  ref?: string | null;
  startedAt: Date;
  endedAt?: Date | null;
  durationMs?: number;
  activeMs?: number;
  maxScrollPct?: number;
  device?: string | null;
  landingPath?: string | null;
  referrerHost?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
};

export async function upsertAnalyticsSession(s: SessionUpsert): Promise<void> {
  await ensureAttributionTables();
  const durationMs = Math.max(0, Math.min(Math.floor(s.durationMs ?? 0), 12 * 60 * 60 * 1000));
  const activeMs = Math.max(0, Math.min(Math.floor(s.activeMs ?? 0), durationMs || 12 * 60 * 60 * 1000));
  const maxScroll = Math.max(0, Math.min(Math.floor(s.maxScrollPct ?? 0), 100));
  await db.query(
    `
    INSERT INTO analytics_sessions (
      id, visitor_id, user_id, ref, started_at, ended_at,
      duration_ms, active_ms, max_scroll_pct, device, landing_path, referrer_host,
      utm_source, utm_medium, utm_campaign
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    ON CONFLICT (id) DO UPDATE SET
      user_id = COALESCE(EXCLUDED.user_id, analytics_sessions.user_id),
      ref = COALESCE(analytics_sessions.ref, EXCLUDED.ref),
      ended_at = COALESCE(EXCLUDED.ended_at, analytics_sessions.ended_at),
      duration_ms = GREATEST(analytics_sessions.duration_ms, EXCLUDED.duration_ms),
      active_ms = GREATEST(analytics_sessions.active_ms, EXCLUDED.active_ms),
      max_scroll_pct = GREATEST(analytics_sessions.max_scroll_pct, EXCLUDED.max_scroll_pct),
      device = COALESCE(analytics_sessions.device, EXCLUDED.device),
      landing_path = COALESCE(analytics_sessions.landing_path, EXCLUDED.landing_path),
      referrer_host = COALESCE(analytics_sessions.referrer_host, EXCLUDED.referrer_host),
      utm_source = COALESCE(analytics_sessions.utm_source, EXCLUDED.utm_source),
      utm_medium = COALESCE(analytics_sessions.utm_medium, EXCLUDED.utm_medium),
      utm_campaign = COALESCE(analytics_sessions.utm_campaign, EXCLUDED.utm_campaign),
      updated_at = now()
    `,
    [
      s.id,
      s.visitorId,
      s.userId ?? null,
      s.ref ?? null,
      s.startedAt.toISOString(),
      s.endedAt ? s.endedAt.toISOString() : null,
      durationMs,
      activeMs,
      maxScroll,
      normalizeShortText(s.device, 32),
      normalizeShortText(s.landingPath, 200),
      normalizeShortText(s.referrerHost, 120),
      normalizeShortText(s.utmSource, 64),
      normalizeShortText(s.utmMedium, 64),
      normalizeShortText(s.utmCampaign, 64),
    ],
  );
}

export async function insertAnalyticsEvents(
  rows: Array<{
    visitorId: string;
    sessionId?: string | null;
    userId?: string | null;
    ref?: string | null;
    event: string;
    meta?: Record<string, unknown>;
    createdAt?: Date;
  }>,
): Promise<number> {
  if (!rows.length) return 0;
  await ensureAttributionTables();
  let inserted = 0;
  for (const row of rows.slice(0, 40)) {
    if (!CLIENT_TRACK_EVENTS.has(row.event)) continue;
    const visitorId = normalizeVisitorId(row.visitorId);
    if (!visitorId) continue;
    const sessionId = normalizeSessionId(row.sessionId);
    const ref = row.ref ? normalizeRef(row.ref) : null;
    const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
    try {
      const rows = await db.query<{ id: number }>(
        `
        INSERT INTO analytics_events (visitor_id, session_id, user_id, ref, event, meta, created_at)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, COALESCE($7::timestamptz, now()))
        ON CONFLICT DO NOTHING
        RETURNING id
        `,
        [
          visitorId,
          sessionId,
          row.userId ?? null,
          ref,
          row.event,
          JSON.stringify(meta),
          row.createdAt ? row.createdAt.toISOString() : null,
        ],
      );
      inserted += rows.length;
    } catch (err) {
      // Unique partial indexes may throw on older PG without ON CONFLICT target — ignore dupes.
      const msg = err instanceof Error ? err.message : String(err);
      if (!/duplicate|unique/i.test(msg)) throw err;
    }
  }
  return inserted;
}

/** Explicit insert for server-side checkout_opened (bypasses client allowlist path). */
export async function logCheckoutOpenedEvent(opts: {
  visitorId?: string | null;
  sessionId?: string | null;
  userId?: string | null;
  ref?: string | null;
  plan?: string | null;
}): Promise<void> {
  await ensureAttributionTables();
  const visitorId = normalizeVisitorId(opts.visitorId) ?? `user:${opts.userId ?? "anon"}`;
  await db.query(
    `
    INSERT INTO analytics_events (visitor_id, session_id, user_id, ref, event, meta)
    VALUES ($1, $2, $3, $4, 'checkout_opened', $5::jsonb)
    `,
    [
      visitorId,
      normalizeSessionId(opts.sessionId),
      opts.userId ?? null,
      opts.ref ? normalizeRef(opts.ref) : null,
      JSON.stringify({ plan: opts.plan ?? null }),
    ],
  );
}

export type LandingDayStats = {
  unique_visitors: number;
  sessions: number;
  returning_visitors: number;
  avg_active_ms: number;
  avg_duration_ms: number;
  avg_scroll_pct: number;
  pricing_views: number;
  buy_clicks: number;
  checkout_opens: number;
  scroll_25: number;
  scroll_50: number;
  scroll_75: number;
  scroll_90: number;
  scroll_100: number;
};

export async function landingDayStats(start: Date, end: Date): Promise<LandingDayStats> {
  await ensureAttributionTables();
  const row = await db.oneApi<LandingDayStats>(
    `
    WITH sess AS (
      SELECT *
      FROM analytics_sessions
      WHERE started_at >= $1 AND started_at < $2
    ),
    returning_visitors_cte AS (
      SELECT COUNT(*)::int AS n FROM (
        SELECT s.visitor_id
        FROM sess s
        WHERE EXISTS (
          SELECT 1 FROM analytics_sessions older
          WHERE older.visitor_id = s.visitor_id
            AND older.started_at < $1
        )
        GROUP BY s.visitor_id
      ) x
    ),
    ev AS (
      SELECT *
      FROM analytics_events
      WHERE created_at >= $1 AND created_at < $2
    )
    SELECT
      COALESCE((SELECT COUNT(DISTINCT visitor_id)::int FROM sess), 0) AS unique_visitors,
      COALESCE((SELECT COUNT(*)::int FROM sess), 0) AS sessions,
      COALESCE((SELECT n FROM returning_visitors_cte), 0) AS returning_visitors,
      COALESCE((SELECT ROUND(AVG(active_ms))::int FROM sess), 0) AS avg_active_ms,
      COALESCE((SELECT ROUND(AVG(duration_ms))::int FROM sess), 0) AS avg_duration_ms,
      COALESCE((SELECT ROUND(AVG(max_scroll_pct))::int FROM sess), 0) AS avg_scroll_pct,
      COALESCE((
        SELECT COUNT(DISTINCT visitor_id)::int FROM ev
        WHERE event = 'section_viewed' AND meta->>'section' = 'pricing'
      ), 0) AS pricing_views,
      COALESCE((
        SELECT COUNT(*)::int FROM ev WHERE event = 'buy_clicked'
      ), 0) AS buy_clicks,
      COALESCE((
        SELECT COUNT(*)::int FROM ev WHERE event = 'checkout_opened'
      ), 0) AS checkout_opens,
      COALESCE((
        SELECT COUNT(DISTINCT session_id)::int FROM ev
        WHERE event = 'scroll_milestone' AND meta->>'pct' = '25'
      ), 0) AS scroll_25,
      COALESCE((
        SELECT COUNT(DISTINCT session_id)::int FROM ev
        WHERE event = 'scroll_milestone' AND meta->>'pct' = '50'
      ), 0) AS scroll_50,
      COALESCE((
        SELECT COUNT(DISTINCT session_id)::int FROM ev
        WHERE event = 'scroll_milestone' AND meta->>'pct' = '75'
      ), 0) AS scroll_75,
      COALESCE((
        SELECT COUNT(DISTINCT session_id)::int FROM ev
        WHERE event = 'scroll_milestone' AND meta->>'pct' = '90'
      ), 0) AS scroll_90,
      COALESCE((
        SELECT COUNT(DISTINCT session_id)::int FROM ev
        WHERE event = 'scroll_milestone' AND meta->>'pct' = '100'
      ), 0) AS scroll_100
    `,
    [start.toISOString(), end.toISOString()],
    10_000,
  );
  return (
    row ?? {
      unique_visitors: 0,
      sessions: 0,
      returning_visitors: 0,
      avg_active_ms: 0,
      avg_duration_ms: 0,
      avg_scroll_pct: 0,
      pricing_views: 0,
      buy_clicks: 0,
      checkout_opens: 0,
      scroll_25: 0,
      scroll_50: 0,
      scroll_75: 0,
      scroll_90: 0,
      scroll_100: 0,
    }
  );
}

export type SourceEngagementRow = {
  ref: string;
  visitors: number;
  sessions: number;
  avg_active_ms: number;
  pricing_views: number;
  buy_clicks: number;
};

export async function landingSourceEngagement(
  start: Date,
  end: Date,
): Promise<SourceEngagementRow[]> {
  await ensureAttributionTables();
  return db.queryApi<SourceEngagementRow>(
    `
    WITH sess AS (
      SELECT *, COALESCE(NULLIF(ref, ''), 'direct') AS src
      FROM analytics_sessions
      WHERE started_at >= $1 AND started_at < $2
    ),
    ev AS (
      SELECT *, COALESCE(NULLIF(ref, ''), 'direct') AS src
      FROM analytics_events
      WHERE created_at >= $1 AND created_at < $2
    )
    SELECT
      s.src AS ref,
      COUNT(DISTINCT s.visitor_id)::int AS visitors,
      COUNT(*)::int AS sessions,
      COALESCE(ROUND(AVG(s.active_ms))::int, 0) AS avg_active_ms,
      COALESCE((
        SELECT COUNT(DISTINCT e.visitor_id)::int FROM ev e
        WHERE e.src = s.src
          AND e.event = 'section_viewed'
          AND e.meta->>'section' = 'pricing'
      ), 0) AS pricing_views,
      COALESCE((
        SELECT COUNT(*)::int FROM ev e
        WHERE e.src = s.src AND e.event = 'buy_clicked'
      ), 0) AS buy_clicks
    FROM sess s
    GROUP BY s.src
    ORDER BY visitors DESC, sessions DESC, s.src ASC
    `,
    [start.toISOString(), end.toISOString()],
    10_000,
  );
}

export type SectionViewRow = { section: string; viewers: number };

export async function landingSectionViews(
  start: Date,
  end: Date,
): Promise<SectionViewRow[]> {
  await ensureAttributionTables();
  return db.queryApi<SectionViewRow>(
    `
    SELECT COALESCE(meta->>'section', 'unknown') AS section,
           COUNT(DISTINCT visitor_id)::int AS viewers
    FROM analytics_events
    WHERE created_at >= $1 AND created_at < $2
      AND event = 'section_viewed'
    GROUP BY 1
    ORDER BY viewers DESC, section ASC
    `,
    [start.toISOString(), end.toISOString()],
    8_000,
  );
}

export type FunnelLeakStats = {
  pricing_no_buy: number;
  buy_no_checkout: number;
  checkout_no_paid: number;
};

export async function landingFunnelLeaks(start: Date, end: Date): Promise<FunnelLeakStats> {
  await ensureAttributionTables();
  const row = await db.oneApi<FunnelLeakStats>(
    `
    WITH pricing AS (
      SELECT DISTINCT visitor_id FROM analytics_events
      WHERE created_at >= $1 AND created_at < $2
        AND event = 'section_viewed' AND meta->>'section' = 'pricing'
    ),
    buys AS (
      SELECT DISTINCT visitor_id FROM analytics_events
      WHERE created_at >= $1 AND created_at < $2 AND event = 'buy_clicked'
    ),
    checkouts AS (
      SELECT DISTINCT visitor_id FROM analytics_events
      WHERE created_at >= $1 AND created_at < $2 AND event = 'checkout_opened'
      UNION
      SELECT DISTINCT visitor_id FROM attribution_events
      WHERE created_at >= $1 AND created_at < $2
        AND event = 'checkout' AND visitor_id IS NOT NULL
    ),
    paid AS (
      SELECT DISTINCT visitor_id FROM attribution_events
      WHERE created_at >= $1 AND created_at < $2
        AND event = 'paid' AND visitor_id IS NOT NULL
    )
    SELECT
      COALESCE((SELECT COUNT(*)::int FROM pricing p WHERE NOT EXISTS (SELECT 1 FROM buys b WHERE b.visitor_id = p.visitor_id)), 0) AS pricing_no_buy,
      COALESCE((SELECT COUNT(*)::int FROM buys b WHERE NOT EXISTS (SELECT 1 FROM checkouts c WHERE c.visitor_id = b.visitor_id)), 0) AS buy_no_checkout,
      COALESCE((SELECT COUNT(*)::int FROM checkouts c WHERE NOT EXISTS (SELECT 1 FROM paid p WHERE p.visitor_id = c.visitor_id)), 0) AS checkout_no_paid
    `,
    [start.toISOString(), end.toISOString()],
    10_000,
  );
  return row ?? { pricing_no_buy: 0, buy_no_checkout: 0, checkout_no_paid: 0 };
}

/** Claim the daily report send slot. Returns false if already sent (unless force). */
export async function claimAttributionReportSend(
  dayKey: string,
  force = false,
): Promise<boolean> {
  await ensureAttributionTables();
  if (force) {
    await db.query(`DELETE FROM attribution_report_sends WHERE day_key = $1`, [dayKey]);
  }
  const row = await db.oneApi<{ day_key: string }>(
    `
    INSERT INTO attribution_report_sends (day_key)
    VALUES ($1)
    ON CONFLICT (day_key) DO NOTHING
    RETURNING day_key
    `,
    [dayKey],
    4_000,
  );
  return Boolean(row?.day_key);
}

export async function markAttributionReportSent(dayKey: string, messageId: string): Promise<void> {
  await ensureAttributionTables();
  await db.query(
    `
    UPDATE attribution_report_sends
    SET message_id = $2, sent_at = now()
    WHERE day_key = $1
    `,
    [dayKey, messageId],
  );
}

export async function releaseAttributionReportClaim(dayKey: string): Promise<void> {
  await ensureAttributionTables();
  await db.query(
    `
    DELETE FROM attribution_report_sends
    WHERE day_key = $1 AND message_id IS NULL
    `,
    [dayKey],
  );
}
