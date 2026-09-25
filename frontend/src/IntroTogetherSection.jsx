import { ExploreFeaturedCards } from './ExploreFeaturedCards.jsx'
import { IntroReveal } from './IntroReveal.jsx'
import { selectIntroTogether, useIntroExplorePeople } from './introExplorePeople.js'
import { scrollIntroToPricing } from './introScroll.js'
import { INTRO_TOGETHER } from './marketingContent.js'
import './ExplorePage.css'

/** Explore featured cards - one world each, yearly returns. */
export function IntroTogetherSection() {
  const { people, loading, range } = useIntroExplorePeople()
  const rows = selectIntroTogether(people, range)

  return (
    <section id="together" className="lpSection lpSection--ruled lpTogether" aria-labelledby="lp-together-title">
      <IntroReveal revealKey="together-head" className="lpSectionHead lpSectionHead--center">
        <p className="lpEyebrow">{INTRO_TOGETHER.kicker}</p>
        <h2 id="lp-together-title" className="lpSectionTitle">
          {INTRO_TOGETHER.title}
        </h2>
        {INTRO_TOGETHER.lead ? <p className="lpSectionLead">{INTRO_TOGETHER.lead}</p> : null}
      </IntroReveal>
      <IntroReveal revealKey="together-rail" delay={70} className="lpTogetherExplore">
        <ExploreFeaturedCards
          rows={rows}
          range={range}
          loading={loading && !rows.length}
          onCardClick={() => scrollIntroToPricing()}
        />
      </IntroReveal>
    </section>
  )
}
