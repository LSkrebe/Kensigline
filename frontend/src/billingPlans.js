/** Display + checkout plan ids (Stripe price IDs wired later). */
export const MONTHLY_PRICE_USD = 99
export const YEARLY_PRICE_USD = 999
export const YEARLY_LIST_USD = MONTHLY_PRICE_USD * 12
export const YEARLY_SAVE_USD = YEARLY_LIST_USD - YEARLY_PRICE_USD

export const BILLING_PLANS = [
  {
    id: 'monthly',
    name: 'Monthly',
    priceUsd: MONTHLY_PRICE_USD,
    intervalLabel: 'month',
    billedNote: 'Billed monthly · cancel anytime',
    badge: null,
    featured: false,
  },
  {
    id: 'yearly',
    name: 'Yearly',
    priceUsd: YEARLY_PRICE_USD,
    intervalLabel: 'year',
    billedNote: `Save ${formatUsd(YEARLY_SAVE_USD)} vs monthly · billed annually`,
    badge: `Save $${YEARLY_SAVE_USD}`,
    featured: true,
  },
]

export function formatUsd(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}
