import { lazy, Suspense } from 'react'
import { AuthBootScreen } from './AuthBootScreen.jsx'
import { parsePublicTickerPath, useMarketingPath } from './marketingRoute.js'

const IntroPage = lazy(() => import('./IntroPage.jsx').then((m) => ({ default: m.IntroPage })))
const PublicTickerPage = lazy(() =>
  import('./PublicTickerPage.jsx').then((m) => ({ default: m.PublicTickerPage })),
)
const SignInPage = lazy(() => import('./SignInPage.jsx').then((m) => ({ default: m.SignInPage })))
const SubscribePage = lazy(() =>
  import('./SubscribePage.jsx').then((m) => ({ default: m.SubscribePage })),
)

/** Logged-out marketing pages - terminal bundle loads only after sign-in + active subscription. */
export default function MarketingRoutes() {
  const marketingPath = useMarketingPath()
  const previewSubscribe =
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('preview') === 'subscribe'

  if (previewSubscribe) {
    return (
      <Suspense fallback={<AuthBootScreen />}>
        <SubscribePage />
      </Suspense>
    )
  }

  const publicTicker = parsePublicTickerPath(marketingPath)
  if (publicTicker) {
    return (
      <Suspense fallback={<AuthBootScreen />}>
        <PublicTickerPage ticker={publicTicker} />
      </Suspense>
    )
  }

  if (marketingPath === '/sign-in') {
    return (
      <Suspense fallback={<AuthBootScreen />}>
        <SignInPage />
      </Suspense>
    )
  }

  return (
    <Suspense fallback={<AuthBootScreen />}>
      <IntroPage />
    </Suspense>
  )
}
