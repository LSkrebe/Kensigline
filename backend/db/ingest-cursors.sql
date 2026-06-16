-- Historical ingest cursors (safe to re-run on existing DBs).
-- Apply: psql "$DATABASE_URL" -f backend/db/ingest-cursors.sql

CREATE TABLE IF NOT EXISTS ingest_cursors (
  pipeline text NOT NULL,
  cursor_key text NOT NULL,
  cursor_value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pipeline, cursor_key)
);
