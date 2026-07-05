import { lazy, Suspense, useEffect } from 'react'
import { fetchJsonSafe } from './api.js'
import { useAuth } from './AuthContext.jsx'
import { AuthBootScreen } from './AuthBootScreen.jsx'
import MarketingRoutes from './MarketingRoutes.jsx'
import { useSubscription } from './useSubscription.js'

const TerminalApp = lazy(() => import('./App.jsx'))
const SubscribePage = lazy(() =>
  import('./SubscribePage.jsx').then((m) => ({ default: m.SubscribePage })),
)

/** Set VITE_BILLING_GATE=0 in root `.env` to bypass locally. */
const BILLING_GATE_ENABLED = import.meta.env.VITE_BILLING_GATE !== '0'

export default function AppRouter() {
  const { configured, loading, user } = useAuth()
  const signedIn = Boolean(configured && user)
  const { loading: subLoading, active, refresh } = useSubscription(
    signedIn && BILLING_GATE_ENABLED,
  )
  const previewTerminal =
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('preview') === 'terminal'

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

  if (configured && loading) return <AuthBootScreen />

  if (previewTerminal) {
    return (
      <Suspense fallback={<AuthBootScreen />}>
        <TerminalApp />
      </Suspense>
    )
  }

  if (!configured || !user) return <MarketingRoutes />

  if (BILLING_GATE_ENABLED) {
    if (subLoading) return <AuthBootScreen />
    if (!active) {
      return (
        <Suspense fallback={<AuthBootScreen />}>
          <SubscribePage />
        </Suspense>
      )
    }
  }

  return (
    <Suspense fallback={<AuthBootScreen />}>
      <TerminalApp />
    </Suspense>
  )
}
