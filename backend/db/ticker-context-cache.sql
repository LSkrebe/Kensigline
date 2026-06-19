-- Per-ticker context snapshots (fundamentals, ownership, clinical programs).
-- Apply on existing DBs: psql "$DATABASE_URL" -f backend/db/ticker-context-cache.sql

CREATE TABLE IF NOT EXISTS ticker_context_cache (
  ticker text PRIMARY KEY,
  company_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  fundamentals_json jsonb,
  ownership_json jsonb,
  clinical_json jsonb,
  documents_watermark timestamptz,
  computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ticker_context_cache_computed_at_idx
  ON ticker_context_cache (computed_at DESC);
