import type http from "node:http";
import { bearerToken, verifySupabaseAccessToken } from "../core/supabase-auth.js";
import { json, sendJson } from "../core/http.js";
import {
  attachUserReferral,
  attributionSummary,
  logAttributionEvent,
  normalizeRef,
  normalizeVisitorId,
} from "./store.js";

export async function handleAttributionVisit(req: http.IncomingMessage, res: http.ServerResponse) {
  let body: Record<string, unknown>;
  try {
    body = ((await json(req)) as Record<string, unknown>) ?? {};
  } catch {
    sendJson(res, 400, { ok: false, error: "invalid_json" });
    return;
  }

  const ref = normalizeRef(body.ref ?? body.r);
  if (!ref) {
    sendJson(res, 400, { ok: false, error: "invalid_ref" });
    return;
  }

  const visitorId = normalizeVisitorId(body.visitor_id ?? body.visitorId);

  try {
    await logAttributionEvent({ ref, event: "visit", visitorId });
    sendJson(res, 200, { ok: true });
  } catch (err) {
    console.warn("[attribution] visit log failed", err);
    sendJson(res, 503, { ok: false, error: "attribution_unavailable" });
  }
}

export async function handleAttributionSignup(req: http.IncomingMessage, res: http.ServerResponse) {
  const tok = bearerToken(req);
  if (!tok) {
    sendJson(res, 401, { ok: false, error: "unauthorized" });
    return;
  }
  const user = await verifySupabaseAccessToken(tok);
  if (!user) {
    sendJson(res, 401, { ok: false, error: "unauthorized" });
    return;
  }

  let body: Record<string, unknown> = {};
  try {
    body = ((await json(req)) as Record<string, unknown>) ?? {};
  } catch {
    /* empty body ok — ref optional if already stored client-side only */
  }

  const ref = normalizeRef(body.ref ?? body.r);
  if (!ref) {
    sendJson(res, 400, { ok: false, error: "invalid_ref" });
    return;
  }

  try {
    const firstTouch = await attachUserReferral(user.sub, ref);
    if (firstTouch) {
      await logAttributionEvent({ ref, event: "signup", userId: user.sub });
    }
    sendJson(res, 200, { ok: true, first_touch: firstTouch });
  } catch (err) {
    console.warn("[attribution] signup log failed", err);
    sendJson(res, 503, { ok: false, error: "attribution_unavailable" });
  }
}

/** Owner / billing-exempt only — funnel summary per ?r= ref. */
export async function handleAttributionSummary(req: http.IncomingMessage, res: http.ServerResponse) {
  const tok = bearerToken(req);
  if (!tok) {
    sendJson(res, 401, { ok: false, error: "unauthorized" });
    return;
  }
  const user = await verifySupabaseAccessToken(tok);
  if (!user?.billingExempt) {
    sendJson(res, 403, { ok: false, error: "forbidden" });
    return;
  }

  try {
    const rows = await attributionSummary();
    sendJson(res, 200, { ok: true, rows });
  } catch (err) {
    console.warn("[attribution] summary failed", err);
    sendJson(res, 503, { ok: false, error: "attribution_unavailable" });
  }
}

/** Called from billing checkout when a ref is present. */
export async function logAttributionCheckout(userId: string, ref: string): Promise<void> {
  const normalized = normalizeRef(ref);
  if (!normalized) return;
  await logAttributionEvent({ ref: normalized, event: "checkout", userId });
}
