import { useCallback, useEffect, useRef, useState } from 'react'
import { AuthSignIn } from './AuthSignIn.jsx'
import { IntroReveal } from './IntroReveal.jsx'
import { IntroTerminalPreview } from './IntroTerminalPreview.jsx'
import { BILLING_PLANS, formatUsd, MONTHLY_PRICE_USD, YEARLY_SAVE_USD } from './billingPlans.js'
import {
  DATA_SOURCES,
  HERO,
  INTRO_FAQ,
  PLAN_FEATURES,
  PRICING,
  PROOF_POINTS,
  SHOWCASE_TABS,
} from './marketingContent.js'
import './IntroPage.css'
import './IntroPage.marketing.css'

const NAV_OFFSET = 72

export function IntroPage() {
  const [signInOpen, setSignInOpen] = useState(false)
  const pageRef = useRef(null)

  const openSignIn = useCallback(() => setSignInOpen(true), [])
  const closeSignIn = useCallback(() => setSignInOpen(false), [])

  const scrollToSection = useCallback((sectionId, e) => {
    e?.preventDefault()
    const scroller = pageRef.current
    const target = document.getElementById(sectionId)
    if (!scroller || !target) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const top =
      target.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop -
      NAV_OFFSET
    scroller.scrollTo({ top: Math.max(0, top), behavior: reduced ? 'instant' : 'smooth' })
    if (window.history?.pushState) window.history.pushState(null, '', `#${sectionId}`)
  }, [])

  const scrollToTop = useCallback((e) => {
    e?.preventDefault()
    pageRef.current?.scrollTo({ top: 0, behavior: 'auto' })
    if (window.history?.pushState) window.history.pushState(null, '', window.location.pathname)
  }, [])

  useEffect(() => {
    if (!signInOpen) return
    function onKeyDown(e) {
      if (e.key === 'Escape') closeSignIn()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [signInOpen, closeSignIn])

  return (
    <div ref={pageRef} className={['introPage', signInOpen ? 'introPage--modalOpen' : ''].filter(Boolean).join(' ')}>
      <header className="introNav">
        <div className="introNavInner">
          <a className="introBrand" href="/" aria-label="Mercerline home" onClick={scrollToTop}>
            <img className="introBrandLogo" src="/mercerline_logo_transparent.png" alt="" width={28} height={28} />
            <span className="introBrandName">MERCERLINE</span>
          </a>
          <nav className="introNavLinks mono" aria-label="On this page">
            <a href="#how" onClick={(e) => scrollToSection('how', e)}>
              How it works
            </a>
            <a href="#pricing" onClick={(e) => scrollToSection('pricing', e)}>
              Pricing
            </a>
            <a href="#faq" onClick={(e) => scrollToSection('faq', e)}>
              FAQ
            </a>
          </nav>
          <button type="button" className="introNavCta" onClick={openSignIn}>
            Sign in
          </button>
        </div>
      </header>

      <main className="introMain">
        <section className="mktHero introHero--enter">
          <div className="mktHeroCopy">
            <p className="introEyebrow mono">{HERO.eyebrow}</p>
            <h1 className="mktHeroTitle">
              {HERO.headline}
              <br />
              <span className="introHeadlineAccent">{HERO.headlineAccent}</span>
            </h1>
            <p className="introLead mktHeroLead">{HERO.lead}</p>
            <div className="introHeroActions mktHeroActions">
              <button type="button" className="introBtn introBtn--primary introBtn--lg" onClick={openSignIn}>
                {HERO.ctaPrimary}
              </button>
              <a className="introBtn introBtn--ghost" href="#how" onClick={(e) => scrollToSection('how', e)}>
                {HERO.ctaSecondary}
              </a>
            </div>
            <p className="mktHeroReassurance mono dim">{HERO.reassurance}</p>
          </div>

          <div className="mktHeroDemo">
            <IntroTerminalPreview staticResearch />
            <p className="mktHeroDemoHint mono dim">{DATA_SOURCES}</p>
          </div>
        </section>

        <IntroReveal as="section" id="how" className="introSection mktWorkflowSection" aria-labelledby="mkt-workflow-title">
          <div className="mktWorkflowHead">
            <p className="introSectionKicker mono">How it works</p>
            <h2 id="mkt-workflow-title" className="introSectionTitle">
              Scan. Build. Drill.
            </h2>
            <p className="introSectionLead mktWorkflowLead">
              Three tabs, one workflow - from macro week to Form 4 cluster, without leaving the grid.
            </p>
          </div>
          <ol className="mktWorkflowSteps">
            {SHOWCASE_TABS.map((tab) => (
              <li key={tab.id} className="mktWorkflowStep">
                <div className="mktWorkflowStepRail" aria-hidden="true">
                  <span className="mktWorkflowStepNum mono">{tab.step}</span>
                  <span className="mktWorkflowStepLine" />
                </div>
                <div className="mktWorkflowStepBody">
                  <p className="mktWorkflowStepLabel mono">{tab.label}</p>
                  <h3 className="mktWorkflowStepTitle">{tab.title}</h3>
                  <p className="mktWorkflowStepText">{tab.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </IntroReveal>

        <IntroReveal as="section" className="introSection mktProof" aria-labelledby="mkt-proof-title" delay={30}>
          <p className="introSectionKicker mono">Why Mercerline</p>
          <h2 id="mkt-proof-title" className="introSectionTitle">
            Built for catalyst process
          </h2>
          <ul className="mktProofGrid">
            {PROOF_POINTS.map((p) => (
              <li key={p.label} className="mktProofCard">
                <span className="mktProofStat mono">{p.stat}</span>
                <span className="mktProofLabel">{p.label}</span>
                <p className="mktProofDetail">{p.detail}</p>
              </li>
            ))}
          </ul>
        </IntroReveal>

        <IntroReveal as="section" id="pricing" className="introSection mktPricing" delay={40}>
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
              {BILLING_PLANS.map((plan) => (
                <article
                  key={plan.id}
                  className={['mktPlanCard', plan.featured ? 'mktPlanCard--featured' : ''].filter(Boolean).join(' ')}
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
                    onClick={openSignIn}
                  >
                    {plan.featured ? 'Start yearly' : 'Start monthly'}
                  </button>
                </article>
              ))}
            </div>
          </div>
          <p className="mktPricingFoot mono dim">
            {formatUsd(YEARLY_SAVE_USD)} off yearly vs 12 monthly payments · Cancel anytime
          </p>
        </IntroReveal>

        <IntroReveal as="section" id="faq" className="introSection mktFaq" delay={50}>
          <p className="introSectionKicker mono">FAQ</p>
          <h2 className="introSectionTitle">Common questions</h2>
          <dl className="mktFaqList">
            {INTRO_FAQ.map((item) => (
              <div key={item.q} className="mktFaqItem">
                <dt className="mktFaqQ">{item.q}</dt>
                <dd className="mktFaqA">{item.a}</dd>
              </div>
            ))}
          </dl>
        </IntroReveal>

        <IntroReveal as="section" className="introSection mktFinalCta" delay={20} eager>
          <div className="mktFinalCtaInner">
            <h2 className="mktFinalCtaTitle">Open the terminal</h2>
            <p className="mktFinalCtaSub mono dim">{HERO.rails}</p>
            <button type="button" className="introBtn introBtn--primary introBtn--lg" onClick={openSignIn}>
              {HERO.ctaPrimary}
            </button>
          </div>
        </IntroReveal>
      </main>

      {signInOpen ? (
        <div className="introModalBackdrop" onClick={closeSignIn}>
          <div
            className="introModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="intro-signin-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="introModalClose mono" onClick={closeSignIn} aria-label="Close sign in">
              ×
            </button>
            <h2 id="intro-signin-title" className="introModalTitle">
              Sign in to continue
            </h2>
            <p className="introModalLead mono dim">Create an account or sign in, then choose your plan.</p>
            <AuthSignIn variant="intro" onSuccess={closeSignIn} />
          </div>
        </div>
      ) : null}

      <footer className="introFoot introFoot--bar" role="contentinfo">
        <div className="introFootInner">
          <span className="introFootNfa mono dim">Not investment advice</span>
          {!signInOpen ? (
            <button type="button" className="introBtn introBtn--primary introFootCta" onClick={openSignIn}>
              Get access - {formatUsd(MONTHLY_PRICE_USD)}/mo
            </button>
          ) : null}
        </div>
      </footer>
    </div>
  )
}
