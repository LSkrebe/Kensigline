import type http from "node:http";
import { randomUUID } from "node:crypto";
import type { SupabaseJwtUser } from "../core/supabase-auth.js";
import { bearerToken, verifySupabaseAccessToken } from "../core/supabase-auth.js";
import {
  ensureSupabaseUserForEmail,
  generateMagicLinkToken,
  supabaseAdminConfigured,
} from "../core/supabase-admin.js";
import { json, sendJson } from "../core/http.js";
import {
  billingAccessPayload,
  frontendOrigin,
  getWhop,
  isActiveStatus,
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

function whopMetaString(meta: Record<string, unknown> | null | undefined, key: string): string | null {
  const v = meta?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

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

/** Create Whop checkout configuration with metadata (returns sessionId for embed). Auth optional. */
export async function handleBillingCheckout(req: http.IncomingMessage, res: http.ServerResponse) {
  const user = await requireUser(req);
  if (isWaitlistModeEnabled()) {
    sendJson(res, 503, { ok: false, error: "waitlist_mode" });
    return;
  }
  if (!whopConfigured()) {
    sendJson(res, 503, { ok: false, error: "whop_not_configured" });
    return;
  }
  if (!user && !supabaseAdminConfigured()) {
    sendJson(res, 503, { ok: false, error: "supabase_admin_not_configured" });
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
  const purchaseToken = user ? null : randomUUID();

  if (ref && user) {
    try {
      await logAttributionCheckout(user.sub, ref);
    } catch (err) {
      console.warn("[attribution] checkout log failed", err);
    }
  }

  try {
    const client = getWhop();
    const idempotencyKey = user
      ? `checkout-${user.sub}-${plan}-${Date.now() >> 16}`
      : `checkout-public-${purchaseToken}-${plan}`;
    const checkout = await client.checkoutConfigurations.create(
      {
        account_id: companyId,
        plan_id: planId,
        mode: "payment",
        redirect_url: `${origin}/?checkout=success`,
        metadata: {
          ...(user?.sub ? { supabase_user_id: user.sub } : { purchase_token: purchaseToken ?? "" }),
          ...(ref ? { ref } : {}),
        },
      },
      { headers: { "Idempotency-Key": idempotencyKey } },
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

/** Post-checkout: provision Supabase user + return magic-link token for instant sign-in. */
export async function handleBillingActivate(req: http.IncomingMessage, res: http.ServerResponse) {
  if (isWaitlistModeEnabled()) {
    sendJson(res, 503, { ok: false, error: "waitlist_mode" });
    return;
  }
  if (!whopConfigured()) {
    sendJson(res, 503, { ok: false, error: "whop_not_configured" });
    return;
  }
  if (!supabaseAdminConfigured()) {
    sendJson(res, 503, { ok: false, error: "supabase_admin_not_configured" });
    return;
  }

  let body: { receiptId?: string };
  try {
    body = (await json(req)) ?? {};
  } catch {
    sendJson(res, 400, { ok: false, error: "invalid_json" });
    return;
  }

  const receiptId = String(body.receiptId ?? "").trim();
  if (!receiptId) {
    sendJson(res, 400, { ok: false, error: "missing_receipt" });
    return;
  }

  try {
    const client = getWhop();
    const payment = await client.payments.retrieve({ id: receiptId });
    const membershipId = payment.membership?.id ?? null;
    if (!membershipId) {
      sendJson(res, 404, { ok: false, error: "membership_not_found" });
      return;
    }

    const membership = await client.memberships.retrieve({ id: membershipId });
    const membershipLike = membership as import("./store.js").WhopMembershipLike;
    const email = membershipLike.user?.email?.trim().toLowerCase() ?? null;
    if (!email) {
      sendJson(res, 422, { ok: false, error: "missing_checkout_email" });
      return;
    }

    const userId = await ensureSupabaseUserForEmail(email);
    if (!userId) {
      sendJson(res, 500, { ok: false, error: "provision_failed" });
      return;
    }

    await syncFromWhopMembership(membershipLike, userId);
    const row = await getBillingByUserId(userId);

    const ref =
      whopMetaString(membershipLike.metadata ?? null, "ref") ??
      whopMetaString(membershipLike.metadata ?? null, "r");
    if (ref) {
      try {
        await logAttributionCheckout(userId, ref);
      } catch (err) {
        console.warn("[attribution] activate checkout log failed", err);
      }
    }

    if (!row || !isActiveStatus(row.status)) {
      sendJson(res, 202, { ok: false, error: "membership_pending", pending: true });
      return;
    }

    const tokens = await generateMagicLinkToken(email);
    if (!tokens) {
      sendJson(res, 500, { ok: false, error: "magic_link_failed" });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      active: true,
      user_id: userId,
      email: tokens.email,
      token_hash: tokens.token_hash,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[billing] activate failed", err);
    sendJson(res, 500, { ok: false, error: "activate_failed", message: msg });
  }
}
