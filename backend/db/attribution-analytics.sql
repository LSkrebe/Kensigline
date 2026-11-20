-- Landing-page session/engagement analytics (extends attribution funnel).
-- Apply: psql "$DATABASE_URL" -f backend/db/attribution-analytics.sql
-- Runtime ensureDDL in attribution/store.ts also creates these.

BEGIN;

-- Allow paid events on the existing funnel table (webhook-only).
ALTER TABLE attribution_events DROP CONSTRAINT IF EXISTS attribution_events_event_check;
ALTER TABLE attribution_events
  ADD CONSTRAINT attribution_events_event_check
  CHECK (event IN ('visit', 'signup', 'checkout', 'paid'));

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
);

CREATE INDEX IF NOT EXISTS analytics_sessions_visitor_idx
  ON analytics_sessions (visitor_id, started_at DESC);
CREATE INDEX IF NOT EXISTS analytics_sessions_started_idx
  ON analytics_sessions (started_at DESC);
CREATE INDEX IF NOT EXISTS analytics_sessions_ref_idx
  ON analytics_sessions (ref)
  WHERE ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS analytics_events (
  id bigserial PRIMARY KEY,
  visitor_id text NOT NULL,
  session_id text,
  user_id text,
  ref text,
  event text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analytics_events_created_idx
  ON analytics_events (created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_event_idx
  ON analytics_events (event, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_visitor_idx
  ON analytics_events (visitor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_session_idx
  ON analytics_events (session_id)
  WHERE session_id IS NOT NULL;

-- One scroll milestone pct per session; one section view per session.
CREATE UNIQUE INDEX IF NOT EXISTS analytics_events_scroll_uniq
  ON analytics_events (session_id, event, ((meta->>'pct')))
  WHERE event = 'scroll_milestone' AND session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS analytics_events_section_uniq
  ON analytics_events (session_id, event, ((meta->>'section')))
  WHERE event = 'section_viewed' AND session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS attribution_report_sends (
  day_key text PRIMARY KEY,
  message_id text,
  sent_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE analytics_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE attribution_report_sends ENABLE ROW LEVEL SECURITY;

COMMIT;
