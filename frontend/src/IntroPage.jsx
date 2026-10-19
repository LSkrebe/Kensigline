import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IntroTerminalPreview } from './IntroTerminalPreview.jsx'
import { IntroCoverageSection } from './IntroCoverageSection.jsx'
import { IntroHowItWorksSection } from './IntroHowItWorksSection.jsx'
import { IntroLeadersSection } from './IntroLeadersSection.jsx'
import { IntroStorySection } from './IntroStorySection.jsx'
import { IntroReviewsSection } from './IntroReviewsSection.jsx'
import { IntroTogetherSection } from './IntroTogetherSection.jsx'
import { IntroCarouselNav } from './IntroCarouselNav.jsx'
import { IntroReveal, clearIntroRevealMemory } from './IntroReveal.jsx'
import { WhopCheckoutPanel } from './WhopCheckoutPanel.jsx'
import { useAuth } from './AuthContext.jsx'
import { formatUsd, yearlyPlanBadgeLabel, yearlyPlanNote } from './billingPlans.js'
import {
  buildMarketingJsonLd,
  introPageMeta,
} from './marketingSeo.js'
import {
  heroCopy,
  heroLeadParts,
  introClosingCopy,
  introConversionFaq,
  INTRO_FOOTER,
  pricingCopy,
  subscribeCopy,
} from './marketingContent.js'
import { navigateMarketing, returnToIntroAfterSignOut } from './marketingRoute.js'
import { applyPageMeta } from './pageMeta.js'
import { markAppReady } from './marketingShell.js'
import { pageBackgroundStyle } from './pageBackgrounds.js'
import { useBillingPricing } from './useBillingPricing.js'
import { useIntroSnapCarousel } from './useIntroSnapCarousel.js'
import './IntroPage.marketing.css'
import './IntroPage.motion.css'
import './SubscribePage.css'

const COLLAPSE_RANGE_FALLBACK = 1
const LP_EXPANDED_FADE_END = 0.92
const LP_COMPACT_FADE_START = 0.62
const NAV_OFFSET = 64
const PRICING_SECTION_ID = 'pricing'

function isIntroPageReload() {
  const nav = performance.getEntriesByType('navigation')[0]
  return nav?.type === 'reload'
}

function collapseProgressVars(progress) {
  const p = Math.min(1, Math.max(0, progress))
  const expandedOpacity = p <= LP_EXPANDED_FADE_END ? 1 - p / LP_EXPANDED_FADE_END : 0
  const compactOpacity =
    p <= LP_COMPACT_FADE_START ? 0 : (p - LP_COMPACT_FADE_START) / (1 - LP_COMPACT_FADE_START)
  return {
    '--lp-collapse': String(p),
    '--lp-expanded-opacity': String(expandedOpacity),
    '--lp-compact-opacity': String(compactOpacity),
  }
}

export function IntroPage() {
  const pageRef = useRef(null)
  const dockRef = useRef(null)
  const spacerRef = useRef(null)
  const checkoutRef = useRef(null)
  const { user, signOut } = useAuth()
  const pricing = useBillingPricing()
  const hero = heroCopy(pricing)
  const closing = introClosingCopy(pricing)
  const subscribe = subscribeCopy(pricing)
  const pricingHead = pricingCopy(pricing)
  const faq = useMemo(() => introConversionFaq(pricing), [pricing])
  const leadParts = heroLeadParts(pricing)
  const plans = pricing.plans
  const waitlist = pricing.waitlist
  const accentBtn = waitlist ? 'lpBtn--waitlist' : pricing.founders ? 'lpBtn--accent' : 'lpBtn--primary'
  const accentNote = waitlist ? 'lpHeroNote--waitlist' : pricing.founders ? 'lpHeroNote--accent' : ''
  const accentEyebrow = waitlist ? 'lpEyebrow--waitlist' : pricing.founders ? 'lpEyebrow--accent' : ''

  const [checkoutPlan, setCheckoutPlan] = useState(null)
  const [checkoutAttempt, setCheckoutAttempt] = useState(0)
  const [checkoutBusy, setCheckoutBusy] = useState(false)
  const [checkoutMsg, setCheckoutMsg] = useState('')
  const plansTrackRef = useRef(null)
  const defaultPlanIndex = useMemo(() => {
    const idx = plans.findIndex((plan) => plan.featured)
    return idx >= 0 ? idx : 0
  }, [plans])
  const {
    active: activePlan,
    scrollTo: scrollToPlan,
    narrow: plansNarrow,
  } = useIntroSnapCarousel(plansTrackRef, '.lpPlan', [plans.length, waitlist])

  useEffect(() => {
    if (waitlist || !plansNarrow || defaultPlanIndex <= 0) return undefined
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollToPlan(defaultPlanIndex, 'instant'))
    })
    return () => cancelAnimationFrame(id)
  }, [defaultPlanIndex, plansNarrow, scrollToPlan, waitlist])

  const goToWaitlist = useCallback((e) => {
    e?.preventDefault()
    navigateMarketing('/waitlist')
  }, [])

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

  const scrollToPricing = useCallback(
    (e) => scrollToSection(PRICING_SECTION_ID, e),
    [scrollToSection],
  )

  const scrollToTop = useCallback((e) => {
    e?.preventDefault()
    pageRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    if (window.history?.pushState) window.history.pushState(null, '', window.location.pathname)
  }, [])

  const onCheckout = useCallback((planId) => {
    setCheckoutPlan(planId)
    setCheckoutAttempt((n) => n + 1)
    setCheckoutMsg('')
    try {
      sessionStorage.setItem('mercerline_checkout_plan', planId)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (!checkoutPlan) return undefined
    let cancelled = false
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return
        const scroller = pageRef.current
        const target = checkoutRef.current
        if (!scroller || !target) return
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const top =
          target.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top +
          scroller.scrollTop -
          NAV_OFFSET
        scroller.scrollTo({ top: Math.max(0, top), behavior: reduced ? 'instant' : 'smooth' })
      })
    })
    return () => {
      cancelled = true
    }
  }, [checkoutPlan, checkoutAttempt])

  const onSignOut = useCallback(async () => {
    const { error } = await signOut()
    if (error) return
    returnToIntroAfterSignOut()
  }, [signOut])

  const goPrimary = waitlist ? goToWaitlist : scrollToPricing
  const secondarySection = waitlist ? 'product' : pricing.founders ? 'leaders' : 'product'
  const goBelowHero = useCallback((e) => scrollToSection(secondarySection, e), [scrollToSection, secondarySection])
  const primaryHref = waitlist ? '/waitlist' : `#${PRICING_SECTION_ID}`
  const secondaryHref = `#${secondarySection}`

  useEffect(() => {
    applyPageMeta(introPageMeta())
    markAppReady()
    if (isIntroPageReload()) clearIntroRevealMemory()

    const schema = buildMarketingJsonLd()

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

  useEffect(() => {
    const page = pageRef.current
    if (!page) return undefined

    page.scrollTo({ top: 0, behavior: 'instant' })
    if (window.location.hash && window.history?.replaceState) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }

    return undefined
  }, [])

  useEffect(() => {
    const page = pageRef.current
    const dock = dockRef.current
    const spacer = spacerRef.current
    if (!page || !dock) return undefined

    let raf = 0

    const syncCollapse = () => {
      raf = 0
      const range = spacer?.offsetHeight || COLLAPSE_RANGE_FALLBACK
      const progress = Math.min(1, Math.max(0, page.scrollTop / range))
      for (const [key, value] of Object.entries(collapseProgressVars(progress))) {
        dock.style.setProperty(key, value)
      }
      dock.classList.toggle('lpHeroDock--compact', progress >= 0.55)
      dock.classList.toggle('lpHeroDock--expanded', progress < 0.45)
    }

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(syncCollapse)
    }

    const onResize = () => {
      if (!raf) raf = requestAnimationFrame(syncCollapse)
    }

    page.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    syncCollapse()

    return () => {
      page.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div
      ref={pageRef}
      className={['lp', pricing.founders ? 'lp--founders' : '', waitlist ? 'lp--waitlist' : '']
        .filter(Boolean)
        .join(' ')}
      style={pageBackgroundStyle('intro')}
    >
      <div className="lpHeroStickWrap">
        <div ref={dockRef} className="lpHeroDock lpHeroDock--expanded">
          <div className="lpHeroExpandedBg" aria-hidden="true" />
          <div className="lpHeroCompactBg" aria-hidden="true" />

          <div className="lpHeroChrome mktEnterNav">
            <a className="lpBrand" href="/" aria-label="Mercerline home" onClick={scrollToTop}>
              <span className="lpBrandLogoClip">
                <img
                  className="lpBrandLogo"
                  src="/mercerline_mark.png"
                  alt=""
                  width={44}
                  height={32}
                  decoding="async"
                />
              </span>
              <span className="lpBrandName">MERCERLINE</span>
            </a>
            <nav className="lpNavLinks" aria-label="Page">
              <a className="lpNavLinkDesktop" href="#product" onClick={(e) => scrollToSection('product', e)}>
                Product
              </a>
              {!waitlist ? (
                <a className="lpNavLinkDesktop" href={`#${PRICING_SECTION_ID}`} onClick={scrollToPricing}>
                  Pricing
                </a>
              ) : null}
              <a className="lpNavLinkDesktop" href="#faq" onClick={(e) => scrollToSection('faq', e)}>
                FAQ
              </a>
              {!user && !waitlist ? (
                <a href="#" onClick={goToSignIn}>
                  Sign in
                </a>
              ) : null}
            </nav>
            {user ? (
              <button type="button" className="lpNavCta lpNavCta--button" onClick={() => void onSignOut()}>
                Sign out
              </button>
            ) : waitlist ? (
              <a className="lpNavCta" href="/waitlist" onClick={goToWaitlist}>
                Join waitlist
              </a>
            ) : null}
          </div>

          <div className="lpHeroExpanded">
            <div className="lpHeroSplit">
              <div className="lpHeroExpandedInner">
                {hero.eyebrow ? (
                  <p className={['lpEyebrow', 'mktEnterSeq', 'mktEnterSeq--1', accentEyebrow].filter(Boolean).join(' ')}>
                    {hero.eyebrow}
                  </p>
                ) : null}
                <p className="lpHeroBrand mktEnterSeq mktEnterSeq--2">{hero.brand}</p>
                <h1 className="lpHeroTitle mktEnterSeq mktEnterSeq--3">{hero.headline}</h1>
                {leadParts.listPrice || (waitlist && leadParts.prefix) ? (
                  <p className="lpHeroLead mktEnterSeq mktEnterSeq--4">
                    {leadParts.listPrice ? (
                      <>
                        {leadParts.prefix}
                        <span className="lpHeroListPrice">{leadParts.listPrice}</span>{' '}
                        <span className="lpHeroPrice">{leadParts.price}</span>
                      </>
                    ) : (
                      leadParts.prefix
                    )}
                  </p>
                ) : null}
                <div className="lpHeroActions mktEnterSeq mktEnterSeq--5">
                  <a className={`lpBtn ${accentBtn}`} href={primaryHref} onClick={goPrimary}>
                    {hero.ctaPrimary}
                  </a>
                  <a
                    className="lpBtn lpBtn--ghost"
                    href={secondaryHref}
                    onClick={goBelowHero}
                  >
                    {hero.ctaSecondary}
                  </a>
                </div>
                {hero.note ? (
                  <p className={['lpHeroNote', 'mktEnterSeq', 'mktEnterSeq--6', accentNote].filter(Boolean).join(' ')}>{hero.note}</p>
                ) : null}
              </div>
              <div className="lpHeroShot mktEnterSeq mktEnterSeq--7 mktHeroShot">
                <div className="lpHeroShotFrame">
                  <IntroTerminalPreview shot="hero" staticResearch eager />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div ref={spacerRef} className="lpHeroCollapseSpacer" aria-hidden="true" />

        <main className="lpMain">
          <IntroStorySection />

          <IntroTogetherSection />

          <IntroHowItWorksSection />

          <IntroLeadersSection />

          {!waitlist ? <IntroCoverageSection /> : null}

          <IntroReviewsSection />

          {!waitlist ? (
            <section
              id={PRICING_SECTION_ID}
              className={['subHero', 'lpPricing', 'lpSection', pricing.founders ? 'subHero--founders' : '']
                .filter(Boolean)
                .join(' ')}
              aria-labelledby="lp-pricing-title"
            >
              <IntroReveal revealKey="pricing-head" className="lpSectionHead lpSectionHead--center lpPricingHead">
                <p className="lpEyebrow">{pricingHead.kicker}</p>
                <h2 id="lp-pricing-title" className="lpSectionTitle">
                  {subscribe.headline || pricingHead.title}
                </h2>
                {subscribe.lead || pricingHead.sub ? (
                  <p className="lpSectionLead">{subscribe.lead || pricingHead.sub}</p>
                ) : null}
              </IntroReveal>

              <IntroReveal revealKey="pricing-plans" delay={80} className="lpPricingCarousel">
                <div className="lpPlans" ref={plansTrackRef}>
                {plans.map((plan, index) => (
                  <article
                    key={plan.id}
                    data-plan-index={index}
                    className={['lpPlan', plan.featured ? 'lpPlan--featured' : ''].filter(Boolean).join(' ')}
                  >
                    <div className="lpPlanHead">
                      <h3 className="lpPlanName">{plan.name}</h3>
                      {plan.featured && yearlyPlanBadgeLabel(pricing) ? (
                        <span className="lpPlanBadge">{yearlyPlanBadgeLabel(pricing)}</span>
                      ) : null}
                    </div>
                    <p className="lpPlanPrice">
                      {plan.listPriceUsd ? (
                        <span className="lpPlanListPrice">{formatUsd(plan.listPriceUsd)}</span>
                      ) : null}
                      <span className="lpPlanAmount">{formatUsd(plan.priceUsd)}</span>
                      <span className="lpPlanInterval">/{plan.intervalLabel}</span>
                    </p>
                    {plan.featured ? (
                      <p className="lpPlanNote">{yearlyPlanNote(pricing)}</p>
                    ) : (
                      <p className="lpPlanNote">Cancel anytime</p>
                    )}
                    <button
                      type="button"
                      className={`lpBtn ${plan.featured ? 'lpBtn--primary' : 'lpBtn--ghost'} lpPlanCta`}
                      disabled={checkoutBusy}
                      onClick={() => onCheckout(plan.id)}
                    >
                      {checkoutBusy && checkoutPlan === plan.id
                        ? 'Opening checkout…'
                        : (subscribe.planCta?.[plan.id] ??
                          (plan.featured ? 'Continue with yearly' : 'Continue with monthly'))}
                    </button>
                  </article>
                ))}
                </div>
                {plansNarrow ? (
                  <IntroCarouselNav
                    count={plans.length}
                    active={activePlan}
                    onSelect={(index) => scrollToPlan(index)}
                    labels={plans.map((plan) => plan.name)}
                    label="Plans"
                  />
                ) : null}
              </IntroReveal>

              <div ref={checkoutRef} id="intro-checkout">
                {checkoutPlan ? (
                  <WhopCheckoutPanel
                    key={`${checkoutPlan}-${checkoutAttempt}`}
                    autoStart
                    selectedPlan={checkoutPlan}
                    userEmail={user?.email ?? null}
                    onBusyChange={setCheckoutBusy}
                    onError={setCheckoutMsg}
                  />
                ) : null}
              </div>
              {checkoutMsg ? (
                <p className="subError" role="alert">
                  {checkoutMsg}
                </p>
              ) : null}
              <p className={pricing.founders ? 'lpFinePrint subFoundersFine' : 'lpFinePrint'}>
                {pricing.founders
                  ? `Founders pricing, yearly saves ${formatUsd(pricing.yearlySaveUsd)} vs monthly. Ends when early access closes.`
                  : `Save ${formatUsd(pricing.yearlySaveUsd)} on yearly vs paying monthly. Cancel anytime.`}
              </p>
            </section>
          ) : null}

          <section id="faq" className="lpSection lpFaqSection lpSection--ruled">
            <IntroReveal revealKey="faq-head" className="lpSectionHead lpSectionHead--center">
              <p className="lpEyebrow">FAQ</p>
              <h2 className="lpSectionTitle">Before you subscribe</h2>
              <p className="lpSectionLead">Access, billing, and what Mercerline is not.</p>
            </IntroReveal>
            <IntroReveal revealKey="faq-list" delay={80}>
              <div className="lpFaq">
                {faq.map((item, index) => (
                  <article key={item.q} className="lpFaqItem">
                    <span className="lpFaqIndex" aria-hidden="true">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div className="lpFaqCopy">
                      <h3 className="lpFaqQ">{item.q}</h3>
                      <p className="lpFaqA">{item.a}</p>
                    </div>
                  </article>
                ))}
              </div>
            </IntroReveal>
          </section>

          <IntroReveal as="section" revealKey="cta" className="lpCtaBand">
            <h2 className="lpCtaTitle">{closing.title}</h2>
            <p className="lpCtaLead">
              {waitlist ? (
                'Leave your email and we will write when access is ready.'
              ) : pricing.founders && pricing.monthlyListUsd ? (
                <>
                  {closing.sub}{' '}
                  <span className="lpHeroListPrice">{formatUsd(pricing.monthlyListUsd)}/mo</span>{' '}
                  <span className="lpHeroPrice">{formatUsd(pricing.monthlyUsd)}/mo</span>
                </>
              ) : (
                closing.sub
              )}
            </p>
            {waitlist ? (
              <a className={`lpBtn ${accentBtn}`} href="/waitlist" onClick={goToWaitlist}>
                {closing.ctaPrimary}
              </a>
            ) : (
              <button type="button" className={`lpBtn ${accentBtn}`} onClick={scrollToPricing}>
                {closing.ctaPrimary}
              </button>
            )}
          </IntroReveal>
        </main>

        <footer className="lpFoot" role="contentinfo">
          <div className="lpFootInner lpFootInner--legal">
            <p className="lpFootLine">{INTRO_FOOTER.line}</p>
            <p className="lpFootLinks">
              <a href="/learn" onClick={(e) => { e.preventDefault(); navigateMarketing('/learn') }}>
                Learn
              </a>
              <a href="/research" onClick={(e) => { e.preventDefault(); navigateMarketing('/research') }}>
                Research
              </a>
            </p>
            <p className="lpFootLegalText">{INTRO_FOOTER.legal}</p>
          </div>
        </footer>
      </div>
    </div>
  )
}
