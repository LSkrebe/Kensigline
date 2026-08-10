-- Mercerline schema v2 (display-first, no documents.data blobs)
-- Content wipe + recreate. PRESERVES billing_accounts and alert_* tables.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/db/schema_v2.sql
--
-- Do NOT use backend/db/schema.sql for wipe — it drops billing.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- --- Drop content / cache / legacy paper model (billing + alerts kept) ---
DROP TABLE IF EXISTS feed_cluster_snapshot CASCADE;
DROP TABLE IF EXISTS feed_market_latest CASCADE;
DROP TABLE IF EXISTS feed_ticker_latest CASCADE;
DROP TABLE IF EXISTS company_dossier_cache CASCADE;
DROP TABLE IF EXISTS investor_dossier_cache CASCADE;
DROP TABLE IF EXISTS ticker_context_cache CASCADE;
DROP TABLE IF EXISTS insider_transactions CASCADE;
DROP TABLE IF EXISTS politician_transactions CASCADE;
DROP TABLE IF EXISTS institution_filings_13f CASCADE;
DROP TABLE IF EXISTS institution_transactions CASCADE;
DROP TABLE IF EXISTS research_drivers CASCADE;
DROP TABLE IF EXISTS research_events CASCADE;
DROP TABLE IF EXISTS feed_entries CASCADE;
DROP TABLE IF EXISTS filing_analysis CASCADE;
DROP TABLE IF EXISTS filings CASCADE;
DROP TABLE IF EXISTS filer_aliases CASCADE;
DROP TABLE IF EXISTS filers CASCADE;
DROP TABLE IF EXISTS issuers CASCADE;
DROP TABLE IF EXISTS documents CASCADE;
DROP TABLE IF EXISTS document_queue CASCADE;
DROP TABLE IF EXISTS companies CASCADE;
DROP TABLE IF EXISTS outcomes CASCADE;
DROP TABLE IF EXISTS bars CASCADE;
DROP TABLE IF EXISTS bars_ticker_meta CASCADE;
DROP TABLE IF EXISTS cusip_ticker_map CASCADE;
DROP TABLE IF EXISTS ingest_cursors CASCADE;
DROP TABLE IF EXISTS waitlist_emails CASCADE;

DROP TYPE IF EXISTS document_queue_status CASCADE;
DROP TYPE IF EXISTS ingest_queue_status CASCADE;
DROP TYPE IF EXISTS filer_type CASCADE;
DROP TYPE IF EXISTS feed_kind CASCADE;

-- --- Enums ---
CREATE TYPE document_queue_status AS ENUM (
  'queued',
  'fetching',
  'ready_to_parse',
  'parsing',
  'parsed',
  'failed',
  'dead'
);

CREATE TYPE filer_type AS ENUM ('insider', 'politician', 'institution');

CREATE TYPE feed_kind AS ENUM ('research', 'insider', 'politicians', 'institutions');

-- --- Issuers ---
CREATE TABLE issuers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL,
  name text NOT NULL,
  cik text,
  industry text,
  country text,
  mcap text,
  earnings_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT issuers_ticker_norm_unique UNIQUE (ticker)
);

CREATE INDEX issuers_name_idx ON issuers (lower(name));

-- Compatibility: legacy code still queries/writes `companies` — map onto issuers.
CREATE TABLE companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  ticker text,
  industry text,
  country text,
  mcap text,
  ev text,
  earnings_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX companies_name_unique ON companies (name);
CREATE INDEX companies_ticker_idx ON companies (ticker);
CREATE INDEX companies_ticker_norm_idx ON companies (upper(trim(ticker))) WHERE ticker IS NOT NULL;

-- --- Filers ---
CREATE TABLE filers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filer_type filer_type NOT NULL,
  display_name text NOT NULL,
  slug text NOT NULL,
  detail text,
  detail_secondary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT filers_slug_unique UNIQUE (slug)
);

CREATE INDEX filers_type_name_idx ON filers (filer_type, lower(display_name));

CREATE TABLE filer_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filer_id uuid NOT NULL REFERENCES filers(id) ON DELETE CASCADE,
  filer_type filer_type NOT NULL,
  raw_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT filer_aliases_type_raw_unique UNIQUE (filer_type, raw_name)
);

CREATE INDEX filer_aliases_filer_id_idx ON filer_aliases (filer_id);

-- --- Ingest queue (table name kept for existing claim/enqueue code) ---
CREATE TABLE document_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  source_type text NOT NULL,
  issuer_id uuid REFERENCES issuers(id) ON DELETE SET NULL,
  status document_queue_status NOT NULL DEFAULT 'queued',
  priority int NOT NULL DEFAULT 0,
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_queue_url_source_unique UNIQUE (url, source_type)
);

CREATE INDEX document_queue_claim_idx
  ON document_queue (source_type, status, priority DESC, created_at ASC)
  WHERE status IN ('ready_to_parse', 'queued', 'failed');

CREATE INDEX document_queue_next_attempt_idx
  ON document_queue (next_attempt_at)
  WHERE next_attempt_at IS NOT NULL;

-- --- Filings (thin header — no data jsonb) ---
CREATE TABLE filings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid REFERENCES document_queue(id) ON DELETE SET NULL,
  source_type text NOT NULL,
  feed_kind feed_kind,
  form text,
  issuer_id uuid REFERENCES issuers(id) ON DELETE SET NULL,
  url text,
  pdf_url text,
  index_url text,
  accession_no text,
  title text,
  source_key text,
  analysis text,
  filed_at timestamptz,
  event_at timestamptz,
  parsed_at timestamptz NOT NULL DEFAULT now(),
  content_sha256 text,
  signal_score int,
  signal_label text,
  signal_reasons text[] NOT NULL DEFAULT '{}',
  program_keys text[] NOT NULL DEFAULT '{}',
  show_on_ticker boolean NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX filings_content_sha256_unique
  ON filings (content_sha256)
  WHERE content_sha256 IS NOT NULL;

CREATE INDEX filings_issuer_event_idx
  ON filings (issuer_id, event_at DESC)
  WHERE issuer_id IS NOT NULL AND event_at IS NOT NULL;

CREATE INDEX filings_issuer_form_filed_idx
  ON filings (issuer_id, form, filed_at DESC)
  WHERE issuer_id IS NOT NULL;

CREATE INDEX filings_feed_kind_event_idx
  ON filings (feed_kind, event_at DESC)
  WHERE feed_kind IS NOT NULL AND event_at IS NOT NULL;

CREATE INDEX filings_url_idx ON filings (url) WHERE url IS NOT NULL;

-- Compatibility: documents as a view over filings for gradual cutover reads
-- (writers must target filings directly; data jsonb is always null)
CREATE OR REPLACE VIEW documents AS
SELECT
  f.id,
  f.queue_id,
  f.source_type AS doc_kind,
  'v2'::text AS schema_version,
  i.ticker,
  upper(trim(i.ticker)) AS ticker_norm,
  f.feed_kind,
  f.source_key,
  f.event_at,
  f.event_at AS feed_at,
  COALESCE(f.title, f.source_key) AS feed_label,
  f.url,
  f.filed_at AS published_at,
  f.content_sha256,
  f.analysis,
  f.title,
  f.program_keys,
  f.show_on_ticker,
  f.parsed_at,
  f.issuer_id AS company_id,
  f.signal_score,
  f.signal_label,
  f.signal_reasons,
  f.form,
  f.pdf_url,
  f.index_url,
  f.accession_no,
  NULL::float8 AS link_confidence,
  NULL::jsonb AS data
FROM filings f
LEFT JOIN issuers i ON i.id = f.issuer_id;

-- --- Transactions ---
CREATE TABLE insider_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filing_id uuid NOT NULL REFERENCES filings(id) ON DELETE CASCADE,
  issuer_id uuid NOT NULL REFERENCES issuers(id) ON DELETE CASCADE,
  filer_id uuid NOT NULL REFERENCES filers(id) ON DELETE CASCADE,
  role text,
  transaction_code text,
  acquired_disposed text,
  amount_usd numeric,
  shares numeric,
  is_derivative boolean NOT NULL DEFAULT false,
  transaction_at timestamptz NOT NULL
);

CREATE INDEX insider_tx_issuer_at_idx ON insider_transactions (issuer_id, transaction_at DESC);
CREATE INDEX insider_tx_filer_at_idx ON insider_transactions (filer_id, transaction_at DESC);
CREATE INDEX insider_tx_filing_idx ON insider_transactions (filing_id);

CREATE TABLE politician_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filing_id uuid NOT NULL REFERENCES filings(id) ON DELETE CASCADE,
  issuer_id uuid NOT NULL REFERENCES issuers(id) ON DELETE CASCADE,
  filer_id uuid NOT NULL REFERENCES filers(id) ON DELETE CASCADE,
  chamber text,
  committee text,
  transaction_type text,
  amount_usd numeric,
  amount_usd_mid numeric,
  amount_range text,
  asset_name text,
  description text,
  transaction_at timestamptz NOT NULL
);

CREATE INDEX politician_tx_issuer_at_idx ON politician_transactions (issuer_id, transaction_at DESC);
CREATE INDEX politician_tx_filer_at_idx ON politician_transactions (filer_id, transaction_at DESC);
CREATE INDEX politician_tx_filing_idx ON politician_transactions (filing_id);

CREATE TABLE institution_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filing_id uuid NOT NULL REFERENCES filings(id) ON DELETE CASCADE,
  issuer_id uuid NOT NULL REFERENCES issuers(id) ON DELETE CASCADE,
  filer_id uuid NOT NULL REFERENCES filers(id) ON DELETE CASCADE,
  activity text,
  amount_usd numeric,
  shares numeric,
  transaction_at timestamptz NOT NULL
);

CREATE INDEX institution_tx_issuer_at_idx ON institution_transactions (issuer_id, transaction_at DESC);
CREATE INDEX institution_tx_filer_at_idx ON institution_transactions (filer_id, transaction_at DESC);
CREATE INDEX institution_tx_filing_idx ON institution_transactions (filing_id);

CREATE TABLE cusip_ticker_map (
  cusip text PRIMARY KEY,
  ticker text NOT NULL,
  source text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cusip_ticker_map_ticker_idx ON cusip_ticker_map (ticker);

-- --- Research ---
CREATE TABLE research_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filing_id uuid NOT NULL REFERENCES filings(id) ON DELETE CASCADE,
  issuer_id uuid REFERENCES issuers(id) ON DELETE SET NULL,
  source_key text,
  analysis text,
  event_at timestamptz,
  program_keys text[] NOT NULL DEFAULT '{}',
  show_on_ticker boolean NOT NULL DEFAULT true,
  forward_revenue_growth_pct numeric,
  signal_score int,
  signal_label text,
  signal_reasons text[] NOT NULL DEFAULT '{}'
);

CREATE INDEX research_events_issuer_event_idx
  ON research_events (issuer_id, event_at DESC)
  WHERE issuer_id IS NOT NULL AND event_at IS NOT NULL;

CREATE INDEX research_events_filing_idx ON research_events (filing_id);

CREATE TABLE research_drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filing_id uuid NOT NULL REFERENCES filings(id) ON DELETE CASCADE,
  issuer_id uuid REFERENCES issuers(id) ON DELETE SET NULL,
  label text NOT NULL,
  driver_kind text,
  rolls_up_to_revenue boolean,
  value_usd_millions numeric,
  unit text,
  period text
);

CREATE INDEX research_drivers_issuer_idx ON research_drivers (issuer_id) WHERE issuer_id IS NOT NULL;
CREATE INDEX research_drivers_filing_idx ON research_drivers (filing_id);

-- --- Disposable feed read model ---
CREATE TABLE feed_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_kind feed_kind NOT NULL,
  issuer_id uuid NOT NULL REFERENCES issuers(id) ON DELETE CASCADE,
  filing_id uuid REFERENCES filings(id) ON DELETE SET NULL,
  feed_at timestamptz NOT NULL,
  feed_label text,
  source_key text,
  signal_score int,
  signal_label text,
  signal_reasons text[] NOT NULL DEFAULT '{}',
  today_count int NOT NULL DEFAULT 0,
  paper_doc_count int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feed_entries_kind_issuer_unique UNIQUE (feed_kind, issuer_id)
);

CREATE INDEX feed_entries_kind_at_idx ON feed_entries (feed_kind, feed_at DESC);

-- --- Prices ---
CREATE TABLE bars (
  ticker text NOT NULL,
  day date NOT NULL,
  close numeric NOT NULL,
  PRIMARY KEY (ticker, day)
);

CREATE INDEX bars_ticker_day_idx ON bars (ticker, day DESC);

CREATE TABLE bars_ticker_meta (
  ticker text PRIMARY KEY,
  last_bar_day date,
  bar_count int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- --- Cursors ---
CREATE TABLE ingest_cursors (
  pipeline text NOT NULL,
  cursor_key text NOT NULL,
  cursor_value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pipeline, cursor_key)
);

-- --- Outcomes (legacy company_id column name; references companies for cutover) ---
CREATE TABLE outcomes (
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  mode text NOT NULL,
  as_of_date date NOT NULL,
  data jsonb NOT NULL,
  PRIMARY KEY (company_id, mode, as_of_date)
);

-- Politician committee lookup may already exist — recreate if missing
CREATE TABLE IF NOT EXISTS politician_committee_lookup (
  name_key text PRIMARY KEY,
  display_name text,
  chamber text,
  committee text,
  bioguide_id text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
