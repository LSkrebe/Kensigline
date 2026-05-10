-- Kensigline (minimal) Postgres schema
-- Goal: keep ingestion/parsing simple (JSONB), but still queryable for feeds/panels.
--
-- Apply manually:
--   cd backend && npm run db:apply-schema
--   psql "$DATABASE_URL" -f backend/db/schema.sql
-- Or paste this file into the Supabase SQL Editor (Dashboard → SQL).
--
-- Notes:
-- - This schema is intentionally small and flexible.
-- - `document_parsed.data` stores the full Qwen output JSON blob (including context sentences).
-- - A few "helper columns" exist to make feeds/programs queryable without JSON scans.

BEGIN;

-- --- Extensions (safe to run repeatedly) ---
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- --- Enums ---
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_queue_status') THEN
    CREATE TYPE document_queue_status AS ENUM (
      'queued',
      'fetching',
      'ready_to_parse',
      'parsing',
      'parsed',
      'failed',
      'dead'
    );
  END IF;
END $$;

-- --- Companies (Company panel) ---
CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  ticker text,
  industry text,
  country text,
  mcap text,
  ev text,
  earnings_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS companies_ticker_idx ON companies (ticker);

-- --- Document queue (URLs waiting to be fetched/parsed) ---
CREATE TABLE IF NOT EXISTS document_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  source_type text NOT NULL,
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,

  status document_queue_status NOT NULL DEFAULT 'queued',
  priority int NOT NULL DEFAULT 0,
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  last_error text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Same SEC URL can be queued for different pipelines (e.g. pharma vs Bosha) with different source_type.
DROP INDEX IF EXISTS document_queue_url_unique;
CREATE UNIQUE INDEX IF NOT EXISTS document_queue_url_sourcetype_unique ON document_queue (url, source_type);

CREATE INDEX IF NOT EXISTS document_queue_status_priority_idx
  ON document_queue (status, priority DESC, created_at ASC);

CREATE INDEX IF NOT EXISTS document_queue_next_attempt_idx
  ON document_queue (next_attempt_at)
  WHERE next_attempt_at IS NOT NULL;

-- --- Parsed documents (full extracted JSON + query-friendly columns) ---
CREATE TABLE IF NOT EXISTS document_parsed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid REFERENCES document_queue(id) ON DELETE SET NULL,

  -- Classification for querying and schema evolution.
  schema_type text NOT NULL,      -- e.g. trial_event | insider_cluster | company_profile | program
  schema_version text NOT NULL DEFAULT 'v1',

  -- Ownership/lookup
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  ticker text,

  -- Feed/program helper columns (keep UI fast without JSON scanning).
  feed_kind text,                 -- pharma | insider | programs
  feed_at timestamptz,            -- sort key for feeds (event timestamp)
  feed_label text,                -- concise row label for feed display

  program_drug text,
  program_indication text,
  program_phase text,
  program_sponsor text,

  -- Parsing metadata
  url text,
  published_at timestamptz,
  parsed_at timestamptz NOT NULL DEFAULT now(),
  model text,                     -- e.g. qwen 7b
  prompt_version text,
  content_sha256 text,

  -- The full model output (including context sentences, worksheet payload, etc.)
  data jsonb NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS document_parsed_content_sha256_unique
  ON document_parsed (content_sha256)
  WHERE content_sha256 IS NOT NULL;

CREATE INDEX IF NOT EXISTS document_parsed_schema_type_idx
  ON document_parsed (schema_type, parsed_at DESC);

CREATE INDEX IF NOT EXISTS document_parsed_feed_idx
  ON document_parsed (feed_kind, feed_at DESC)
  WHERE feed_kind IS NOT NULL AND feed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS document_parsed_company_idx
  ON document_parsed (company_id, feed_at DESC)
  WHERE company_id IS NOT NULL;

-- Optional: if you want ad-hoc queries over JSON quickly.
-- CREATE INDEX IF NOT EXISTS document_parsed_data_gin ON document_parsed USING gin (data);

-- --- Bars (daily close series, close-only) ---
CREATE TABLE IF NOT EXISTS bars (
  ticker text NOT NULL,
  day date NOT NULL,
  close numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticker, day)
);

CREATE INDEX IF NOT EXISTS bars_ticker_day_idx ON bars (ticker, day DESC);

-- --- Bosha (Explore): structured company intel (no raw document bodies) ---
CREATE TABLE IF NOT EXISTS bosha_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS bosha_entities_ticker_unique
  ON bosha_entities (ticker)
  WHERE ticker IS NOT NULL AND length(btrim(ticker)) > 0;

CREATE INDEX IF NOT EXISTS bosha_entities_name_idx ON bosha_entities (name);

CREATE TABLE IF NOT EXISTS bosha_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid REFERENCES document_queue(id) ON DELETE SET NULL,
  content_sha256 text NOT NULL,
  source_type text NOT NULL,
  url text,
  title text,
  published_at timestamptz,
  primary_ticker text,
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS bosha_documents_sha_unique ON bosha_documents (content_sha256);

CREATE TABLE IF NOT EXISTS bosha_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES bosha_documents(id) ON DELETE CASCADE,
  ticker text NOT NULL,
  kind text NOT NULL DEFAULT 'other',
  summary text NOT NULL,
  event_at timestamptz,
  magnitude double precision NOT NULL DEFAULT 0,
  novelty double precision NOT NULL DEFAULT 0,
  sentiment double precision NOT NULL DEFAULT 0,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bosha_events_ticker_idx ON bosha_events (ticker, created_at DESC);
CREATE INDEX IF NOT EXISTS bosha_events_doc_idx ON bosha_events (document_id);

CREATE TABLE IF NOT EXISTS bosha_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_entity_id uuid NOT NULL REFERENCES bosha_entities(id) ON DELETE CASCADE,
  to_entity_id uuid NOT NULL REFERENCES bosha_entities(id) ON DELETE CASCADE,
  rel_type text NOT NULL,
  confidence double precision NOT NULL DEFAULT 0.5,
  document_id uuid REFERENCES bosha_documents(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bosha_rel_from_idx ON bosha_relationships (from_entity_id);
CREATE INDEX IF NOT EXISTS bosha_rel_to_idx ON bosha_relationships (to_entity_id);

CREATE TABLE IF NOT EXISTS bosha_ticker_state (
  ticker text PRIMARY KEY,
  score double precision NOT NULL DEFAULT 0,
  components jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bosha_score_log (
  id bigserial PRIMARY KEY,
  ticker text NOT NULL,
  score double precision NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bosha_score_log_ticker_time_idx ON bosha_score_log (ticker, recorded_at DESC);

CREATE TABLE IF NOT EXISTS bosha_papers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL,
  title text NOT NULL,
  thesis text NOT NULL,
  key_points jsonb NOT NULL DEFAULT '[]'::jsonb,
  presentation jsonb NOT NULL DEFAULT '{}'::jsonb,
  score double precision NOT NULL DEFAULT 0,
  trigger_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE bosha_papers ADD COLUMN IF NOT EXISTS presentation jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS bosha_papers_ticker_created_idx ON bosha_papers (ticker, created_at DESC);

-- --- Outcomes (Historical outcomes panel) ---
CREATE TABLE IF NOT EXISTS outcomes (
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  mode text NOT NULL,             -- pharma | insider (matches UI focus)
  as_of_date date NOT NULL,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, mode, as_of_date)
);

COMMIT;

