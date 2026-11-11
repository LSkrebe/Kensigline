import { useEffect, useState } from 'react'
import { fetchJsonSafe } from './api.js'
import { DEFAULT_PRICING, pricingFromApi } from './billingPlans.js'

/** Live pricing + marketing mode from backend (PPP geo tier / WAITLIST_MODE). */
export function useBillingPricing() {
  const [pricing, setPricing] = useState(DEFAULT_PRICING)

  useEffect(() => {
    let cancelled = false
    void fetchJsonSafe('/api/billing/pricing', { timeoutMs: 8000 }).then((res) => {
      if (cancelled || !res.ok || !res.data) return
      setPricing(pricingFromApi(res.data))
    })
    return () => {
      cancelled = true
    }
  }, [])

  return pricing
}
