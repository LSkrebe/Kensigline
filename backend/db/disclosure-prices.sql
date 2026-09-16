-- Additive cache: one complete, consistently split-adjusted price series per ticker.
CREATE TABLE IF NOT EXISTS disclosure_price_history (
  ticker text PRIMARY KEY,
  provider text NOT NULL,
  basis text NOT NULL CHECK (basis = 'split_adjusted_close'),
  as_of_day date NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  bars jsonb NOT NULL
);
ALTER TABLE disclosure_price_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON disclosure_price_history FROM anon, authenticated;
