import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { EMPTY_EXPLORE_RECAP } from './dataMode.js'
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
  const slides = Array.isArray(recap?.slides) ? recap.slides : []
  return slides.length
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

function ExploreRecapEmptySlide({ isFallback = false }) {
  return (
    <article className="exploreRecapSlide exploreRecapSlide--event">
      <div className="exploreRecapSlideInner exploreRecapSlideInner--event">
        <div className="exploreRecapEventCopy">
          <p className="exploreRecapSlideKicker mono">Daily recap</p>
          <h2 className="exploreRecapEventTitle">
            {isFallback ? 'No notable filings recently' : 'No notable filings today'}
          </h2>
          <p className="exploreRecapEventSummary">
            {isFallback
              ? 'When fresh activity clears the bar, it will lead here first.'
              : 'When something clears the bar, it will lead here first.'}
          </p>
        </div>
      </div>
    </article>
  )
}

function ExploreRecapSlideView({ slide, onOpenEvent }) {
  if (!slide) return null
  const openEvent = () => {
    if (typeof onOpenEvent === 'function') onOpenEvent(slide)
  }
  return (
    <article className="exploreRecapSlide exploreRecapSlide--event">
      <div className="exploreRecapSlideInner exploreRecapSlideInner--event">
        <ExploreRecapEventSlideLayout
          overlapKey={`${slide.id}-${slide.headline}`}
          series={slide.priceSeries}
          ticker={slide.ticker}
          copy={
            <div className="exploreRecapEventCopy">
              <p className="exploreRecapSlideKicker mono">{slide.kicker}</p>
              <button
                type="button"
                className="exploreRecapEventTitleBtn"
                aria-label={`Open event brief: ${slide.headline}`}
                onClick={openEvent}
              >
                <span className="exploreRecapEventTitleRow">
                  <span className="exploreRecapEventTitle">{slide.headline}</span>
                  <span className="exploreRecapEventChevron mono" aria-hidden="true">
                    &gt;
                  </span>
                </span>
              </button>
              <p className="exploreRecapEventSummary">{slide.summary}</p>
              <div className="exploreRecapEventMeta">
                <span className="exploreRecapMetaItem mono">{slide.source}</span>
                {slide.ticker ? <span className="exploreRecapMetaItem mono">{slide.ticker}</span> : null}
                {slide.moveLabel ? (
                  <span
                    className={['exploreRecapTileMove mono', slide.moveUp ? 'isUp' : 'isDown'].join(' ')}
                  >
                    {slide.moveLabel}
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

function renderRecapSlideAt(recap, logicalIdx, onOpenEvent) {
  const slides = Array.isArray(recap?.slides) ? recap.slides : []
  if (!slides.length) return <ExploreRecapEmptySlide isFallback={recap?.isFallback === true} />
  const slide = slides[logicalIdx]
  if (!slide) return null
  return <ExploreRecapSlideView key={slide.id} slide={slide} onOpenEvent={onOpenEvent} />
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
  recap = EMPTY_EXPLORE_RECAP,
  backendUp = null,
  macroActive = false,
  onMacroClick,
  settingsActive = false,
  onSettingsClick,
  onBrandClick = null,
  onRequestCollapse,
  onOpenEvent = null,
  searchValue = '',
  onSearchChange = null,
}) {
  const trackRef = useRef(null)
  const jumpingRef = useRef(false)
  const activeIdxRef = useRef(0)
  const [activeIdx, setActiveIdx] = useState(0)
  const compactLayout = useExploreCompactLayout()
  const slideCount = useMemo(() => Math.max(1, getRecapSlideCount(recap)), [recap])
  const slidesContentKey = useMemo(() => {
    const slides = Array.isArray(recap?.slides) ? recap.slides : []
    return slides.map((s) => String(s?.id ?? '')).join('|')
  }, [recap])
  const hasSlides = getRecapSlideCount(recap) > 0
  const loopEnabled = hasSlides && slideCount > 1

  activeIdxRef.current = activeIdx

  const syncActiveFromScroll = useCallback(() => {
    const el = trackRef.current
    if (!el || el.clientWidth <= 0 || jumpingRef.current) return
    const physicalIdx = Math.round(el.scrollLeft / el.clientWidth)
    const logicalIdx = logicalIndexFromPhysical(physicalIdx, slideCount)
    setActiveIdx(Math.max(0, Math.min(slideCount - 1, logicalIdx)))
  }, [slideCount])

  const settleLoopPosition = useCallback(() => {
    const el = trackRef.current
    if (!el || el.clientWidth <= 0 || !loopEnabled || jumpingRef.current) return

    const physicalIdx = Math.round(el.scrollLeft / el.clientWidth)
    if (physicalIdx === 0) {
      jumpingRef.current = true
      jumpToPhysicalSlide(el, slideCount)
      requestAnimationFrame(() => {
        jumpingRef.current = false
        syncActiveFromScroll()
      })
      return
    }
    if (physicalIdx === slideCount + 1) {
      jumpingRef.current = true
      jumpToPhysicalSlide(el, 1)
      requestAnimationFrame(() => {
        jumpingRef.current = false
        syncActiveFromScroll()
      })
    }
  }, [loopEnabled, slideCount, syncActiveFromScroll])

  useEffect(() => {
    const el = trackRef.current
    if (!el) return undefined

    let scrollEndTimer
    const onScroll = () => {
      syncActiveFromScroll()
      clearTimeout(scrollEndTimer)
      scrollEndTimer = window.setTimeout(() => {
        settleLoopPosition()
      }, 140)
    }
    const onScrollEnd = () => {
      clearTimeout(scrollEndTimer)
      settleLoopPosition()
      syncActiveFromScroll()
    }
    const onResize = () => {
      const track = trackRef.current
      if (!track || track.clientWidth <= 0) return
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
    if (!el || el.clientWidth <= 0) return
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
    /* Reset only when slide content/count changes — not on parent re-renders. */
  }, [slidesContentKey, loopEnabled, slideCount])

  const scrollToSlide = (idx) => {
    const el = trackRef.current
    if (!el || el.clientWidth <= 0) return
    const next = Math.max(0, Math.min(slideCount - 1, idx))
    const current = activeIdxRef.current

    let physicalIdx = loopEnabled ? next + 1 : next
    // Wrap through clones so arrow nav matches trackpad (one-step, then snap).
    if (loopEnabled && current === slideCount - 1 && next === 0) {
      physicalIdx = slideCount + 1
    } else if (loopEnabled && current === 0 && next === slideCount - 1) {
      physicalIdx = 0
    }

    // Let scroll drive the active dot — same path as trackpad swipes.
    el.scrollTo({ left: physicalIdx * el.clientWidth, behavior: 'smooth' })
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
            onBrandClick={onBrandClick}
            collapsibleSearch
            showSearch
            searchPlaceholder="Search company, investor"
            searchPlaceholderMobile="Search"
            searchValue={searchValue}
            onSearchChange={onSearchChange}
          />
        </div>

        <div className="exploreRecapHero">
          <div className="exploreRecapExpanded">
            <div className="exploreRecapTrack" ref={trackRef}>
              {loopEnabled ? (
                <div className="exploreRecapSlideWrap exploreRecapSlideWrap--loopClone" aria-hidden="true">
                  {renderRecapSlideAt(recap, slideCount - 1, onOpenEvent)}
                </div>
              ) : null}
              {Array.from({ length: slideCount }, (_, i) => (
                <div key={hasSlides ? recap.slides[i]?.id ?? i : 'empty'} className="exploreRecapSlideWrap">
                  {renderRecapSlideAt(recap, i, onOpenEvent)}
                </div>
              ))}
              {loopEnabled ? (
                <div className="exploreRecapSlideWrap exploreRecapSlideWrap--loopClone" aria-hidden="true">
                  {renderRecapSlideAt(recap, 0, onOpenEvent)}
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
