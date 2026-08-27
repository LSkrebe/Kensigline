import { useCallback, useEffect, useState } from 'react'
import { WhopCheckoutPanel } from './WhopCheckoutPanel.jsx'
import { useAuth } from './AuthContext.jsx'
import { formatUsd } from './billingPlans.js'
import { IntroTerminalPreview } from './IntroTerminalPreview.jsx'
import {
  SUBSCRIBE_FEATURES,
  subscribeCopy,
  subscribeFaq,
  SUBSCRIBE_FOOTER,
  subscribePageMeta,
  SUBSCRIBE_PREVIEW,
} from './marketingContent.js'
import { returnToIntroAfterSignOut } from './marketingRoute.js'
import { applyPageMeta } from './pageMeta.js'
import { markAppReady } from './marketingShell.js'
import { useBillingPricing } from './useBillingPricing.js'
import './IntroPage.marketing.css'
import './SubscribePage.css'

export function SubscribePage() {
  const { user, signOut } = useAuth()
  const pricing = useBillingPricing()
  const plans = pricing.plans
  const copy = subscribeCopy(pricing)
  const faq = subscribeFaq(pricing)
  const [selected, setSelected] = useState('yearly')
  const [checkoutMsg, setCheckoutMsg] = useState('')

  useEffect(() => {
    applyPageMeta(subscribePageMeta(pricing))
    markAppReady()
  }, [pricing])

  const onSelectPlan = useCallback((planId) => {
    setSelected(planId)
    setCheckoutMsg('')
    try {
      sessionStorage.setItem('mercerline_checkout_plan', planId)
    } catch {
      /* ignore */
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
        <section
          id="subscribe-pricing"
          className={['subHero', pricing.founders ? 'subHero--founders' : ''].filter(Boolean).join(' ')}
        >
          {copy.eyebrow ? <p className="lpEyebrow">{copy.eyebrow}</p> : null}
          <h1 className="subTitle">{copy.headline}</h1>
          {copy.lead ? <p className="subLead">{copy.lead}</p> : null}
          {copy.reassurance ? (
            <p
              className={['lpHeroNote', pricing.founders ? 'lpHeroNote--accent' : '']
                .filter(Boolean)
                .join(' ')}
            >
              {copy.reassurance}
            </p>
          ) : null}

          <ul className="lpSourceList subFeaturesList" aria-label="Included with either plan">
            {SUBSCRIBE_FEATURES.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>

          <div className="lpPlans">
            {plans.map((plan) => {
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
                  <button
                    type="button"
                    className={`lpBtn ${plan.featured ? 'lpBtn--primary' : 'lpBtn--ghost'} lpPlanCta`}
                    onClick={() => onSelectPlan(plan.id)}
                  >
                    {isSelected
                      ? 'Selected'
                      : plan.featured
                        ? 'Choose yearly'
                        : 'Choose monthly'}
                  </button>
                </article>
              )
            })}
          </div>
          <WhopCheckoutPanel
            selectedPlan={selected}
            userEmail={user?.email ?? null}
            onError={setCheckoutMsg}
            startLabel={copy.checkoutCta}
          />
          {checkoutMsg ? (
            <p className="subError" role="alert">
              {checkoutMsg}
            </p>
          ) : null}
          <p className={pricing.founders ? 'lpFinePrint subFoundersFine' : 'lpFinePrint'}>
            {pricing.founders
              ? 'This limited-time offer ends when early access closes'
              : `Save ${formatUsd(pricing.yearlySaveUsd)} on yearly. Cancel anytime.`}
          </p>
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
            {faq.map((item) => (
              <article key={item.q} className="lpFaqItem">
                <h3 className="lpFaqQ">{item.q}</h3>
                <p className="lpFaqA">{item.a}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="lpFoot" role="contentinfo">
        <div className="lpFootInner lpFootInner--legal">
          <p className="lpFootLine">{SUBSCRIBE_FOOTER.line}</p>
          <p className="lpFootLegalText">
            <span className="lpFootLegalLabel">Terms</span> {SUBSCRIBE_FOOTER.terms}
          </p>
          <p className="lpFootLegalText">
            <span className="lpFootLegalLabel">Privacy</span> {SUBSCRIBE_FOOTER.privacy}
          </p>
          <p className="lpFootLegalText">
            <span className="lpFootLegalLabel">IP / DMCA</span> {SUBSCRIBE_FOOTER.ip}
          </p>
        </div>
      </footer>
    </div>
  )
}
