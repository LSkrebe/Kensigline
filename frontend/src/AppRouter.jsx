import { lazy, Suspense, useEffect, useState } from 'react'
import { fetchJsonSafe } from './api.js'
import { useAuth } from './AuthContext.jsx'
import { isCaptureMode } from './captureMode.js'
import MarketingRoutes from './MarketingRoutes.jsx'
import { PublicMarketingRoutes, isPublicMarketingPath } from './PublicMarketingRoutes.jsx'
import { SignInPage } from './SignInPage.jsx'
import { readMarketingPath, navigateMarketing } from './marketingRoute.js'
import { activateCheckoutSession } from './checkoutActivate.js'
import { clearCheckoutReceiptId, peekCheckoutReceiptId } from './WhopCheckoutPanel.jsx'
import { captureReferralRef } from './referralRef.js'
import { markAppReady } from './marketingShell.js'
import { useSubscription } from './useSubscription.js'
import { useBillingPricing } from './useBillingPricing.js'

const TerminalApp = lazy(() => import('./App.jsx'))

/** Set VITE_BILLING_GATE=0 in root `.env` to bypass locally. */
const BILLING_GATE_ENABLED = import.meta.env.VITE_BILLING_GATE !== '0'
/** Build-time waitlist lock; API `waitlist` flag is the live source of truth. */
const WAITLIST_BUILD = import.meta.env.VITE_WAITLIST_MODE === '1'

export default function AppRouter() {
  const { configured, loading, user } = useAuth()
  const signedIn = Boolean(configured && user)
  const userId = user?.id ?? null
  const captureMode = isCaptureMode()
  const pricing = useBillingPricing()
  const waitlistMode = WAITLIST_BUILD || pricing.waitlist === true
  const [path, setPath] = useState(readMarketingPath)
  const publicMarketing = isPublicMarketingPath(path)
  const showMarketing = !captureMode && (waitlistMode || !configured || !user)
  const { loading: subLoading, active, refresh, gateReady } = useSubscription(
    signedIn && BILLING_GATE_ENABLED && !waitlistMode,
    userId,
  )

  useEffect(() => {
    markAppReady()
    captureReferralRef()
  }, [])

  useEffect(() => {
    const onPop = () => setPath(readMarketingPath())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.location.pathname.replace(/\/$/, '') === '/subscribe') {
      window.history.replaceState(null, '', waitlistMode ? '/waitlist' : '/#pricing')
      setPath(waitlistMode ? '/waitlist' : '/')
    }
  }, [waitlistMode])

  useEffect(() => {
    if (waitlistMode || captureMode) return
    const p = path.replace(/\/$/, '') || '/'
    if (p === '/subscribe' || p === '/join') {
      navigateMarketing(p === '/join' ? '/#pricing' : '/')
      setPath('/')
    }
  }, [waitlistMode, captureMode, path])

  useEffect(() => {
    if (waitlistMode || captureMode) return
    const p = path.replace(/\/$/, '') || '/'
    if (p.startsWith('/settings')) document.title = 'Settings - Mercerline'
    else if (p.startsWith('/macro')) document.title = 'Macro - Mercerline'
    else if (p.startsWith('/explore/investors')) document.title = 'Investors - Mercerline'
    else if (p.startsWith('/explore/companies')) document.title = 'Companies - Mercerline'
    else if (p.startsWith('/explore')) document.title = 'Explore - Mercerline'
    else document.title = 'Mercerline'
  }, [waitlistMode, captureMode, path, signedIn, active])

  useEffect(() => {
    if (waitlistMode) return
    const params = new URLSearchParams(window.location.search)
    const checkout = params.get('checkout')
    if (checkout !== 'success' && checkout !== 'cancel') return

    const cleanUrl = () => {
      if (window.history?.replaceState) {
        window.history.replaceState(null, '', window.location.pathname || '/')
      }
      setPath(readMarketingPath())
    }

    if (checkout === 'success') {
      const receiptId = peekCheckoutReceiptId()
      void (async () => {
        if (receiptId) {
          await activateCheckoutSession(receiptId)
          await refresh()
        } else if (user) {
          await fetchJsonSafe('/api/billing/refresh', {
            method: 'POST',
            body: {},
            timeoutMs: 20000,
          })
          await refresh()
        }
        clearCheckoutReceiptId()
        cleanUrl()
      })()
    } else {
      cleanUrl()
    }
  }, [waitlistMode, refresh, user])

  useEffect(() => {
    if (!signedIn || waitlistMode || captureMode) return
    let alive = true
    void import('./exploreApi.js').then(({ hydrateExploreHomeFromSession, prefetchExploreHome }) => {
      hydrateExploreHomeFromSession(null)
      if (!alive) return
      void prefetchExploreHome(true)
    })
    return () => {
      alive = false
    }
  }, [signedIn, waitlistMode, captureMode])

  useEffect(() => {
    if (user) void import('./App.jsx')
  }, [user])

  useEffect(() => {
    if (!signedIn || waitlistMode || captureMode || !BILLING_GATE_ENABLED) return
    if (!gateReady || subLoading || active) return
    const p = readMarketingPath()
    if (p !== '/sign-in') {
      if (window.history?.replaceState) {
        window.history.replaceState(null, '', '/sign-in?reason=no_subscription')
        window.dispatchEvent(new PopStateEvent('popstate'))
      } else {
        navigateMarketing('/sign-in?reason=no_subscription')
      }
      setPath('/sign-in')
    }
  }, [signedIn, waitlistMode, captureMode, gateReady, subLoading, active])

  if (publicMarketing && !waitlistMode) {
    return <PublicMarketingRoutes path={path} />
  }

  if (showMarketing || waitlistMode) return <MarketingRoutes />

  if (loading || (BILLING_GATE_ENABLED && !captureMode && (!gateReady || subLoading))) {
    return (
      <div className="terminalShell terminalShell--boot" aria-busy="true" aria-label="Loading">
        <div className="terminalBootBar" />
      </div>
    )
  }

  if (BILLING_GATE_ENABLED && !active && !captureMode) {
    return <SignInPage gateReason="no_subscription" />
  }

  return (
    <Suspense
      fallback={
        <div className="terminalShell terminalShell--boot" aria-busy="true" aria-label="Loading" />
      }
    >
      <TerminalApp />
    </Suspense>
  )
}
