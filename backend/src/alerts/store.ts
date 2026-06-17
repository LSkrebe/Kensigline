import { db } from "../core/db.js";

export type AlertPreferences = {
  user_id: string;
  email: string;
  enabled: boolean;
  timezone: string;
  morning_hour: number;
  evening_hour: number;
  feeds: string[];
  max_items: number;
};

let tableReady: Promise<void> | null = null;

export async function ensureAlertTables() {
  if (!tableReady) {
    tableReady = db
      .query(
        `
        CREATE TABLE IF NOT EXISTS alert_preferences (
          user_id text PRIMARY KEY,
          email text NOT NULL,
          enabled boolean NOT NULL DEFAULT true,
          min_grade text NOT NULL DEFAULT 'B',
          timezone text NOT NULL DEFAULT 'UTC',
          morning_hour int NOT NULL DEFAULT 8,
          evening_hour int NOT NULL DEFAULT 18,
          feeds text[] NOT NULL DEFAULT ARRAY['insider','politicians','institutions','research','pharma'],
          max_items int NOT NULL DEFAULT 12,
          updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS alert_digest_log (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id text NOT NULL,
          slot_key text NOT NULL,
          sent_at timestamptz NOT NULL DEFAULT now(),
          item_count int NOT NULL DEFAULT 0
        );
        CREATE UNIQUE INDEX IF NOT EXISTS alert_digest_log_user_slot_unique ON alert_digest_log (user_id, slot_key);
        CREATE TABLE IF NOT EXISTS alert_watchlist (
          user_id text NOT NULL,
          ticker text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (user_id, ticker)
        );
        CREATE INDEX IF NOT EXISTS alert_watchlist_ticker_idx ON alert_watchlist (ticker);
        CREATE TABLE IF NOT EXISTS alert_ticker_sent_log (
          user_id text NOT NULL,
          document_id uuid NOT NULL,
          sent_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (user_id, document_id)
        );
        `,
        [],
      )
      .then(() => undefined);
  }
  await tableReady;
}

async function ensureTables() {
  await ensureAlertTables();
}

export async function getAlertPreferences(userId: string): Promise<AlertPreferences | null> {
  await ensureTables();
  return db.one<AlertPreferences>(`SELECT * FROM alert_preferences WHERE user_id = $1`, [userId]);
}

export async function upsertAlertPreferences(args: {
  userId: string;
  email: string;
  enabled?: boolean;
  timezone?: string;
  morning_hour?: number;
  evening_hour?: number;
  feeds?: string[];
  max_items?: number;
}): Promise<AlertPreferences> {
  await ensureTables();
  const existing = await getAlertPreferences(args.userId);
  const row = await db.one<AlertPreferences>(
    `
    INSERT INTO alert_preferences (user_id, email, enabled, min_grade, timezone, morning_hour, evening_hour, feeds, max_items, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
    ON CONFLICT (user_id) DO UPDATE SET
      email = EXCLUDED.email,
      enabled = COALESCE($3, alert_preferences.enabled),
      min_grade = COALESCE($4, alert_preferences.min_grade),
      timezone = COALESCE($5, alert_preferences.timezone),
      morning_hour = COALESCE($6, alert_preferences.morning_hour),
      evening_hour = COALESCE($7, alert_preferences.evening_hour),
      feeds = COALESCE($8, alert_preferences.feeds),
      max_items = COALESCE($9, alert_preferences.max_items),
      updated_at = now()
    RETURNING *
    `,
    [
      args.userId,
      args.email,
      args.enabled ?? existing?.enabled ?? true,
      // Keep legacy column populated; alert selection is now strictly “best ideas only”.
      "A",
      args.timezone ?? existing?.timezone ?? "UTC",
      args.morning_hour ?? existing?.morning_hour ?? 8,
      args.evening_hour ?? existing?.evening_hour ?? 18,
      args.feeds ?? existing?.feeds ?? ["insider", "politicians", "institutions", "research", "pharma"],
      args.max_items ?? existing?.max_items ?? 12,
    ],
  );
  if (!row) throw new Error("alert_preferences_upsert_failed");
  return row;
}

export async function listEnabledAlertUsers(): Promise<AlertPreferences[]> {
  await ensureTables();
  return db.query<AlertPreferences>(`SELECT * FROM alert_preferences WHERE enabled = true`);
}

export async function digestAlreadySent(userId: string, slotKey: string): Promise<boolean> {
  await ensureTables();
  const row = await db.one<{ id: string }>(
    `SELECT id FROM alert_digest_log WHERE user_id = $1 AND slot_key = $2 LIMIT 1`,
    [userId, slotKey],
  );
  return Boolean(row?.id);
}

export async function logDigestSent(userId: string, slotKey: string, itemCount: number): Promise<void> {
  await ensureTables();
  await db.query(
    `
    INSERT INTO alert_digest_log (user_id, slot_key, item_count, sent_at)
    VALUES ($1, $2, $3, now())
    ON CONFLICT (user_id, slot_key) DO UPDATE SET item_count = EXCLUDED.item_count, sent_at = now()
    `,
    [userId, slotKey, itemCount],
  );
}
