import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildExploreDailyRecap } from './exploreRecapMock.js'
import { MiniPriceChart } from './MiniPriceChart.jsx'

function ExploreRecapCompactSpark({ series = [] }) {
  const vals = useMemo(() => {
    const arr = Array.isArray(series) ? series.filter(Number.isFinite) : []
    return arr.length > 40 ? arr.slice(-40) : arr
  }, [series])

  if (vals.length < 2) return null

  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = max - min || 1
  const padX = 0
  const padY = 2
  const w = 200
  const h = 26
  const linePts = vals
    .map((v, i) => {
      const x = padX + (i / (vals.length - 1)) * (w - padX * 2)
      const y = padY + (1 - (v - min) / span) * (h - padY * 2)
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')

  return (
    <svg
      className="exploreRecapCompactSpark"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline
        points={linePts}
        fill="none"
        stroke="rgba(255, 255, 255, 0.88)"
        strokeWidth="1.25"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

function ExploreRecapCompanySlide({ company }) {
  return (
    <article className="exploreRecapSlide exploreRecapSlide--company">
      <div className="exploreRecapSlideInner exploreRecapSlideInner--event">
        <div className="exploreRecapEventLayout">
          <div className="exploreRecapEventCopy">
            <p className="exploreRecapSlideKicker mono">Companies of the day</p>
            <h2 className="exploreRecapEventTitle">{company.headline}</h2>
            <p className="exploreRecapEventSummary">{company.name}</p>
            <div className="exploreRecapEventMeta">
              <span className="exploreRecapMetaItem mono">{company.source}</span>
              <span className="exploreRecapMetaItem mono">{company.ticker}</span>
              <span className={['exploreRecapTileMove mono', company.moveUp ? 'isUp' : 'isDown'].join(' ')}>
                {company.moveLabel}
              </span>
            </div>
          </div>
          <div className="exploreRecapEventVisual">
            <ExploreRecapFeatureChart series={company.priceSeries} ticker={company.ticker} />
          </div>
        </div>
      </div>
    </article>
  )
}

function ExploreRecapActorSlide({ actor }) {
  return (
    <article className="exploreRecapSlide exploreRecapSlide--actor">
      <div className="exploreRecapSlideInner exploreRecapSlideInner--event">
        <div className="exploreRecapEventLayout">
          <div className="exploreRecapEventCopy">
            <p className="exploreRecapSlideKicker mono">Actors of the day</p>
            <h2 className="exploreRecapEventTitle">{actor.headline}</h2>
            <p className="exploreRecapEventSummary">{actor.name}</p>
            <div className="exploreRecapEventMeta">
              <span className="exploreRecapMetaItem mono">{recapDocType(actor.detail)}</span>
              <span className="exploreRecapMetaItem mono">{actor.ticker}</span>
              {actor.amount ? (
                <span className={['exploreRecapTileMove mono', actor.up ? 'isUp' : 'isDown'].join(' ')}>
                  {actor.amount}
                </span>
              ) : null}
            </div>
          </div>
          <div className="exploreRecapEventVisual">
            <ExploreRecapFeatureChart series={actor.priceSeries} ticker={actor.ticker} />
          </div>
        </div>
      </div>
    </article>
  )
}

function ExploreRecapFeatureChart({ series, ticker }) {
  return (
    <div className="exploreRecapEventChart">
      <MiniPriceChart
        series={series}
        label={ticker}
        showMeta={false}
        chartRange="6M"
        trimLeadingPlateau
        hideAxisLabels
        flushEdges
        showHoverTooltip
        lineOnly
      />
    </div>
  )
}

function recapDocType(detail) {
  return String(detail ?? '').split(' · ')[0]?.trim() ?? ''
}

function ExploreRecapEventSlide({ event }) {
  return (
    <article className="exploreRecapSlide exploreRecapSlide--event">
      <div className="exploreRecapSlideInner exploreRecapSlideInner--event">
        <div className="exploreRecapEventLayout">
          <div className="exploreRecapEventCopy">
            <p className="exploreRecapSlideKicker mono">Event of the day</p>
            <h2 className="exploreRecapEventTitle">{event.headline}</h2>
            <p className="exploreRecapEventSummary">{event.summary}</p>
            <div className="exploreRecapEventMeta">
              <span className="exploreRecapMetaItem mono">{event.source}</span>
              <span className="exploreRecapMetaItem mono">{event.ticker}</span>
              <span className={['exploreRecapTileMove mono', event.moveUp ? 'isUp' : 'isDown'].join(' ')}>
                {event.moveLabel}
              </span>
            </div>
          </div>
          <div className="exploreRecapEventVisual">
            <ExploreRecapFeatureChart series={event.priceSeries} ticker={event.ticker} />
          </div>
        </div>
      </div>
    </article>
  )
}

function getCompactSlides(recap) {
  return [
    {
      title: recap.event.headline,
      ticker: recap.event.ticker,
      priceSeries: recap.event.priceSeries,
    },
    ...recap.companies.map((company) => ({
      title: company.headline,
      ticker: company.ticker,
      priceSeries: company.priceSeries,
    })),
    ...recap.actors.map((actor) => ({
      title: actor.headline,
      ticker: actor.ticker,
      priceSeries: actor.priceSeries,
    })),
  ]
}

function renderRecapSlideAt(recap, logicalIdx) {
  if (logicalIdx === 0) {
    return <ExploreRecapEventSlide event={recap.event} />
  }

  const companyIdx = logicalIdx - 1
  if (companyIdx < recap.companies.length) {
    const company = recap.companies[companyIdx]
    return <ExploreRecapCompanySlide key={company.ticker} company={company} />
  }

  const actor = recap.actors[logicalIdx - 1 - recap.companies.length]
  return (
    <ExploreRecapActorSlide
      key={actor.id ?? `${actor.name}-${actor.ticker}`}
      actor={actor}
    />
  )
}

function logicalIndexFromPhysical(physicalIdx, slideCount) {
  if (slideCount <= 1) return physicalIdx
  if (physicalIdx === 0) return slideCount - 1
  if (physicalIdx === slideCount + 1) return 0
  return physicalIdx - 1
}

function jumpToPhysicalSlide(el, physicalIdx) {
  const prev = el.style.scrollBehavior
  el.style.scrollBehavior = 'auto'
  el.scrollLeft = physicalIdx * el.clientWidth
  el.style.scrollBehavior = prev || ''
}

export function ExploreDailyRecap({ recap = buildExploreDailyRecap() }) {
  const trackRef = useRef(null)
  const jumpingRef = useRef(false)
  const activeIdxRef = useRef(0)
  const [activeIdx, setActiveIdx] = useState(0)
  const compactSlides = useMemo(() => getCompactSlides(recap), [recap])
  const slideCount = compactSlides.length
  const loopEnabled = slideCount > 1

  activeIdxRef.current = activeIdx

  const settleLoopPosition = useCallback(() => {
    const el = trackRef.current
    if (!el || el.clientWidth <= 0 || !loopEnabled || jumpingRef.current) return

    const physicalIdx = Math.round(el.scrollLeft / el.clientWidth)
    if (physicalIdx === 0) {
      jumpingRef.current = true
      jumpToPhysicalSlide(el, slideCount)
      requestAnimationFrame(() => {
        jumpingRef.current = false
      })
      return
    }
    if (physicalIdx === slideCount + 1) {
      jumpingRef.current = true
      jumpToPhysicalSlide(el, 1)
      requestAnimationFrame(() => {
        jumpingRef.current = false
      })
    }
  }, [loopEnabled, slideCount])

  const syncActiveFromScroll = useCallback(() => {
    const el = trackRef.current
    if (!el || el.clientWidth <= 0) return
    const physicalIdx = Math.round(el.scrollLeft / el.clientWidth)
    const logicalIdx = logicalIndexFromPhysical(physicalIdx, slideCount)
    setActiveIdx(Math.max(0, Math.min(slideCount - 1, logicalIdx)))
  }, [slideCount])

  useEffect(() => {
    const el = trackRef.current
    if (!el) return undefined

    let scrollEndTimer
    const onScroll = () => {
      if (!jumpingRef.current) syncActiveFromScroll()
      clearTimeout(scrollEndTimer)
      scrollEndTimer = window.setTimeout(() => {
        settleLoopPosition()
      }, 120)
    }
    const onScrollEnd = () => {
      clearTimeout(scrollEndTimer)
      settleLoopPosition()
      syncActiveFromScroll()
    }
    const onResize = () => {
      const track = trackRef.current
      if (!track) return
      const physicalIdx = loopEnabled ? activeIdxRef.current + 1 : activeIdxRef.current
      jumpToPhysicalSlide(track, physicalIdx)
      syncActiveFromScroll()
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    if ('onscrollend' in el) {
      el.addEventListener('scrollend', onScrollEnd)
    }
    window.addEventListener('resize', onResize)

    return () => {
      el.removeEventListener('scroll', onScroll)
      if ('onscrollend' in el) {
        el.removeEventListener('scrollend', onScrollEnd)
      }
      window.removeEventListener('resize', onResize)
      clearTimeout(scrollEndTimer)
    }
  }, [loopEnabled, settleLoopPosition, syncActiveFromScroll])

  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    jumpingRef.current = true
    if (loopEnabled) {
      jumpToPhysicalSlide(el, 1)
      setActiveIdx(0)
      activeIdxRef.current = 0
    } else {
      jumpToPhysicalSlide(el, 0)
      setActiveIdx(0)
      activeIdxRef.current = 0
    }
    requestAnimationFrame(() => {
      jumpingRef.current = false
    })
  }, [recap, loopEnabled, slideCount])

  const scrollToSlide = (idx) => {
    const el = trackRef.current
    if (!el) return
    const next = Math.max(0, Math.min(slideCount - 1, idx))
    const physicalIdx = loopEnabled ? next + 1 : next
    el.scrollTo({ left: physicalIdx * el.clientWidth, behavior: 'smooth' })
    setActiveIdx(next)
  }

  return (
    <section className="exploreRecap" aria-label="Daily recap">
      <div className="exploreRecapViewport">
        <div className="exploreRecapExpandedBg" aria-hidden="true" />

        <div className="exploreRecapExpanded">
          <div className="exploreRecapTrack" ref={trackRef}>
            {loopEnabled ? (
              <div className="exploreRecapSlideWrap exploreRecapSlideWrap--loopClone" aria-hidden="true">
                {renderRecapSlideAt(recap, slideCount - 1)}
              </div>
            ) : null}
            {Array.from({ length: slideCount }, (_, i) => (
              <div key={i} className="exploreRecapSlideWrap">
                {renderRecapSlideAt(recap, i)}
              </div>
            ))}
            {loopEnabled ? (
              <div className="exploreRecapSlideWrap exploreRecapSlideWrap--loopClone" aria-hidden="true">
                {renderRecapSlideAt(recap, 0)}
              </div>
            ) : null}
          </div>
        </div>

        <div className="exploreRecapCompactBg" aria-hidden="true" />

        <div className="exploreRecapCompactBar" aria-hidden="true">
          <div className="exploreRecapCompactSlide">
            <span className="exploreRecapCompactTicker exploreDirectoryTicker mono">
              {compactSlides[activeIdx]?.ticker}
            </span>
            <p className="exploreRecapCompactTitle">{compactSlides[activeIdx]?.title}</p>
            <ExploreRecapCompactSpark series={compactSlides[activeIdx]?.priceSeries ?? []} />
          </div>
        </div>

        <div className="exploreRecapDots">
          {Array.from({ length: slideCount }, (_, i) => (
            <button
              key={i}
              type="button"
              className={['exploreRecapDot', i === activeIdx ? 'isActive' : ''].filter(Boolean).join(' ')}
              aria-label={`Go to recap section ${i + 1}`}
              onClick={() => scrollToSlide(i)}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
