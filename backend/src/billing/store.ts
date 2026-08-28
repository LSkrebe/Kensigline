import { db } from "../core/db.js";
import { ensureSupabaseUserForEmail } from "../core/supabase-admin.js";
import { isActiveStatus, planFromWhopPlanId } from "./config.js";

export type BillingRow = {
  user_id: string;
  email: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  whop_membership_id: string | null;
  whop_user_id: string | null;
  referral_ref: string | null;
  manage_url: string | null;
  status: string;
  plan: string | null;
  price_id: string | null;
  current_period_end: string | null;
};

type AccessCacheEntry = {
  at: number;
  row: BillingRow | null;
  active: boolean;
};

const ACCESS_TTL_MS = Math.max(
  5_000,
  Math.min(300_000, Number(process.env.BILLING_ACCESS_CACHE_TTL_MS ?? 60_000) || 60_000),
);

const accessCache = new Map<string, AccessCacheEntry>();
const webhookSeen = new Set<string>();

function cacheKey(userId: string) {
  return String(userId ?? "").trim();
}

export function peekBillingAccessCache(userId: string): AccessCacheEntry | null {
  const key = cacheKey(userId);
  if (!key) return null;
  const hit = accessCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > ACCESS_TTL_MS) {
    accessCache.delete(key);
    return null;
  }
  return hit;
}

export function rememberBillingAccess(userId: string, row: BillingRow | null, active: boolean) {
  const key = cacheKey(userId);
  if (!key) return;
  accessCache.set(key, { at: Date.now(), row, active });
}

export function invalidateBillingAccessCache(userId: string) {
  const key = cacheKey(userId);
  if (!key) return;
  accessCache.delete(key);
}

export function markWebhookDeliverySeen(deliveryId: string): boolean {
  const id = String(deliveryId ?? "").trim();
  if (!id) return true;
  if (webhookSeen.has(id)) return false;
  webhookSeen.add(id);
  if (webhookSeen.size > 5000) {
    webhookSeen.clear();
  }
  return true;
}

const BILLING_SELECT = `
  SELECT user_id, email, stripe_customer_id, stripe_subscription_id,
         whop_membership_id, whop_user_id, referral_ref, manage_url,
         status, plan, price_id, current_period_end::text AS current_period_end
  FROM billing_accounts
`;

export async function getBillingByUserId(userId: string): Promise<BillingRow | null> {
  return db.oneApi<BillingRow>(`${BILLING_SELECT} WHERE user_id = $1`, [userId], 4_000);
}

export async function getBillingByWhopMembershipId(membershipId: string): Promise<BillingRow | null> {
  return db.oneApi<BillingRow>(`${BILLING_SELECT} WHERE whop_membership_id = $1`, [membershipId], 4_000);
}

export async function getBillingByEmail(email: string): Promise<BillingRow | null> {
  const normalized = String(email ?? "").trim().toLowerCase();
  if (!normalized) return null;
  return db.oneApi<BillingRow>(`${BILLING_SELECT} WHERE lower(email) = $1`, [normalized], 4_000);
}

function unixToIso(value: unknown): string | null {
  if (value == null) return null;
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) {
    return new Date(n * 1000).toISOString();
  }
  const s = String(value).trim();
  if (!s) return null;
  const parsed = Date.parse(s);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function metaString(meta: Record<string, unknown> | null | undefined, key: string): string | null {
  const v = meta?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export type WhopMembershipLike = {
  id?: string | null;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
  manage_url?: string | null;
  renewal_period_end?: string | null;
  plan?: { id?: string | null } | null;
  user?: { id?: string | null; email?: string | null } | null;
};

export async function syncFromWhopMembership(
  membership: WhopMembershipLike,
  userIdHint?: string | null,
): Promise<void> {
  const membershipId = String(membership?.id ?? "").trim();
  if (!membershipId) {
    console.warn("[billing] sync membership: missing id");
    return;
  }

  const meta = membership.metadata ?? null;
  let userId =
    userIdHint ||
    metaString(meta, "supabase_user_id") ||
    (await getBillingByWhopMembershipId(membershipId))?.user_id ||
    null;

  const email = membership.user?.email?.trim().toLowerCase() ?? null;
  if (!userId && email) {
    userId = (await getBillingByEmail(email))?.user_id ?? null;
  }
  if (!userId && email) {
    try {
      userId = await ensureSupabaseUserForEmail(email);
    } catch (err) {
      console.warn("[billing] sync membership: provision user failed", err);
    }
  }
  if (!userId) {
    console.warn("[billing] sync membership: missing supabase user id", membershipId);
    return;
  }

  const planId = membership.plan?.id ?? null;
  const plan = planFromWhopPlanId(planId);
  const periodEnd = unixToIso(membership.renewal_period_end);
  const referralRef = metaString(meta, "ref") ?? metaString(meta, "r");
  const whopUserId = membership.user?.id ?? null;
  const manageUrl = membership.manage_url ?? null;
  const status = String(membership.status ?? "none").toLowerCase();

  await db.query(
    `
    INSERT INTO billing_accounts (
      user_id, email, whop_membership_id, whop_user_id, referral_ref, manage_url,
      status, plan, price_id, current_period_end, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz, now())
    ON CONFLICT (user_id) DO UPDATE SET
      email = COALESCE(EXCLUDED.email, billing_accounts.email),
      whop_membership_id = EXCLUDED.whop_membership_id,
      whop_user_id = COALESCE(EXCLUDED.whop_user_id, billing_accounts.whop_user_id),
      referral_ref = COALESCE(EXCLUDED.referral_ref, billing_accounts.referral_ref),
      manage_url = COALESCE(EXCLUDED.manage_url, billing_accounts.manage_url),
      status = EXCLUDED.status,
      plan = COALESCE(EXCLUDED.plan, billing_accounts.plan),
      price_id = EXCLUDED.price_id,
      current_period_end = EXCLUDED.current_period_end,
      updated_at = now()
    `,
    [userId, email, membershipId, whopUserId, referralRef, manageUrl, status, plan, planId, periodEnd],
  );
  invalidateBillingAccessCache(userId);
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
    manage_url: row?.manage_url ?? null,
  };
}
