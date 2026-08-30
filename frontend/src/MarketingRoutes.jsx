import { useEffect } from 'react'
import { IntroPage } from './IntroPage.jsx'
import { SignInPage } from './SignInPage.jsx'
import { WaitlistPage } from './WaitlistPage.jsx'
import { PublicMarketingRoutes, isPublicMarketingPath } from './PublicMarketingRoutes.jsx'
import { navigateMarketing, useMarketingPath } from './marketingRoute.js'
import { useBillingPricing } from './useBillingPricing.js'

/** Logged-out marketing pages — single sales page at `/`. */
export default function MarketingRoutes() {
  const marketingPath = useMarketingPath()
  const pricing = useBillingPricing()
  const waitlist = pricing.waitlist

  useEffect(() => {
    const p = marketingPath.replace(/\/$/, '') || '/'
    if (!waitlist && p === '/waitlist') {
      navigateMarketing('/')
      return
    }
    if (!waitlist && (p === '/subscribe' || p === '/join')) {
      navigateMarketing(p === '/join' ? '/#pricing' : '/')
    }
    if (!waitlist) return
    if (p === '/sign-in' || p === '/subscribe' || p === '/join') {
      navigateMarketing('/waitlist')
    }
  }, [waitlist, marketingPath])

  if (isPublicMarketingPath(marketingPath)) {
    return <PublicMarketingRoutes path={marketingPath} />
  }
  if (!waitlist && marketingPath === '/sign-in') return <SignInPage />
  if (!waitlist && marketingPath === '/waitlist') return <IntroPage />
  if (marketingPath === '/waitlist') return <WaitlistPage />
  if (waitlist && (marketingPath === '/sign-in' || marketingPath === '/subscribe' || marketingPath === '/join')) {
    return <WaitlistPage />
  }
  return <IntroPage />
}
