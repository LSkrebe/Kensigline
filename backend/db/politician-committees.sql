-- Politician committee reference index (congress-legislators) + stamp column.
-- Safe to re-run. Does not drop content.

CREATE TABLE IF NOT EXISTS politician_committee_lookup (
  name_key text PRIMARY KEY,
  committee text NOT NULL,
  chamber text,
  bioguide text,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS politician_committee_lookup_bioguide_idx
  ON politician_committee_lookup (bioguide)
  WHERE bioguide IS NOT NULL;

ALTER TABLE politician_transactions
  ADD COLUMN IF NOT EXISTS committee text;

COMMENT ON TABLE politician_committee_lookup IS
  'Normalized politician name → primary committee. Refreshed periodically from unitedstates/congress-legislators.';
