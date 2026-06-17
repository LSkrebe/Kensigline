-- Alert preferences + digest log (safe to re-run on existing DBs).
-- Apply: psql "$DATABASE_URL" -f backend/db/alerts.sql

CREATE TABLE IF NOT EXISTS alert_preferences (
  user_id text PRIMARY KEY,
  email text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  min_grade text NOT NULL DEFAULT 'B',
  timezone text NOT NULL DEFAULT 'UTC',
  morning_hour int NOT NULL DEFAULT 8,
  evening_hour int NOT NULL DEFAULT 18,
  feeds text[] NOT NULL DEFAULT ARRAY['insider', 'politicians', 'institutions', 'research', 'pharma'],
  max_items int NOT NULL DEFAULT 12,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alert_digest_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  slot_key text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  item_count int NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS alert_digest_log_user_slot_unique ON alert_digest_log (user_id, slot_key);
