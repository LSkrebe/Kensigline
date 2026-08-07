import { lazy, Suspense, useEffect, useState } from 'react'
import { fetchJsonSafe } from './api.js'
import { useAuth } from './AuthContext.jsx'
import { isCaptureMode } from './captureMode.js'
import { SubscribePage } from './SubscribePage.jsx'
import MarketingRoutes from './MarketingRoutes.jsx'
import { PublicCompanyPage } from './PublicCompanyPage.jsx'
import { matchPublicCompanyPath } from './publicCompany.js'
import { readMarketingPath } from './marketingRoute.js'
import { useSubscription } from './useSubscription.js'

const TerminalApp = lazy(() => import('./App.jsx'))

/** Set VITE_BILLING_GATE=0 in root `.env` to bypass locally. */
const BILLING_GATE_ENABLED = import.meta.env.VITE_BILLING_GATE !== '0'

export default function AppRouter() {
  const { configured, loading, user } = useAuth()
  const signedIn = Boolean(configured && user)
  const userId = user?.id ?? null
  const captureMode = isCaptureMode()
  const [path, setPath] = useState(readMarketingPath)
  const publicCompany = matchPublicCompanyPath(path)
  const showMarketing = !captureMode && (!configured || !user)
  const { loading: subLoading, active, refresh, gateReady } = useSubscription(
    signedIn && BILLING_GATE_ENABLED,
    userId,
  )

  useEffect(() => {
    const onPop = () => setPath(readMarketingPath())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.location.pathname.replace(/\/$/, '') === '/subscribe') {
      window.history.replaceState(null, '', '/')
      setPath('/')
    }
  }, [])

  useEffect(() => {
    if (showMarketing || publicCompany) return
    const p = path.replace(/\/$/, '') || '/'
    if (p.startsWith('/settings')) document.title = 'Settings - Mercerline'
    else if (p.startsWith('/macro')) document.title = 'Macro - Mercerline'
    else if (p.startsWith('/explore/investors')) document.title = 'Investors - Mercerline'
    else if (p.startsWith('/explore/companies')) document.title = 'Companies - Mercerline'
    else if (p.startsWith('/explore')) document.title = 'Explore - Mercerline'
    else document.title = 'Mercerline'
  }, [showMarketing, publicCompany, path, signedIn, active])

  useEffect(() => {
    if (!signedIn || !BILLING_GATE_ENABLED) return
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
      void fetchJsonSafe('/api/billing/refresh', { method: 'POST', timeoutMs: 20000 })
        .then(() => refresh())
        .finally(cleanUrl)
    } else {
      cleanUrl()
    }
  }, [signedIn, refresh])

  useEffect(() => {
    if (!signedIn) return
    /* Warm the terminal chunk while auth/billing settle so Suspense doesn't stall. */
    void import('./App.jsx')
  }, [signedIn])

  /* Public SEO company pages stay outside auth + paywall. */
  if (publicCompany) {
    return <PublicCompanyPage ticker={publicCompany.ticker} />
  }

  if (showMarketing) return <MarketingRoutes />

  /* Wait until billing status is for THIS user — no stale access / no premature paywall. */
  if (loading || (BILLING_GATE_ENABLED && !captureMode && (!gateReady || subLoading))) {
    return (
      <div className="terminalShell terminalShell--boot" aria-busy="true" aria-label="Loading">
        <div className="terminalBootBar" />
      </div>
    )
  }

  if (BILLING_GATE_ENABLED && !active && !captureMode) return <SubscribePage />

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
