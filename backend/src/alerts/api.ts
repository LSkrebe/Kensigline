import type http from "node:http";
import { json, sendJson } from "../core/http.js";
import { bearerToken, verifySupabaseAccessToken } from "../core/supabase-auth.js";
import { getAlertPreferences, upsertAlertPreferences } from "./store.js";

async function requireUser(req: http.IncomingMessage) {
  const tok = bearerToken(req);
  if (!tok) return null;
  return verifySupabaseAccessToken(tok);
}

export async function handleAlertsPreferencesGet(req: http.IncomingMessage, res: http.ServerResponse) {
  const user = await requireUser(req);
  if (!user?.sub || !user.email) {
    sendJson(res, 401, { ok: false, error: "unauthorized" });
    return;
  }
  let prefs = await getAlertPreferences(user.sub);
  if (!prefs) {
    prefs = await upsertAlertPreferences({ userId: user.sub, email: user.email, enabled: true });
  }
  sendJson(res, 200, { ok: true, preferences: prefs });
}

export async function handleAlertsPreferencesPatch(req: http.IncomingMessage, res: http.ServerResponse) {
  const user = await requireUser(req);
  if (!user?.sub || !user.email) {
    sendJson(res, 401, { ok: false, error: "unauthorized" });
    return;
  }
  const body = (await json(req)) as Record<string, unknown>;
  const patch: {
    userId: string;
    email: string;
    enabled?: boolean;
    timezone?: string;
    morning_hour?: number;
    evening_hour?: number;
    feeds?: string[];
    max_items?: number;
  } = { userId: user.sub, email: user.email };
  if (body.enabled != null) patch.enabled = Boolean(body.enabled);
  if (body.timezone != null) patch.timezone = String(body.timezone);
  if (body.morning_hour != null) patch.morning_hour = Math.max(0, Math.min(23, Number(body.morning_hour)));
  if (body.evening_hour != null) patch.evening_hour = Math.max(0, Math.min(23, Number(body.evening_hour)));
  if (Array.isArray(body.feeds)) patch.feeds = body.feeds.map((x) => String(x));
  if (body.max_items != null) patch.max_items = Math.max(1, Math.min(30, Number(body.max_items)));
  const prefs = await upsertAlertPreferences(patch);
  sendJson(res, 200, { ok: true, preferences: prefs });
}
