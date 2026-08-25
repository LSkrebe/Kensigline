import { WhopClient } from "@whop/sdk";

import type { SupabaseJwtUser } from "../core/supabase-auth.js";
import type { BillingRow } from "./store.js";

/** Display amounts (USD). Whop plan IDs are separate env vars. */
export const STANDARD_MONTHLY_USD = 99;
export const STANDARD_YEARLY_USD = 999;
export const FOUNDERS_MONTHLY_USD = 49;
export const FOUNDERS_YEARLY_USD = 499;

export function whopConfigured(): boolean {
  return Boolean(String(process.env.WHOP_API_KEY ?? "").trim());
}

/** @deprecated alias — gate + status still reference billing provider configured. */
export function stripeConfigured(): boolean {
  return whopConfigured();
}

export function getWhop(): WhopClient {
  const apiKey = String(process.env.WHOP_API_KEY ?? "").trim();
  if (!apiKey) throw new Error("WHOP_API_KEY is required");
  return new WhopClient({ token: apiKey });
}

export function whopCompanyId(): string | null {
  const id = String(process.env.WHOP_COMPANY_ID ?? "").trim();
  return id || null;
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

function envPlan(name: string): string {
  return String(process.env[name] ?? "").trim();
}

export function planIdForPlan(plan: string): string | null {
  if (plan !== "monthly" && plan !== "yearly") return null;

  if (isFoundersPricingEnabled()) {
    const founders =
      plan === "monthly" ? envPlan("WHOP_PLAN_ID_MONTHLY_FOUNDERS") : envPlan("WHOP_PLAN_ID_YEARLY_FOUNDERS");
    if (founders) return founders;
  }

  const standard = plan === "monthly" ? envPlan("WHOP_PLAN_ID_MONTHLY") : envPlan("WHOP_PLAN_ID_YEARLY");
  return standard || null;
}

export function planFromWhopPlanId(planId: string | null | undefined): string | null {
  if (!planId) return null;
  const monthly = new Set(
    [envPlan("WHOP_PLAN_ID_MONTHLY"), envPlan("WHOP_PLAN_ID_MONTHLY_FOUNDERS")].filter(Boolean),
  );
  const yearly = new Set([envPlan("WHOP_PLAN_ID_YEARLY"), envPlan("WHOP_PLAN_ID_YEARLY_FOUNDERS")].filter(Boolean));
  if (monthly.has(planId)) return "monthly";
  if (yearly.has(planId)) return "yearly";
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
    monthly_list_usd: founders ? STANDARD_MONTHLY_USD : null,
    yearly_list_usd: founders ? STANDARD_YEARLY_USD : STANDARD_MONTHLY_USD * 12,
    whop_configured: whopConfigured(),
  };
}

/** Whop statuses that grant app access. */
export const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "completed"]);

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

export function whopPortalUrl(): string {
  return String(process.env.WHOP_PORTAL_URL ?? "https://whop.com/hub/memberships").trim();
}
