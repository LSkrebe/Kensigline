import { useCallback, useEffect, useState } from 'react'
import { fetchJsonSafe, getBackendBase } from './api.js'
import { useAuth } from './AuthContext.jsx'
import { BILLING_PLANS, formatUsd, YEARLY_SAVE_USD } from './billingPlans.js'
import { IntroTerminalPreview } from './IntroTerminalPreview.jsx'
import {
  PLAN_FEATURES,
  PRICING,
  SUBSCRIBE,
  SUBSCRIBE_FAQ,
  SUBSCRIBE_FOOTER,
  SUBSCRIBE_PAGE_META,
  SUBSCRIBE_PREVIEW,
} from './marketingContent.js'
import { returnToIntroAfterSignOut } from './marketingRoute.js'
import { applyPageMeta } from './pageMeta.js'
import { markAppReady } from './marketingShell.js'
import './IntroPage.marketing.css'
import './SubscribePage.css'

export function SubscribePage() {
  const { user, signOut } = useAuth()
  const [selected, setSelected] = useState('yearly')
  const [checkoutMsg, setCheckoutMsg] = useState('')
  const [checkoutBusy, setCheckoutBusy] = useState(false)

  useEffect(() => {
    applyPageMeta(SUBSCRIBE_PAGE_META)
    markAppReady()
  }, [])

  const onCheckout = useCallback(async (planId) => {
    setSelected(planId)
    setCheckoutMsg('')
    setCheckoutBusy(true)
    try {
      sessionStorage.setItem('mercerline_checkout_plan', planId)
    } catch {
      /* ignore */
    }
    const res = await fetchJsonSafe('/api/billing/checkout', {
      method: 'POST',
      body: { plan: planId },
      timeoutMs: 20000,
    })
    setCheckoutBusy(false)
    if (res.ok && res.data?.url) {
      window.location.href = res.data.url
      return
    }
    const err = res.data?.error
    const detail = res.data?.message
    if (res.status === 0 || err === 'network_error') {
      setCheckoutMsg(
        `Cannot reach the API (${getBackendBase() || 'same origin'}/api). Check API_BASE_URL.`,
      )
    } else if (err === 'stripe_not_configured') {
      setCheckoutMsg('Billing is not configured yet.')
    } else if (err === 'invalid_plan') {
      setCheckoutMsg('Unknown plan.')
    } else if (res.status === 401) {
      setCheckoutMsg('Session expired — sign in again.')
    } else if (err === 'checkout_failed' && detail) {
      setCheckoutMsg(`Checkout failed: ${detail}`)
    } else {
      setCheckoutMsg(`Could not start checkout (HTTP ${res.status}${err ? `: ${err}` : ''}).`)
    }
  }, [])

  const onSignOut = useCallback(async () => {
    const { error } = await signOut()
    if (error) return
    returnToIntroAfterSignOut()
  }, [signOut])

  return (
    <div className="lp subPage">
      <header className="lpNav">
        <div className="lpNavInner">
          <a className="lpBrand" href="/" aria-label="Mercerline home">
            <span className="lpBrandLogoClip">
              <img className="lpBrandLogo" src="/mercerline_mark.png" alt="" width={44} height={32} decoding="async" />
            </span>
            <span className="lpBrandName">MERCERLINE</span>
          </a>
          <span className="subSpacer" />
          {user ? (
            <button type="button" className="lpNavCta" onClick={() => void onSignOut()}>
              Sign out
            </button>
          ) : null}
        </div>
      </header>

      <main className="subMain">
        <section id="subscribe-pricing" className="subHero">
          <p className="lpEyebrow">{SUBSCRIBE.eyebrow}</p>
          <h1 className="subTitle">{SUBSCRIBE.headline}</h1>
          <p className="subLead">{SUBSCRIBE.lead}</p>
          <p className="lpHeroNote">{SUBSCRIBE.reassurance}</p>

          <ul className="lpInclude">
            {PLAN_FEATURES.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <div className="lpPlans">
            {BILLING_PLANS.map((plan) => {
              const isSelected = selected === plan.id
              return (
                <article
                  key={plan.id}
                  className={[
                    'lpPlan',
                    plan.featured ? 'lpPlan--featured' : '',
                    isSelected ? 'lpPlan--selected' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <h2 className="lpPlanName">{plan.name}</h2>
                  <p className="lpPlanPrice">
                    {plan.listPriceUsd ? (
                      <span className="lpPlanListPrice">{formatUsd(plan.listPriceUsd)}</span>
                    ) : null}
                    <span className="lpPlanAmount">{formatUsd(plan.priceUsd)}</span>
                    <span className="lpPlanInterval">/{plan.intervalLabel}</span>
                  </p>
                  <p className="lpPlanNote">
                    {plan.id === 'yearly' ? PRICING.yearlyNote : PRICING.monthlyNote}
                  </p>
                  <button
                    type="button"
                    className={`lpBtn ${plan.featured ? 'lpBtn--primary' : 'lpBtn--ghost'} lpPlanCta`}
                    disabled={checkoutBusy}
                    onClick={() => void onCheckout(plan.id)}
                  >
                    {checkoutBusy && isSelected
                      ? 'Opening checkout…'
                      : plan.featured
                        ? 'Continue with yearly'
                        : 'Continue with monthly'}
                  </button>
                </article>
              )
            })}
          </div>
          {checkoutMsg ? (
            <p className="subError" role="alert">
              {checkoutMsg}
            </p>
          ) : null}
          <p className="lpFinePrint">Save {formatUsd(YEARLY_SAVE_USD)} on yearly. Cancel anytime.</p>
        </section>

        <section className="lpSection subPreview" aria-label="Product preview">
          <div className="lpSectionHead">
            <p className="lpEyebrow">{SUBSCRIBE_PREVIEW.kicker}</p>
            <h2 className="lpSectionTitle">{SUBSCRIBE_PREVIEW.title}</h2>
            <p className="lpSectionLead">{SUBSCRIBE_PREVIEW.lead}</p>
          </div>
          <ul className="lpPillars">
            {SUBSCRIBE_PREVIEW.pillars.map((p) => (
              <li key={p.id} className="lpPillar">
                <h3 className="lpPillarTitle">{p.title}</h3>
                <p className="lpPillarBody">{p.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="lpShot" aria-label="Investors directory preview">
          <div className="lpShotFrame">
            <IntroTerminalPreview shot="investorsDirectory" staticResearch />
          </div>
        </section>

        <section id="subscribe-faq" className="lpSection">
          <div className="lpSectionHead">
            <p className="lpEyebrow">FAQ</p>
            <h2 className="lpSectionTitle">Before you checkout</h2>
          </div>
          <div className="lpFaq">
            {SUBSCRIBE_FAQ.map((item) => (
              <article key={item.q} className="lpFaqItem">
                <h3 className="lpFaqQ">{item.q}</h3>
                <p className="lpFaqA">{item.a}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="lpFoot" role="contentinfo">
        <div className="lpFootInner">
          <div className="lpFootCopy">
            <p className="lpFootNfa">{SUBSCRIBE_FOOTER.nfa}</p>
            <p className="lpFootTag">{SUBSCRIBE_FOOTER.tagline}</p>
          </div>
          <button type="button" className="lpFootCta" onClick={() => void onSignOut()}>
            Sign out
          </button>
        </div>
      </footer>
    </div>
  )
}
