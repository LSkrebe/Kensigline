-- Scale-hardening indexes + bars meta (safe to re-run).

CREATE TABLE IF NOT EXISTS bars_ticker_meta (
  ticker text PRIMARY KEY,
  last_bar_day date NOT NULL,
  bar_count int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bars_ticker_meta_last_day_idx
  ON bars_ticker_meta (last_bar_day DESC);

CREATE INDEX IF NOT EXISTS feed_ticker_latest_kind_at_ticker_idx
  ON feed_ticker_latest (feed_kind, feed_at DESC, ticker_norm DESC);

CREATE INDEX IF NOT EXISTS feed_market_latest_at_ticker_idx
  ON feed_market_latest (feed_at DESC, ticker_norm DESC);

-- Backfill meta from existing bars (batched by callers if huge; fine while small/medium).
INSERT INTO bars_ticker_meta (ticker, last_bar_day, bar_count, updated_at)
SELECT ticker, max(day)::date, count(*)::int, now()
FROM bars
GROUP BY ticker
ON CONFLICT (ticker) DO UPDATE SET
  last_bar_day = EXCLUDED.last_bar_day,
  bar_count = EXCLUDED.bar_count,
  updated_at = now();
