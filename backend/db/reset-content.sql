-- Wipe ingest / market / document data. Keeps accounts, billing, and alert watchlists.
--
-- Preserved: billing_accounts, alert_preferences, alert_watchlist, alert_actor_watchlist, alert_digest_log
-- Cleared: documents, queues, bars, companies, outcomes, caches, alert send logs
--
--   cd backend && npx tsx src/scripts/reset-content-data.ts

BEGIN;

TRUNCATE TABLE alert_ticker_sent_log;
TRUNCATE TABLE alert_actor_sent_log;

TRUNCATE TABLE insider_transactions;
TRUNCATE TABLE politician_transactions;
TRUNCATE TABLE institution_filings_13f;
TRUNCATE TABLE documents;
TRUNCATE TABLE document_queue;
TRUNCATE TABLE outcomes;
TRUNCATE TABLE bars;
TRUNCATE TABLE ticker_context_cache;
TRUNCATE TABLE ingest_cursors;
TRUNCATE TABLE companies;

COMMIT;
