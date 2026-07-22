import { MARKETING_SHOTS } from './marketingContent.js'

/** Terminal screenshot for marketing pages (desktop capture at 1440×900 @2x). */
export function IntroTerminalPreview({ shot = 'hero', staticResearch = false, eager = false }) {
  if (!staticResearch) return null

  const meta = MARKETING_SHOTS[shot] ?? MARKETING_SHOTS.hero
  const { src, srcSet, sizes, alt, width, height } = meta

  return (
    <figure className="mktHeroShot">
      <picture>
        <source type="image/webp" srcSet={srcSet.webp} sizes={sizes} />
        <img
          className="mktHeroShotImg"
          src={src}
          alt={alt}
          width={width}
          height={height}
          loading={eager ? 'eager' : 'lazy'}
          fetchPriority={eager ? 'high' : 'auto'}
          decoding="async"
        />
      </picture>
    </figure>
  )
}
