import { db } from "../core/db.js";
import { ensureAlertTables } from "./store.js";

export type WatchlistEntry = {
  user_id: string;
  ticker: string;
  created_at: string;
};

export async function listUserWatchlist(userId: string): Promise<string[]> {
  await ensureAlertTables();
  const rows = await db.query<{ ticker: string }>(
    `SELECT upper(ticker) AS ticker FROM alert_watchlist WHERE user_id = $1 ORDER BY created_at ASC`,
    [userId],
  );
  return rows.map((r) => String(r.ticker ?? "").trim().toUpperCase()).filter(Boolean);
}

export async function addWatchlistTicker(userId: string, ticker: string): Promise<string[]> {
  await ensureAlertTables();
  const t = String(ticker ?? "").trim().toUpperCase();
  if (!t || !/^[A-Z0-9.-]{1,12}$/.test(t)) throw new Error("invalid_ticker");
  await db.query(
    `
    INSERT INTO alert_watchlist (user_id, ticker, created_at)
    VALUES ($1, $2, now())
    ON CONFLICT (user_id, ticker) DO NOTHING
    `,
    [userId, t],
  );
  return listUserWatchlist(userId);
}

export async function removeWatchlistTicker(userId: string, ticker: string): Promise<string[]> {
  await ensureAlertTables();
  const t = String(ticker ?? "").trim().toUpperCase();
  if (!t) return listUserWatchlist(userId);
  await db.query(`DELETE FROM alert_watchlist WHERE user_id = $1 AND ticker = $2`, [userId, t]);
  return listUserWatchlist(userId);
}

export async function listWatchlistSubscribersForTicker(ticker: string): Promise<{ user_id: string; email: string }[]> {
  await ensureAlertTables();
  const t = String(ticker ?? "").trim().toUpperCase();
  if (!t) return [];
  return db.query<{ user_id: string; email: string }>(
    `
    SELECT w.user_id, p.email
    FROM alert_watchlist w
    INNER JOIN alert_preferences p ON p.user_id = w.user_id
    WHERE w.ticker = $1 AND p.email IS NOT NULL AND trim(p.email) <> ''
    `,
    [t],
  );
}

export async function tickerAlertAlreadySent(userId: string, documentId: string): Promise<boolean> {
  await ensureAlertTables();
  const row = await db.one<{ id: string }>(
    `SELECT user_id AS id FROM alert_ticker_sent_log WHERE user_id = $1 AND document_id = $2::uuid LIMIT 1`,
    [userId, documentId],
  );
  return Boolean(row?.id);
}

export async function logTickerAlertSent(userId: string, documentId: string): Promise<void> {
  await ensureAlertTables();
  await db.query(
    `
    INSERT INTO alert_ticker_sent_log (user_id, document_id, sent_at)
    VALUES ($1, $2::uuid, now())
    ON CONFLICT (user_id, document_id) DO NOTHING
    `,
    [userId, documentId],
  );
}
