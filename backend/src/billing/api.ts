import type http from "node:http";
import type { SupabaseJwtUser } from "../core/supabase-auth.js";
import { bearerToken, verifySupabaseAccessToken } from "../core/supabase-auth.js";
import { json, sendJson } from "../core/http.js";
import {
  billingAccessPayload,
  frontendOrigin,
  getWhop,
  isWaitlistModeEnabled,
  planIdForPlan,
  publicPricingPayload,
  whopCompanyId,
  whopConfigured,
  whopPortalUrl,
} from "./config.js";
import {
  billingStatusPayload,
  getBillingByUserId,
  peekBillingAccessCache,
  rememberBillingAccess,
  syncFromWhopMembership,
} from "./store.js";
import { logAttributionCheckout } from "../attribution/api.js";
import { handleBillingWebhook } from "./webhook.js";

export { handleBillingWebhook };

/** Public pricing for marketing pages (kill-switch aware). */
export function handleBillingPricing(_req: http.IncomingMessage, res: http.ServerResponse) {
  sendJson(res, 200, publicPricingPayload());
}

async function requireUser(req: http.IncomingMessage): Promise<SupabaseJwtUser | null> {
  const tok = bearerToken(req);
  if (!tok) return null;
  return verifySupabaseAccessToken(tok);
}

/** Subscription gate for the SPA. */
export async function handleBillingStatus(req: http.IncomingMessage, res: http.ServerResponse) {
  const user = await requireUser(req);
  if (!user) {
    sendJson(res, 401, { ok: false, error: "unauthorized" });
    return;
  }

  const identity = { user_id: user.sub, email: user.email };

  if (!whopConfigured()) {
    sendJson(res, 200, {
      ok: true,
      active: false,
      status: "none",
      plan: null,
      billing_enabled: true,
      whop_configured: false,
      stripe_configured: false,
      ...identity,
    });
    return;
  }

  const comped = billingAccessPayload(user);
  if (comped) {
    rememberBillingAccess(user.sub, null, true);
    sendJson(res, 200, {
      ...comped,
      billing_enabled: true,
      whop_configured: true,
      stripe_configured: false,
      ...identity,
    });
    return;
  }

  try {
    const row = await getBillingByUserId(user.sub);
    const payload = billingStatusPayload(row);
    rememberBillingAccess(user.sub, row, Boolean(payload.active));
    sendJson(res, 200, {
      ...payload,
      billing_enabled: true,
      whop_configured: true,
      stripe_configured: false,
      ...identity,
    });
  } catch (err) {
    const cached = peekBillingAccessCache(user.sub);
    if (cached) {
      sendJson(res, 200, {
        ok: true,
        active: cached.active,
        status: cached.row?.status ?? (cached.active ? "active" : "none"),
        plan: cached.row?.plan ?? null,
        current_period_end: cached.row?.current_period_end ?? null,
        manage_url: cached.row?.manage_url ?? null,
        billing_enabled: true,
        whop_configured: true,
        stripe_configured: false,
        stale: true,
        ...identity,
      });
      return;
    }
    console.warn("[billing/status] db_failed", err instanceof Error ? err.message : err);
    sendJson(res, 503, {
      ok: false,
      error: "billing_temporarily_unavailable",
      billing_enabled: true,
      whop_configured: true,
      stripe_configured: false,
      ...identity,
    });
  }
}

/** Create Whop checkout configuration with metadata (returns sessionId for embed). */
export async function handleBillingCheckout(req: http.IncomingMessage, res: http.ServerResponse) {
  const user = await requireUser(req);
  if (!user) {
    sendJson(res, 401, { ok: false, error: "unauthorized" });
    return;
  }
  if (isWaitlistModeEnabled()) {
    sendJson(res, 503, { ok: false, error: "waitlist_mode" });
    return;
  }
  if (!whopConfigured()) {
    sendJson(res, 503, { ok: false, error: "whop_not_configured" });
    return;
  }

  let body: { plan?: string; ref?: string; r?: string };
  try {
    body = (await json(req)) ?? {};
  } catch {
    sendJson(res, 400, { ok: false, error: "invalid_json" });
    return;
  }

  const plan = String(body.plan ?? "").trim();
  const planId = planIdForPlan(plan);
  if (!planId) {
    sendJson(res, 400, { ok: false, error: "invalid_plan" });
    return;
  }

  const companyId = whopCompanyId();
  if (!companyId) {
    sendJson(res, 503, { ok: false, error: "whop_company_not_configured" });
    return;
  }

  const ref = String(body.ref ?? body.r ?? "").trim().slice(0, 32) || null;
  const origin = frontendOrigin();

  if (ref) {
    try {
      await logAttributionCheckout(user.sub, ref);
    } catch (err) {
      console.warn("[attribution] checkout log failed", err);
    }
  }

  try {
    const client = getWhop();
    const checkout = await client.checkoutConfigurations.create(
      {
        account_id: companyId,
        plan_id: planId,
        mode: "payment",
        redirect_url: `${origin}/?checkout=success`,
        metadata: {
          supabase_user_id: user.sub,
          ...(ref ? { ref } : {}),
        },
      },
      { headers: { "Idempotency-Key": `checkout-${user.sub}-${plan}-${Date.now() >> 16}` } },
    );

    sendJson(res, 200, {
      ok: true,
      sessionId: checkout.id,
      planId,
      plan,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[billing] checkout session failed", err);
    sendJson(res, 500, { ok: false, error: "checkout_failed", message: msg });
  }
}

export async function handleBillingPortal(req: http.IncomingMessage, res: http.ServerResponse) {
  const user = await requireUser(req);
  if (!user) {
    sendJson(res, 401, { ok: false, error: "unauthorized" });
    return;
  }

  const row = await getBillingByUserId(user.sub);
  const url = row?.manage_url ?? whopPortalUrl();
  sendJson(res, 200, { ok: true, url });
}

/** Re-fetch membership from Whop (e.g. right after checkout success). */
export async function handleBillingRefresh(req: http.IncomingMessage, res: http.ServerResponse) {
  const user = await requireUser(req);
  if (!user) {
    sendJson(res, 401, { ok: false, error: "unauthorized" });
    return;
  }
  if (!whopConfigured()) {
    sendJson(res, 503, { ok: false, error: "whop_not_configured" });
    return;
  }

  let body: { receiptId?: string } = {};
  try {
    body = (await json(req)) ?? {};
  } catch {
    /* empty body ok */
  }

  const row = await getBillingByUserId(user.sub);
  const receiptId = String(body.receiptId ?? "").trim();

  try {
    const client = getWhop();
    if (receiptId) {
      const payment = await client.payments.retrieve({ id: receiptId });
      const membershipId = payment.membership?.id ?? null;
      if (membershipId) {
        const membership = await client.memberships.retrieve({ id: membershipId });
        await syncFromWhopMembership(membership, user.sub);
      }
    } else if (row?.whop_membership_id) {
      const membership = await client.memberships.retrieve({ id: row.whop_membership_id });
      await syncFromWhopMembership(membership, user.sub);
    }
  } catch (err) {
    console.warn("[billing] refresh failed", err);
  }

  const updated = await getBillingByUserId(user.sub);
  sendJson(res, 200, billingStatusPayload(updated));
}
