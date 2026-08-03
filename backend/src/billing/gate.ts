import type http from "node:http";
import { URL } from "node:url";
import { bearerToken, verifySupabaseAccessToken } from "../core/supabase-auth.js";
import { sendJson } from "../core/http.js";
import { hasBillingAccess, stripeConfigured } from "./config.js";
import { getBillingByUserId } from "./store.js";

const BILLING_EXEMPT_PATHS = new Set([
  "/api/billing/pricing",
  "/api/billing/status",
  "/api/billing/checkout",
  "/api/billing/portal",
  "/api/billing/refresh",
  "/api/auth/me",
]);

/** When false, API data routes stay open (local dev). Default: on. */
export function isBillingGateEnabled(): boolean {
  return String(process.env.BILLING_GATE_ENABLED ?? "1").trim() !== "0";
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

  const row = await getBillingByUserId(user.sub);
  if (!hasBillingAccess(user, row)) {
    sendJson(res, 402, { ok: false, error: "subscription_required" });
    return true;
  }

  return false;
}
