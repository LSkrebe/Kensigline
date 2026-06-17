import type http from "node:http";
import type { SupabaseJwtUser } from "../core/supabase-auth.js";
import { bearerToken, verifySupabaseAccessToken } from "../core/supabase-auth.js";
import { json, sendJson } from "../core/http.js";
import {
  frontendOrigin,
  getStripe,
  isBillingBypassEmail,
  priceIdForPlan,
  stripeConfigured,
} from "./config.js";
import {
  billingStatusPayload,
  getBillingByUserId,
  syncFromStripeSubscription,
  upsertCustomerLink,
} from "./store.js";
import { handleBillingWebhook } from "./webhook.js";

export { handleBillingWebhook };

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

  if (!stripeConfigured()) {
    sendJson(res, 200, {
      ok: true,
      active: false,
      status: "none",
      plan: null,
      billing_enabled: true,
      stripe_configured: false,
    });
    return;
  }

  if (isBillingBypassEmail(user.email)) {
    sendJson(res, 200, {
      ok: true,
      active: true,
      status: "active",
      plan: "dev_bypass",
      current_period_end: null,
      billing_enabled: true,
      stripe_configured: true,
    });
    return;
  }

  const row = await getBillingByUserId(user.sub);
  sendJson(res, 200, { ...billingStatusPayload(row), billing_enabled: true, stripe_configured: true });
}

export async function handleBillingCheckout(req: http.IncomingMessage, res: http.ServerResponse) {
  const user = await requireUser(req);
  if (!user) {
    sendJson(res, 401, { ok: false, error: "unauthorized" });
    return;
  }
  if (!stripeConfigured()) {
    sendJson(res, 503, { ok: false, error: "stripe_not_configured" });
    return;
  }

  let body: { plan?: string };
  try {
    body = (await json(req)) ?? {};
  } catch {
    sendJson(res, 400, { ok: false, error: "invalid_json" });
    return;
  }

  const plan = String(body.plan ?? "").trim();
  const priceId = priceIdForPlan(plan);
  if (!priceId) {
    sendJson(res, 400, { ok: false, error: "invalid_plan" });
    return;
  }

  try {
    const stripe = getStripe();
    const origin = frontendOrigin();
    let row = await getBillingByUserId(user.sub);
    let customerId = row?.stripe_customer_id ?? null;

    if (!customerId) {
      const customer = await stripe.customers.create({
        ...(user.email ? { email: user.email } : {}),
        metadata: { supabase_user_id: user.sub },
      });
      customerId = customer.id;
      await upsertCustomerLink({
        userId: user.sub,
        email: user.email,
        stripeCustomerId: customerId,
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancel`,
      client_reference_id: user.sub,
      metadata: { supabase_user_id: user.sub, plan },
      subscription_data: {
        metadata: { supabase_user_id: user.sub, plan },
      },
    });

    if (!session.url) {
      sendJson(res, 500, { ok: false, error: "checkout_session_failed" });
      return;
    }

    sendJson(res, 200, { ok: true, url: session.url });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[billing] checkout failed", err);
    sendJson(res, 500, { ok: false, error: "checkout_failed", message: msg });
  }
}

export async function handleBillingPortal(req: http.IncomingMessage, res: http.ServerResponse) {
  const user = await requireUser(req);
  if (!user) {
    sendJson(res, 401, { ok: false, error: "unauthorized" });
    return;
  }
  if (!stripeConfigured()) {
    sendJson(res, 503, { ok: false, error: "stripe_not_configured" });
    return;
  }

  const row = await getBillingByUserId(user.sub);
  if (!row?.stripe_customer_id) {
    sendJson(res, 400, { ok: false, error: "no_customer" });
    return;
  }

  const portal = await getStripe().billingPortal.sessions.create({
    customer: row.stripe_customer_id,
    return_url: `${frontendOrigin()}/`,
  });

  sendJson(res, 200, { ok: true, url: portal.url });
}

/** Re-fetch subscription from Stripe (e.g. right after checkout success). */
export async function handleBillingRefresh(req: http.IncomingMessage, res: http.ServerResponse) {
  const user = await requireUser(req);
  if (!user) {
    sendJson(res, 401, { ok: false, error: "unauthorized" });
    return;
  }
  if (!stripeConfigured()) {
    sendJson(res, 503, { ok: false, error: "stripe_not_configured" });
    return;
  }

  const row = await getBillingByUserId(user.sub);
  if (!row?.stripe_subscription_id) {
    sendJson(res, 200, billingStatusPayload(row));
    return;
  }

  try {
    const sub = await getStripe().subscriptions.retrieve(row.stripe_subscription_id);
    await syncFromStripeSubscription(sub, user.sub);
  } catch (err) {
    console.warn("[billing] refresh failed", err);
  }

  const updated = await getBillingByUserId(user.sub);
  sendJson(res, 200, billingStatusPayload(updated));
}
