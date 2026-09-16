-- Additive migration. Existing content and customer data are preserved.
BEGIN;
ALTER TABLE institution_transactions ADD COLUMN IF NOT EXISTS instrument_type text;
ALTER TABLE institution_transactions ADD COLUMN IF NOT EXISTS data_quality_version integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS tracker_watchlist (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 filer_id uuid NOT NULL REFERENCES filers(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,filer_id)
);
ALTER TABLE tracker_watchlist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON tracker_watchlist FROM anon, authenticated;
COMMIT;
