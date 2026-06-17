import { useCallback, useEffect, useState } from 'react'
import { fetchJsonSafe } from './api.js'

/** Subscription gate — only call when the user is signed in. */
export function useSubscription(enabled = false) {
  const [loading, setLoading] = useState(Boolean(enabled))
  const [active, setActive] = useState(false)
  const [billingEnabled, setBillingEnabled] = useState(false)

  const refresh = useCallback(async () => {
    if (!enabled) {
      setLoading(false)
      setActive(false)
      setBillingEnabled(false)
      return
    }

    setLoading(true)
    const res = await fetchJsonSafe('/api/billing/status')
    if (!res.ok) {
      setBillingEnabled(true)
      setActive(false)
      setLoading(false)
      return
    }
    const billingOn = res.data?.billing_enabled === true
    setBillingEnabled(billingOn)
    setActive(billingOn && Boolean(res.data?.active))
    setLoading(false)
  }, [enabled])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { loading, active, billingEnabled, refresh }
}
