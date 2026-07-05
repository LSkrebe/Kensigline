import { lazy, Suspense } from 'react'
import { IntroPage } from './IntroPage.jsx'
import { AuthBootScreen } from './AuthBootScreen.jsx'
import { parsePublicTickerPath, useMarketingPath } from './marketingRoute.js'

const PublicTickerPage = lazy(() => import('./PublicTickerPage.jsx'))
const SignInPage = lazy(() => import('./SignInPage.jsx'))
const SubscribePage = lazy(() => import('./SubscribePage.jsx'))

/** Logged-out marketing pages - terminal bundle loads only after sign-in. */
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

  return <IntroPage />
}
