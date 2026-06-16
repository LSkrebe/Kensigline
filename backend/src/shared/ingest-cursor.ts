import { db } from "../core/db.js";

let tableReady: Promise<void> | null = null;

async function ensureTable() {
  if (!tableReady) {
    tableReady = db
      .query(
        `
        CREATE TABLE IF NOT EXISTS ingest_cursors (
          pipeline text NOT NULL,
          cursor_key text NOT NULL,
          cursor_value text NOT NULL,
          updated_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (pipeline, cursor_key)
        )
        `,
        [],
      )
      .then(() => undefined);
  }
  await tableReady;
}

export async function getIngestCursor(pipeline: string, key: string): Promise<string | null> {
  await ensureTable();
  const row = await db.one<{ cursor_value: string }>(
    `SELECT cursor_value FROM ingest_cursors WHERE pipeline = $1 AND cursor_key = $2`,
    [pipeline, key],
  );
  return row?.cursor_value ?? null;
}

export async function setIngestCursor(pipeline: string, key: string, value: string): Promise<void> {
  await ensureTable();
  await db.query(
    `
    INSERT INTO ingest_cursors (pipeline, cursor_key, cursor_value, updated_at)
    VALUES ($1, $2, $3, now())
    ON CONFLICT (pipeline, cursor_key)
    DO UPDATE SET cursor_value = EXCLUDED.cursor_value, updated_at = now()
    `,
    [pipeline, key, value],
  );
}
