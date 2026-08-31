import { ORIGIN_STORY } from './marketingContent.js'
import { IntroStoryDiagram } from './IntroStoryChart.jsx'
import { IntroReveal } from './IntroReveal.jsx'

/** FOMO origin beat — chart with filing vs news callouts. */
export function IntroStorySection() {
  const { person, timeline, outcome } = ORIGIN_STORY

  return (
    <section id="story" className="lpStory" aria-labelledby="lp-story-title">
      <IntroReveal revealKey="story-head" className="lpSectionHead lpSectionHead--center">
        <p className="lpEyebrow">{ORIGIN_STORY.kicker}</p>
        <h2 id="lp-story-title" className="lpSectionTitle">
          {ORIGIN_STORY.title}
        </h2>
        <p className="lpSectionLead">{ORIGIN_STORY.tagline}</p>
      </IntroReveal>

      <IntroReveal revealKey="story-chart" delay={80}>
        <IntroStoryDiagram person={person} timeline={timeline} outcome={outcome} />
      </IntroReveal>

      {outcome.chartCaption ? (
        <IntroReveal revealKey="story-caption" delay={140}>
          <p className="lpStoryCaption">{outcome.chartCaption}</p>
        </IntroReveal>
      ) : null}
    </section>
  )
}
