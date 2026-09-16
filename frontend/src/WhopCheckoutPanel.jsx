import { useCallback, useEffect, useRef, useState } from 'react'
import { WhopCheckoutEmbed } from '@whop/checkout/react'
import { fetchJsonSafe, getBackendBase } from './api.js'
import { activateCheckoutSession } from './checkoutActivate.js'
import { peekReferralRef } from './referralRef.js'

const WHOP_ENV = import.meta.env.VITE_WHOP_ENV === 'sandbox' ? 'sandbox' : 'production'
import {CHECKOUT_RECEIPT_KEY,peekCheckoutReceiptId,clearCheckoutReceiptId} from './checkoutReceipt.js'
export {peekCheckoutReceiptId,clearCheckoutReceiptId} from './checkoutReceipt.js'

export function WhopCheckoutPanel({
  selectedPlan,
  userEmail = null,
  onComplete = null,
  onError = null,
  onBusyChange = null,
  startLabel = 'Continue to payment',
  autoStart = false,
}) {
  const [sessionId, setSessionId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const autoStartedRef = useRef(false)

  useEffect(() => {
    onBusyChange?.(busy)
  }, [busy, onBusyChange])

  useEffect(() => {
    autoStartedRef.current = false
    setSessionId(null)
    setErr('')
  }, [selectedPlan])

  const startCheckout = useCallback(async () => {
    if (!selectedPlan || busy || sessionId) return
    setBusy(true)
    setErr('')
    const ref = peekReferralRef()
    const res = await fetchJsonSafe('/api/billing/checkout', {
      method: 'POST',
      body: { plan: selectedPlan, ...(ref ? { r: ref } : {}) },
      timeoutMs: 20000,
    })
    setBusy(false)
    if (res.ok && res.data?.sessionId) {
      setSessionId(res.data.sessionId)
      return
    }
    const code = res.data?.error
    let msg = `Could not start checkout (HTTP ${res.status}${code ? `: ${code}` : ''}).`
    if (res.status === 0 || code === 'network_error') {
      msg = `Cannot reach the API (${getBackendBase() || 'same origin'}/api).`
    } else if (code === 'whop_not_configured' || code === 'whop_company_not_configured') {
      msg = 'Billing is not configured yet.'
    } else if (code === 'waitlist_mode') {
      msg = 'Access is waitlist-only right now.'
    } else if (code === 'supabase_admin_not_configured') {
      msg = 'Checkout is not fully configured yet.'
    } else if (res.status === 401) {
      msg = 'Could not start checkout — try again.'
    } else if (code === 'checkout_failed' && res.data?.message) {
      msg = `Checkout failed: ${res.data.message}`
    }
    setErr(msg)
    onError?.(msg)
  }, [selectedPlan, busy, sessionId, onError])

  useEffect(() => {
    if (!autoStart || !selectedPlan || autoStartedRef.current) return
    autoStartedRef.current = true
    void startCheckout()
  }, [autoStart, selectedPlan, startCheckout])

  const handleComplete = useCallback(
    (_planId, receiptId) => {
      if (receiptId) {
        try {
          sessionStorage.setItem(CHECKOUT_RECEIPT_KEY, receiptId)
        } catch {
          /* ignore */
        }
        void activateCheckoutSession(receiptId).then((result) => {
          if (!result.ok) {
            const msg = 'Payment received — finishing setup. Refresh if access does not open.'
            setErr(msg)
            onError?.(msg)
          }
          onComplete?.(receiptId, result)
        })
        return
      }
      onComplete?.(receiptId)
    },
    [onComplete, onError],
  )

  if (!sessionId) {
    if (autoStart) {
      return err ? (
        <p className="subError" role="alert">
          {err}
        </p>
      ) : null
    }

    return (
      <div className="whopCheckoutStart">
        <button
          type="button"
          className="lpBtn lpBtn--primary"
          disabled={!selectedPlan || busy}
          onClick={() => void startCheckout()}
        >
          {busy ? 'Preparing checkout…' : startLabel}
        </button>
        {err ? (
          <p className="subError" role="alert">
            {err}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="whopCheckoutEmbed">
      <WhopCheckoutEmbed
        sessionId={sessionId}
        environment={WHOP_ENV}
        theme="dark"
        returnUrl={`${window.location.origin}/?checkout=success`}
        skipRedirect
        prefill={userEmail ? { email: userEmail } : undefined}
        onComplete={handleComplete}
        fallback={<p className="mono exploreDirectoryEmpty--loading">Loading checkout…</p>}
      />
    </div>
  )
}
