/** Display amounts + checkout plan ids. Live amounts come from GET /api/billing/pricing. */

/** Tier 1 defaults until /api/billing/pricing responds. */
export const STANDARD_MONTHLY_USD = 48.4
export const STANDARD_YEARLY_USD = 484

/**
 * Defaults until /api/billing/pricing responds (match WAITLIST_MODE on API).
 */
export const DEFAULT_WAITLIST = false

/** Round money to cents. */
export function moneyCents(n) {
  return Math.round(Number(n) * 100) / 100
}

export function formatUsd(n) {
  const v = moneyCents(n)
  const hasCents = Math.abs(v % 1) > 1e-9
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(v)
}

/** Note under the featured yearly plan price. */
export function yearlyPlanNote(pricing) {
  const perMonth = moneyCents((pricing?.yearlySaveUsd ?? 0) / 12)
  return `Save ${formatUsd(perMonth)}/mo vs paying monthly`
}

/** Badge on the featured yearly plan card — effective monthly from the yearly total. */
export function yearlyPlanBadgeLabel(pricing) {
  const yearly = Number(pricing?.yearlyUsd)
  if (!Number.isFinite(yearly) || yearly <= 0) return null
  const perMonth = moneyCents(yearly / 12)
  return `${formatUsd(perMonth)}/mo`
}

export function pricingFromApi(data) {
  const waitlist = data?.waitlist === true
  const monthlyUsd = Number(data?.monthly_usd)
  const yearlyUsd = Number(data?.yearly_usd)
  const tier = Number(data?.tier)
  return buildPricing({
    waitlist,
    tier: tier === 1 || tier === 2 || tier === 3 || tier === 4 ? tier : 1,
    country: typeof data?.country === 'string' ? data.country : null,
    monthlyUsd: Number.isFinite(monthlyUsd) ? monthlyUsd : STANDARD_MONTHLY_USD,
    yearlyUsd: Number.isFinite(yearlyUsd) ? yearlyUsd : STANDARD_YEARLY_USD,
    monthlyListUsd: data?.monthly_list_usd != null ? Number(data.monthly_list_usd) : null,
    yearlyListUsd:
      data?.yearly_list_usd != null ? Number(data.yearly_list_usd) : STANDARD_MONTHLY_USD * 12,
  })
}

export function buildPricing({
  waitlist = DEFAULT_WAITLIST,
  tier = 1,
  country = null,
  monthlyUsd,
  yearlyUsd,
  monthlyListUsd,
  yearlyListUsd,
} = {}) {
  const monthly = monthlyUsd ?? STANDARD_MONTHLY_USD
  const yearly = yearlyUsd ?? STANDARD_YEARLY_USD
  const monthlyList = monthlyListUsd ?? null
  const yearlyList = yearlyListUsd ?? STANDARD_MONTHLY_USD * 12
  const yearlySave = moneyCents(Math.max(0, monthly * 12 - yearly))

  const plans = [
    {
      id: 'monthly',
      name: 'Monthly',
      priceUsd: monthly,
      listPriceUsd: monthlyList,
      intervalLabel: 'month',
      billedNote: 'Billed monthly, cancel anytime',
      featured: false,
    },
    {
      id: 'yearly',
      name: 'Yearly',
      priceUsd: yearly,
      listPriceUsd: yearlyList,
      intervalLabel: 'year',
      billedNote: `Save ${formatUsd(yearlySave)} vs paying monthly (${formatUsd(moneyCents(yearlySave / 12))}/mo), billed annually`,
      featured: true,
    },
  ]

  return {
    waitlist: Boolean(waitlist),
    /** Always false — founders pricing removed; kept for existing UI branches. */
    founders: false,
    tier,
    country,
    monthlyUsd: monthly,
    yearlyUsd: yearly,
    monthlyListUsd: monthlyList,
    yearlyListUsd: yearlyList,
    yearlySaveUsd: yearlySave,
    plans,
  }
}

export const DEFAULT_PRICING = buildPricing({ waitlist: DEFAULT_WAITLIST })

/** Standard list pricing for SEO, llms.txt, JSON-LD, and other crawler-facing copy. */
export const SEO_PRICING = DEFAULT_PRICING

/** @deprecated Prefer useBillingPricing / DEFAULT_PRICING — kept for static imports. */
export const MONTHLY_PRICE_USD = DEFAULT_PRICING.monthlyUsd
export const YEARLY_PRICE_USD = DEFAULT_PRICING.yearlyUsd
export const YEARLY_LIST_USD = DEFAULT_PRICING.yearlyListUsd
export const YEARLY_SAVE_USD = DEFAULT_PRICING.yearlySaveUsd
export const BILLING_PLANS = DEFAULT_PRICING.plans
