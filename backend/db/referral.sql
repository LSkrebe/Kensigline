-- Referral attribution (safe to run on existing DBs)
CREATE TABLE IF NOT EXISTS referral_sources (
  source_key text PRIMARY KEY,
  label text NOT NULL,
  visits int NOT NULL DEFAULT 0,
  signups int NOT NULL DEFAULT 0,
  subscriptions int NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_attribution (
  user_id text PRIMARY KEY,
  source_key text NOT NULL REFERENCES referral_sources(source_key),
  subscription_counted boolean NOT NULL DEFAULT false,
  attributed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_attribution_source_idx ON user_attribution (source_key);

ALTER TABLE user_attribution
  ADD COLUMN IF NOT EXISTS subscription_counted boolean NOT NULL DEFAULT false;
