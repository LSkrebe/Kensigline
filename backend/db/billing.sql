-- Mercerline billing (Stripe). Apply after schema.sql:
--   psql "$DATABASE_URL" -f backend/db/billing.sql

BEGIN;

CREATE TABLE IF NOT EXISTS billing_accounts (
  user_id text PRIMARY KEY,
  email text,
  stripe_customer_id text UNIQUE,
  stripe_subscription_id text,
  status text NOT NULL DEFAULT 'none',
  plan text,
  price_id text,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_accounts_customer_idx
  ON billing_accounts (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS billing_accounts_subscription_idx
  ON billing_accounts (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

COMMIT;
