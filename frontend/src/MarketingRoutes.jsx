import { IntroPage } from './IntroPage.jsx'
import { SignInPage } from './SignInPage.jsx'
import { PublicCompanyPage } from './PublicCompanyPage.jsx'
import { useMarketingPath } from './marketingRoute.js'
import { matchPublicCompanyPath } from './publicCompany.js'

/** Logged-out marketing pages - terminal bundle loads only after sign-in + active subscription. */
export default function MarketingRoutes() {
  const marketingPath = useMarketingPath()
  const publicCompany = matchPublicCompanyPath(marketingPath)
  if (publicCompany) return <PublicCompanyPage ticker={publicCompany.ticker} />
  if (marketingPath === '/sign-in') return <SignInPage />
  return <IntroPage />
}
