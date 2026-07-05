import { lazy, Suspense } from 'react'
import { IntroPage } from './IntroPage.jsx'
import { SignInPage } from './SignInPage.jsx'
import { SubscribePage } from './SubscribePage.jsx'
import { parsePublicTickerPath, useMarketingPath } from './marketingRoute.js'

const PublicTickerPage = lazy(() =>
  import('./PublicTickerPage.jsx').then((m) => ({ default: m.PublicTickerPage })),
)

/** Logged-out marketing pages - terminal bundle loads only after sign-in + active subscription. */
export default function MarketingRoutes() {
  const marketingPath = useMarketingPath()
  const previewSubscribe =
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('preview') === 'subscribe'

  if (previewSubscribe) return <SubscribePage />

  const publicTicker = parsePublicTickerPath(marketingPath)
  if (publicTicker) {
    return (
      <Suspense fallback={null}>
        <PublicTickerPage ticker={publicTicker} />
      </Suspense>
    )
  }

  if (marketingPath === '/sign-in') return <SignInPage />
  return <IntroPage />
}
