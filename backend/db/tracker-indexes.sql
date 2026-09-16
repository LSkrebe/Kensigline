-- Run each statement outside a transaction. These indexes are already applied in production.
CREATE INDEX CONCURRENTLY IF NOT EXISTS filings_tracker_source_recorded_idx ON filings(source_type,parsed_at DESC,id DESC) WHERE show_on_ticker;
CREATE INDEX CONCURRENTLY IF NOT EXISTS insider_transactions_tracker_date_idx ON insider_transactions(transaction_at DESC,id DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS politician_transactions_tracker_date_idx ON politician_transactions(transaction_at DESC,id DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS institution_transactions_tracker_date_idx ON institution_transactions(transaction_at DESC,id DESC) WHERE data_quality_version>=1;
