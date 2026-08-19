import { db } from "../core/db.js";
import { actorCanonicalKey, type ActorAlertMode } from "./actor-key.js";
import { assertCombinedWatchlistHasRoom } from "./watchlist-limits.js";
import { WatchlistLimitError } from "./watchlist.js";
import { ensureAlertTables } from "./store.js";

export type ActorWatchlistRow = {
  actor_key: string;
  display_name: string;
  mode: ActorAlertMode;
  created_at: string;
};

export { WatchlistLimitError as ActorWatchlistLimitError };

function normalizeActorKey(key: string): string {
  return String(key ?? "").trim().toLowerCase();
}

function normalizeMode(mode: string): ActorAlertMode {
  if (mode === "politicians" || mode === "institutions") return mode;
  return "insider";
}

export async function listUserActorWatchlist(userId: string): Promise<ActorWatchlistRow[]> {
  await ensureAlertTables();
  return db.query<ActorWatchlistRow>(
    `
    SELECT actor_key, display_name, mode, created_at::text
    FROM alert_actor_watchlist
    WHERE user_id = $1
    ORDER BY created_at ASC
    `,
    [userId],
  );
}

export async function addActorWatchlistEntry(
  userId: string,
  args: { actor_key: string; display_name: string; mode: string },
): Promise<ActorWatchlistRow[]> {
  await ensureAlertTables();
  const actorKey = normalizeActorKey(args.actor_key);
  if (!actorKey || actorKey.length > 120) throw new Error("invalid_actor_key");

  const current = await listUserActorWatchlist(userId);
  const addingNew = !current.some((r) => r.actor_key === actorKey);
  if (addingNew) {
    await assertCombinedWatchlistHasRoom(userId, true);
  }

  const displayName = String(args.display_name ?? "").trim() || actorKey;
  const mode = normalizeMode(args.mode);

  await db.query(
    `
    INSERT INTO alert_actor_watchlist (user_id, actor_key, display_name, mode, created_at)
    VALUES ($1, $2, $3, $4, now())
    ON CONFLICT (user_id, actor_key) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      mode = EXCLUDED.mode
    `,
    [userId, actorKey, displayName, mode],
  );
  return listUserActorWatchlist(userId);
}

export async function removeActorWatchlistEntry(userId: string, actorKey: string): Promise<ActorWatchlistRow[]> {
  await ensureAlertTables();
  const key = normalizeActorKey(actorKey);
  if (!key) return listUserActorWatchlist(userId);
  await db.query(`DELETE FROM alert_actor_watchlist WHERE user_id = $1 AND actor_key = $2`, [userId, key]);
  return listUserActorWatchlist(userId);
}

export async function listActorWatchlistSubscribers(
  actorKey: string,
): Promise<{ user_id: string; email: string; timezone: string }[]> {
  await ensureAlertTables();
  const key = normalizeActorKey(actorKey);
  if (!key) return [];
  return db.query<{ user_id: string; email: string; timezone: string }>(
    `
    SELECT w.user_id, p.email, coalesce(nullif(trim(p.timezone), ''), 'UTC') AS timezone
    FROM alert_actor_watchlist w
    INNER JOIN alert_preferences p ON p.user_id = w.user_id
    WHERE w.actor_key = $1 AND p.email IS NOT NULL AND trim(p.email) <> ''
    `,
    [key],
  );
}

export async function actorAlertAlreadySent(userId: string, documentId: string, actorKey: string): Promise<boolean> {
  await ensureAlertTables();
  const row = await db.one<{ id: string }>(
    `
    SELECT user_id AS id
    FROM alert_actor_sent_log
    WHERE user_id = $1 AND document_id = $2::uuid AND actor_key = $3
    LIMIT 1
    `,
    [userId, documentId, normalizeActorKey(actorKey)],
  );
  return Boolean(row?.id);
}

export async function logActorAlertSent(userId: string, documentId: string, actorKey: string): Promise<void> {
  await ensureAlertTables();
  await db.query(
    `
    INSERT INTO alert_actor_sent_log (user_id, document_id, actor_key, sent_at)
    VALUES ($1, $2::uuid, $3, now())
    ON CONFLICT (user_id, document_id, actor_key) DO NOTHING
    `,
    [userId, documentId, normalizeActorKey(actorKey)],
  );
}

/** Resolve actor keys present on a document from flow tables. */
export async function listActorKeysForDocument(documentId: string): Promise<{ actor_key: string; display_name: string; mode: ActorAlertMode }[]> {
  await ensureAlertTables();
  const out = new Map<string, { actor_key: string; display_name: string; mode: ActorAlertMode }>();

  const insiders = await db.query<{ display_name: string }>(
    `
    SELECT DISTINCT f.display_name
    FROM insider_transactions t
    JOIN filers f ON f.id = t.filer_id
    WHERE t.filing_id = $1::uuid
    `,
    [documentId],
  );
  for (const row of insiders) {
    const name = String(row.display_name ?? "").trim();
    if (!name) continue;
    const actor_key = actorCanonicalKey(name, "insider");
    if (!actor_key) continue;
    out.set(actor_key, { actor_key, display_name: name, mode: "insider" });
  }

  const politicians = await db.query<{ display_name: string }>(
    `
    SELECT DISTINCT f.display_name
    FROM politician_transactions t
    JOIN filers f ON f.id = t.filer_id
    WHERE t.filing_id = $1::uuid
    `,
    [documentId],
  );
  for (const row of politicians) {
    const name = String(row.display_name ?? "").trim();
    if (!name) continue;
    const actor_key = actorCanonicalKey(name, "politicians");
    if (!actor_key) continue;
    out.set(actor_key, { actor_key, display_name: name, mode: "politicians" });
  }

  const institutions = await db.query<{ display_name: string }>(
    `
    SELECT DISTINCT f.display_name
    FROM institution_transactions t
    JOIN filers f ON f.id = t.filer_id
    WHERE t.filing_id = $1::uuid
    `,
    [documentId],
  );
  for (const row of institutions) {
    const name = String(row.display_name ?? "").trim();
    if (!name) continue;
    const actor_key = actorCanonicalKey(name, "institutions");
    if (!actor_key) continue;
    out.set(actor_key, { actor_key, display_name: name, mode: "institutions" });
  }

  return [...out.values()];
}
