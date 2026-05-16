import { useCallback, useEffect, useRef, useState } from 'react'
import { AuthSignIn } from './AuthSignIn.jsx'
import { IntroReveal } from './IntroReveal.jsx'
import './IntroPage.css'

const PROBLEMS = [
  {
    title: 'Fragmented context',
    body: 'Thesis, filing, and chart live in three apps. You align them after the move starts.',
  },
  {
    title: 'Noisy insider flow',
    body: 'Headlines chase single Form 4s. Clusters and size vs history are what matter.',
  },
  {
    title: 'Unstructured pharma',
    body: 'Press releases skip design and endpoints. You need the worksheet, not another alert.',
  },
  {
    title: 'Politicians misread',
    body: 'PTR is delayed. Use it as exposure confirmation — not timing alpha.',
  },
]

const FEATURES = [
  {
    tag: 'Research',
    title: 'Catalyst papers',
    body: 'Thesis, price, causality, and sources in one exportable paper.',
  },
  {
    tag: 'Insiders',
    title: 'Form 4 on the case',
    body: 'Clusters on the tape with historical outcome context.',
  },
  {
    tag: 'Pharma',
    title: 'Trials on a timeline',
    body: 'Programs and worksheets beside the chart — not buried in PDFs.',
  },
  {
    tag: 'Politicians',
    title: 'PTR, framed right',
    body: 'Disclosures as exposure signals. Same rhythm as insider flow.',
  },
]

const BENEFITS = [
  { code: 'OUT', title: 'Historical outcomes', body: 'Win rates and return windows on similar setups — no export.' },
  { code: 'TRD', title: 'Trend panels', body: 'Forward-return views per rail when your API is live.' },
  { code: 'PPR', title: 'Bosha papers', body: 'Long-form theses you copy or share — not chat scraps.' },
  { code: 'UX', title: 'Terminal UX', body: 'Dense grid and keyboard flow for full-day screens.' },
]

const STEPS = [
  { n: '1', title: 'Pick your lane', body: 'Research, Insiders, Pharma, or Politicians — each a full workspace.' },
  { n: '2', title: 'Build the case', body: 'Feeds, worksheets, and graphs lock to the ticker in one grid.' },
  { n: '3', title: 'Decide early', body: 'Outcomes and trends show how similar setups behaved before the print.' },
]

const PERSONAS = [
  { code: 'BIO', title: 'Biotech & pharma', body: 'Readouts and FDA dates with trial structure on the same screen.' },
  { code: 'EVT', title: 'Event-driven', body: 'Binary catalysts and short holds — not continuous coverage.' },
  { code: 'FLW', title: 'Insider & flow', body: 'Form 4 clusters and case sheets as first-class rails.' },
]

const FAQ = [
  {
    code: 'Q01',
    q: 'Bloomberg replacement?',
    a: 'No — narrow by design: catalyst equities, insider flow, trials, and research papers.',
  },
  {
    code: 'Q02',
    q: 'How fresh is data?',
    a: 'Live feeds when your API is connected; sample data offline so the UI still runs.',
  },
  {
    code: 'Q03',
    q: 'Who is it for?',
    a: 'Investors and analysts who already work in catalysts, filings, and readouts.',
  },
  {
    code: 'Q04',
    q: 'Investment advice?',
    a: 'No. Mercerline is a research workspace only.',
  },
]

const INTRO_NAV_OFFSET = 80

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
      INTRO_NAV_OFFSET

    scroller.scrollTo({
      top: Math.max(0, top),
      behavior: reduced ? 'instant' : 'smooth',
    })

    if (window.history?.pushState) {
      window.history.pushState(null, '', `#${sectionId}`)
    }
  }, [])

  const scrollToTop = useCallback((e) => {
    e?.preventDefault()
    const scroller = pageRef.current
    if (!scroller) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    scroller.scrollTo({ top: 0, behavior: reduced ? 'instant' : 'smooth' })
    if (window.history?.pushState) {
      window.history.pushState(null, '', window.location.pathname)
    }
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
    <div ref={pageRef} className={`introPage${signInOpen ? ' introPage--modalOpen' : ''}`}>
      <header className="introNav">
        <div className="introNavInner">
          <a className="introBrand" href="/" aria-label="Mercerline home" onClick={scrollToTop}>
            <img className="introBrandLogo" src="/mercerline_logo_transparent.png" alt="" width={28} height={28} />
            <span className="introBrandName">MERCERLINE</span>
          </a>
          <nav className="introNavLinks mono" aria-label="On this page">
            <a href="#problem" onClick={(e) => scrollToSection('problem', e)}>
              Why
            </a>
            <a href="#features" onClick={(e) => scrollToSection('features', e)}>
              Product
            </a>
            <a href="#workflow" onClick={(e) => scrollToSection('workflow', e)}>
              Workflow
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
        <section className="introHero introHero--enter">
          <div className="introHeroContent">
            <p className="introEyebrow mono">Research terminal</p>
            <h1 className="introHeadline">
              Read the tape.
              <br />
              <span className="introHeadlineAccent">Own the catalyst.</span>
            </h1>
            <p className="introLead">
              One dark grid for biotech, insider flow, and event-driven names — built around what moves the stock.
            </p>
          </div>
          <div className="introHeroRow">
            <div className="introHeroActions">
              <button type="button" className="introBtn introBtn--primary" onClick={openSignIn}>
                Get started
              </button>
              <a className="introBtn introBtn--ghost" href="#workflow" onClick={(e) => scrollToSection('workflow', e)}>
                See how it works
              </a>
            </div>
            <p className="introHeroRailsLabel mono" aria-hidden="true">
              Insiders · Pharma · Politicians · Research
            </p>
          </div>
        </section>

        <IntroReveal as="section" id="problem" className="introSection introProblem" aria-labelledby="intro-problem-title">
          <div className="introProblemBand">
            <div className="introSectionHead introProblemHead">
              <p className="introSectionKicker mono">Why Mercerline</p>
              <h2 id="intro-problem-title" className="introSectionTitle">
                Generic tools fail catalyst work
              </h2>
              <p className="introSectionLead introSectionLead--wide">
                You trade discrete events. Most platforms are built for always-on coverage.
              </p>
            </div>
            <ul className="introProblemList">
              {PROBLEMS.map((p) => (
                <li key={p.title} className="introProblemItem">
                  <span className="introProblemTitle">{p.title}</span>
                  <span className="introProblemBody">{p.body}</span>
                </li>
              ))}
            </ul>
          </div>
        </IntroReveal>

        <IntroReveal
          as="section"
          id="features"
          className="introSection introFeatures"
          aria-labelledby="intro-features-title"
          delay={40}
        >
          <div className="introSectionHead">
            <p className="introSectionKicker mono">Product</p>
            <h2 id="intro-features-title" className="introSectionTitle">
              Everything before the print
            </h2>
            <p className="introSectionLead introSectionLead--wide">
              Four rails. One terminal. Same rhythm from Phase 3 drill-down to insider clusters.
            </p>
          </div>
          <div className="introFeatureGrid">
            {FEATURES.map((f) => (
              <article key={f.tag} className="introFeatureCard">
                <span className="introFeatureTag mono">{f.tag}</span>
                <h3 className="introFeatureTitle">{f.title}</h3>
                <p className="introFeatureBody">{f.body}</p>
              </article>
            ))}
          </div>
        </IntroReveal>

        <IntroReveal as="section" className="introSection introBenefits" aria-labelledby="intro-benefits-title" delay={60}>
          <p className="introSectionKicker mono">Included</p>
          <h2 id="intro-benefits-title" className="introSectionTitle">
            Built into every case
          </h2>
          <ul className="introBenefitMatrix">
            {BENEFITS.map((b) => (
              <li key={b.title} className="introBenefitCell">
                <span className="introBenefitCode mono">{b.code}</span>
                <h3 className="introBenefitTitle">{b.title}</h3>
                <p className="introBenefitBody">{b.body}</p>
              </li>
            ))}
          </ul>
        </IntroReveal>

        <IntroReveal
          as="section"
          id="workflow"
          className="introSection introWorkflow"
          aria-labelledby="intro-workflow-title"
          delay={40}
        >
          <div className="introSectionHead">
            <p className="introSectionKicker mono">Workflow</p>
            <h2 id="intro-workflow-title" className="introSectionTitle">
              Idea to conviction in three steps
            </h2>
          </div>
          <ol className="introSteps">
            {STEPS.map((s) => (
              <li key={s.n} className="introStep">
                <span className="introStepMarker mono" aria-hidden="true">
                  {s.n}
                </span>
                <div className="introStepBody">
                  <h3 className="introStepTitle">{s.title}</h3>
                  <p className="introStepText">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </IntroReveal>

        <IntroReveal as="section" className="introSection introPersonas" aria-labelledby="intro-personas-title" delay={60}>
          <p className="introSectionKicker mono">Who it&apos;s for</p>
          <h2 id="intro-personas-title" className="introSectionTitle">
            Built for serious process
          </h2>
          <ul className="introPersonaStack">
            {PERSONAS.map((p, i) => (
              <li key={p.title} className="introPersonaRail">
                <div className="introPersonaRailTrack" aria-hidden="true">
                  <span className="introPersonaCode mono">{p.code}</span>
                  {i < PERSONAS.length - 1 ? <span className="introPersonaRailLine" /> : null}
                </div>
                <div className="introPersonaRailCopy">
                  <h3 className="introPersonaTitle">{p.title}</h3>
                  <p className="introPersonaBody">{p.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </IntroReveal>

        <IntroReveal as="section" className="introSection introPitch" delay={40}>
          <blockquote className="introQuote">
            “Insider flow, trial design, and narrative in one frame — before the crowd reprices.”
          </blockquote>
        </IntroReveal>

        <IntroReveal as="section" id="faq" className="introSection introFaq" aria-labelledby="intro-faq-title" delay={60}>
          <div className="introSectionHead">
            <p className="introSectionKicker mono">FAQ</p>
            <h2 id="intro-faq-title" className="introSectionTitle">
              Common questions
            </h2>
          </div>
          <ul className="introFaqMatrix">
            {FAQ.map((item) => (
              <li key={item.q} className="introFaqCell">
                <span className="introFaqCode mono">{item.code}</span>
                <h3 className="introFaqQ">{item.q}</h3>
                <p className="introFaqA">{item.a}</p>
              </li>
            ))}
          </ul>
        </IntroReveal>

        <IntroReveal
          as="section"
          className="introSection introCtaBand"
          aria-labelledby="intro-cta-title"
          delay={80}
          eager
        >
          <div className="introCtaInner">
            <div className="introCtaRule" aria-hidden="true" />
            <div className="introCtaCopy">
              <h2 id="intro-cta-title" className="introCtaTitle">
                Open the <span className="introCtaTitleAccent">terminal</span>
              </h2>
              <p className="introCtaRails mono" aria-hidden="true">
                Insiders · Pharma · Politicians · Research
              </p>
              <button type="button" className="introBtn introBtn--primary introCtaBtn" onClick={openSignIn}>
                Sign in
              </button>
            </div>
            <div className="introCtaRule" aria-hidden="true" />
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
              Sign in
            </h2>
            <p className="introModalLead mono dim">
              Sign in with email and password, or create an account to open the terminal.
            </p>
            <AuthSignIn variant="intro" onSuccess={closeSignIn} />
          </div>
        </div>
      ) : null}

      <footer className="introFoot mono dim">
        <span>Mercerline</span>
        <span className="introFootSep">·</span>
        <span>Not investment advice</span>
      </footer>
    </div>
  )
}
