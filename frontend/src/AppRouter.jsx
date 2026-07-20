import { lazy, Suspense, useEffect } from 'react'
import { fetchJsonSafe } from './api.js'
import { useAuth } from './AuthContext.jsx'
import { SubscribePage } from './SubscribePage.jsx'
import MarketingRoutes from './MarketingRoutes.jsx'
import { useSubscription } from './useSubscription.js'

const TerminalApp = lazy(() => import('./App.jsx'))

/** Set VITE_BILLING_GATE=0 in root `.env` to bypass locally. */
const BILLING_GATE_ENABLED = import.meta.env.VITE_BILLING_GATE !== '0'

export default function AppRouter() {
  const { configured, loading, user } = useAuth()
  const signedIn = Boolean(configured && user)
  const showMarketing = !configured || !user
  const { loading: subLoading, active, refresh } = useSubscription(
    signedIn && BILLING_GATE_ENABLED,
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.location.pathname.replace(/\/$/, '') === '/subscribe') {
      window.history.replaceState(null, '', '/')
    }
  }, [])

  useEffect(() => {
    if (!signedIn || !BILLING_GATE_ENABLED) return
    const params = new URLSearchParams(window.location.search)
    const checkout = params.get('checkout')
    if (checkout !== 'success' && checkout !== 'cancel') return

    const cleanUrl = () => {
      if (window.history?.replaceState) {
        window.history.replaceState(null, '', window.location.pathname || '/')
      }
    }

    if (checkout === 'success') {
      void fetchJsonSafe('/api/billing/refresh', { method: 'POST', timeoutMs: 20000 })
        .then(() => refresh())
        .finally(cleanUrl)
    } else {
      cleanUrl()
    }
  }, [signedIn, refresh])

  if (showMarketing) return <MarketingRoutes />

  if (loading || (BILLING_GATE_ENABLED && subLoading)) {
    return (
      <div className="terminalShell terminalShell--boot" aria-busy="true" aria-label="Loading">
        <div className="terminalBootBar" />
      </div>
    )
  }

  if (BILLING_GATE_ENABLED && !active) return <SubscribePage />

  return (
    <Suspense fallback={null}>
      <TerminalApp />
    </Suspense>
  )
}
