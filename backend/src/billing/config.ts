import Stripe from "stripe";

import type { SupabaseJwtUser } from "../core/supabase-auth.js";
import type { BillingRow } from "./store.js";

/** Display amounts (USD). Stripe price IDs are separate env vars. */
export const STANDARD_MONTHLY_USD = 99;
export const STANDARD_YEARLY_USD = 999;
export const FOUNDERS_MONTHLY_USD = 49;
export const FOUNDERS_YEARLY_USD = 499;

export function stripeConfigured(): boolean {
  return Boolean(String(process.env.STRIPE_SECRET_KEY ?? "").trim());
}

export function stripeMode(): "live" | "test" | "unknown" {
  const key = String(process.env.STRIPE_SECRET_KEY ?? "").trim();
  if (key.startsWith("sk_live_")) return "live";
  if (key.startsWith("sk_test_")) return "test";
  return "unknown";
}

export function getStripe(): Stripe {
  const key = String(process.env.STRIPE_SECRET_KEY ?? "").trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY is required");
  return new Stripe(key);
}

export function frontendOrigin(): string {
  const u = String(process.env.FRONTEND_URL ?? process.env.APP_URL ?? "http://localhost:5173").trim();
  return u.replace(/\/$/, "");
}

/** Kill switch: FOUNDERS_PRICING=1 → new checkouts use founders prices. */
export function isFoundersPricingEnabled(): boolean {
  if (isWaitlistModeEnabled()) return false;
  return String(process.env.FOUNDERS_PRICING ?? "").trim() === "1";
}

/**
 * Marketing lock: WAITLIST_MODE=1 → intro uses waitlist CTAs, no subscribe / app access.
 * Takes priority over founders pricing while history is still draining.
 */
export function isWaitlistModeEnabled(): boolean {
  return String(process.env.WAITLIST_MODE ?? "").trim() === "1";
}

function envPrice(name: string): string {
  return String(process.env[name] ?? "").trim();
}

export function priceIdForPlan(plan: string): string | null {
  if (plan !== "monthly" && plan !== "yearly") return null;

  if (isFoundersPricingEnabled()) {
    const founders =
      plan === "monthly" ? envPrice("STRIPE_PRICE_ID_MONTHLY_FOUNDERS") : envPrice("STRIPE_PRICE_ID_YEARLY_FOUNDERS");
    if (founders) return founders;
  }

  const standard = plan === "monthly" ? envPrice("STRIPE_PRICE_ID_MONTHLY") : envPrice("STRIPE_PRICE_ID_YEARLY");
  return standard || null;
}

export function planFromPriceId(priceId: string | null | undefined): string | null {
  if (!priceId) return null;
  const monthly = new Set(
    [envPrice("STRIPE_PRICE_ID_MONTHLY"), envPrice("STRIPE_PRICE_ID_MONTHLY_FOUNDERS")].filter(Boolean),
  );
  const yearly = new Set(
    [envPrice("STRIPE_PRICE_ID_YEARLY"), envPrice("STRIPE_PRICE_ID_YEARLY_FOUNDERS")].filter(Boolean),
  );
  if (monthly.has(priceId)) return "monthly";
  if (yearly.has(priceId)) return "yearly";
  return null;
}

/** Public display pricing for intro / subscribe (no auth). */
export function publicPricingPayload() {
  const waitlist = isWaitlistModeEnabled();
  const founders = !waitlist && isFoundersPricingEnabled();
  const monthlyUsd = founders ? FOUNDERS_MONTHLY_USD : STANDARD_MONTHLY_USD;
  const yearlyUsd = founders ? FOUNDERS_YEARLY_USD : STANDARD_YEARLY_USD;
  return {
    ok: true as const,
    waitlist,
    founders,
    currency: "usd" as const,
    monthly_usd: monthlyUsd,
    yearly_usd: yearlyUsd,
    /** Struck-through reference when founders is on; yearly list is always monthly×12 when standard. */
    monthly_list_usd: founders ? STANDARD_MONTHLY_USD : null,
    yearly_list_usd: founders ? STANDARD_YEARLY_USD : STANDARD_MONTHLY_USD * 12,
  };
}

export const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

export function isActiveStatus(status: string | null | undefined): boolean {
  return ACTIVE_SUBSCRIPTION_STATUSES.has(String(status ?? "").toLowerCase());
}

/** Paid sub or Supabase app_metadata billing_exempt / role owner. */
export function hasBillingAccess(user: SupabaseJwtUser, row: BillingRow | null): boolean {
  if (user.billingExempt) return true;
  return isActiveStatus(row?.status);
}

export function billingAccessPayload(user: SupabaseJwtUser) {
  if (!user.billingExempt) return null;
  return {
    ok: true as const,
    active: true,
    status: "active",
    plan: "owner",
    current_period_end: null,
  };
}
