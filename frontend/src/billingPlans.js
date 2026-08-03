/** Display amounts + checkout plan ids. Live amounts come from GET /api/billing/pricing. */

export const STANDARD_MONTHLY_USD = 99
export const STANDARD_YEARLY_USD = 999
export const FOUNDERS_MONTHLY_USD = 49
export const FOUNDERS_YEARLY_USD = 499

/** Default until /api/billing/pricing responds (founders launch). */
export const DEFAULT_FOUNDERS = true

export function formatUsd(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export function pricingFromApi(data) {
  const founders = data?.founders === true
  const monthlyUsd = Number(data?.monthly_usd)
  const yearlyUsd = Number(data?.yearly_usd)
  return buildPricing({
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
  founders = DEFAULT_FOUNDERS,
  monthlyUsd,
  yearlyUsd,
  monthlyListUsd,
  yearlyListUsd,
} = {}) {
  const monthly = monthlyUsd ?? (founders ? FOUNDERS_MONTHLY_USD : STANDARD_MONTHLY_USD)
  const yearly = yearlyUsd ?? (founders ? FOUNDERS_YEARLY_USD : STANDARD_YEARLY_USD)
  const monthlyList = monthlyListUsd ?? (founders ? STANDARD_MONTHLY_USD : null)
  const yearlyList =
    yearlyListUsd ?? (founders ? STANDARD_YEARLY_USD : STANDARD_MONTHLY_USD * 12)
  const yearlySave = Math.max(0, (monthly * 12) - yearly)

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
    founders,
    monthlyUsd: monthly,
    yearlyUsd: yearly,
    monthlyListUsd: monthlyList,
    yearlyListUsd: yearlyList,
    yearlySaveUsd: yearlySave,
    plans,
    badge: founders ? 'Founders pricing — early access rate' : null,
  }
}

export const DEFAULT_PRICING = buildPricing({ founders: DEFAULT_FOUNDERS })

/** @deprecated Prefer useBillingPricing / DEFAULT_PRICING — kept for static imports. */
export const MONTHLY_PRICE_USD = DEFAULT_PRICING.monthlyUsd
export const YEARLY_PRICE_USD = DEFAULT_PRICING.yearlyUsd
export const YEARLY_LIST_USD = DEFAULT_PRICING.yearlyListUsd
export const YEARLY_SAVE_USD = DEFAULT_PRICING.yearlySaveUsd
export const BILLING_PLANS = DEFAULT_PRICING.plans
