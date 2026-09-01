-- Hot-path indexes for feed + ingest (safe to re-run).
-- Prefer CREATE INDEX CONCURRENTLY in production (not inside a transaction).

CREATE INDEX IF NOT EXISTS documents_url_idx
  ON documents (url)
  WHERE url IS NOT NULL;

CREATE INDEX IF NOT EXISTS documents_near_dup_key_idx
  ON documents ((data->>'near_dup_key'))
  WHERE feed_kind = 'research' AND (data ? 'near_dup_key');

CREATE INDEX IF NOT EXISTS documents_ticker_norm_parsed_at_idx
  ON documents (ticker_norm, parsed_at DESC)
  WHERE ticker_norm IS NOT NULL;

CREATE INDEX IF NOT EXISTS documents_feed_kind_ticker_norm_event_idx
  ON documents (feed_kind, ticker_norm, event_at DESC)
  WHERE feed_kind IS NOT NULL AND ticker_norm IS NOT NULL AND event_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS documents_feed_kind_parsed_at_idx
  ON documents (feed_kind, parsed_at DESC)
  WHERE feed_kind IS NOT NULL;

CREATE INDEX IF NOT EXISTS document_queue_claim_idx
  ON document_queue (source_type, status, priority DESC, created_at ASC)
  WHERE status IN ('ready_to_parse', 'queued', 'failed');

CREATE INDEX IF NOT EXISTS companies_ticker_norm_idx
  ON companies (upper(trim(ticker)))
  WHERE ticker IS NOT NULL;

CREATE INDEX IF NOT EXISTS institution_tx_transaction_at_desc_idx
  ON institution_transactions (transaction_at DESC);

-- One institution_transactions row per 13F filing (apply after duplicate repair).
-- CREATE UNIQUE INDEX IF NOT EXISTS institution_tx_one_per_filing_uidx
--   ON institution_transactions (filing_id);

CREATE INDEX IF NOT EXISTS filings_explore_event_at_desc_idx
  ON filings (coalesce(event_at, filed_at, parsed_at) DESC)
  WHERE issuer_id IS NOT NULL;

-- Backfill normalized columns used by indexes / feed queries.
UPDATE documents
SET ticker_norm = upper(trim(ticker))
WHERE ticker_norm IS NULL
  AND ticker IS NOT NULL
  AND length(trim(ticker)) > 0;

UPDATE documents
SET feed_at = COALESCE(
  CASE
    WHEN event_at IS NOT NULL AND event_at <= now() + interval '14 days' THEN event_at
    ELSE NULL
  END,
  published_at,
  parsed_at
)
WHERE feed_at IS NULL
  AND (event_at IS NOT NULL OR published_at IS NOT NULL OR parsed_at IS NOT NULL);
