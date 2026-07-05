import { lazy, Suspense } from 'react'
import { useAuth } from './AuthContext.jsx'
import { AuthBootScreen } from './AuthBootScreen.jsx'
import MarketingRoutes from './MarketingRoutes.jsx'

const TerminalApp = lazy(() => import('./App.jsx'))

export default function AppRouter() {
  const { configured, loading, user } = useAuth()
  const previewTerminal =
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('preview') === 'terminal'

  if (configured && loading) return <AuthBootScreen />

  if (previewTerminal) {
    return (
      <Suspense fallback={<AuthBootScreen />}>
        <TerminalApp />
      </Suspense>
    )
  }

  if (!configured || !user) return <MarketingRoutes />

  return (
    <Suspense fallback={<AuthBootScreen />}>
      <TerminalApp />
    </Suspense>
  )
}
