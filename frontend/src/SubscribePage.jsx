import { useCallback, useState } from 'react'
import { fetchJsonSafe, getBackendBase } from './api.js'
import { useAuth } from './AuthContext.jsx'
import { BILLING_PLANS, formatUsd, MONTHLY_PRICE_USD, YEARLY_LIST_USD, YEARLY_SAVE_USD } from './billingPlans.js'
import { IntroReveal } from './IntroReveal.jsx'
import './IntroPage.css'
import './SubscribePage.css'

const INCLUDED = [
  'Research, Insiders, Pharma & Politicians rails',
  'Bosha catalyst papers & case worksheets',
  'Historical outcomes on similar setups',
  'Insider clusters with filing context',
  'Exportable research — built for event-driven names',
]

const TRUST = [
  { label: 'Cancel anytime', body: 'Self-serve from billing settings once Stripe is live.' },
  { label: 'Secure checkout', body: 'Card handled by Stripe — never stored on our servers.' },
  { label: 'Full terminal access', body: 'One subscription unlocks every workspace tab.' },
]

const FAQ = [
  {
    q: 'Can I switch between monthly and yearly?',
    a: 'Yes. You can change plans from billing settings after checkout is connected.',
  },
  {
    q: 'Is this investment advice?',
    a: 'No. Mercerline is a research workspace only.',
  },
  {
    q: 'What happens after I subscribe?',
    a: 'You go straight into the terminal with live feeds when your API is connected.',
  },
]

export function SubscribePage() {
  const { user, signOut } = useAuth()
  const [selected, setSelected] = useState('yearly')
  const [checkoutMsg, setCheckoutMsg] = useState('')
  const [checkoutBusy, setCheckoutBusy] = useState(false)

  const email = user?.email ?? 'Signed in'

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
        `Cannot reach the API (${getBackendBase() || 'same origin'}/api). Run npm run dev locally, or set API_BASE_URL to your live API when deploying.`,
      )
    } else if (err === 'stripe_not_configured') {
      setCheckoutMsg('Billing is not configured on the server yet (STRIPE_SECRET_KEY / price IDs).')
    } else if (err === 'invalid_plan') {
      setCheckoutMsg('Unknown plan — check STRIPE_PRICE_ID_MONTHLY and STRIPE_PRICE_ID_YEARLY in .env.')
    } else if (res.status === 401) {
      setCheckoutMsg('Session expired — sign out and sign in again, then retry.')
    } else if (err === 'checkout_failed' && detail) {
      setCheckoutMsg(`Checkout failed: ${detail}`)
    } else {
      setCheckoutMsg(
        `Could not start checkout (HTTP ${res.status}${err ? `: ${err}` : ''}${detail ? ` — ${detail}` : ''}).`,
      )
    }
  }, [])

  return (
    <div className="introPage subscribePage">
      <header className="introNav">
        <div className="introNavInner">
          <div className="introBrand" aria-label="Mercerline">
            <img className="introBrandLogo" src="/mercerline_logo_transparent.png" alt="" width={28} height={28} />
            <span className="introBrandName">MERCERLINE</span>
          </div>
          <p className="subscribeNavEmail mono" title={email}>
            {email}
          </p>
          <button type="button" className="introNavCta subscribeNavSignOut" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <main className="introMain">
        <section className="introHero introHero--enter subscribeHero">
          <p className="introEyebrow mono">One step left</p>
          <h1 className="introHeadline subscribeHeadline">
            Unlock the
            <br />
            <span className="introHeadlineAccent">full terminal</span>
          </h1>
          <p className="introLead subscribeLead">
            You are in. Choose a plan to access Research, Insiders, Pharma, Politicians, outcomes, and Bosha papers in
            one grid.
          </p>
        </section>

        <IntroReveal as="section" className="introSection subscribePricing" delay={30}>
          <div className="introSectionHead subscribePricingHead">
            <p className="introSectionKicker mono">Pricing</p>
            <h2 className="introSectionTitle">Pick how you want to pay</h2>
            <p className="introSectionLead introSectionLead--wide">
              Yearly is the best value — {formatUsd(YEARLY_SAVE_USD)} less than {formatUsd(MONTHLY_PRICE_USD)}/mo × 12.
              Most members choose annual.
            </p>
          </div>

          <div className="subscribePlanGrid" role="list">
            {BILLING_PLANS.map((plan) => {
              const isSelected = selected === plan.id
              return (
                <article
                  key={plan.id}
                  role="listitem"
                  className={[
                    'subscribePlanCard',
                    plan.featured ? 'subscribePlanCard--featured' : '',
                    isSelected ? 'subscribePlanCard--selected' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {plan.badge ? (
                    <span className="subscribePlanBadge mono">{plan.badge}</span>
                  ) : (
                    <span className="subscribePlanBadge subscribePlanBadge--spacer" aria-hidden="true" />
                  )}
                  <h3 className="subscribePlanName">{plan.name}</h3>
                  <p className="subscribePlanPrice">
                    <span className="subscribePlanAmount">{formatUsd(plan.priceUsd)}</span>
                    <span className="subscribePlanInterval mono">/{plan.intervalLabel}</span>
                  </p>
                  {plan.id === 'yearly' ? (
                    <p className="subscribePlanCompare mono">
                      <s>{formatUsd(YEARLY_LIST_USD)}/yr</s> list
                    </p>
                  ) : (
                    <p className="subscribePlanCompare mono subscribePlanCompare--muted">
                      Flexible month to month
                    </p>
                  )}
                  <p className="subscribePlanNote">{plan.billedNote}</p>
                  <ul className="subscribePlanBullets">
                    {INCLUDED.slice(0, 3).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className={`introBtn ${plan.featured ? 'introBtn--primary' : 'introBtn--ghost'} subscribePlanBtn`}
                    disabled={checkoutBusy}
                    onClick={() => void onCheckout(plan.id)}
                  >
                    {checkoutBusy ? 'Opening checkout…' : plan.featured ? 'Start yearly' : 'Start monthly'}
                  </button>
                </article>
              )
            })}
          </div>

          {checkoutMsg ? (
            <p className="subscribeCheckoutMsg mono" role="status">
              {checkoutMsg}
            </p>
          ) : null}
        </IntroReveal>

        <IntroReveal as="section" className="introSection subscribeIncluded" delay={50}>
          <p className="introSectionKicker mono">Included</p>
          <h2 className="introSectionTitle">Everything in one subscription</h2>
          <ul className="subscribeIncludedList">
            {INCLUDED.map((line) => (
              <li key={line} className="subscribeIncludedItem">
                <span className="subscribeIncludedMark" aria-hidden="true" />
                {line}
              </li>
            ))}
          </ul>
        </IntroReveal>

        <IntroReveal as="section" className="introSection subscribeTrust" delay={40}>
          <div className="subscribeTrustGrid">
            {TRUST.map((t) => (
              <div key={t.label} className="subscribeTrustCell">
                <h3 className="subscribeTrustLabel">{t.label}</h3>
                <p className="subscribeTrustBody">{t.body}</p>
              </div>
            ))}
          </div>
        </IntroReveal>

        <IntroReveal as="section" className="introSection subscribeFaq" aria-labelledby="subscribe-faq-title" delay={40}>
          <p className="introSectionKicker mono">FAQ</p>
          <h2 id="subscribe-faq-title" className="introSectionTitle">
            Quick answers
          </h2>
          <ul className="introFaqList subscribeFaqList">
            {FAQ.map((item) => (
              <li key={item.q} className="introFaqCell">
                <p className="introFaqQ">{item.q}</p>
                <p className="introFaqA">{item.a}</p>
              </li>
            ))}
          </ul>
        </IntroReveal>

        <section className="introSection introCtaBand subscribeBottomCta">
          <div className="introCtaInner">
            <div className="introCtaRule" aria-hidden="true" />
            <div className="introCtaCopy">
              <h2 className="introCtaTitle">
                Ready when
                <span className="introCtaTitleAccent"> you are</span>
              </h2>
              <p className="introCtaRails mono">Yearly · {formatUsd(YEARLY_SAVE_USD)} off vs monthly × 12</p>
              <button
                type="button"
                className="introBtn introBtn--primary introCtaBtn"
                disabled={checkoutBusy}
                onClick={() => void onCheckout('yearly')}
              >
                {checkoutBusy ? 'Opening checkout…' : 'Continue with yearly'}
              </button>
            </div>
            <div className="introCtaRule" aria-hidden="true" />
          </div>
        </section>
      </main>
    </div>
  )
}
