import type Stripe from "stripe";
import { db } from "../core/db.js";
import { isActiveStatus, planFromPriceId } from "./config.js";

export type BillingRow = {
  user_id: string;
  email: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: string;
  plan: string | null;
  price_id: string | null;
  current_period_end: string | null;
};

export async function getBillingByUserId(userId: string): Promise<BillingRow | null> {
  return db.one<BillingRow>(
    `
    SELECT user_id, email, stripe_customer_id, stripe_subscription_id, status, plan, price_id,
           current_period_end::text AS current_period_end
    FROM billing_accounts
    WHERE user_id = $1
    `,
    [userId],
  );
}

export async function getBillingByCustomerId(customerId: string): Promise<BillingRow | null> {
  return db.one<BillingRow>(
    `
    SELECT user_id, email, stripe_customer_id, stripe_subscription_id, status, plan, price_id,
           current_period_end::text AS current_period_end
    FROM billing_accounts
    WHERE stripe_customer_id = $1
    `,
    [customerId],
  );
}

export async function upsertCustomerLink(args: {
  userId: string;
  email: string | null;
  stripeCustomerId: string;
}): Promise<void> {
  await db.query(
    `
    INSERT INTO billing_accounts (user_id, email, stripe_customer_id, status, updated_at)
    VALUES ($1, $2, $3, 'none', now())
    ON CONFLICT (user_id) DO UPDATE SET
      email = COALESCE(EXCLUDED.email, billing_accounts.email),
      stripe_customer_id = EXCLUDED.stripe_customer_id,
      updated_at = now()
    `,
    [args.userId, args.email, args.stripeCustomerId],
  );
}

export async function syncFromStripeSubscription(
  sub: Stripe.Subscription,
  userIdHint?: string | null,
): Promise<void> {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
  let userId =
    userIdHint ||
    sub.metadata?.supabase_user_id ||
    (customerId ? (await getBillingByCustomerId(customerId))?.user_id : null);

  if (!userId && customerId) {
    const row = await getBillingByCustomerId(customerId);
    userId = row?.user_id ?? null;
  }
  if (!userId) {
    console.warn("[billing] sync subscription: missing supabase user id", sub.id);
    return;
  }

  const item = sub.items?.data?.[0];
  const priceId = item?.price?.id ?? (typeof item?.price === "string" ? item.price : null);
  const plan = planFromPriceId(priceId);
  const periodEndUnix = (sub as Stripe.Subscription & { current_period_end?: number }).current_period_end;
  const periodEnd = periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null;

  await db.query(
    `
    INSERT INTO billing_accounts (
      user_id, stripe_customer_id, stripe_subscription_id, status, plan, price_id,
      current_period_end, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, now())
    ON CONFLICT (user_id) DO UPDATE SET
      stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, billing_accounts.stripe_customer_id),
      stripe_subscription_id = EXCLUDED.stripe_subscription_id,
      status = EXCLUDED.status,
      plan = EXCLUDED.plan,
      price_id = EXCLUDED.price_id,
      current_period_end = EXCLUDED.current_period_end,
      updated_at = now()
    `,
    [userId, customerId, sub.id, sub.status, plan, priceId, periodEnd],
  );
}

export function billingStatusPayload(row: BillingRow | null) {
  const status = row?.status ?? "none";
  const active = isActiveStatus(status);
  return {
    ok: true,
    active,
    status,
    plan: row?.plan ?? null,
    current_period_end: row?.current_period_end ?? null,
  };
}
