import type http from "node:http";
import { bearerToken, verifySupabaseAccessToken } from "../core/supabase-auth.js";
import { json, sendJson } from "../core/http.js";
import { normalizeReferralKey, referralAdminToken } from "./config.js";
import {
  attachUserReferral,
  listReferralStats,
  recordReferralVisit,
  resolveReferralKeyFromQuery,
  syncReferralSourcesFromEnv,
} from "./store.js";

function adminAuthorized(req: http.IncomingMessage): boolean {
  const expected = referralAdminToken();
  if (!expected) return false;
  const got = String(req.headers["x-referral-admin-token"] ?? "").trim();
  return got.length > 0 && got === expected;
}

export async function handleReferralVisit(req: http.IncomingMessage, res: http.ServerResponse) {
  let body: { ref?: string; utm_source?: string; utm_medium?: string } = {};
  try {
    body = (await json(req)) ?? {};
  } catch {
    sendJson(res, 400, { ok: false, error: "invalid_json" });
    return;
  }

  const key = resolveReferralKeyFromQuery(
    body.ref ?? null,
    body.utm_source ?? null,
    body.utm_medium ?? null,
  );
  if (!key) {
    sendJson(res, 400, { ok: false, error: "invalid_ref" });
    return;
  }

  try {
    await syncReferralSourcesFromEnv();
    await recordReferralVisit(key);
    sendJson(res, 200, { ok: true, ref: key });
  } catch (err) {
    console.error("[referral] visit failed", err);
    sendJson(res, 500, { ok: false, error: "visit_failed" });
  }
}

export async function handleReferralAttach(req: http.IncomingMessage, res: http.ServerResponse) {
  const tok = bearerToken(req);
  if (!tok) {
    sendJson(res, 401, { ok: false, error: "missing_bearer" });
    return;
  }
  const user = await verifySupabaseAccessToken(tok);
  if (!user) {
    sendJson(res, 401, { ok: false, error: "invalid_token" });
    return;
  }

  let body: { ref?: string } = {};
  try {
    body = (await json(req)) ?? {};
  } catch {
    sendJson(res, 400, { ok: false, error: "invalid_json" });
    return;
  }

  const key = normalizeReferralKey(body.ref ?? "");
  if (!key) {
    sendJson(res, 400, { ok: false, error: "invalid_ref" });
    return;
  }

  try {
    await syncReferralSourcesFromEnv();
    const attached = await attachUserReferral(user.sub, key);
    sendJson(res, 200, { ok: true, attached, ref: key });
  } catch (err) {
    console.error("[referral] attach failed", err);
    sendJson(res, 500, { ok: false, error: "attach_failed" });
  }
}

export async function handleReferralStats(req: http.IncomingMessage, res: http.ServerResponse) {
  if (!adminAuthorized(req)) {
    sendJson(res, 401, { ok: false, error: "unauthorized" });
    return;
  }

  try {
    const sources = await listReferralStats();
    sendJson(res, 200, { ok: true, sources });
  } catch (err) {
    console.error("[referral] stats failed", err);
    sendJson(res, 500, { ok: false, error: "stats_failed" });
  }
}
