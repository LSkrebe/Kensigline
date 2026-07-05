import { INTRO_SCREENSHOTS } from './marketingContent.js'

/** Live terminal screenshots for the marketing hero (captured from offline mock data). */
export function IntroTerminalPreview({ staticResearch = false }) {
  if (!staticResearch) return null

  return (
    <figure className="mktHeroShot">
      <img
        className="mktHeroShotImg"
        src={INTRO_SCREENSHOTS.hero}
        alt="Mercerline terminal - research feed, paper timeline, and context panel for ASML"
        width={1440}
        height={900}
        loading="eager"
        decoding="async"
      />
    </figure>
  )
}
