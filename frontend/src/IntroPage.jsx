import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IntroTerminalPreview } from './IntroTerminalPreview.jsx'
import { IntroCompanyMarquee } from './IntroCompanyMarquee.jsx'
import { IntroReviewsSection } from './IntroReviewsSection.jsx'
import { WhopCheckoutPanel } from './WhopCheckoutPanel.jsx'
import { useAuth } from './AuthContext.jsx'
import { formatUsd } from './billingPlans.js'
import {
  heroCopy,
  heroLeadParts,
  introClosingCopy,
  introFaq,
  INTRO_FOOTER,
  INTRO_PAGE_META,
  ORIGIN_STORY,
  PILLARS,
  pricingCopy,
  PRODUCT,
  EXPLORE_SHOT,
  INVESTOR_SHOT,
  SOURCES,
  SUBSCRIBE_FEATURES,
  subscribeCopy,
  subscribeFaq,
  SUBSCRIBE_PREVIEW,
} from './marketingContent.js'
import { navigateMarketing, returnToIntroAfterSignOut } from './marketingRoute.js'
import { applyPageMeta } from './pageMeta.js'
import { markAppReady } from './marketingShell.js'
import { useBillingPricing } from './useBillingPricing.js'
import './IntroPage.marketing.css'
import './SubscribePage.css'

const COLLAPSE_RANGE_FALLBACK = 1
const LP_EXPANDED_FADE_END = 0.92
const LP_COMPACT_FADE_START = 0.62
const NAV_OFFSET = 64
const PRICING_SECTION_ID = 'pricing'

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

function mergeFaq(intro, subscribe) {
  const seen = new Set()
  return [...intro, ...subscribe].filter((item) => {
    if (seen.has(item.q)) return false
    seen.add(item.q)
    return true
  })
}

export function IntroPage() {
  const pageRef = useRef(null)
  const dockRef = useRef(null)
  const spacerRef = useRef(null)
  const { user, signOut, signInWithOAuth } = useAuth()
  const pricing = useBillingPricing()
  const hero = heroCopy(pricing)
  const closing = introClosingCopy(pricing)
  const subscribe = subscribeCopy(pricing)
  const pricingHead = pricingCopy(pricing)
  const faq = useMemo(
    () => mergeFaq(introFaq(pricing), subscribeFaq(pricing)),
    [pricing],
  )
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

  const goToWaitlist = useCallback((e) => {
    e?.preventDefault()
    navigateMarketing('/waitlist')
  }, [])

  const goToSignIn = useCallback((e) => {
    e?.preventDefault()
    void signInWithOAuth('google')
  }, [signInWithOAuth])

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

  const collapseHero = useCallback((e) => {
    e?.preventDefault()
    const page = pageRef.current
    const spacer = spacerRef.current
    if (!page || !spacer) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    page.scrollTo({
      top: spacer.offsetHeight,
      behavior: reduced ? 'instant' : 'smooth',
    })
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

  const onSignOut = useCallback(async () => {
    const { error } = await signOut()
    if (error) return
    returnToIntroAfterSignOut()
  }, [signOut])

  const goPrimary = waitlist ? goToWaitlist : scrollToPricing
  const goBelowHero = waitlist ? (e) => scrollToSection('product', e) : collapseHero
  const primaryHref = waitlist ? '/waitlist' : `#${PRICING_SECTION_ID}`

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
        price: String(pricing.monthlyUsd),
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
  }, [pricing.monthlyUsd])

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '')
    if (hash === PRICING_SECTION_ID) {
      requestAnimationFrame(() => scrollToSection(PRICING_SECTION_ID))
    }
  }, [scrollToSection])

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
    <div ref={pageRef} className="lp">
      <div className="lpHeroStickWrap">
        <div ref={dockRef} className="lpHeroDock lpHeroDock--expanded">
          <div className="lpHeroExpandedBg" aria-hidden="true" />
          <div className="lpHeroCompactBg" aria-hidden="true" />

          <div className="lpHeroChrome">
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
                <a href={`#${PRICING_SECTION_ID}`} onClick={scrollToPricing}>
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
            <div className="lpHeroExpandedInner">
              {hero.eyebrow ? (
                <p className={['lpEyebrow', accentEyebrow].filter(Boolean).join(' ')}>
                  {hero.eyebrow}
                </p>
              ) : null}
              <p className="lpHeroBrand">{hero.brand}</p>
              <h1 className="lpHeroTitle">{hero.headline}</h1>
              {hero.lead || leadParts.listPrice || (waitlist && leadParts.prefix) ? (
                <p className="lpHeroLead">
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
              <div className="lpHeroActions">
                <a className={`lpBtn ${accentBtn}`} href={primaryHref} onClick={goPrimary}>
                  {hero.ctaPrimary}
                </a>
                <a
                  className="lpBtn lpBtn--ghost"
                  href={waitlist ? '#product' : '#story'}
                  onClick={goBelowHero}
                >
                  {hero.ctaSecondary}
                </a>
              </div>
              {hero.note ? (
                <p className={['lpHeroNote', accentNote].filter(Boolean).join(' ')}>{hero.note}</p>
              ) : null}
            </div>
            <div className="lpHeroExpandedFooter">
              <button
                type="button"
                className="lpHeroNavBtn lpHeroNavBtn--collapse lpHeroNavBtn--collapseStart"
                aria-label="Collapse hero"
                onClick={collapseHero}
              >
                <span className="lpHeroNavBtnGlyph mono" aria-hidden="true">
                  ↓
                </span>
              </button>
              <button
                type="button"
                className="lpHeroNavBtn lpHeroNavBtn--collapse lpHeroNavBtn--collapseEnd"
                aria-label="Collapse hero"
                onClick={collapseHero}
              >
                <span className="lpHeroNavBtnGlyph mono" aria-hidden="true">
                  ↓
                </span>
              </button>
            </div>
          </div>
        </div>
        <div ref={spacerRef} className="lpHeroCollapseSpacer" aria-hidden="true" />

        <IntroCompanyMarquee />

        <main className="lpMain">
          <section id="story" className="lpStory" aria-labelledby="lp-story-title">
            <div className="lpStoryInner">
              <div className="lpStoryCopy">
                <p className="lpEyebrow">{ORIGIN_STORY.kicker}</p>
                <h2 id="lp-story-title" className="lpSectionTitle">
                  {ORIGIN_STORY.title}
                </h2>
                <p className="lpStoryLead">
                  {ORIGIN_STORY.lead.map((part, i) =>
                    part.tone === 'up' ? (
                      <span key={i} className="lpStoryMark lpStoryMark--up">
                        {part.text}
                      </span>
                    ) : (
                      <span key={i}>{part.text}</span>
                    ),
                  )}
                </p>
                <p className="lpStoryCloser">{ORIGIN_STORY.closer}</p>
              </div>
              <aside className="lpStoryCard">
                <div className="lpStoryPerson">
                  <img
                    className="lpStoryPhoto"
                    src={ORIGIN_STORY.person.photoUrl}
                    alt={ORIGIN_STORY.person.photoAlt}
                    width={112}
                    height={137}
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="lpStoryPersonMeta">
                    <p className="lpStoryPersonName">{ORIGIN_STORY.person.name}</p>
                    <p className="lpStoryPersonChamber">{ORIGIN_STORY.person.chamber}</p>
                    <p className="lpStoryPersonFiling">{ORIGIN_STORY.person.filing}</p>
                  </div>
                </div>
                <dl className="lpStoryTrade">
                  <div className="lpStoryTradeRow">
                    <dt>Filed</dt>
                    <dd className="lpStoryTradeValue--date">{ORIGIN_STORY.trade.filed}</dd>
                  </div>
                  <div className="lpStoryTradeRow">
                    <dt>Trade</dt>
                    <dd className="lpStoryTradeValue--money">{ORIGIN_STORY.trade.detail}</dd>
                  </div>
                  <div className="lpStoryTradeRow">
                    <dt>Move</dt>
                    <dd className="lpStoryTradeValue--up">{ORIGIN_STORY.trade.outcome}</dd>
                  </div>
                </dl>
              </aside>
            </div>
          </section>

          <section id="product" className="lpSection">
            <div className="lpSectionHead">
              <p className="lpEyebrow">{PRODUCT.kicker}</p>
              <h2 className="lpSectionTitle">{PRODUCT.title}</h2>
              <p className="lpSectionLead">{PRODUCT.lead}</p>
            </div>
            <ul className="lpPillars">
              {PILLARS.map((p) => (
                <li key={p.id} className="lpPillar">
                  <h3 className="lpPillarTitle">{p.title}</h3>
                  <p className="lpPillarBody">{p.body}</p>
                </li>
              ))}
            </ul>
          </section>

          <IntroReviewsSection />

          <section className="lpShot" aria-labelledby="lp-explore-shot-title">
            <div className="lpShotHead">
              <p className="lpEyebrow">{EXPLORE_SHOT.kicker}</p>
              <h2 id="lp-explore-shot-title" className="lpSectionTitle">
                {EXPLORE_SHOT.title}
              </h2>
              {EXPLORE_SHOT.lead ? <p className="lpSectionLead">{EXPLORE_SHOT.lead}</p> : null}
            </div>
            <div className="lpShotFrame">
              <IntroTerminalPreview shot="hero" staticResearch eager />
            </div>
          </section>

          <section className="lpSection lpSection--sources">
            <div className="lpSectionHead">
              <p className="lpEyebrow">{SOURCES.kicker}</p>
              <h2 className="lpSectionTitle">{SOURCES.title}</h2>
              {SOURCES.lead ? <p className="lpSectionLead">{SOURCES.lead}</p> : null}
            </div>
            <ul className="lpSourceList">
              {SOURCES.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="lpShot" aria-labelledby="lp-investor-shot-title">
            <div className="lpShotHead">
              <p className="lpEyebrow">{INVESTOR_SHOT.kicker}</p>
              <h2 id="lp-investor-shot-title" className="lpSectionTitle">
                {INVESTOR_SHOT.title}
              </h2>
              {INVESTOR_SHOT.lead ? <p className="lpSectionLead">{INVESTOR_SHOT.lead}</p> : null}
            </div>
            <div className="lpShotFrame">
              <IntroTerminalPreview shot="deepInvestor" staticResearch />
            </div>
          </section>

          {!waitlist ? (
            <section
              id={PRICING_SECTION_ID}
              className={['subHero', 'lpPricing', pricing.founders ? 'subHero--founders' : '']
                .filter(Boolean)
                .join(' ')}
              aria-labelledby="lp-pricing-title"
            >
              <p className="lpEyebrow">{pricingHead.kicker}</p>
              <h2 id="lp-pricing-title" className="subTitle">
                {subscribe.headline || pricingHead.title}
              </h2>
              {subscribe.lead || pricingHead.sub ? (
                <p className="subLead">{subscribe.lead || pricingHead.sub}</p>
              ) : null}
              {subscribe.reassurance ? (
                <p
                  className={['lpHeroNote', pricing.founders ? 'lpHeroNote--accent' : '']
                    .filter(Boolean)
                    .join(' ')}
                >
                  {subscribe.reassurance}
                </p>
              ) : null}

              <ul className="lpSourceList subFeaturesList" aria-label="Included with either plan">
                {SUBSCRIBE_FEATURES.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>

              <div className="lpPlans">
                {plans.map((plan) => (
                  <article
                    key={plan.id}
                    className={['lpPlan', plan.featured ? 'lpPlan--featured' : ''].filter(Boolean).join(' ')}
                  >
                    <h3 className="lpPlanName">{plan.name}</h3>
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
          ) : null}

          {!waitlist ? (
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
              <div className="lpShotFrame lpShotFrame--tight">
                <IntroTerminalPreview shot="investorsDirectory" staticResearch />
              </div>
            </section>
          ) : null}

          <section id="faq" className="lpSection">
            <div className="lpSectionHead">
              <p className="lpEyebrow">FAQ</p>
              <h2 className="lpSectionTitle">Questions</h2>
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

          <section className="lpCtaBand">
            <h2 className="lpCtaTitle">{closing.title}</h2>
            <p className="lpCtaLead">
              {waitlist ? (
                'Leave your email and we will write when access is ready.'
              ) : pricing.founders && pricing.monthlyListUsd ? (
                <>
                  Full access from day one at{' '}
                  <span className="lpHeroListPrice">{formatUsd(pricing.monthlyListUsd)}/mo</span>{' '}
                  <span className="lpHeroPrice">{formatUsd(pricing.monthlyUsd)}/mo</span>
                </>
              ) : (
                'Full access from day one — pay and start immediately.'
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
          </section>
        </main>

        <footer className="lpFoot" role="contentinfo">
          <div className="lpFootInner lpFootInner--legal">
            <p className="lpFootLine">{INTRO_FOOTER.line}</p>
            <p className="lpFootLegalText">
              <span className="lpFootLegalLabel">Terms</span> {INTRO_FOOTER.terms}
            </p>
            <p className="lpFootLegalText">
              <span className="lpFootLegalLabel">Privacy</span> {INTRO_FOOTER.privacy}
            </p>
            <p className="lpFootLegalText">
              <span className="lpFootLegalLabel">IP / DMCA</span> {INTRO_FOOTER.ip}
            </p>
          </div>
        </footer>
      </div>
    </div>
  )
}
