import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {ExplorePerformanceSlide} from './ExplorePerformance.jsx'
import { EMPTY_EXPLORE_RECAP } from './dataMode.js'
import { MiniPriceChart } from './MiniPriceChart.jsx'
import { TerminalTopBarChrome } from './TerminalTopBarChrome.jsx'
import { SkeletonStatus } from './AppSkeleton.jsx'

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

function ExploreRecapLoadingSlide() {
  return (
    <article className="exploreRecapSlide exploreRecapSlide--event exploreRecapSlide--loading" aria-busy="true">
      <div className="exploreRecapSlideInner exploreRecapSlideInner--event">
        <div className="exploreRecapEventCopy">
          <SkeletonStatus label="Loading today's recap">
            <span className="appSkel appSkel--recapTitle" />
            <span className="appSkel appSkel--recapLine" />
          </SkeletonStatus>
        </div>
      </div>
    </article>
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

function renderRecapSlideAt(recap, logicalIdx, onOpenEvent, loading = false) {
  if (loading) return <ExploreRecapLoadingSlide />
  const slides = Array.isArray(recap?.slides) ? recap.slides : []
  if (!slides.length) return <ExploreRecapEmptySlide isFallback={recap?.isFallback === true} />
  const slide = slides[logicalIdx]
  if (!slide) return null
  if (slide.kind === 'performance') return <ExplorePerformanceSlide slide={slide} />
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
  backendUp = null,
  macroActive = false,
  onMacroClick,
  settingsActive = false,
  onSettingsClick,
  onBrandClick = null,
  searchValue = '',
  onSearchChange = null,
}) {
  return (
    <section className="exploreRecap exploreRecap--flat" aria-label="Explore">
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
          hideDate
          showSearch
          settingsAsText
          searchPlaceholder="Search"
          searchValue={searchValue}
          onSearchChange={onSearchChange}
        />
      </div>
    </section>
  )
}
