-- Whop billing columns (replaces Stripe IDs). Apply after billing.sql:
--   psql "$DATABASE_URL" -f backend/db/billing-whop.sql

BEGIN;

ALTER TABLE billing_accounts ADD COLUMN IF NOT EXISTS whop_membership_id text;
ALTER TABLE billing_accounts ADD COLUMN IF NOT EXISTS whop_user_id text;
ALTER TABLE billing_accounts ADD COLUMN IF NOT EXISTS referral_ref text;
ALTER TABLE billing_accounts ADD COLUMN IF NOT EXISTS manage_url text;

CREATE INDEX IF NOT EXISTS billing_accounts_whop_membership_idx
  ON billing_accounts (whop_membership_id)
  WHERE whop_membership_id IS NOT NULL;

COMMIT;
