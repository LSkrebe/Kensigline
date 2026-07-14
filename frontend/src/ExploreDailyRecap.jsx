import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { buildExploreDailyRecap } from './exploreRecapMock.js'
import { MiniPriceChart } from './MiniPriceChart.jsx'
import { TerminalTopBarChrome } from './TerminalTopBarChrome.jsx'

const EXPLORE_COMPACT_MQ = '(max-width: 960px)'

function useExploreCompactLayout() {
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(EXPLORE_COMPACT_MQ).matches,
  )

  useEffect(() => {
    const mq = window.matchMedia(EXPLORE_COMPACT_MQ)
    const onChange = () => setCompact(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return compact
}

function useRecapChartOverlap(layoutRef, enabled, contentKey) {
  useLayoutEffect(() => {
    const layout = layoutRef.current
    if (!layout) return undefined

    if (!enabled) {
      layout.classList.remove('exploreRecapEventLayout--chartHidden')
      return undefined
    }

    const check = () => {
      const meta = layout.querySelector('.exploreRecapEventMeta')
      const visual = layout.querySelector('.exploreRecapEventVisual')
      if (!meta || !visual) {
        layout.classList.remove('exploreRecapEventLayout--chartHidden')
        return
      }

      // Always measure while visible — display:none zeros getBoundingClientRect and
      // would otherwise keep the chart hidden after expanding the window.
      layout.classList.remove('exploreRecapEventLayout--chartHidden')

      const metaBottom = meta.getBoundingClientRect().bottom
      const visualTop = visual.getBoundingClientRect().top
      if (visualTop < metaBottom + 6) {
        layout.classList.add('exploreRecapEventLayout--chartHidden')
      }
    }

    check()

    const ro = new ResizeObserver(check)
    ro.observe(layout)

    const meta = layout.querySelector('.exploreRecapEventMeta')
    const visual = layout.querySelector('.exploreRecapEventVisual')
    const copy = layout.querySelector('.exploreRecapEventCopy')
    if (meta) ro.observe(meta)
    if (visual) ro.observe(visual)
    if (copy) ro.observe(copy)

    window.addEventListener('resize', check)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', check)
      layout.classList.remove('exploreRecapEventLayout--chartHidden')
    }
  }, [enabled, contentKey, layoutRef])
}

function ExploreRecapEventSlideLayout({ copy, series, ticker, overlapKey }) {
  const layoutRef = useRef(null)
  const compactLayout = useExploreCompactLayout()

  useRecapChartOverlap(layoutRef, compactLayout, overlapKey)

  return (
    <div className="exploreRecapEventLayout" ref={layoutRef}>
      {copy}
      <div className="exploreRecapEventVisual">
        <ExploreRecapFeatureChart series={series} ticker={ticker} />
      </div>
    </div>
  )
}

function getRecapSlideCount(recap) {
  return 1 + recap.companies.length + recap.actors.length
}

const EXPLORE_RECAP_ARROW = {
  left: '←',
  right: '→',
  down: '↓',
}

function ExploreRecapNavArrow({ direction = 'down' }) {
  return (
    <span className="exploreRecapNavBtnGlyph mono" aria-hidden="true">
      {EXPLORE_RECAP_ARROW[direction]}
    </span>
  )
}

function ExploreRecapCompanySlide({ company }) {
  return (
    <article className="exploreRecapSlide exploreRecapSlide--company">
      <div className="exploreRecapSlideInner exploreRecapSlideInner--event">
        <ExploreRecapEventSlideLayout
          overlapKey={`${company.ticker}-${company.headline}-${company.name}`}
          series={company.priceSeries}
          ticker={company.ticker}
          copy={
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
          }
        />
      </div>
    </article>
  )
}

function ExploreRecapActorSlide({ actor }) {
  return (
    <article className="exploreRecapSlide exploreRecapSlide--actor">
      <div className="exploreRecapSlideInner exploreRecapSlideInner--event">
        <ExploreRecapEventSlideLayout
          overlapKey={`${actor.id ?? actor.name}-${actor.headline}-${actor.name}`}
          series={actor.priceSeries}
          ticker={actor.ticker}
          copy={
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
          }
        />
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
        <ExploreRecapEventSlideLayout
          overlapKey={`${event.ticker}-${event.headline}-${event.summary}`}
          series={event.priceSeries}
          ticker={event.ticker}
          copy={
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
          }
        />
      </div>
    </article>
  )
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

export function ExploreDailyRecap({
  recap = buildExploreDailyRecap(),
  backendUp = true,
  macroActive = false,
  onMacroClick,
  settingsActive = false,
  onSettingsClick,
  onRequestCollapse,
}) {
  const trackRef = useRef(null)
  const jumpingRef = useRef(false)
  const activeIdxRef = useRef(0)
  const [activeIdx, setActiveIdx] = useState(0)
  const compactLayout = useExploreCompactLayout()
  const slideCount = useMemo(() => getRecapSlideCount(recap), [recap])
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

        <div className="exploreRecapChromeBar">
          <div className="exploreRecapCompactBg" aria-hidden="true" />
          <TerminalTopBarChrome
            className="exploreRecapChrome"
            logoSrc="/mercerline_mark.png"
            backendUp={backendUp}
            macroActive={macroActive}
            onMacroClick={onMacroClick}
            settingsActive={settingsActive}
            onSettingsClick={onSettingsClick}
            showSearch
            searchPlaceholder="Search companies, actors"
            searchPlaceholderMobile="Search"
          />
        </div>

        <div className="exploreRecapHero">
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

          <div
            className={['exploreRecapSlideFooter', compactLayout ? 'exploreRecapSlideFooter--compact' : '']
              .filter(Boolean)
              .join(' ')}
          >
            {!compactLayout && slideCount > 1 ? (
              <button
                type="button"
                className="exploreRecapNavBtn exploreRecapNavBtn--prev"
                aria-label="Previous recap section"
                onClick={() => scrollToSlide(activeIdx - 1 < 0 ? slideCount - 1 : activeIdx - 1)}
              >
                <ExploreRecapNavArrow direction="left" />
              </button>
            ) : null}
            <div
              className={['exploreRecapDots', compactLayout ? 'exploreRecapDots--static' : ''].filter(Boolean).join(' ')}
            >
              <div
                className="exploreRecapDotsList"
                role={compactLayout ? 'group' : 'tablist'}
                aria-label="Recap sections"
              >
                {Array.from({ length: slideCount }, (_, i) =>
                  compactLayout ? (
                    <span
                      key={i}
                      className={['exploreRecapDot', i === activeIdx ? 'isActive' : ''].filter(Boolean).join(' ')}
                      aria-hidden="true"
                    />
                  ) : (
                    <button
                      key={i}
                      type="button"
                      className={['exploreRecapDot', i === activeIdx ? 'isActive' : ''].filter(Boolean).join(' ')}
                      aria-label={`Go to recap section ${i + 1}`}
                      onClick={() => scrollToSlide(i)}
                    />
                  ),
                )}
              </div>
            </div>
            {compactLayout ? (
              <button
                type="button"
                className="exploreRecapNavBtn exploreRecapNavBtn--collapse"
                aria-label="Collapse recap"
                onClick={onRequestCollapse}
              >
                <ExploreRecapNavArrow direction="down" />
              </button>
            ) : slideCount > 1 ? (
              <button
                type="button"
                className="exploreRecapNavBtn exploreRecapNavBtn--next"
                aria-label="Next recap section"
                onClick={() => scrollToSlide((activeIdx + 1) % slideCount)}
              >
                <ExploreRecapNavArrow direction="right" />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
