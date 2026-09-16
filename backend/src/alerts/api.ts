import type http from "node:http";
import { bearerToken, verifySupabaseAccessToken } from "../core/supabase-auth.js";
import { json, sendJson } from "../core/http.js";
import { getAlertPreferences, ensureAlertPreferences, patchAlertPreferences } from "./store.js";

async function requireUser(req: http.IncomingMessage) {
  const tok = bearerToken(req);
  if (!tok) return null;
  return verifySupabaseAccessToken(tok);
}

function prefsPayload(row: Awaited<ReturnType<typeof getAlertPreferences>>) {
  if (!row) {
    return {
      enabled: true,
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

  try {
    let row = await getAlertPreferences(user.sub);
    if (!row && user.email) {
      const requestedTimezone = new URL(req.url ?? '/', 'http://localhost').searchParams.get('timezone') || 'UTC';
      let timezone = 'UTC';
      try { new Intl.DateTimeFormat('en', {timeZone:requestedTimezone}).format(); timezone = requestedTimezone; } catch {}
      row = await ensureAlertPreferences(user.sub, user.email, timezone);
    }
    if (!row) { sendJson(res, 400, {ok:false,error:'email_required'}); return; }
    sendJson(res, 200, { ok: true, preferences: prefsPayload(row) });
  } catch (e) {
    console.warn('[alerts] preferences_get_failed', e instanceof Error ? e.message : e);
    sendJson(res, 503, {ok:false,error:'preferences_unavailable'});
  }
}

export async function handleAlertsPreferencesPut(req: http.IncomingMessage, res: http.ServerResponse) {
  const user = await requireUser(req);
  if (!user?.sub) {
    sendJson(res, 401, { ok: false, error: "unauthorized" });
    return;
  }

  let body: {
    enabled?: boolean;
    timezone?: string;
    morning_hour?: number;
    email?: string;
  } = {};
  try {
    const parsed = (await json(req)) as typeof body | string | null;
    // Tolerate accidental double-JSON from older clients.
    if (typeof parsed === "string") {
      try {
        body = JSON.parse(parsed) as typeof body;
      } catch {
        body = {};
      }
    } else if (parsed && typeof parsed === "object") {
      body = parsed;
    }
  } catch (e) {
    console.warn("[alerts] preferences_bad_json", e instanceof Error ? e.message : e);
    sendJson(res, 400, { ok: false, error: "invalid_json" });
    return;
  }

  const email =
    String(user.email ?? "").trim() ||
    String(body.email ?? "").trim() ||
    "";
  if (!email) {
    sendJson(res, 400, { ok: false, error: "email_required" });
    return;
  }

  try {
    const row = await patchAlertPreferences({
      userId: user.sub,
      email,
      ...(typeof body.enabled === "boolean" ? { enabled: body.enabled } : {}),
      ...(typeof body.timezone === "string" && body.timezone.trim()
        ? { timezone: body.timezone.trim() }
        : {}),
      ...(typeof body.morning_hour === "number" ? { morningHour: body.morning_hour } : {}),
    });

    sendJson(res, 200, { ok: true, preferences: prefsPayload(row) });
  } catch (e) {
    console.error("[alerts] preferences_put_failed", e);
    sendJson(res, 500, { ok: false, error: "preferences_update_failed" });
  }
}
