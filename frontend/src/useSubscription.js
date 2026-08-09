import { useCallback, useEffect, useRef, useState } from 'react'
import { clearAuthTokenCache, fetchJsonSafe } from './api.js'

const BILLING_CACHE_PREFIX = 'ml.billing.status.v1:'

function readBillingCache(userId) {
  try {
    const raw = sessionStorage.getItem(BILLING_CACHE_PREFIX + userId)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    if (parsed.user_id && parsed.user_id !== userId) return null
    const age = Date.now() - Number(parsed.at || 0)
    if (!Number.isFinite(age) || age < 0 || age > 6 * 60 * 60 * 1000) return null
    return parsed
  } catch {
    return null
  }
}

function writeBillingCache(userId, data) {
  try {
    sessionStorage.setItem(
      BILLING_CACHE_PREFIX + userId,
      JSON.stringify({
        at: Date.now(),
        user_id: userId,
        billing_enabled: data?.billing_enabled === true,
        active: Boolean(data?.active),
      }),
    )
  } catch {
    /* ignore quota / private mode */
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Subscription gate for the signed-in user.
 * Always keyed by userId so account switches cannot reuse another user’s access.
 * Uses a short session cache so reloads don't sit on the boot bar waiting for billing.
 */
export function useSubscription(enabled = false, userId = null) {
  const cached = enabled && userId ? readBillingCache(userId) : null
  const [loading, setLoading] = useState(Boolean(enabled && userId && !cached))
  const [active, setActive] = useState(Boolean(cached?.billing_enabled && cached?.active))
  const [billingEnabled, setBillingEnabled] = useState(Boolean(cached?.billing_enabled))
  const [verifiedUserId, setVerifiedUserId] = useState(cached ? userId : null)
  const genRef = useRef(0)

  const applyStatus = useCallback((data, expectedUserId) => {
    if (data?.user_id && data.user_id !== expectedUserId) return false
    const billingOn = data?.billing_enabled === true
    setBillingEnabled(billingOn)
    setActive(billingOn && Boolean(data?.active))
    setVerifiedUserId(expectedUserId)
    setLoading(false)
    writeBillingCache(expectedUserId, {
      billing_enabled: billingOn,
      active: Boolean(data?.active),
      user_id: expectedUserId,
    })
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
    const warm = readBillingCache(userId)
    if (warm) {
      setBillingEnabled(Boolean(warm.billing_enabled))
      setActive(Boolean(warm.billing_enabled && warm.active))
      setVerifiedUserId(userId)
      setLoading(false)
    } else {
      /* Deny until this user is proven — never flash previous account’s access. */
      setLoading(true)
      setActive(false)
      setVerifiedUserId(null)
    }

    const tryOnce = () => fetchJsonSafe('/api/billing/status', { timeoutMs: 8000 })

    let res = await tryOnce()
    if (gen !== genRef.current) return
    if (res.ok && applyStatus(res.data, userId)) return

    if (!res.ok && (res.status === 401 || res.status === 0)) {
      clearAuthTokenCache()
      await sleep(250)
      if (gen !== genRef.current) return
      res = await tryOnce()
      if (gen !== genRef.current) return
      if (res.ok && applyStatus(res.data, userId)) return
    }

    if (res.ok && res.data?.user_id && res.data.user_id !== userId) {
      clearAuthTokenCache()
      await sleep(250)
      if (gen !== genRef.current) return
      res = await tryOnce()
      if (gen !== genRef.current) return
      if (res.ok && applyStatus(res.data, userId)) return
    }

    // Transient API/DB pressure (503 / timeout): keep warm access; retry once more before denying.
    const transient =
      !res.ok && (res.status === 0 || res.status === 503 || res.status === 502 || res.status === 504)
    if (transient) {
      if (warm) {
        setVerifiedUserId(userId)
        setLoading(false)
        return
      }
      await sleep(600)
      if (gen !== genRef.current) return
      const retry = await tryOnce()
      if (gen !== genRef.current) return
      if (retry.ok && applyStatus(retry.data, userId)) return
      if (warm) {
        setVerifiedUserId(userId)
        setLoading(false)
        return
      }
    }

    if (warm) {
      setVerifiedUserId(userId)
      setLoading(false)
      return
    }

    setBillingEnabled(true)
    setActive(false)
    setVerifiedUserId(userId)
    setLoading(false)
  }, [applyStatus, enabled, userId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const gateReady = !enabled || (!loading && verifiedUserId === userId) || Boolean(cached && verifiedUserId === userId)

  return { loading, active, billingEnabled, refresh, verifiedUserId, gateReady }
}
