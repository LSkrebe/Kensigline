import type http from "node:http";
import { bearerToken, verifySupabaseAccessToken } from "../core/supabase-auth.js";
import { json, sendJson } from "../core/http.js";
import { getAlertPreferences, patchAlertPreferences } from "./store.js";

async function requireUser(req: http.IncomingMessage) {
  const tok = bearerToken(req);
  if (!tok) return null;
  return verifySupabaseAccessToken(tok);
}

function prefsPayload(row: Awaited<ReturnType<typeof getAlertPreferences>>) {
  if (!row) {
    return {
      enabled: false,
      email: null,
      timezone: "UTC",
      morning_hour: 8,
      max_items: 12,
    };
  }
  return {
    enabled: row.enabled,
    email: row.email,
    timezone: row.timezone,
    morning_hour: row.morning_hour,
    max_items: row.max_items,
    updated_at: row.updated_at,
  };
}

export async function handleAlertsPreferencesGet(req: http.IncomingMessage, res: http.ServerResponse) {
  const user = await requireUser(req);
  if (!user?.sub) {
    sendJson(res, 401, { ok: false, error: "unauthorized" });
    return;
  }

  const row = await getAlertPreferences(user.sub);
  sendJson(res, 200, { ok: true, preferences: prefsPayload(row) });
}

export async function handleAlertsPreferencesPut(req: http.IncomingMessage, res: http.ServerResponse) {
  const user = await requireUser(req);
  if (!user?.sub || !user.email) {
    sendJson(res, 401, { ok: false, error: "unauthorized" });
    return;
  }

  const body = (await json(req)) as {
    enabled?: boolean;
    timezone?: string;
    morning_hour?: number;
  };

  const row = await patchAlertPreferences({
    userId: user.sub,
    email: user.email,
    ...(typeof body.enabled === "boolean" ? { enabled: body.enabled } : {}),
    ...(typeof body.timezone === "string" && body.timezone.trim()
      ? { timezone: body.timezone.trim() }
      : {}),
    ...(typeof body.morning_hour === "number" ? { morningHour: body.morning_hour } : {}),
  });

  sendJson(res, 200, { ok: true, preferences: prefsPayload(row) });
}
