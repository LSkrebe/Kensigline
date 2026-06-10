import { useCallback, useState } from 'react'
import { fetchJsonSafe, getBackendBase } from './api.js'
import { useAuth } from './AuthContext.jsx'
import { BILLING_PLANS, formatUsd, MONTHLY_PRICE_USD, YEARLY_SAVE_USD } from './billingPlans.js'
import { IntroReveal } from './IntroReveal.jsx'
import {
  PLAN_FEATURES,
  PRICING,
  SUBSCRIBE,
  SUBSCRIBE_FAQ,
} from './marketingContent.js'
import './IntroPage.css'
import './IntroPage.marketing.css'
import './SubscribePage.css'

export function SubscribePage() {
  const { user, signOut } = useAuth()
  const [selected, setSelected] = useState('yearly')
  const [checkoutMsg, setCheckoutMsg] = useState('')
  const [checkoutBusy, setCheckoutBusy] = useState(false)

  const email = user?.email?.trim() || null
  const selectedPlan = BILLING_PLANS.find((p) => p.id === selected) ?? BILLING_PLANS[1]

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
        `Cannot reach the API (${getBackendBase() || 'same origin'}/api). Check API_BASE_URL points at your live backend.`,
      )
    } else if (err === 'stripe_not_configured') {
      setCheckoutMsg('Billing is not configured on the server yet (STRIPE_SECRET_KEY / price IDs).')
    } else if (err === 'invalid_plan') {
      setCheckoutMsg('Unknown plan - check STRIPE_PRICE_ID_MONTHLY and STRIPE_PRICE_ID_YEARLY in .env.')
    } else if (res.status === 401) {
      setCheckoutMsg('Session expired - sign out and sign in again, then retry.')
    } else if (err === 'checkout_failed' && detail) {
      setCheckoutMsg(`Checkout failed: ${detail}`)
    } else {
      setCheckoutMsg(
        `Could not start checkout (HTTP ${res.status}${err ? `: ${err}` : ''}${detail ? ` - ${detail}` : ''}).`,
      )
    }
  }, [])

  const footerLabel =
    selected === 'yearly'
      ? `Continue · yearly · save ${formatUsd(YEARLY_SAVE_USD)}`
      : `Continue · ${formatUsd(MONTHLY_PRICE_USD)}/mo`

  return (
    <div className="introPage subscribePage">
      <header className="introNav">
        <div className="introNavInner">
          <a className="introBrand" href="/" aria-label="Mercerline home">
            <img className="introBrandLogo" src="/mercerline_logo_transparent.png" alt="" width={28} height={28} />
            <span className="introBrandName">MERCERLINE</span>
          </a>
          {email ? (
            <p className="subscribeNavEmail mono" title={email}>
              {email}
            </p>
          ) : null}
          <button type="button" className="introNavCta subscribeNavSignOut" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <main className="introMain subscribeMain">
        <section className="mktSubscribeHero introHero--enter">
          <p className="introEyebrow mono">{SUBSCRIBE.eyebrow}</p>
          <h1 className="mktHeroTitle mktSubscribeTitle">
            {SUBSCRIBE.headline}
            <br />
            <span className="introHeadlineAccent">{SUBSCRIBE.headlineAccent}</span>
          </h1>
          <p className="introLead mktSubscribeLead">{SUBSCRIBE.lead}</p>
          <p className="mktHeroReassurance mono dim">{SUBSCRIBE.reassurance}</p>
        </section>

        <IntroReveal as="section" className="introSection mktPricing subscribePricing" eager>
          <div className="mktPricingLayout">
            <div className="mktPricingHead">
              <p className="introSectionKicker mono">{PRICING.kicker}</p>
              <h2 className="introSectionTitle">{PRICING.title}</h2>
              <p className="introSectionLead mktPricingSub">{PRICING.sub}</p>
              <ul className="mktPricingFeatures">
                {PLAN_FEATURES.map((line) => (
                  <li key={line} className="mktPricingFeaturesItem">
                    <span className="mktPricingFeaturesMark" aria-hidden="true" />
                    {line}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mktPlanGrid mktPlanGrid--full">
              {BILLING_PLANS.map((plan) => {
                const isSelected = selected === plan.id
                return (
                  <article
                    key={plan.id}
                    className={[
                      'mktPlanCard',
                      plan.featured ? 'mktPlanCard--featured' : '',
                      isSelected ? 'subscribePlanCard--selected' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {plan.badge ? <span className="mktPlanBadge mono">{plan.badge}</span> : null}
                    <h3 className="mktPlanName">{plan.name}</h3>
                    <p className="mktPlanPrice">
                      <span className="mktPlanAmount">{formatUsd(plan.priceUsd)}</span>
                      <span className="mono mktPlanInterval">/{plan.intervalLabel}</span>
                    </p>
                    <p className="mktPlanNote mono dim">
                      {plan.id === 'yearly' ? PRICING.yearlyNote : PRICING.monthlyNote}
                    </p>
                    {plan.featured ? (
                      <p className="mktPlanHighlight mono">Recommended for full-time use</p>
                    ) : (
                      <p className="mktPlanHighlight mktPlanHighlight--spacer" aria-hidden="true">
                        &nbsp;
                      </p>
                    )}
                    <button
                      type="button"
                      className={`introBtn ${plan.featured ? 'introBtn--primary' : 'introBtn--ghost'} mktPlanBtn`}
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
          </div>

          {checkoutMsg ? (
            <p className="subscribeCheckoutMsg mono" role="alert">
              {checkoutMsg}
            </p>
          ) : null}

          <p className="mktPricingFoot mono dim">
            {formatUsd(YEARLY_SAVE_USD)} off yearly vs 12 monthly payments · Cancel anytime
          </p>
        </IntroReveal>

        <IntroReveal as="section" className="introSection mktFaq subscribeFaq" delay={20}>
          <p className="introSectionKicker mono">FAQ</p>
          <h2 className="introSectionTitle">Before you checkout</h2>
          <dl className="mktFaqList">
            {SUBSCRIBE_FAQ.map((item) => (
              <div key={item.q} className="mktFaqItem">
                <dt className="mktFaqQ">{item.q}</dt>
                <dd className="mktFaqA">{item.a}</dd>
              </div>
            ))}
          </dl>
        </IntroReveal>
      </main>

      <footer className="introFoot introFoot--bar" role="contentinfo">
        <div className="introFootInner">
          <span className="introFootNfa mono dim">Not investment advice</span>
          <button
            type="button"
            className="introBtn introBtn--primary introFootCta"
            disabled={checkoutBusy}
            onClick={() => void onCheckout(selectedPlan.id)}
          >
            {checkoutBusy ? 'Opening checkout…' : footerLabel}
          </button>
        </div>
      </footer>
    </div>
  )
}
