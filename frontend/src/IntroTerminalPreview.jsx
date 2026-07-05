import { INTRO_SCREENSHOTS } from './marketingContent.js'

/** Live terminal screenshots for the marketing hero (captured from offline mock data). */
export function IntroTerminalPreview({ staticResearch = false }) {
  if (!staticResearch) return null

  const { heroSrcSet, heroSizes } = INTRO_SCREENSHOTS

  return (
    <figure className="mktHeroShot mktEnterSeq mktEnterSeq--6">
      <picture>
        <source type="image/avif" srcSet={heroSrcSet.avif} sizes={heroSizes} />
        <source type="image/webp" srcSet={heroSrcSet.webp} sizes={heroSizes} />
        <img
          className="mktHeroShotImg"
          src={INTRO_SCREENSHOTS.hero}
          srcSet={heroSrcSet.webp}
          sizes={heroSizes}
          alt="Mercerline event-driven research terminal - research feed, paper timeline, and context panel"
          width={1200}
          height={750}
          loading="eager"
          fetchPriority="high"
          decoding="async"
        />
      </picture>
    </figure>
  )
}
