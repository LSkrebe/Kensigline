-- Precomputed feed index for fast list endpoints (see src/shared/feed-index.ts).

ALTER TABLE documents ADD COLUMN IF NOT EXISTS feed_at timestamptz;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS ticker_norm text;

CREATE INDEX IF NOT EXISTS documents_feed_kind_feed_at_idx
  ON documents (feed_kind, feed_at DESC)
  WHERE feed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS documents_ticker_norm_feed_at_idx
  ON documents (ticker_norm, feed_at DESC)
  WHERE ticker_norm IS NOT NULL AND feed_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS feed_ticker_latest (
  feed_kind text NOT NULL,
  ticker_norm text NOT NULL,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  feed_at timestamptz NOT NULL,
  feed_label text,
  company_name text,
  source_key text,
  analysis text,
  program_phase text,
  show_on_ticker boolean NOT NULL DEFAULT true,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (feed_kind, ticker_norm)
);

CREATE INDEX IF NOT EXISTS feed_ticker_latest_kind_at_idx
  ON feed_ticker_latest (feed_kind, feed_at DESC);

CREATE TABLE IF NOT EXISTS feed_market_latest (
  ticker_norm text PRIMARY KEY,
  feed_kind text NOT NULL,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  feed_at timestamptz NOT NULL,
  feed_label text,
  company_name text,
  source_key text,
  analysis text,
  program_phase text,
  show_on_ticker boolean NOT NULL DEFAULT true,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS feed_market_latest_feed_at_idx
  ON feed_market_latest (feed_at DESC);
