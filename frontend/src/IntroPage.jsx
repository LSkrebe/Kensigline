import { useCallback, useEffect, useRef } from 'react'
import { IntroTerminalPreview } from './IntroTerminalPreview.jsx'
import { formatUsd } from './billingPlans.js'
import {
  heroCopy,
  heroLeadParts,
  introFaq,
  INTRO_FOOTER,
  INTRO_PAGE_META,
  ORIGIN_STORY,
  PILLARS,
  PRODUCT,
  SOURCES,
} from './marketingContent.js'
import { navigateMarketing } from './marketingRoute.js'
import { applyPageMeta } from './pageMeta.js'
import { markAppReady } from './marketingShell.js'
import { useBillingPricing } from './useBillingPricing.js'
import './IntroPage.marketing.css'

const COLLAPSE_RANGE_FALLBACK = 1
const LP_EXPANDED_FADE_END = 0.88
const LP_COMPACT_FADE_START = 0
const NAV_OFFSET = 64

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
  const pricing = useBillingPricing()
  const hero = heroCopy(pricing)
  const faq = introFaq(pricing)
  const leadParts = heroLeadParts(pricing)

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
            {pricing.founders ? (
              <p className="lpHeroFoundersChip">50% off</p>
            ) : null}
            <nav className="lpNavLinks" aria-label="Page">
              <a href="#product" onClick={(e) => scrollToSection('product', e)}>
                Product
              </a>
              <a href="#faq" onClick={(e) => scrollToSection('faq', e)}>
                FAQ
              </a>
            </nav>
            <a className="lpNavCta" href="/sign-in" onClick={goToSignIn}>
              Sign in
            </a>
          </div>

          <div className="lpHeroExpanded">
            <div className="lpHeroExpandedInner">
              <p className={['lpEyebrow', pricing.founders ? 'lpEyebrow--accent' : ''].filter(Boolean).join(' ')}>
                {hero.eyebrow}
              </p>
              <p className="lpHeroBrand">{hero.brand}</p>
              <h1 className="lpHeroTitle">{hero.headline}</h1>
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
              <div className="lpHeroActions">
                <a
                  className={`lpBtn ${pricing.founders ? 'lpBtn--accent' : 'lpBtn--primary'}`}
                  href="/sign-in"
                  onClick={goToSignIn}
                >
                  {hero.ctaPrimary}
                </a>
                <a
                  className="lpBtn lpBtn--ghost"
                  href="#product"
                  onClick={(e) => scrollToSection('product', e)}
                >
                  {hero.ctaSecondary}
                </a>
              </div>
              <p className={['lpHeroNote', pricing.founders ? 'lpHeroNote--accent' : ''].filter(Boolean).join(' ')}>
                {hero.note}
              </p>
            </div>
          </div>
        </div>
        <div ref={spacerRef} className="lpHeroCollapseSpacer" aria-hidden="true" />

        <main className="lpMain">
          <section className="lpShot" aria-label="Product preview">
            <div className="lpShotFrame">
              <IntroTerminalPreview shot="hero" staticResearch eager />
            </div>
          </section>

          <section className="lpStory" aria-labelledby="lp-story-title">
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

          <section className="lpShot" aria-label="Investor dossier preview">
            <div className="lpShotFrame">
              <IntroTerminalPreview shot="deepInvestor" staticResearch />
            </div>
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
            <h2 className="lpCtaTitle">Start tracking disclosures</h2>
            <p className="lpCtaLead">
              Full access from day one
              {pricing.founders && pricing.monthlyListUsd ? (
                <>
                  {' '}
                  from <span className="lpHeroListPrice">{formatUsd(pricing.monthlyListUsd)}/mo</span>{' '}
                  <span className="lpHeroPrice">{formatUsd(pricing.monthlyUsd)}/mo</span>
                </>
              ) : null}
              . Cancel anytime.
            </p>
            <a
              className={`lpBtn ${pricing.founders ? 'lpBtn--accent' : 'lpBtn--primary'}`}
              href="/sign-in"
              onClick={goToSignIn}
            >
              {hero.ctaPrimary}
            </a>
          </section>
        </main>

        <footer className="lpFoot" role="contentinfo">
          <div className="lpFootInner">
            <div className="lpFootCopy">
              <p className="lpFootNfa">{INTRO_FOOTER.nfa}</p>
              <p className="lpFootTag">{INTRO_FOOTER.tagline}</p>
            </div>
            <a className="lpFootCta" href="/sign-in" onClick={goToSignIn}>
              Sign in
            </a>
          </div>
        </footer>
      </div>
    </div>
  )
}
