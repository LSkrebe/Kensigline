import type http from "node:http";
import { bearerToken, verifySupabaseAccessToken } from "../core/supabase-auth.js";
import { json, sendJson } from "../core/http.js";
import {
  attachUserReferral,
  attributionSummary,
  CLIENT_TRACK_EVENTS,
  insertAnalyticsEvents,
  linkVisitorToUser,
  logAttributionEvent,
  logCheckoutOpenedEvent,
  normalizeRef,
  normalizeSessionId,
  normalizeVisitorId,
  upsertAnalyticsSession,
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

  const visitorId = normalizeVisitorId(body.visitor_id ?? body.visitorId);

  try {
    const firstTouch = await attachUserReferral(user.sub, ref);
    if (firstTouch) {
      await logAttributionEvent({ ref, event: "signup", userId: user.sub, visitorId });
    }
    if (visitorId) {
      try {
        await linkVisitorToUser(visitorId, user.sub);
      } catch (err) {
        console.warn("[attribution] visitor link failed", err);
      }
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

/**
 * Batched landing-page engagement ingest (public).
 * Never accepts purchase/paid events — those come only from Whop webhooks.
 */
export async function handleAttributionTrack(req: http.IncomingMessage, res: http.ServerResponse) {
  let body: Record<string, unknown>;
  try {
    body = ((await json(req)) as Record<string, unknown>) ?? {};
  } catch {
    sendJson(res, 400, { ok: false, error: "invalid_json" });
    return;
  }

  const visitorId = normalizeVisitorId(body.visitor_id ?? body.visitorId);
  if (!visitorId) {
    sendJson(res, 400, { ok: false, error: "invalid_visitor_id" });
    return;
  }

  const sessionId = normalizeSessionId(body.session_id ?? body.sessionId);
  const ref = normalizeRef(body.ref ?? body.r);
  const userId = normalizeShortOptional(body.user_id ?? body.userId, 128);

  // Optional auth — if present, trust user id from token instead of body.
  let authedUserId: string | null = null;
  const tok = bearerToken(req);
  if (tok) {
    const user = await verifySupabaseAccessToken(tok);
    if (user) authedUserId = user.sub;
  }
  const boundUserId = authedUserId ?? userId;

  try {
    const session = body.session;
    if (session && typeof session === "object" && sessionId) {
      const s = session as Record<string, unknown>;
      const startedAt = parseIsoDate(s.started_at ?? s.startedAt) ?? new Date();
      const endedAt = parseIsoDate(s.ended_at ?? s.endedAt);
      await upsertAnalyticsSession({
        id: sessionId,
        visitorId,
        userId: boundUserId,
        ref,
        startedAt,
        endedAt,
        durationMs: num(s.duration_ms ?? s.durationMs),
        activeMs: num(s.active_ms ?? s.activeMs),
        maxScrollPct: num(s.max_scroll_pct ?? s.maxScrollPct),
        device: str(s.device),
        landingPath: str(body.landing_path ?? body.landingPath ?? s.landing_path),
        referrerHost: str(body.referrer_host ?? body.referrerHost ?? s.referrer_host),
        utmSource: str(body.utm_source ?? body.utmSource ?? s.utm_source),
        utmMedium: str(body.utm_medium ?? body.utmMedium ?? s.utm_medium),
        utmCampaign: str(body.utm_campaign ?? body.utmCampaign ?? s.utm_campaign),
      });
    }

    const rawEvents = Array.isArray(body.events) ? body.events : [];
    const events = [];
    for (const raw of rawEvents.slice(0, 40)) {
      if (!raw || typeof raw !== "object") continue;
      const e = raw as Record<string, unknown>;
      const type = String(e.type ?? e.event ?? "")
        .trim()
        .slice(0, 40);
      if (!CLIENT_TRACK_EVENTS.has(type)) continue;
      // Refuse anything purchase-shaped in meta.
      const meta = sanitizeMeta(e.meta);
      if (type === "scroll_milestone") {
        const pct = Number(meta.pct);
        if (![25, 50, 75, 90, 100].includes(pct)) continue;
        meta.pct = String(pct);
      }
      if (type === "section_viewed") {
        const section = String(meta.section ?? "")
          .trim()
          .slice(0, 40);
        if (!section) continue;
        meta.section = section;
      }
      const createdAt = parseIsoDate(e.ts ?? e.created_at ?? e.createdAt);
      events.push({
        visitorId,
        sessionId,
        userId: boundUserId,
        ref,
        event: type,
        meta,
        ...(createdAt ? { createdAt } : {}),
      });
    }

    const inserted = await insertAnalyticsEvents(events);
    sendJson(res, 200, { ok: true, inserted });
  } catch (err) {
    console.warn("[attribution] track failed", err);
    sendJson(res, 503, { ok: false, error: "attribution_unavailable" });
  }
}

/** Called from billing checkout when a ref is present (or always for checkout_opened). */
export async function logAttributionCheckout(
  userId: string | null,
  ref: string | null,
  opts?: { visitorId?: string | null; sessionId?: string | null; plan?: string | null },
): Promise<void> {
  const normalized = ref ? normalizeRef(ref) : null;
  if (normalized) {
    await logAttributionEvent({
      ref: normalized,
      event: "checkout",
      userId,
      visitorId: opts?.visitorId ?? null,
    });
  }
  try {
    await logCheckoutOpenedEvent({
      visitorId: opts?.visitorId ?? null,
      sessionId: opts?.sessionId ?? null,
      userId,
      ref: normalized,
      plan: opts?.plan ?? null,
    });
  } catch (err) {
    console.warn("[attribution] checkout_opened log failed", err);
  }
}

export async function logAttributionPaid(opts: {
  ref: string | null;
  userId?: string | null;
  visitorId?: string | null;
}): Promise<void> {
  const normalized = normalizeRef(opts.ref) ?? "direct";
  await logAttributionEvent({
    ref: normalized,
    event: "paid",
    userId: opts.userId ?? null,
    visitorId: opts.visitorId ?? null,
  });
}

function num(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function str(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  return s || null;
}

function normalizeShortOptional(raw: unknown, max: number): string | null {
  const s = String(raw ?? "")
    .trim()
    .slice(0, max);
  return s || null;
}

function parseIsoDate(raw: unknown): Date | null {
  if (!raw) return null;
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d;
}

function sanitizeMeta(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = String(k).slice(0, 40);
    if (!key) continue;
    if (typeof v === "string") out[key] = v.slice(0, 120);
    else if (typeof v === "number" && Number.isFinite(v)) out[key] = v;
    else if (typeof v === "boolean") out[key] = v;
  }
  return out;
}
