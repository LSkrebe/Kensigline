import { useEffect } from 'react'
import { IntroPage } from './IntroPage.jsx'
import { SignInPage } from './SignInPage.jsx'
import { WaitlistPage } from './WaitlistPage.jsx'
import { PublicCompanyPage } from './PublicCompanyPage.jsx'
import { navigateMarketing, useMarketingPath } from './marketingRoute.js'
import { matchPublicCompanyPath } from './publicCompany.js'
import { useBillingPricing } from './useBillingPricing.js'

/** Logged-out marketing pages - terminal bundle loads only after sign-in + active subscription. */
export default function MarketingRoutes() {
  const marketingPath = useMarketingPath()
  const pricing = useBillingPricing()
  const waitlist = pricing.waitlist
  const publicCompany = matchPublicCompanyPath(marketingPath)

  useEffect(() => {
    if (!waitlist) return
    const p = marketingPath.replace(/\/$/, '') || '/'
    if (p === '/sign-in' || p === '/subscribe') {
      navigateMarketing('/waitlist')
    }
  }, [waitlist, marketingPath])

  if (publicCompany) return <PublicCompanyPage ticker={publicCompany.ticker} />
  if (marketingPath === '/waitlist') return <WaitlistPage />
  if (waitlist && (marketingPath === '/sign-in' || marketingPath === '/subscribe')) {
    return <WaitlistPage />
  }
  if (marketingPath === '/sign-in') return <SignInPage />
  return <IntroPage />
}
