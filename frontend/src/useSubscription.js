import { useCallback, useEffect, useRef, useState } from 'react'
import { clearAuthTokenCache, fetchJsonSafe } from './api.js'

/**
 * Subscription gate for the signed-in user.
 * Always keyed by userId so account switches cannot reuse another user’s access.
 */
export function useSubscription(enabled = false, userId = null) {
  const [loading, setLoading] = useState(Boolean(enabled && userId))
  const [active, setActive] = useState(false)
  const [billingEnabled, setBillingEnabled] = useState(false)
  /** User id we last successfully resolved status for (null = none). */
  const [verifiedUserId, setVerifiedUserId] = useState(null)
  const genRef = useRef(0)

  const applyStatus = useCallback((data, expectedUserId) => {
    if (data?.user_id && data.user_id !== expectedUserId) return false
    const billingOn = data?.billing_enabled === true
    setBillingEnabled(billingOn)
    setActive(billingOn && Boolean(data?.active))
    setVerifiedUserId(expectedUserId)
    setLoading(false)
    return true
  }, [])

  const refresh = useCallback(async () => {
    if (!enabled || !userId) {
      genRef.current += 1
      setLoading(false)
      setActive(false)
      setBillingEnabled(false)
      setVerifiedUserId(null)
      return
    }

    const gen = ++genRef.current
    /* Deny until this user is proven — never flash previous account’s access. */
    setLoading(true)
    setActive(false)
    setVerifiedUserId(null)

    const res = await fetchJsonSafe('/api/billing/status', { timeoutMs: 5000 })
    if (gen !== genRef.current) return

    if (res.ok && applyStatus(res.data, userId)) return

    /* Auth race after account switch — clear cache and retry once. */
    if (!res.ok && (res.status === 401 || res.status === 0)) {
      clearAuthTokenCache()
      const retry = await fetchJsonSafe('/api/billing/status', { timeoutMs: 5000 })
      if (gen !== genRef.current) return
      if (retry.ok && applyStatus(retry.data, userId)) return
    }

    /* Mismatched user_id on an otherwise-ok response — treat as deny + retry once. */
    if (res.ok && res.data?.user_id && res.data.user_id !== userId) {
      clearAuthTokenCache()
      const retry = await fetchJsonSafe('/api/billing/status', { timeoutMs: 5000 })
      if (gen !== genRef.current) return
      if (retry.ok && applyStatus(retry.data, userId)) return
    }

    setBillingEnabled(true)
    setActive(false)
    setVerifiedUserId(userId)
    setLoading(false)
  }, [applyStatus, enabled, userId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const gateReady = !enabled || (!loading && verifiedUserId === userId)

  return { loading, active, billingEnabled, refresh, verifiedUserId, gateReady }
}
