import { db } from "../core/db.js";

export type AlertPreferencesRow = {
  user_id: string;
  email: string;
  enabled: boolean;
  min_grade: string;
  timezone: string;
  morning_hour: number;
  evening_hour: number;
  feeds: string[];
  max_items: number;
  updated_at: string;
};

const SELECT_PREFS = `
  SELECT user_id, email, enabled, min_grade, timezone, morning_hour, evening_hour,
         feeds, max_items, updated_at::text AS updated_at
  FROM alert_preferences
`;

export async function getAlertPreferences(userId: string): Promise<AlertPreferencesRow | null> {
  const rows = await db.query<AlertPreferencesRow>(`${SELECT_PREFS} WHERE user_id = $1 LIMIT 1`, [userId]);
  return rows[0] ?? null;
}

export async function upsertAlertPreferences(input: {
  userId: string;
  email: string;
  enabled?: boolean;
  timezone?: string;
  morningHour?: number;
  maxItems?: number;
}): Promise<AlertPreferencesRow> {
  const timezone = String(input.timezone ?? "UTC").trim() || "UTC";
  const morningHour = clampHour(input.morningHour ?? 8);
  const maxItems = clampMaxItems(input.maxItems ?? 12);
  const enabled = input.enabled === true;

  const rows = await db.query<AlertPreferencesRow>(
    `
    INSERT INTO alert_preferences (user_id, email, enabled, timezone, morning_hour, max_items, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, now())
    ON CONFLICT (user_id) DO UPDATE SET
      email = EXCLUDED.email,
      enabled = COALESCE($3, alert_preferences.enabled),
      timezone = EXCLUDED.timezone,
      morning_hour = EXCLUDED.morning_hour,
      max_items = EXCLUDED.max_items,
      updated_at = now()
    RETURNING user_id, email, enabled, min_grade, timezone, morning_hour, evening_hour,
              feeds, max_items, updated_at::text AS updated_at
    `,
    [input.userId, input.email, enabled, timezone, morningHour, maxItems],
  );

  const row = rows[0];
  if (!row) throw new Error("alert_preferences_upsert_failed");
  return row;
}

export async function patchAlertPreferences(input: {
  userId: string;
  email: string;
  enabled?: boolean;
  timezone?: string;
  morningHour?: number;
}): Promise<AlertPreferencesRow> {
  const existing = await getAlertPreferences(input.userId);
  if (!existing) {
    return upsertAlertPreferences({
      userId: input.userId,
      email: input.email,
      enabled: input.enabled ?? false,
      ...(input.timezone ? { timezone: input.timezone } : {}),
      ...(input.morningHour != null ? { morningHour: input.morningHour } : {}),
    });
  }

  const rows = await db.query<AlertPreferencesRow>(
    `
    UPDATE alert_preferences SET
      email = $2,
      enabled = COALESCE($3, enabled),
      timezone = COALESCE($4, timezone),
      morning_hour = COALESCE($5, morning_hour),
      updated_at = now()
    WHERE user_id = $1
    RETURNING user_id, email, enabled, min_grade, timezone, morning_hour, evening_hour,
              feeds, max_items, updated_at::text AS updated_at
    `,
    [
      input.userId,
      input.email,
      input.enabled ?? null,
      input.timezone ?? null,
      input.morningHour != null ? clampHour(input.morningHour) : null,
    ],
  );

  const row = rows[0];
  if (!row) throw new Error("alert_preferences_patch_failed");
  return row;
}

export async function listEnabledAlertPreferences(): Promise<AlertPreferencesRow[]> {
  return db.query<AlertPreferencesRow>(`${SELECT_PREFS} WHERE enabled = true ORDER BY user_id`);
}

export async function wasDigestSent(userId: string, slotKey: string): Promise<boolean> {
  const rows = await db.query<{ n: string }>(
    `SELECT 1::text AS n FROM alert_digest_log WHERE user_id = $1 AND slot_key = $2 LIMIT 1`,
    [userId, slotKey],
  );
  return rows.length > 0;
}

export async function logDigestSent(userId: string, slotKey: string, itemCount: number): Promise<void> {
  await db.query(
    `
    INSERT INTO alert_digest_log (user_id, slot_key, item_count)
    VALUES ($1, $2, $3)
    ON CONFLICT (user_id, slot_key) DO NOTHING
    `,
    [userId, slotKey, Math.max(0, itemCount)],
  );
}

function clampHour(h: number): number {
  const n = Math.floor(Number(h));
  if (!Number.isFinite(n)) return 8;
  return Math.max(0, Math.min(23, n));
}

function clampMaxItems(n: number): number {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return 12;
  return Math.max(3, Math.min(20, v));
}

export function localDateKey(timezone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  }
}

export function localHour(timezone: string, now = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    }).formatToParts(now);
    const h = parts.find((p) => p.type === "hour")?.value;
    const n = Number(h);
    return Number.isFinite(n) ? n : now.getUTCHours();
  } catch {
    return now.getUTCHours();
  }
}
