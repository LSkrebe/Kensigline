import { useCallback, useEffect, useRef, useState } from 'react'
import { ImageOrInitials, normalizeInvestorName } from './ExplorePersonRow.jsx'
import { explorePerformerReturn } from './ExploreWatchlistSection.jsx'
import { SENATE_INVESTOR_SLUGS } from './exploreWatchlistCatalog.js'
import portraits from './explorePortraits.json'
import { SkeletonStatus } from './AppSkeleton.jsx'

const NARROW = '(max-width: 899px)'

function formatPnl(fraction) {
  if (fraction == null || !Number.isFinite(Number(fraction))) return null
  const value = Number(fraction)
  const text = `${value > 0 ? '+' : ''}${(value * 100).toFixed(2)}%`
  const tone = value > 0.0005 ? 'isUp' : value < -0.0005 ? 'isDown' : 'isFlat'
  return { text, tone }
}

function portraitFor(name) {
  return portraits[normalizeInvestorName(name)] ?? null
}

const SENATE = new Set([
  ...SENATE_INVESTOR_SLUGS,
  'maria-cantwell',
  'amy-klobuchar',
  'bernie-sanders',
  'john-barrasso',
  'mitch-mcconnell',
  'chuck-schumer',
  'elizabeth-warren',
  'ted-cruz',
])

const HOUSE_MARK = '/seals/house.png'
const SENATE_MARK = '/seals/senate.png'
const SEC_MARK = '/seals/sec.png'

function featuredSource(row) {
  const mode = String(row?.mode ?? row?.modeLabel ?? '').toLowerCase()
  if (mode === 'insiders' || mode === 'insider') return { label: 'SEC', src: SEC_MARK }
  if (mode === 'institutions' || mode === 'institution') return { label: 'SEC', src: SEC_MARK }
  const slug = String(row?.actorSlug ?? '').toLowerCase()
  if (String(row?.chamber ?? '').toLowerCase() === 'senate' || SENATE.has(slug)) return { label: 'Senate', src: SENATE_MARK }
  return { label: 'House', src: HOUSE_MARK }
}

function ExploreRecapNavArrow({ direction }) {
  const left = direction === 'left'
  return (
    <span className="exploreRecapNavBtnGlyph mono" aria-hidden="true">
      {left ? '‹' : '›'}
    </span>
  )
}

export function ExploreFeaturedCards({ rows = [], range = '6M', onCardClick = null, loading = false }) {
  const scrollerRef = useRef(null)
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(NARROW).matches : false,
  )
  const [active, setActive] = useState(0)

  useEffect(() => {
    const query = window.matchMedia(NARROW)
    const sync = () => setNarrow(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    setActive(0)
    const el = scrollerRef.current
    if (el) el.scrollLeft = 0
  }, [rows, range])

  const syncActive = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const cards = [...el.querySelectorAll('.exploreFeaturedCard')]
    if (!cards.length) return
    const pad = parseFloat(getComputedStyle(el).paddingLeft) || 0
    const x = el.scrollLeft + pad + 8
    let best = 0
    let bestDist = Infinity
    cards.forEach((card, index) => {
      const dist = Math.abs(card.offsetLeft - x)
      if (dist < bestDist) {
        bestDist = dist
        best = index
      }
    })
    setActive(best)
  }, [])

  const scrollTo = (index) => {
    const el = scrollerRef.current
    const card = el?.querySelectorAll('.exploreFeaturedCard')?.[index]
    if (!el || !card) return
    const pad = parseFloat(getComputedStyle(el).paddingLeft) || 0
    el.scrollTo({ left: Math.max(0, card.offsetLeft - pad), behavior: 'smooth' })
  }

  if (!rows.length) {
    if (!loading) return null
    const count = narrow ? 1 : 3
    return (
      <SkeletonStatus label="Loading top performers" className="exploreFeatured">
        <div className="exploreFeaturedScroller">
          {Array.from({ length: count }, (_, index) => (
            <div className="exploreFeaturedCard appSkelCard" key={index} />
          ))}
        </div>
      </SkeletonStatus>
    )
  }

  return (
    <section className="exploreFeatured" aria-label="Top performers">
      <div className="exploreFeaturedScroller" ref={scrollerRef} onScroll={narrow ? syncActive : undefined}>
        {rows.map((row) => {
          const portrait = portraitFor(row.name)
          const logo = portrait?.kind === 'logo'
          const source = featuredSource(row)
          const pnl = formatPnl(explorePerformerReturn(row, range))
          return (
            <button
              type="button"
              className={`exploreFeaturedCard${logo ? ' isLogo' : ''}`}
              key={row.actorSlug || row.id}
              aria-label={`Open ${row.name}`}
              onClick={() => onCardClick?.(row)}
            >
              <ImageOrInitials
                src={portrait?.src}
                name={row.name}
                className="exploreFeaturedPhoto"
                logo={logo}
                discover={false}
              />
              <span className="exploreFeaturedCopy">
                <span className="exploreFeaturedBadge">Featured</span>
                <span className="exploreFeaturedTitle">{row.name}</span>
                <span className={`exploreFeaturedPnl${pnl ? ` ${pnl.tone}` : ''}`}>{pnl ? pnl.text : '—'}</span>
                <span className="exploreFeaturedBy">
                  <ImageOrInitials
                    src={source.src}
                    name={source.label}
                    className="exploreFeaturedByMark isSource"
                    logo
                    discover={false}
                  />
                  <span>by {source.label}</span>
                </span>
              </span>
            </button>
          )
        })}
      </div>
      <div className="exploreFeaturedNav">
          <button
            type="button"
            className="exploreRecapNavBtn exploreRecapNavBtn--prev"
            aria-label="Previous performance card"
            onClick={() => scrollTo(active - 1 < 0 ? rows.length - 1 : active - 1)}
          >
            <ExploreRecapNavArrow direction="left" />
          </button>
          <div className="exploreRecapDots exploreRecapDots--static" role="group" aria-label="Performance cards">
            <div className="exploreRecapDotsList">
              {rows.map((row, index) => (
                <button
                  key={row.actorSlug || row.id}
                  type="button"
                  className={index === active ? 'exploreRecapDot isActive' : 'exploreRecapDot'}
                  aria-label={row.name}
                  aria-pressed={index === active}
                  onClick={() => scrollTo(index)}
                />
              ))}
            </div>
          </div>
          <button
            type="button"
            className="exploreRecapNavBtn exploreRecapNavBtn--next"
            aria-label="Next performance card"
            onClick={() => scrollTo((active + 1) % rows.length)}
          >
            <ExploreRecapNavArrow direction="right" />
          </button>
        </div>
    </section>
  )
}
