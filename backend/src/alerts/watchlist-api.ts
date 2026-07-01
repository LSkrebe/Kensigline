import type http from "node:http";
import { json, sendJson } from "../core/http.js";
import { bearerToken, verifySupabaseAccessToken } from "../core/supabase-auth.js";
import { upsertAlertPreferences } from "./store.js";
import {
  addWatchlistTicker,
  listUserWatchlist,
  removeWatchlistTicker,
  WatchlistLimitError,
} from "./watchlist.js";
import { combinedWatchlistCounts } from "./watchlist-limits.js";

async function requireUser(req: http.IncomingMessage) {
  const tok = bearerToken(req);
  if (!tok) return null;
  return verifySupabaseAccessToken(tok);
}

export async function handleAlertsWatchlistGet(req: http.IncomingMessage, res: http.ServerResponse) {
  const user = await requireUser(req);
  if (!user?.sub || !user.email) {
    sendJson(res, 401, { ok: false, error: "unauthorized" });
    return;
  }
  await upsertAlertPreferences({ userId: user.sub, email: user.email });
  const tickers = await listUserWatchlist(user.sub);
  const counts = await combinedWatchlistCounts(user.sub);
  sendJson(res, 200, {
    ok: true,
    tickers,
    max: counts.max,
    count: tickers.length,
    total_count: counts.totalCount,
  });
}

export async function handleAlertsWatchlistPatch(req: http.IncomingMessage, res: http.ServerResponse) {
  const user = await requireUser(req);
  if (!user?.sub || !user.email) {
    sendJson(res, 401, { ok: false, error: "unauthorized" });
    return;
  }
  const body = (await json(req)) as Record<string, unknown>;
  const ticker = String(body.ticker ?? "").trim().toUpperCase();
  if (!ticker) {
    sendJson(res, 400, { ok: false, error: "ticker_required" });
    return;
  }
  await upsertAlertPreferences({ userId: user.sub, email: user.email });
  const subscribed = body.subscribed != null ? Boolean(body.subscribed) : !body.remove;

  try {
    const tickers = subscribed
      ? await addWatchlistTicker(user.sub, ticker)
      : await removeWatchlistTicker(user.sub, ticker);
    const counts = await combinedWatchlistCounts(user.sub);
    sendJson(res, 200, {
      ok: true,
      tickers,
      max: counts.max,
      count: tickers.length,
      total_count: counts.totalCount,
      ticker,
      subscribed,
    });
  } catch (err) {
    if (err instanceof WatchlistLimitError) {
      const tickers = await listUserWatchlist(user.sub);
      const counts = await combinedWatchlistCounts(user.sub);
      sendJson(res, 409, {
        ok: false,
        error: "watchlist_limit",
        max: err.max,
        count: tickers.length,
        total_count: counts.totalCount,
        tickers,
        ticker,
      });
      return;
    }
    throw err;
  }
}
