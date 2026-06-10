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
    const gateOn = res.ok && res.data?.billing_enabled !== false
    setBillingEnabled(gateOn)
    setActive(gateOn ? Boolean(res.data?.active) : true)
    setLoading(false)
  }, [enabled])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { loading, active, billingEnabled, refresh }
}
