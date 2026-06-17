import Stripe from "stripe";

import type { SupabaseJwtUser } from "../core/supabase-auth.js";
import type { BillingRow } from "./store.js";

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

export function priceIdForPlan(plan: string): string | null {
  if (plan === "monthly") return String(process.env.STRIPE_PRICE_ID_MONTHLY ?? "").trim() || null;
  if (plan === "yearly") return String(process.env.STRIPE_PRICE_ID_YEARLY ?? "").trim() || null;
  return null;
}

export function planFromPriceId(priceId: string | null | undefined): string | null {
  if (!priceId) return null;
  const monthly = String(process.env.STRIPE_PRICE_ID_MONTHLY ?? "").trim();
  const yearly = String(process.env.STRIPE_PRICE_ID_YEARLY ?? "").trim();
  if (priceId === monthly) return "monthly";
  if (priceId === yearly) return "yearly";
  return null;
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
