/**
 * Purchasing-power pricing — country → tier → USD amounts.
 * Edit this file to adjust tiers, prices, or country assignments.
 * Checkout uses matching Whop plan IDs from env (see planIdForTierPlan).
 */

export type PricingTier = 1 | 2 | 3 | 4;

export type TierPrices = { monthlyUsd: number; yearlyUsd: number };

/** Display + intended Whop plan amounts (USD). */
export const TIER_PRICES: Record<PricingTier, TierPrices> = {
  1: { monthlyUsd: 48.4, yearlyUsd: 484 },
  2: { monthlyUsd: 37.6, yearlyUsd: 376 },
  3: { monthlyUsd: 26.4, yearlyUsd: 264 },
  4: { monthlyUsd: 14.8, yearlyUsd: 148 },
};

export const DEFAULT_PRICING_TIER: PricingTier = 1;

/**
 * Explicit overrides. Unlisted countries → Tier 1.
 * ISO 3166-1 alpha-2 (uppercase).
 */
const COUNTRY_TIER: Record<string, PricingTier> = {
  // Tier 2 — high-income / strong PPP but below top bracket
  CN: 2,
  CZ: 2,
  EE: 2,
  ES: 2,
  GR: 2,
  HR: 2,
  HU: 2,
  IT: 2,
  LT: 2,
  LV: 2,
  MY: 2,
  PL: 2,
  PT: 2,
  SI: 2,
  SK: 2,
  TW: 2,

  // Tier 3 — mid PPP
  AR: 3,
  BR: 3,
  BG: 3,
  CL: 3,
  CO: 3,
  CR: 3,
  DO: 3,
  EC: 3,
  ID: 3,
  MX: 3,
  PA: 3,
  PE: 3,
  PH: 3,
  RO: 3,
  RS: 3,
  TH: 3,
  TR: 3,
  UA: 3,
  UY: 3,
  VN: 3,
  ZA: 3,

  // Tier 4 — lower PPP
  BD: 4,
  EG: 4,
  ET: 4,
  GH: 4,
  IN: 4,
  KE: 4,
  LK: 4,
  MA: 4,
  NG: 4,
  NP: 4,
  PK: 4,
  TZ: 4,
  UG: 4,
  ZM: 4,
};

export function isPricingTier(n: number): n is PricingTier {
  return n === 1 || n === 2 || n === 3 || n === 4;
}

export function tierForCountry(country: string | null | undefined): PricingTier {
  const cc = String(country ?? "")
    .trim()
    .toUpperCase();
  if (!cc || cc === "XX" || cc === "T1" || cc.length !== 2) return DEFAULT_PRICING_TIER;
  return COUNTRY_TIER[cc] ?? DEFAULT_PRICING_TIER;
}

export function pricesForTier(tier: PricingTier): TierPrices {
  return TIER_PRICES[tier] ?? TIER_PRICES[DEFAULT_PRICING_TIER];
}

/** Read visitor country from Cloudflare (or forwarded) request headers. */
export function countryFromRequestHeaders(
  headers: Record<string, string | string[] | undefined> | Headers | null | undefined,
): string | null {
  if (!headers) return null;
  const raw =
    typeof (headers as Headers).get === "function"
      ? (headers as Headers).get("cf-ipcountry") ??
        (headers as Headers).get("CF-IPCountry") ??
        (headers as Headers).get("x-vercel-ip-country") ??
        (headers as Headers).get("x-country-code")
      : headerValue(headers as Record<string, string | string[] | undefined>, "cf-ipcountry") ??
        headerValue(headers as Record<string, string | string[] | undefined>, "x-vercel-ip-country") ??
        headerValue(headers as Record<string, string | string[] | undefined>, "x-country-code");
  const cc = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (!cc || cc === "XX" || cc === "T1" || !/^[A-Z]{2}$/.test(cc)) return null;
  return cc;
}

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | null {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() !== lower) continue;
    const s = Array.isArray(v) ? v[0] : v;
    return s != null ? String(s) : null;
  }
  return null;
}

export function resolveVisitorPricing(
  headers: Record<string, string | string[] | undefined> | Headers | null | undefined,
): { country: string | null; tier: PricingTier; prices: TierPrices } {
  const country = countryFromRequestHeaders(headers);
  const tier = tierForCountry(country);
  return { country, tier, prices: pricesForTier(tier) };
}
