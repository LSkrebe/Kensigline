import type http from "node:http";
import { URL } from "node:url";
import { bearerToken, verifySupabaseAccessToken } from "../core/supabase-auth.js";
import { sendJson } from "../core/http.js";
import { hasBillingAccess, stripeConfigured } from "./config.js";
import {
  getBillingByUserId,
  peekBillingAccessCache,
  rememberBillingAccess,
} from "./store.js";

const BILLING_EXEMPT_PATHS = new Set([
  "/api/billing/pricing",
  "/api/billing/status",
  "/api/billing/checkout",
  "/api/billing/portal",
  "/api/billing/refresh",
  "/api/auth/me",
  "/api/public/company",
  "/api/public/bars",
  "/api/waitlist",
]);

/** When false, API data routes stay open (local dev). Default: on. */
export function isBillingGateEnabled(): boolean {
  return String(process.env.BILLING_GATE_ENABLED ?? "1").trim() !== "0";
}

function isTransientDbError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /timeout|ECHECKOUTTIMEOUT|Connection terminated|too many clients|remaining connection slots/i.test(
    msg,
  );
}

/**
 * Enforce auth + active subscription on paid API routes.
 * Returns true when the response was already sent (caller should return).
 */
export async function billingGateBlocksRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<boolean> {
  if (!isBillingGateEnabled()) return false;
  if (!url.pathname.startsWith("/api/")) return false;
  if (BILLING_EXEMPT_PATHS.has(url.pathname)) return false;

  if (!stripeConfigured()) {
    sendJson(res, 503, { ok: false, error: "billing_not_configured" });
    return true;
  }

  const tok = bearerToken(req);
  if (!tok) {
    sendJson(res, 401, { ok: false, error: "unauthorized" });
    return true;
  }

  const user = await verifySupabaseAccessToken(tok);
  if (!user?.sub) {
    sendJson(res, 401, { ok: false, error: "unauthorized" });
    return true;
  }

  if (user.billingExempt) {
    rememberBillingAccess(user.sub, null, true);
    return false;
  }

  const cached = peekBillingAccessCache(user.sub);
  if (cached) {
    if (!cached.active) {
      sendJson(res, 402, { ok: false, error: "subscription_required" });
      return true;
    }
    return false;
  }

  try {
    const row = await getBillingByUserId(user.sub);
    const ok = hasBillingAccess(user, row);
    rememberBillingAccess(user.sub, row, ok);
    if (!ok) {
      sendJson(res, 402, { ok: false, error: "subscription_required" });
      return true;
    }
    return false;
  } catch (err) {
    // Soft-fail under pool pressure: never convert a DB blip into a hard paywall deny mid-session.
    if (isTransientDbError(err)) {
      console.warn("[billing-gate] db_transient", err instanceof Error ? err.message : err);
      sendJson(res, 503, { ok: false, error: "billing_temporarily_unavailable" });
      return true;
    }
    throw err;
  }
}
