import { useRef } from 'react'
import { IntroTerminalPreview } from './IntroTerminalPreview.jsx'
import { HOW_IT_WORKS } from './marketingContent.js'
import { IntroReveal } from './IntroReveal.jsx'
import { IntroCarouselNav } from './IntroCarouselNav.jsx'
import { useIntroSnapCarousel } from './useIntroSnapCarousel.js'

/** Product shots - desktop 2-up, mobile snap carousel with Together-style dots. */
export function IntroHowItWorksSection() {
  const { steps } = HOW_IT_WORKS
  const trackRef = useRef(null)
  const { active, scrollTo, narrow } = useIntroSnapCarousel(trackRef, '.lpHowCard', [steps.length])

  return (
    <section id="product" className="lpSection lpHowItWorks lpSection--ruled" aria-labelledby="lp-how-title">
      <IntroReveal revealKey="how-head" className="lpSectionHead lpSectionHead--center">
        <p className="lpEyebrow">{HOW_IT_WORKS.kicker}</p>
        <h2 id="lp-how-title" className="lpSectionTitle">
          {HOW_IT_WORKS.title}
        </h2>
        {HOW_IT_WORKS.lead ? <p className="lpSectionLead">{HOW_IT_WORKS.lead}</p> : null}
      </IntroReveal>

      <IntroReveal revealKey="how-track" delay={60} className="lpHowCarousel">
        <ol className="lpHowGrid" ref={trackRef}>
          {steps.map((step, index) => (
            <li key={step.id} className="lpHowCard" aria-label={step.title}>
              <div className="lpHowFrame">
                <IntroTerminalPreview shot={step.shot} staticResearch eager={index === 0} />
              </div>
            </li>
          ))}
        </ol>
        {narrow ? (
          <IntroCarouselNav
            count={steps.length}
            active={active}
            onSelect={(index) => scrollTo(index)}
            labels={steps.map((step) => step.title)}
            label="Product shots"
          />
        ) : null}
      </IntroReveal>
    </section>
  )
}
