import { useCallback, useEffect, useState } from 'react'
import { fetchJsonSafe, getBackendBase } from './api.js'
import { useAuth } from './AuthContext.jsx'
import { BILLING_PLANS, formatUsd, MONTHLY_PRICE_USD, YEARLY_SAVE_USD } from './billingPlans.js'
import { IntroReveal } from './IntroReveal.jsx'
import {
  PLAN_FEATURES,
  PRICING,
  SUBSCRIBE,
  SUBSCRIBE_FAQ,
  SUBSCRIBE_FOOTER,
  SUBSCRIBE_PAGE_META,
} from './marketingContent.js'
import { navigateMarketing, returnToIntroAfterSignOut } from './marketingRoute.js'
import { applyPageMeta } from './pageMeta.js'
import { markAppReady } from './marketingShell.js'
import './IntroPage.css'
import './IntroPage.marketing.css'
import './SubscribePage.css'

const NAV_OFFSET = 72

export function SubscribePage() {
  const { user, signOut } = useAuth()
  const [selected, setSelected] = useState('yearly')
  const [checkoutMsg, setCheckoutMsg] = useState('')
  const [checkoutBusy, setCheckoutBusy] = useState(false)

  const email = user?.email?.trim() || null

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

  const onSignOut = useCallback(async () => {
    const { error } = await signOut()
    if (error) return
    returnToIntroAfterSignOut()
  }, [signOut])

  const onFooterLink = useCallback((link, e) => {
    e.preventDefault()
    const href = link.href
    if (href === '/' || href.startsWith('/#')) {
      navigateMarketing(href)
      return
    }
    if (!href.startsWith('#')) return
    const scroller = document.querySelector('.subscribePage')
    const target = document.getElementById(href.slice(1))
    if (!scroller || !target) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const top =
      target.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop -
      NAV_OFFSET
    scroller.scrollTo({ top: Math.max(0, top), behavior: reduced ? 'instant' : 'smooth' })
    if (window.history?.replaceState) window.history.replaceState(null, '', href)
  }, [])

  return (
    <div className="introPage subscribePage introPage--marketingChrome">
      <header className="introNav mktEnterNav">
        <div className="introNavInner">
          <a className="introBrand" href="/" aria-label="Mercerline home">
            <img className="introBrandLogo" src="/mercerline_logo.png" alt="" width={28} height={28} />
            <span className="introBrandName">MERCERLINE</span>
          </a>
          {email ? (
            <p className="subscribeNavEmail mono" title={email}>
              {email}
            </p>
          ) : null}
          {user ? (
            <button
              type="button"
              className="introNavAction introNavCta subscribeNavSignOut"
              onClick={() => void onSignOut()}
            >
              Sign out
            </button>
          ) : null}
        </div>
      </header>

      <main className="introMain subscribeMain">
        <section className="mktSubscribeHero">
          <p className="introEyebrow mono mktEnterSeq mktEnterSeq--1">{SUBSCRIBE.eyebrow}</p>
          <h1 className="mktHeroTitle mktSubscribeTitle mktEnterSeq mktEnterSeq--2">
            {SUBSCRIBE.headline}
            <br />
            <span className="introHeadlineAccent">{SUBSCRIBE.headlineAccent}</span>
          </h1>
          <p className="introLead mktSubscribeLead mktEnterSeq mktEnterSeq--3">{SUBSCRIBE.lead}</p>
          <p className="mktHeroReassurance mono dim mktEnterSeq mktEnterSeq--4">{SUBSCRIBE.reassurance}</p>
        </section>

        <section
          id="subscribe-pricing"
          className="introSection mktPricing subscribePricing mktEnterSeq mktEnterSeq--5"
        >
          <div className="mktPricingLayout">
            <div className="mktPricingHead">
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
                      {(plan.id === 'yearly' ? PRICING.yearlyNoteLines : PRICING.monthlyNoteLines).map((line) => (
                        <span key={line} className="mktPlanNoteLine">
                          {line}
                        </span>
                      ))}
                    </p>
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
        </section>

        <IntroReveal as="section" id="subscribe-faq" className="introSection mktFaq subscribeFaq" delay={20}>
          <div className="mktSectionHead">
            <p className="introSectionKicker mono">FAQ</p>
            <h2 className="introSectionTitle">Before you checkout</h2>
          </div>
          <div className="mktFaqList">
            {SUBSCRIBE_FAQ.map((item) => (
              <article key={item.q} className="mktFaqItem">
                <h3 className="mktFaqQ">{item.q}</h3>
                <p className="mktFaqA">{item.a}</p>
              </article>
            ))}
          </div>
        </IntroReveal>
      </main>

      <footer className="introFoot introFoot--bar" role="contentinfo">
        <div className="introFootInner introFootInner--marketing">
          <div className="introFootMeta">
            <span className="introFootNfa mono dim">{SUBSCRIBE_FOOTER.nfa}</span>
            <p className="introFootTagline">{SUBSCRIBE_FOOTER.tagline}</p>
          </div>
          <nav className="introFootNav mono" aria-label="Footer">
            {SUBSCRIBE_FOOTER.links.map((link) => (
              <a
                key={link.id}
                className="introFootNavLink"
                href={link.href}
                onClick={(e) => onFooterLink(link, e)}
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  )
}
