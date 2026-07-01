import type http from "node:http";
import { json, sendJson } from "../core/http.js";
import { bearerToken, verifySupabaseAccessToken } from "../core/supabase-auth.js";
import { upsertAlertPreferences } from "./store.js";
import {
  ActorWatchlistLimitError,
  addActorWatchlistEntry,
  listUserActorWatchlist,
  removeActorWatchlistEntry,
} from "./actor-watchlist.js";
import { combinedWatchlistCounts } from "./watchlist-limits.js";
import { watchlistMaxTickers, WatchlistLimitError } from "./watchlist.js";

async function requireUser(req: http.IncomingMessage) {
  const tok = bearerToken(req);
  if (!tok) return null;
  return verifySupabaseAccessToken(tok);
}

export async function handleAlertsActorWatchlistGet(req: http.IncomingMessage, res: http.ServerResponse) {
  const user = await requireUser(req);
  if (!user?.sub || !user.email) {
    sendJson(res, 401, { ok: false, error: "unauthorized" });
    return;
  }
  await upsertAlertPreferences({ userId: user.sub, email: user.email });
  const actors = await listUserActorWatchlist(user.sub);
  const counts = await combinedWatchlistCounts(user.sub);
  sendJson(res, 200, {
    ok: true,
    actors,
    max: counts.max,
    count: actors.length,
    total_count: counts.totalCount,
  });
}

export async function handleAlertsActorWatchlistPatch(req: http.IncomingMessage, res: http.ServerResponse) {
  const user = await requireUser(req);
  if (!user?.sub || !user.email) {
    sendJson(res, 401, { ok: false, error: "unauthorized" });
    return;
  }
  const body = (await json(req)) as Record<string, unknown>;
  const actorKey = String(body.actor_key ?? "").trim().toLowerCase();
  if (!actorKey) {
    sendJson(res, 400, { ok: false, error: "actor_key_required" });
    return;
  }
  await upsertAlertPreferences({ userId: user.sub, email: user.email });
  const subscribed = body.subscribed != null ? Boolean(body.subscribed) : !body.remove;

  try {
    const actors = subscribed
      ? await addActorWatchlistEntry(user.sub, {
          actor_key: actorKey,
          display_name: String(body.display_name ?? ""),
          mode: String(body.mode ?? "insider"),
        })
      : await removeActorWatchlistEntry(user.sub, actorKey);
    const counts = await combinedWatchlistCounts(user.sub);
    sendJson(res, 200, {
      ok: true,
      actors,
      max: counts.max,
      count: actors.length,
      total_count: counts.totalCount,
      actor_key: actorKey,
      subscribed,
    });
  } catch (err) {
    if (err instanceof WatchlistLimitError || err instanceof ActorWatchlistLimitError) {
      const actors = await listUserActorWatchlist(user.sub);
      const counts = await combinedWatchlistCounts(user.sub);
      const max = err instanceof WatchlistLimitError ? err.max : watchlistMaxTickers();
      sendJson(res, 409, {
        ok: false,
        error: "watchlist_limit",
        max,
        count: actors.length,
        total_count: counts.totalCount,
        actors,
        actor_key: actorKey,
      });
      return;
    }
    throw err;
  }
}
