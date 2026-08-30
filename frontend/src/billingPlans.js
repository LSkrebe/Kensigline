/** Display amounts + checkout plan ids. Live amounts come from GET /api/billing/pricing. */

export const STANDARD_MONTHLY_USD = 99
export const STANDARD_YEARLY_USD = 999
export const FOUNDERS_MONTHLY_USD = 49
export const FOUNDERS_YEARLY_USD = 499

/**
 * Defaults until /api/billing/pricing responds (match WAITLIST_MODE / FOUNDERS_PRICING on API).
 */
export const DEFAULT_WAITLIST = false
export const DEFAULT_FOUNDERS = true

export function formatUsd(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export function pricingFromApi(data) {
  const waitlist = data?.waitlist === true
  const founders = !waitlist && data?.founders === true
  const monthlyUsd = Number(data?.monthly_usd)
  const yearlyUsd = Number(data?.yearly_usd)
  return buildPricing({
    waitlist,
    founders,
    monthlyUsd: Number.isFinite(monthlyUsd) ? monthlyUsd : founders ? FOUNDERS_MONTHLY_USD : STANDARD_MONTHLY_USD,
    yearlyUsd: Number.isFinite(yearlyUsd) ? yearlyUsd : founders ? FOUNDERS_YEARLY_USD : STANDARD_YEARLY_USD,
    monthlyListUsd: data?.monthly_list_usd != null ? Number(data.monthly_list_usd) : founders ? STANDARD_MONTHLY_USD : null,
    yearlyListUsd:
      data?.yearly_list_usd != null
        ? Number(data.yearly_list_usd)
        : founders
          ? STANDARD_YEARLY_USD
          : STANDARD_MONTHLY_USD * 12,
  })
}

export function buildPricing({
  waitlist = DEFAULT_WAITLIST,
  founders = DEFAULT_FOUNDERS,
  monthlyUsd,
  yearlyUsd,
  monthlyListUsd,
  yearlyListUsd,
} = {}) {
  const foundersOn = !waitlist && founders
  const monthly = monthlyUsd ?? (foundersOn ? FOUNDERS_MONTHLY_USD : STANDARD_MONTHLY_USD)
  const yearly = yearlyUsd ?? (foundersOn ? FOUNDERS_YEARLY_USD : STANDARD_YEARLY_USD)
  const monthlyList = monthlyListUsd ?? (foundersOn ? STANDARD_MONTHLY_USD : null)
  const yearlyList =
    yearlyListUsd ?? (foundersOn ? STANDARD_YEARLY_USD : STANDARD_MONTHLY_USD * 12)
  const yearlySave = Math.max(0, monthly * 12 - yearly)

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
      billedNote: `Save ${formatUsd(yearlySave)} vs paying monthly, billed annually`,
      featured: true,
    },
  ]

  return {
    waitlist: Boolean(waitlist),
    founders: foundersOn,
    monthlyUsd: monthly,
    yearlyUsd: yearly,
    monthlyListUsd: monthlyList,
    yearlyListUsd: yearlyList,
    yearlySaveUsd: yearlySave,
    plans,
  }
}

export const DEFAULT_PRICING = buildPricing({ waitlist: DEFAULT_WAITLIST, founders: DEFAULT_FOUNDERS })

/** Standard list pricing for SEO, llms.txt, JSON-LD, and other crawler-facing copy. */
export const SEO_PRICING = buildPricing({ waitlist: false, founders: false })

/** @deprecated Prefer useBillingPricing / DEFAULT_PRICING — kept for static imports. */
export const MONTHLY_PRICE_USD = DEFAULT_PRICING.monthlyUsd
export const YEARLY_PRICE_USD = DEFAULT_PRICING.yearlyUsd
export const YEARLY_LIST_USD = DEFAULT_PRICING.yearlyListUsd
export const YEARLY_SAVE_USD = DEFAULT_PRICING.yearlySaveUsd
export const BILLING_PLANS = DEFAULT_PRICING.plans
