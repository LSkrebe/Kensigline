-- Kensigline Postgres schema (full reset)
-- Document-centric research model. No Bosha graph. No migrations.
--
-- WARNING: drops all app tables and recreates them empty.
--
--   psql "$DATABASE_URL" -f backend/db/schema.sql

BEGIN;

-- --- Drop legacy + current (safe re-run) ---
DROP TABLE IF EXISTS gov_contract_ticker_links CASCADE;
DROP TABLE IF EXISTS gov_contract_awards CASCADE;
DROP TABLE IF EXISTS clinical_catalysts CASCADE;
DROP TABLE IF EXISTS clinical_milestones CASCADE;
DROP TABLE IF EXISTS clinical_programs CASCADE;
DROP TABLE IF EXISTS institution_filings_13f CASCADE;
DROP TABLE IF EXISTS politician_transactions CASCADE;
DROP TABLE IF EXISTS insider_transactions CASCADE;
DROP TABLE IF EXISTS documents CASCADE;
DROP TABLE IF EXISTS research_memos CASCADE;
DROP TABLE IF EXISTS ticker_feed_state CASCADE;
DROP TABLE IF EXISTS document_queue CASCADE;
DROP TABLE IF EXISTS outcomes CASCADE;
DROP TABLE IF EXISTS bars CASCADE;
DROP TABLE IF EXISTS billing_accounts CASCADE;
DROP TABLE IF EXISTS companies CASCADE;

DROP TABLE IF EXISTS bosha_exploration_queue CASCADE;
DROP TABLE IF EXISTS bosha_claims CASCADE;
DROP TABLE IF EXISTS bosha_relationships CASCADE;
DROP TABLE IF EXISTS bosha_events CASCADE;
DROP TABLE IF EXISTS bosha_score_log CASCADE;
DROP TABLE IF EXISTS bosha_papers CASCADE;
DROP TABLE IF EXISTS bosha_ticker_state CASCADE;
DROP TABLE IF EXISTS bosha_entities CASCADE;
DROP TABLE IF EXISTS bosha_documents CASCADE;
DROP TABLE IF EXISTS document_parsed CASCADE;

DROP TYPE IF EXISTS document_queue_status CASCADE;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE document_queue_status AS ENUM (
  'queued',
  'fetching',
  'ready_to_parse',
  'parsing',
  'parsed',
  'failed',
  'dead'
);

-- --- Companies ---
CREATE TABLE companies (
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

CREATE INDEX companies_ticker_idx ON companies (ticker);

-- --- Historical ingest cursors (idle backfill) ---
CREATE TABLE ingest_cursors (
  pipeline text NOT NULL,
  cursor_key text NOT NULL,
  cursor_value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pipeline, cursor_key)
);

CREATE TABLE alert_preferences (
  user_id text PRIMARY KEY,
  email text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  min_grade text NOT NULL DEFAULT 'B',
  timezone text NOT NULL DEFAULT 'UTC',
  morning_hour int NOT NULL DEFAULT 8,
  evening_hour int NOT NULL DEFAULT 18,
  feeds text[] NOT NULL DEFAULT ARRAY['insider', 'politicians', 'institutions', 'research', 'pharma'],
  max_items int NOT NULL DEFAULT 12,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE alert_digest_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  slot_key text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  item_count int NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX alert_digest_log_user_slot_unique ON alert_digest_log (user_id, slot_key);

-- --- Ingest queue ---
CREATE TABLE document_queue (
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

CREATE UNIQUE INDEX document_queue_url_sourcetype_unique ON document_queue (url, source_type);
CREATE INDEX document_queue_status_priority_idx
  ON document_queue (status, priority DESC, created_at ASC);
CREATE INDEX document_queue_next_attempt_idx
  ON document_queue (next_attempt_at)
  WHERE next_attempt_at IS NOT NULL;

-- --- Parsed documents (paper cards + cluster payloads) ---
CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid REFERENCES document_queue(id) ON DELETE SET NULL,
  doc_kind text NOT NULL,
  schema_version text NOT NULL DEFAULT 'v1',
  source_key text,
  analysis text,
  event_at timestamptz,
  feed_kind text,
  feed_label text,
  ticker text,
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  program_keys text[] NOT NULL DEFAULT '{}',
  program_drug text,
  program_indication text,
  program_phase text,
  program_sponsor text,
  link_confidence numeric,
  show_on_ticker boolean NOT NULL DEFAULT true,
  url text,
  title text,
  published_at timestamptz,
  parsed_at timestamptz NOT NULL DEFAULT now(),
  model text,
  prompt_version text,
  content_sha256 text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX documents_content_sha256_unique
  ON documents (content_sha256)
  WHERE content_sha256 IS NOT NULL;
CREATE INDEX documents_ticker_event_idx
  ON documents (ticker, event_at DESC)
  WHERE ticker IS NOT NULL AND event_at IS NOT NULL;
CREATE INDEX documents_feed_idx
  ON documents (feed_kind, event_at DESC)
  WHERE feed_kind IS NOT NULL AND event_at IS NOT NULL;
CREATE INDEX documents_paper_idx
  ON documents (ticker, event_at DESC)
  WHERE show_on_ticker = true
    AND analysis IS NOT NULL
    AND length(trim(analysis)) > 0;
CREATE INDEX documents_doc_kind_idx ON documents (doc_kind, parsed_at DESC);

-- --- Flow tables (insider / PTR / 13F on paper timeline) ---
CREATE TABLE insider_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES documents(id) ON DELETE CASCADE,
  ticker text NOT NULL,
  insider_role text,
  insider_name text NOT NULL,
  transaction_code text,
  amount_usd numeric,
  transaction_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX insider_transactions_ticker_at_idx
  ON insider_transactions (ticker, transaction_at DESC);

CREATE TABLE politician_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES documents(id) ON DELETE CASCADE,
  ticker text NOT NULL,
  politician_name text NOT NULL,
  chamber text,
  transaction_type text,
  amount_usd_mid numeric,
  transaction_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX politician_transactions_ticker_at_idx
  ON politician_transactions (ticker, transaction_at DESC);

CREATE TABLE institution_filings_13f (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES documents(id) ON DELETE CASCADE,
  ticker text NOT NULL,
  filer text NOT NULL,
  activity text,
  amount_usd numeric,
  filed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX institution_filings_13f_ticker_at_idx
  ON institution_filings_13f (ticker, filed_at DESC);

-- --- Clinical ---
CREATE TABLE clinical_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL,
  program_key text NOT NULL,
  drug text,
  indication text,
  stage text,
  nct_id text,
  url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ticker, program_key)
);

CREATE INDEX clinical_programs_ticker_idx ON clinical_programs (ticker);

CREATE TABLE clinical_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES clinical_programs(id) ON DELETE CASCADE,
  milestone_at timestamptz NOT NULL,
  label text NOT NULL,
  url text,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX clinical_milestones_program_at_idx
  ON clinical_milestones (program_id, milestone_at ASC);

CREATE TABLE clinical_catalysts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL,
  catalyst_at timestamptz NOT NULL,
  label text NOT NULL,
  program_key text,
  kind text NOT NULL DEFAULT 'trial',
  url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX clinical_catalysts_ticker_at_idx ON clinical_catalysts (ticker, catalyst_at ASC);

-- --- Gov contracts ---
CREATE TABLE gov_contract_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  award_id text,
  awardee_name text,
  agency text,
  amount_usd numeric,
  awarded_at timestamptz,
  url text,
  summary text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX gov_contract_awards_award_id_unique
  ON gov_contract_awards (award_id)
  WHERE award_id IS NOT NULL;

CREATE TABLE gov_contract_ticker_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  award_id uuid NOT NULL REFERENCES gov_contract_awards(id) ON DELETE CASCADE,
  ticker text NOT NULL,
  confidence numeric NOT NULL DEFAULT 0.5,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (award_id, ticker)
);

CREATE INDEX gov_contract_ticker_links_ticker_idx ON gov_contract_ticker_links (ticker);

-- --- Research feed ---
CREATE TABLE research_memos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL,
  title text NOT NULL,
  thesis text NOT NULL DEFAULT '',
  key_points jsonb NOT NULL DEFAULT '[]'::jsonb,
  presentation jsonb NOT NULL DEFAULT '{}'::jsonb,
  score double precision NOT NULL DEFAULT 0,
  trigger_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX research_memos_ticker_created_idx ON research_memos (ticker, created_at DESC);

-- --- Bars ---
CREATE TABLE bars (
  ticker text NOT NULL,
  day date NOT NULL,
  close numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticker, day)
);

CREATE INDEX bars_ticker_day_idx ON bars (ticker, day DESC);

-- --- Outcomes ---
CREATE TABLE outcomes (
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  mode text NOT NULL,
  as_of_date date NOT NULL,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, mode, as_of_date)
);

-- --- Billing ---
CREATE TABLE billing_accounts (
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

CREATE INDEX billing_accounts_customer_idx
  ON billing_accounts (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

COMMIT;
