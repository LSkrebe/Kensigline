import { ORIGIN_STORY } from './marketingContent.js'
import { IntroStoryDiagram } from './IntroStoryChart.jsx'

/** FOMO origin beat — chart with Pelosi vs News callouts. */
export function IntroStorySection() {
  const { person, timeline, outcome } = ORIGIN_STORY

  return (
    <section id="story" className="lpStory" aria-labelledby="lp-story-title">
      <div className="lpSectionHead lpSectionHead--center">
        <p className="lpEyebrow">{ORIGIN_STORY.kicker}</p>
        <h2 id="lp-story-title" className="lpSectionTitle">
          {ORIGIN_STORY.title}
        </h2>
        <p className="lpSectionLead">{ORIGIN_STORY.tagline}</p>
      </div>

      <IntroStoryDiagram person={person} timeline={timeline} outcome={outcome} />

      {outcome.chartCaption ? (
        <p className="lpStoryCaption">{outcome.chartCaption}</p>
      ) : null}
    </section>
  )
}
