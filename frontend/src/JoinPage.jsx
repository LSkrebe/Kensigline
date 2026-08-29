import { useEffect } from 'react'
import { useAuth } from './AuthContext.jsx'
import { formatUsd } from './billingPlans.js'
import { captureReferralRef } from './referralRef.js'
import { WhopCheckoutPanel } from './WhopCheckoutPanel.jsx'
import { useBillingPricing } from './useBillingPricing.js'
import { navigateMarketing } from './marketingRoute.js'
import { applyPageMeta } from './pageMeta.js'
import { pageBackgroundStyle } from './pageBackgrounds.js'
import { markAppReady } from './marketingShell.js'
import './IntroPage.marketing.css'
import './SubscribePage.css'

const JOIN_META = {
  title: 'Join Mercerline',
  description: 'Subscribe to Mercerline — insider, politician, and fund filing intelligence.',
  path: '/join',
}

export function JoinPage() {
  const { user, configured, loading } = useAuth()
  const pricing = useBillingPricing()
  const signedIn = Boolean(configured && user)
  const ref = captureReferralRef()

  useEffect(() => {
    applyPageMeta(JOIN_META)
    markAppReady()
  }, [])

  if (pricing.waitlist) {
    return null
  }

  return (
    <div className="lp subPage" style={pageBackgroundStyle('subscribe')}>
      <header className="lpNav">
        <div className="lpNavInner">
          <a className="lpBrand" href="/" aria-label="Mercerline home">
            <span className="lpBrandLogoClip">
              <img className="lpBrandLogo" src="/mercerline_mark.png" alt="" width={44} height={32} decoding="async" />
            </span>
            <span className="lpBrandName">MERCERLINE</span>
          </a>
          <span className="subSpacer" />
          {!signedIn ? (
            <button type="button" className="lpNavCta" onClick={() => navigateMarketing('/sign-in')}>
              Sign in
            </button>
          ) : null}
        </div>
      </header>

      <main className="subMain">
        <section className="subHero">
          <p className="lpEyebrow">Join</p>
          <h1 className="subTitle">Get access to Mercerline</h1>
          <p className="subLead">
            {pricing.founders
              ? `Founders pricing — ${formatUsd(pricing.monthlyUsd)}/mo or ${formatUsd(pricing.yearlyUsd)}/yr.`
              : `${formatUsd(pricing.monthlyUsd)}/mo or ${formatUsd(pricing.yearlyUsd)}/yr.`}
          </p>
          {ref ? <p className="lpFinePrint mono">Ref {ref}</p> : null}

          {!signedIn && !loading ? (
            <button type="button" className="lpBtn lpBtn--primary" onClick={() => navigateMarketing('/sign-in')}>
              Sign in to checkout
            </button>
          ) : null}

          {signedIn ? (
            <div className="joinCheckoutBlock">
              <WhopCheckoutPanel selectedPlan="yearly" userEmail={user?.email ?? null} />
            </div>
          ) : null}
        </section>
      </main>
    </div>
  )
}
