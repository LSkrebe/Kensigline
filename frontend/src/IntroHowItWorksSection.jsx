import { useEffect, useRef, useState } from 'react'
import { IntroTerminalPreview } from './IntroTerminalPreview.jsx'
import { HOW_IT_WORKS } from './marketingContent.js'
import { IntroReveal } from './IntroReveal.jsx'

/** Four-step walkthrough — copy and screenshots side by side. */
export function IntroHowItWorksSection() {
  const { steps } = HOW_IT_WORKS
  const trackRef = useRef(null)
  const [activeStep, setActiveStep] = useState(0)

  useEffect(() => {
    const track = trackRef.current
    if (!track) return undefined

    const mq = window.matchMedia('(max-width: 899px)')
    const slides = [...track.querySelectorAll('.lpHowRow')]
    if (!slides.length) return undefined

    const observer = new IntersectionObserver(
      (entries) => {
        if (!mq.matches) return
        const best = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (!best) return
        const idx = Number(best.target.getAttribute('data-step-index'))
        if (!Number.isNaN(idx)) setActiveStep(idx)
      },
      { root: track, threshold: [0.5, 0.75] },
    )

    const attach = () => {
      observer.disconnect()
      if (!mq.matches) {
        setActiveStep(0)
        return
      }
      slides.forEach((slide) => observer.observe(slide))
    }

    attach()
    mq.addEventListener('change', attach)
    return () => {
      observer.disconnect()
      mq.removeEventListener('change', attach)
    }
  }, [steps.length])

  return (
    <section id="product" className="lpSection lpHowItWorks lpSection--ruled" aria-labelledby="lp-how-title">
      <IntroReveal revealKey="how-head" className="lpSectionHead lpSectionHead--center">
        <p className="lpEyebrow">{HOW_IT_WORKS.kicker}</p>
        <h2 id="lp-how-title" className="lpSectionTitle">
          {HOW_IT_WORKS.title}
        </h2>
        {HOW_IT_WORKS.lead ? <p className="lpSectionLead">{HOW_IT_WORKS.lead}</p> : null}
      </IntroReveal>

      <IntroReveal revealKey="how-track" delay={60}>
        <ol className="lpHowRows" ref={trackRef}>
        {steps.map((step, index) => (
          <li
            key={step.id}
            data-step-index={index}
            aria-label={`${step.title}`}
            className={['lpHowRow', index % 2 === 1 ? 'lpHowRow--flip' : ''].filter(Boolean).join(' ')}
          >
            <div className="lpHowCopy">
              <p className="lpHowStepNum" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </p>
              <p className="lpHowLabel">{step.label}</p>
              <h3 className="lpHowTitle">{step.title}</h3>
              {step.body ? <p className="lpHowBody">{step.body}</p> : null}
            </div>
            <div className="lpHowFrame">
              <IntroTerminalPreview shot={step.shot} staticResearch eager={index === 0} />
            </div>
          </li>
        ))}
        </ol>
      </IntroReveal>

      <div className="lpHowDots" aria-hidden="true">
        {steps.map((step, index) => (
          <span
            key={step.id}
            className={['lpHowDot', index === activeStep ? 'lpHowDot--active' : ''].filter(Boolean).join(' ')}
          />
        ))}
      </div>
    </section>
  )
}
