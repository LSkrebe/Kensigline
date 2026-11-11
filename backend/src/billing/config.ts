import type http from "node:http";
import { WhopClient } from "@whop/sdk";

import type { SupabaseJwtUser } from "../core/supabase-auth.js";
import type { BillingRow } from "./store.js";
import {
  DEFAULT_PRICING_TIER,
  pricesForTier,
  resolveVisitorPricing,
  type PricingTier,
  type TierPrices,
} from "./ppp.js";

export type { PricingTier, TierPrices };
export {
  DEFAULT_PRICING_TIER,
  TIER_PRICES,
  countryFromRequestHeaders,
  pricesForTier,
  resolveVisitorPricing,
  tierForCountry,
} from "./ppp.js";

/** Tier 1 display defaults (also SEO / offline fallback). */
export const STANDARD_MONTHLY_USD = pricesForTier(1).monthlyUsd;
export const STANDARD_YEARLY_USD = pricesForTier(1).yearlyUsd;

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

/**
 * Marketing lock: WAITLIST_MODE=1 → intro uses waitlist CTAs, no subscribe / app access.
 */
export function isWaitlistModeEnabled(): boolean {
  return String(process.env.WAITLIST_MODE ?? "").trim() === "1";
}

function envPlan(name: string): string {
  return String(process.env[name] ?? "").trim();
}

/** Env var names for monthly/yearly Whop plans per PPP tier. */
export function planEnvNamesForTier(tier: PricingTier): { monthly: string; yearly: string } {
  if (tier === 1) {
    return { monthly: "WHOP_PLAN_ID_MONTHLY", yearly: "WHOP_PLAN_ID_YEARLY" };
  }
  return {
    monthly: `WHOP_PLAN_ID_T${tier}_MONTHLY`,
    yearly: `WHOP_PLAN_ID_T${tier}_YEARLY`,
  };
}

export function planIdForTierPlan(tier: PricingTier, plan: string): string | null {
  if (plan !== "monthly" && plan !== "yearly") return null;
  const names = planEnvNamesForTier(tier);
  const id = envPlan(plan === "monthly" ? names.monthly : names.yearly);
  return id || null;
}

/**
 * Resolve a checkout tier: use requested tier when both plan IDs exist,
 * otherwise fall back to Tier 1 so display and charge stay aligned.
 */
export function resolveConfiguredTier(tier: PricingTier): PricingTier {
  if (tier === 1) return 1;
  const monthly = planIdForTierPlan(tier, "monthly");
  const yearly = planIdForTierPlan(tier, "yearly");
  if (monthly && yearly) return tier;
  return DEFAULT_PRICING_TIER;
}

/** @deprecated Prefer planIdForTierPlan — kept for call sites that already resolved a tier. */
export function planIdForPlan(plan: string, tier: PricingTier = DEFAULT_PRICING_TIER): string | null {
  const effective = resolveConfiguredTier(tier);
  return planIdForTierPlan(effective, plan);
}

/**
 * Map a Whop plan id → monthly/yearly interval.
 * Includes legacy founders + all PPP tier plan IDs so existing memberships keep syncing.
 */
export function planFromWhopPlanId(planId: string | null | undefined): string | null {
  if (!planId) return null;
  const monthly = new Set(
    [
      envPlan("WHOP_PLAN_ID_MONTHLY"),
      envPlan("WHOP_PLAN_ID_T2_MONTHLY"),
      envPlan("WHOP_PLAN_ID_T3_MONTHLY"),
      envPlan("WHOP_PLAN_ID_T4_MONTHLY"),
      // Legacy — keep so existing memberships still sync
      envPlan("WHOP_PLAN_ID_MONTHLY_FOUNDERS"),
    ].filter(Boolean),
  );
  const yearly = new Set(
    [
      envPlan("WHOP_PLAN_ID_YEARLY"),
      envPlan("WHOP_PLAN_ID_T2_YEARLY"),
      envPlan("WHOP_PLAN_ID_T3_YEARLY"),
      envPlan("WHOP_PLAN_ID_T4_YEARLY"),
      envPlan("WHOP_PLAN_ID_YEARLY_FOUNDERS"),
    ].filter(Boolean),
  );
  if (monthly.has(planId)) return "monthly";
  if (yearly.has(planId)) return "yearly";
  return null;
}

export type PublicPricingPayload = {
  ok: true;
  waitlist: boolean;
  founders: false;
  currency: "usd";
  tier: PricingTier;
  country: string | null;
  monthly_usd: number;
  yearly_usd: number;
  monthly_list_usd: null;
  yearly_list_usd: number;
  whop_configured: boolean;
};

function moneyCents(n: number): number {
  return Math.round(Number(n) * 100) / 100;
}

/** Public display pricing for intro / subscribe (geo + waitlist aware). */
export function publicPricingPayload(req?: http.IncomingMessage | null): PublicPricingPayload {
  const waitlist = isWaitlistModeEnabled();
  const detected = resolveVisitorPricing(req?.headers);
  const tier = resolveConfiguredTier(detected.tier);
  const prices = pricesForTier(tier);
  return {
    ok: true,
    waitlist,
    founders: false,
    currency: "usd",
    tier,
    country: detected.country,
    monthly_usd: prices.monthlyUsd,
    yearly_usd: prices.yearlyUsd,
    monthly_list_usd: null,
    yearly_list_usd: moneyCents(prices.monthlyUsd * 12),
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
