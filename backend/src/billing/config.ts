import Stripe from "stripe";

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

/** Comma-separated emails that skip subscription checks (server env only — for prod dev access). */
export function billingBypassEmails(): Set<string> {
  const raw = String(process.env.BILLING_BYPASS_EMAILS ?? "").trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(/[,;\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isBillingBypassEmail(email: string | null | undefined): boolean {
  const e = String(email ?? "").trim().toLowerCase();
  if (!e) return false;
  return billingBypassEmails().has(e);
}
