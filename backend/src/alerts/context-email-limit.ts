import { db } from "../core/db.js";
import { ensureAlertTables } from "./store.js";

export function contextEmailsPerDay(): number {
  const n = Number(process.env.ALERT_CONTEXT_EMAILS_PER_DAY ?? 20);
  if (!Number.isFinite(n)) return 20;
  return Math.max(1, Math.min(50, Math.round(n)));
}

export function localDateKey(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

async function ensureContextEmailLogTable(): Promise<void> {
  await ensureAlertTables();
  await db.query(`
    CREATE TABLE IF NOT EXISTS alert_context_email_log (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id text NOT NULL,
      date_key text NOT NULL,
      item_count int NOT NULL DEFAULT 0,
      sent_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS alert_context_email_log_user_date_idx
      ON alert_context_email_log (user_id, date_key);
  `);
}

export async function countContextEmailsSentOnDate(userId: string, dateKey: string): Promise<number> {
  await ensureContextEmailLogTable();
  const row = await db.one<{ n: string }>(
    `SELECT count(*)::text AS n FROM alert_context_email_log WHERE user_id = $1 AND date_key = $2`,
    [userId, dateKey],
  );
  return Number(row?.n ?? 0);
}

export async function canSendContextEmail(userId: string, timeZone: string): Promise<{ ok: boolean; dateKey: string; sent: number; max: number }> {
  const dateKey = localDateKey(new Date(), timeZone);
  const sent = await countContextEmailsSentOnDate(userId, dateKey);
  const max = contextEmailsPerDay();
  return { ok: sent < max, dateKey, sent, max };
}

export async function logContextEmailSent(userId: string, dateKey: string, itemCount: number): Promise<void> {
  await ensureContextEmailLogTable();
  await db.query(
    `INSERT INTO alert_context_email_log (user_id, date_key, item_count, sent_at) VALUES ($1, $2, $3, now())`,
    [userId, dateKey, itemCount],
  );
}
