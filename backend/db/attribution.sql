-- Referral funnel: ?r= visits, signups, checkouts. Paid counts join billing_accounts.referral_ref.
-- Apply: psql "$DATABASE_URL" -f backend/db/attribution.sql

BEGIN;

CREATE TABLE IF NOT EXISTS attribution_events (
  id bigserial PRIMARY KEY,
  ref text NOT NULL,
  event text NOT NULL CHECK (event IN ('visit', 'signup', 'checkout')),
  user_id text,
  visitor_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attribution_events_ref_idx ON attribution_events (ref);
CREATE INDEX IF NOT EXISTS attribution_events_ref_event_idx ON attribution_events (ref, event, created_at DESC);
CREATE INDEX IF NOT EXISTS attribution_events_user_idx ON attribution_events (user_id) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_attribution (
  user_id text PRIMARY KEY,
  ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_attribution_ref_idx ON user_attribution (ref);

COMMIT;
