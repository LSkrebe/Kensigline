import { IntroTerminalPreview } from './IntroTerminalPreview.jsx'
import { HOW_IT_WORKS } from './marketingContent.js'

/** Three-step walkthrough — copy and screenshots side by side. */
export function IntroHowItWorksSection() {
  const { steps } = HOW_IT_WORKS

  return (
    <section id="product" className="lpSection lpHowItWorks lpSection--ruled" aria-labelledby="lp-how-title">
      <div className="lpSectionHead lpSectionHead--center">
        <p className="lpEyebrow">{HOW_IT_WORKS.kicker}</p>
        <h2 id="lp-how-title" className="lpSectionTitle">
          {HOW_IT_WORKS.title}
        </h2>
        {HOW_IT_WORKS.lead ? <p className="lpSectionLead">{HOW_IT_WORKS.lead}</p> : null}
      </div>

      <ol className="lpHowRows">
        {steps.map((step, index) => (
          <li
            key={step.id}
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
    </section>
  )
}
