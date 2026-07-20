import { IntroPage } from './IntroPage.jsx'
import { SignInPage } from './SignInPage.jsx'
import { useMarketingPath } from './marketingRoute.js'

/** Logged-out marketing pages - terminal bundle loads only after sign-in + active subscription. */
export default function MarketingRoutes() {
  const marketingPath = useMarketingPath()
  if (marketingPath === '/sign-in') return <SignInPage />
  return <IntroPage />
}
