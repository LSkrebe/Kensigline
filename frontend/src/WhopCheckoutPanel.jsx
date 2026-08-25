import { useCallback, useEffect, useState } from 'react'
import { WhopCheckoutEmbed } from '@whop/checkout/react'
import { fetchJsonSafe, getBackendBase } from './api.js'
import { peekReferralRef } from './referralRef.js'

const WHOP_ENV = import.meta.env.VITE_WHOP_ENV === 'sandbox' ? 'sandbox' : 'production'
const CHECKOUT_RECEIPT_KEY = 'ml.checkout.receipt'

export function peekCheckoutReceiptId() {
  try {
    return sessionStorage.getItem(CHECKOUT_RECEIPT_KEY)
  } catch {
    return null
  }
}

export function clearCheckoutReceiptId() {
  try {
    sessionStorage.removeItem(CHECKOUT_RECEIPT_KEY)
  } catch {
    /* ignore */
  }
}

export function WhopCheckoutPanel({ selectedPlan, userEmail = null, onComplete = null, onError = null }) {
  const [sessionId, setSessionId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
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
    } else if (res.status === 401) {
      msg = 'Session expired — sign in again.'
    } else if (code === 'checkout_failed' && res.data?.message) {
      msg = `Checkout failed: ${res.data.message}`
    }
    setErr(msg)
    onError?.(msg)
  }, [selectedPlan, busy, sessionId, onError])

  const handleComplete = useCallback(
    (_planId, receiptId) => {
      if (receiptId) {
        try {
          sessionStorage.setItem(CHECKOUT_RECEIPT_KEY, receiptId)
        } catch {
          /* ignore */
        }
      }
      onComplete?.(receiptId)
    },
    [onComplete],
  )

  if (!sessionId) {
    return (
      <div className="whopCheckoutStart">
        <button
          type="button"
          className="lpBtn lpBtn--primary"
          disabled={!selectedPlan || busy}
          onClick={() => void startCheckout()}
        >
          {busy ? 'Preparing checkout…' : 'Continue to payment'}
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
