import { MarqueeRow } from './IntroCompanyMarquee.jsx'
import { INTRO_COVERAGE, INTRO_TRACKED_COMPANIES } from './marketingContent.js'
import { IntroReveal } from './IntroReveal.jsx'

/** Tracked-issuer validation — dual marquees with a centered proof band between rows. */
export function IntroCoverageSection() {
  const { rowA, rowB } = INTRO_TRACKED_COMPANIES

  return (
    <section id="coverage" className="lpSection lpCoverageSection" aria-labelledby="lp-coverage-title">
      <IntroReveal revealKey="coverage-head" className="lpSectionHead lpSectionHead--center">
        <p className="lpEyebrow">{INTRO_COVERAGE.kicker}</p>
        <h2 id="lp-coverage-title" className="lpSectionTitle">
          {INTRO_COVERAGE.title}
        </h2>
        <p className="lpSectionLead">{INTRO_COVERAGE.lead}</p>
      </IntroReveal>

      <IntroReveal revealKey="coverage-marquees" delay={80}>
        <div className="lpCoverageMarquees" aria-label="Companies we track">
          <MarqueeRow tickers={rowA} />

          <div className="lpCoverageMid">
            <ul className="lpCoverageStats lpRevealStagger">
              {INTRO_COVERAGE.stats.map((stat) => (
                <li
                  key={stat.label}
                  className={['lpCoverageStat', stat.featured ? 'lpCoverageStat--featured' : '']
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span className="lpCoverageStatValue">{stat.value}</span>
                  <span className="lpCoverageStatLabel">{stat.label}</span>
                </li>
              ))}
            </ul>
          </div>

          <MarqueeRow tickers={rowB} reverse />
        </div>
      </IntroReveal>
    </section>
  )
}
