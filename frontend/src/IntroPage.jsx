import { useCallback, useEffect, useRef } from 'react'
import { IntroReveal } from './IntroReveal.jsx'
import { IntroTerminalPreview } from './IntroTerminalPreview.jsx'
import { BILLING_PLANS, formatUsd, MONTHLY_PRICE_USD, YEARLY_SAVE_USD } from './billingPlans.js'
import {
  DATA_SOURCES,
  HERO,
  INTRO_FAQ,
  INTRO_FOOTER,
  INTRO_PAGE_META,
  PLAN_FEATURES,
  PRICING,
  PROOF_POINTS,
  SHOWCASE_TABS,
  WORKFLOW,
} from './marketingContent.js'
import { navigateMarketing } from './marketingRoute.js'
import { applyPageMeta } from './pageMeta.js'
import { markAppReady } from './marketingShell.js'
import './IntroPage.css'
import './IntroPage.marketing.css'

const NAV_OFFSET = 72

export function IntroPage() {
  const pageRef = useRef(null)

  const goToSignIn = useCallback((e) => {
    e?.preventDefault()
    navigateMarketing('/sign-in')
  }, [])

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
    applyPageMeta(INTRO_PAGE_META)
    markAppReady()

    const schema = {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Mercerline',
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      description: INTRO_PAGE_META.description,
      offers: {
        '@type': 'Offer',
        price: String(MONTHLY_PRICE_USD),
        priceCurrency: 'USD',
      },
    }

    let el = document.head.querySelector('script[data-intro-schema]')
    if (!el) {
      el = document.createElement('script')
      el.setAttribute('type', 'application/ld+json')
      el.setAttribute('data-intro-schema', 'true')
      document.head.appendChild(el)
    }
    el.textContent = JSON.stringify(schema)

    return () => {
      el?.remove()
    }
  }, [])

  return (
    <div ref={pageRef} className="introPage introPage--marketingChrome">
      <header className="introNav mktEnterNav">
        <div className="introNavInner">
          <a className="introBrand" href="/" aria-label="Mercerline home" onClick={scrollToTop}>
            <img className="introBrandLogo" src="/mercerline_yt.png" alt="" width={28} height={28} />
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
          <a className="introNavAction introNavCta" href="/sign-in" onClick={goToSignIn}>
            Sign in
          </a>
        </div>
      </header>

      <main className="introMain">
        <section className="mktHero">
          <div className="mktHeroCopy">
            <p className="introEyebrow mono mktEnterSeq mktEnterSeq--1">{HERO.eyebrow}</p>
            <h1 className="mktHeroTitle mktEnterSeq mktEnterSeq--2">
              Event-driven research terminal
              <span className="introHeadlineAccent"> for the catalyst trade.</span>
            </h1>
            <p className="introLead mktHeroLead mktEnterSeq mktEnterSeq--3">{HERO.lead}</p>
            <div className="introHeroActions mktHeroActions mktEnterSeq mktEnterSeq--4">
              <a className="introBtn introBtn--primary introBtn--lg" href="/sign-in" onClick={goToSignIn}>
                {HERO.ctaPrimary}
              </a>
              <a className="introBtn introBtn--ghost" href="#how" onClick={(e) => scrollToSection('how', e)}>
                {HERO.ctaSecondary}
              </a>
            </div>
            <p className="mktHeroReassurance mono dim mktEnterSeq mktEnterSeq--5">{HERO.reassurance}</p>
          </div>

          <div className="mktHeroDemo">
            <IntroTerminalPreview staticResearch />
            <p className="mktHeroDemoHint mono dim">{DATA_SOURCES}</p>
          </div>
        </section>

        <IntroReveal
          as="section"
          id="how"
          revealKey="intro-how"
          className="introSection mktWorkflowSection"
          aria-labelledby="mkt-workflow-title"
        >
          <div className="mktWorkflowHead">
            <p className="introSectionKicker mono">{WORKFLOW.kicker}</p>
            <h2 id="mkt-workflow-title" className="introSectionTitle">
              {WORKFLOW.title}
            </h2>
            <p className="introSectionLead mktWorkflowLead">{WORKFLOW.lead}</p>
          </div>
          <ol className="mktWorkflowSteps">
            {SHOWCASE_TABS.map((tab) => (
              <li key={tab.id} className="mktWorkflowStep">
                <p className="mktWorkflowStepKicker mono">
                  <span className="mktWorkflowStepNum">{tab.step}</span>
                  <span className="mktWorkflowStepLabel">{tab.label}</span>
                </p>
                <h3 className="mktWorkflowStepTitle">{tab.title}</h3>
                <div className="mktWorkflowStepText">
                  {tab.bodyLines.map((line) => (
                    <p key={line} className="mktWorkflowStepTextLine">
                      {line}
                    </p>
                  ))}
                  {tab.bullets?.length ? (
                    <p className="mktWorkflowStepTextLine mktWorkflowStepBullets">{tab.bullets.join(' · ')}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          <p className="mktWorkflowSources mono dim">{DATA_SOURCES}</p>
        </IntroReveal>

        <IntroReveal as="section" className="introSection mktProof" revealKey="intro-proof" aria-labelledby="mkt-proof-title" delay={30}>
          <div className="mktSectionHead">
            <p className="introSectionKicker mono">Why Mercerline</p>
            <h2 id="mkt-proof-title" className="introSectionTitle">
              Built for catalyst process
            </h2>
          </div>
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

        <IntroReveal as="section" id="pricing" revealKey="intro-pricing" className="introSection mktPricing" delay={40}>
          <div className="mktSectionHead">
            <p className="introSectionKicker mono">{PRICING.kicker}</p>
            <h2 className="introSectionTitle">{PRICING.title}</h2>
            <p className="introSectionLead mktPricingSub">{PRICING.sub}</p>
          </div>
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
                    {(plan.id === 'yearly' ? PRICING.yearlyNoteLines : PRICING.monthlyNoteLines).map((line) => (
                      <span key={line} className="mktPlanNoteLine">
                        {line}
                      </span>
                    ))}
                  </p>
                  <a
                    className={`introBtn ${plan.featured ? 'introBtn--primary' : 'introBtn--ghost'} mktPlanBtn`}
                    href="/sign-in"
                    onClick={goToSignIn}
                  >
                    {plan.featured ? 'Start yearly' : 'Start monthly'}
                  </a>
                </article>
              ))}
            </div>
          </div>
          <p className="mktPricingFoot mono dim">
            {formatUsd(YEARLY_SAVE_USD)} off yearly vs 12 monthly payments · Cancel anytime
          </p>
        </IntroReveal>

        <IntroReveal as="section" id="faq" revealKey="intro-faq" className="introSection mktFaq" delay={50}>
          <div className="mktSectionHead">
            <p className="introSectionKicker mono">FAQ</p>
            <h2 className="introSectionTitle">Common questions</h2>
          </div>
          <div className="mktFaqList" role="list">
            {INTRO_FAQ.map((item) => (
              <article key={item.q} className="mktFaqItem" role="listitem">
                <h3 className="mktFaqQ">{item.q}</h3>
                <p className="mktFaqA">{item.a}</p>
              </article>
            ))}
          </div>
        </IntroReveal>

        <IntroReveal as="section" revealKey="intro-final-cta" className="introSection mktFinalCta" delay={20} eager>
          <div className="mktFinalCtaInner">
            <h2 className="mktFinalCtaTitle">Open the terminal</h2>
            <p className="mktFinalCtaSub mono dim">{HERO.rails}</p>
            <a className="introBtn introBtn--primary introBtn--lg" href="/sign-in" onClick={goToSignIn}>
              {HERO.ctaPrimary}
            </a>
          </div>
        </IntroReveal>
      </main>

      <footer className="introFoot introFoot--bar" role="contentinfo">
        <div className="introFootInner introFootInner--marketing">
          <div className="introFootMeta">
            <span className="introFootNfa mono dim">{INTRO_FOOTER.nfa}</span>
            <p className="introFootTagline">{INTRO_FOOTER.tagline}</p>
          </div>
          <nav className="introFootNav mono" aria-label="Footer">
            {INTRO_FOOTER.links.map((link) =>
              link.id === 'sign-in' ? (
                <a key={link.id} className="introFootNavLink" href={link.href} onClick={goToSignIn}>
                  {link.label}
                </a>
              ) : (
                <a
                  key={link.id}
                  className="introFootNavLink"
                  href={link.href}
                  onClick={(e) => scrollToSection(link.id, e)}
                >
                  {link.label}
                </a>
              ),
            )}
          </nav>
        </div>
      </footer>
    </div>
  )
}
