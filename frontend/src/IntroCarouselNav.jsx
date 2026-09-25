import './ExplorePage.css'

/** Same prev / dots / next chrome as Explore featured cards (Together). */
export function IntroCarouselNav({
  count = 0,
  active = 0,
  onSelect,
  labels = [],
  className = '',
  label = 'Slides',
}) {
  if (count < 2) return null

  const go = (index) => {
    const next = ((index % count) + count) % count
    onSelect?.(next)
  }

  return (
    <div className={['exploreFeaturedNav', 'lpCarouselNav', className].filter(Boolean).join(' ')}>
      <button
        type="button"
        className="exploreRecapNavBtn exploreRecapNavBtn--prev"
        aria-label="Previous"
        onClick={() => go(active - 1)}
      >
        <span className="exploreRecapNavBtnGlyph mono" aria-hidden="true">
          ‹
        </span>
      </button>
      <div className="exploreRecapDots exploreRecapDots--static" role="group" aria-label={label}>
        <div className="exploreRecapDotsList">
          {Array.from({ length: count }, (_, index) => (
            <button
              key={labels[index] || index}
              type="button"
              className={index === active ? 'exploreRecapDot isActive' : 'exploreRecapDot'}
              aria-label={labels[index] || `Slide ${index + 1}`}
              aria-pressed={index === active}
              onClick={() => go(index)}
            />
          ))}
        </div>
      </div>
      <button
        type="button"
        className="exploreRecapNavBtn exploreRecapNavBtn--next"
        aria-label="Next"
        onClick={() => go(active + 1)}
      >
        <span className="exploreRecapNavBtnGlyph mono" aria-hidden="true">
          ›
        </span>
      </button>
    </div>
  )
}
