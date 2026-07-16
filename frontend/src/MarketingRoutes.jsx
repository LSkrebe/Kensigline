import { IntroPage } from './IntroPage.jsx'
import { SignInPage } from './SignInPage.jsx'
import { SubscribePage } from './SubscribePage.jsx'
import { useMarketingPath } from './marketingRoute.js'

/** Logged-out marketing pages - terminal bundle loads only after sign-in + active subscription. */
export default function MarketingRoutes() {
  const marketingPath = useMarketingPath()
  const previewSubscribe =
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('preview') === 'subscribe'

  if (previewSubscribe) return <SubscribePage />

  if (marketingPath === '/sign-in') return <SignInPage />
  return <IntroPage />
}
