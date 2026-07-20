import { useCallback, useEffect, useRef } from 'react'
import { IntroTerminalPreview } from './IntroTerminalPreview.jsx'
import { BILLING_PLANS, formatUsd, MONTHLY_PRICE_USD, YEARLY_SAVE_USD } from './billingPlans.js'
import {
  HERO,
  INTRO_FAQ,
  INTRO_FOOTER,
  INTRO_PAGE_META,
  PILLARS,
  PLAN_FEATURES,
  PRICING,
  PRODUCT,
  SOURCES,
} from './marketingContent.js'
import { navigateMarketing } from './marketingRoute.js'
import { applyPageMeta } from './pageMeta.js'
import { markAppReady } from './marketingShell.js'
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
    pageRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
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
    <div ref={pageRef} className="lp">
      <header className="lpNav">
        <div className="lpNavInner">
          <a className="lpBrand" href="/" aria-label="Mercerline home" onClick={scrollToTop}>
            <span className="lpBrandLogoClip">
              <img className="lpBrandLogo" src="/mercerline_mark.png" alt="" width={44} height={32} decoding="async" />
            </span>
            <span className="lpBrandName">MERCERLINE</span>
          </a>
          <nav className="lpNavLinks" aria-label="Page">
            <a href="#product" onClick={(e) => scrollToSection('product', e)}>
              Product
            </a>
            <a href="#pricing" onClick={(e) => scrollToSection('pricing', e)}>
              Pricing
            </a>
            <a href="#faq" onClick={(e) => scrollToSection('faq', e)}>
              FAQ
            </a>
          </nav>
          <a className="lpNavCta" href="/sign-in" onClick={goToSignIn}>
            Sign in
          </a>
        </div>
      </header>

      <main>
        <section className="lpHero">
          <p className="lpEyebrow">{HERO.eyebrow}</p>
          <h1 className="lpHeroTitle">{HERO.headline}</h1>
          <p className="lpHeroLead">{HERO.lead}</p>
          <div className="lpHeroActions">
            <a className="lpBtn lpBtn--primary" href="/sign-in" onClick={goToSignIn}>
              {HERO.ctaPrimary}
            </a>
            <a className="lpBtn lpBtn--ghost" href="#product" onClick={(e) => scrollToSection('product', e)}>
              {HERO.ctaSecondary}
            </a>
          </div>
          <p className="lpHeroNote">{HERO.note}</p>
        </section>

        <section className="lpShot" aria-label="Product preview">
          <div className="lpShotFrame">
            <IntroTerminalPreview staticResearch />
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

        <section className="lpSection lpSection--sources">
          <div className="lpSectionHead">
            <p className="lpEyebrow">{SOURCES.kicker}</p>
            <h2 className="lpSectionTitle">{SOURCES.title}</h2>
          </div>
          <ul className="lpSourceList">
            {SOURCES.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section id="pricing" className="lpSection">
          <div className="lpSectionHead">
            <p className="lpEyebrow">{PRICING.kicker}</p>
            <h2 className="lpSectionTitle">{PRICING.title}</h2>
            <p className="lpSectionLead">{PRICING.sub}</p>
          </div>
          <ul className="lpInclude">
            {PLAN_FEATURES.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <div className="lpPlans">
            {BILLING_PLANS.map((plan) => (
              <article key={plan.id} className={['lpPlan', plan.featured ? 'lpPlan--featured' : ''].filter(Boolean).join(' ')}>
                <h3 className="lpPlanName">{plan.name}</h3>
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
                <a
                  className={`lpBtn ${plan.featured ? 'lpBtn--primary' : 'lpBtn--ghost'} lpPlanCta`}
                  href="/sign-in"
                  onClick={goToSignIn}
                >
                  {plan.featured ? 'Start yearly' : 'Start monthly'}
                </a>
              </article>
            ))}
          </div>
          <p className="lpFinePrint">
            Save {formatUsd(YEARLY_SAVE_USD)} on yearly. Cancel anytime.
          </p>
        </section>

        <section id="faq" className="lpSection">
          <div className="lpSectionHead">
            <p className="lpEyebrow">FAQ</p>
            <h2 className="lpSectionTitle">Questions</h2>
          </div>
          <div className="lpFaq">
            {INTRO_FAQ.map((item) => (
              <article key={item.q} className="lpFaqItem">
                <h3 className="lpFaqQ">{item.q}</h3>
                <p className="lpFaqA">{item.a}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="lpCtaBand">
          <h2 className="lpCtaTitle">Open the terminal</h2>
          <p className="lpCtaLead">Full access from day one. Cancel anytime.</p>
          <a className="lpBtn lpBtn--primary" href="/sign-in" onClick={goToSignIn}>
            {HERO.ctaPrimary}
          </a>
        </section>
      </main>

      <footer className="lpFoot" role="contentinfo">
        <div className="lpFootInner">
          <div>
            <p className="lpFootNfa">{INTRO_FOOTER.nfa}</p>
            <p className="lpFootTag">{INTRO_FOOTER.tagline}</p>
          </div>
          <nav className="lpFootNav" aria-label="Footer">
            {INTRO_FOOTER.links.map((link) =>
              link.id === 'sign-in' ? (
                <a key={link.id} href={link.href} onClick={goToSignIn}>
                  {link.label}
                </a>
              ) : (
                <a key={link.id} href={link.href} onClick={(e) => scrollToSection(link.id, e)}>
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
