import { INTRO_SCREENSHOTS } from './marketingContent.js'

/** Explore screenshot for the marketing product plane (desktop capture from offline mock data). */
export function IntroTerminalPreview({ staticResearch = false }) {
  if (!staticResearch) return null

  const { hero, heroSrcSet, heroSizes, alt, width, height } = INTRO_SCREENSHOTS

  return (
    <figure className="mktHeroShot">
      <picture>
        <source type="image/webp" srcSet={heroSrcSet.webp} sizes={heroSizes} />
        <img
          className="mktHeroShotImg"
          src={hero}
          alt={alt}
          width={width}
          height={height}
          loading="eager"
          fetchPriority="high"
          decoding="async"
        />
      </picture>
    </figure>
  )
}
