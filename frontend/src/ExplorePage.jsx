import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  buildExploreDirectoryHomeLatest,
  buildExploreDirectoryHomePreview,
  EXPLORE_DIRECTORY_BLOCK,
  HOME_DIRECTORY_PREVIEW,
} from './exploreDirectoryMock.js'
import { ExploreDirectoryCompanyRow, ExploreDirectoryInvestorRow } from './ExploreDirectoryRows.jsx'
import { ExploreDailyRecap } from './ExploreDailyRecap.jsx'
import { filterExploreHomeRows, normalizeExploreSearchQuery } from './exploreDirectorySearch.js'
import { buildExploreDailyRecap } from './exploreRecapMock.js'
import { navigateExploreCompanies, navigateExploreEventDetail, navigateExploreInvestors } from './terminalRoute.js'
import { useExploreScrollList } from './useExploreScrollList.js'
import './DeepReport.css'
import './ExplorePage.css'

const COLLAPSE_RANGE_FALLBACK = 1
/** Scroll progress (0–1) at which recap hero / expanded bg finishes fading. */
const EXPLORE_EXPANDED_FADE_END = 0.92
/** Keep compact strip dark until near the end so the hero photo doesn't morph mid-collapse. */
const EXPLORE_COMPACT_FADE_START = 0.62
const EXPLORE_COMPACT_MQ = '(max-width: 960px)'
const EXPLORE_HOME_COMPACT_STEP = 10

function collapseProgressVars(progress) {
  const p = Math.min(1, Math.max(0, progress))
  const expandedOpacity = p <= EXPLORE_EXPANDED_FADE_END ? 1 - p / EXPLORE_EXPANDED_FADE_END : 0
  const compactOpacity =
    p <= EXPLORE_COMPACT_FADE_START
      ? 0
      : (p - EXPLORE_COMPACT_FADE_START) / (1 - EXPLORE_COMPACT_FADE_START)
  return {
    '--explore-collapse': String(p),
    '--explore-expanded-opacity': String(expandedOpacity),
    '--explore-compact-opacity': String(compactOpacity),
  }
}

function useExploreCompactLayout() {
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(EXPLORE_COMPACT_MQ).matches,
  )

  useEffect(() => {
    const mq = window.matchMedia(EXPLORE_COMPACT_MQ)
    const onChange = () => setCompact(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return compact
}

function ExploreHomeShowMoreButton({ remaining, onClick }) {
  const step = Math.min(EXPLORE_HOME_COMPACT_STEP, remaining)
  return (
    <button
      type="button"
      className="drpt-showMore exploreDirShowMore exploreHomeShowMore"
      onClick={onClick}
      aria-label={`Show ${step} more`}
    >
      <span className="drpt-showMoreChip" aria-hidden="true">
        <span className="drpt-showMoreSign">+</span>
        <span className="drpt-showMoreLabel">{step}</span>
      </span>
    </button>
  )
}

function ExploreDirectorySection({
  title,
  kicker,
  onOpen,
  rows,
  RowComponent,
  onRowClick,
  scrollRootRef,
  compact,
  pageSize,
  resetKey = '',
}) {
  const { visibleRows, hasMore, remaining, loadMore, sentinelRef } = useExploreScrollList({
    rows,
    pageSize,
    compact,
    scrollRootRef,
    loadStep: compact ? EXPLORE_HOME_COMPACT_STEP : EXPLORE_DIRECTORY_BLOCK,
    resetKey,
  })

  return (
    <section className="exploreDirectorySection">
      <button
        type="button"
        className="exploreDirectorySectionHead"
        aria-label={`Open ${title}`}
        onClick={onOpen}
      >
        <span className="exploreDirectorySectionHeadCopy">
          <span className="exploreDirectorySectionKicker mono">{kicker}</span>
          <span className="exploreDirectorySectionTitleRow">
            <span className="exploreDirectorySectionTitle">{title}</span>
            <span className="exploreDirectorySectionChevron mono" aria-hidden="true">
              &gt;
            </span>
          </span>
        </span>
      </button>
      <div className={['exploreHomeListPanel', compact && hasMore ? 'exploreHomeListPanel--truncated' : '']
        .filter(Boolean)
        .join(' ')}
      >
        <ul className="exploreDirectoryList">
          {visibleRows.length ? (
            visibleRows.map((row) => <RowComponent key={row.id} row={row} onClick={onRowClick} />)
          ) : (
            <li className="exploreDirectoryEmpty mono">No matches</li>
          )}
        </ul>
        {compact && hasMore ? (
          <ExploreHomeShowMoreButton remaining={remaining} onClick={() => loadMore(EXPLORE_HOME_COMPACT_STEP)} />
        ) : null}
        {!compact && hasMore ? (
          <div ref={sentinelRef} className="exploreDirScrollSentinel" aria-hidden="true" />
        ) : null}
      </div>
    </section>
  )
}

export function ExplorePage({
  backendUp = true,
  macroActive = false,
  onMacroClick,
  settingsActive = false,
  onSettingsClick,
  onBrandClick = null,
  onCompanyRowClick = null,
  onInvestorRowClick = null,
  onEventClick = null,
}) {
  const recap = useMemo(() => buildExploreDailyRecap(), [])
  const homePreview = useMemo(() => buildExploreDirectoryHomePreview(), [])
  const homeSearchPool = useMemo(() => buildExploreDirectoryHomeLatest(), [])
  const [searchQuery, setSearchQuery] = useState('')
  const pageRef = useRef(null)
  const dockRef = useRef(null)
  const spacerRef = useRef(null)
  const compact = useExploreCompactLayout()
  const normalizedQuery = normalizeExploreSearchQuery(searchQuery)
  const searching = normalizedQuery.length > 0
  const sectionKicker = searching ? 'Matches' : 'Latest'
  const pageSize = compact ? EXPLORE_HOME_COMPACT_STEP : HOME_DIRECTORY_PREVIEW

  const investorRows = useMemo(() => {
    if (!searching) return homePreview.investors
    return filterExploreHomeRows(homeSearchPool.investors, searchQuery)
  }, [searching, homePreview.investors, homeSearchPool.investors, searchQuery])

  const companyRows = useMemo(() => {
    if (!searching) return homePreview.companies
    return filterExploreHomeRows(homeSearchPool.companies, searchQuery)
  }, [searching, homePreview.companies, homeSearchPool.companies, searchQuery])

  const openRecapEvent = useCallback(
    (slide) => {
      if (typeof onEventClick === 'function') {
        onEventClick(slide)
        return
      }
      if (slide?.id) navigateExploreEventDetail(slide.id)
    },
    [onEventClick],
  )

  const requestRecapCollapse = useCallback(() => {
    const page = pageRef.current
    const spacer = spacerRef.current
    if (!page || !spacer) return
    page.scrollTo({ top: spacer.offsetHeight, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    const page = pageRef.current
    const dock = dockRef.current
    const spacer = spacerRef.current
    if (!page || !dock) return undefined

    let raf = 0

    const syncCollapse = () => {
      raf = 0
      const range = spacer?.offsetHeight || COLLAPSE_RANGE_FALLBACK
      const progress = Math.min(1, Math.max(0, page.scrollTop / range))
      for (const [key, value] of Object.entries(collapseProgressVars(progress))) {
        dock.style.setProperty(key, value)
      }
    }

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(syncCollapse)
    }

    const onResize = () => {
      if (!raf) raf = requestAnimationFrame(syncCollapse)
    }

    page.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    syncCollapse()

    return () => {
      page.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div className="explorePage" ref={pageRef}>
      <div className="exploreRecapStickWrap">
        <div ref={dockRef} className="exploreRecapDock">
          <ExploreDailyRecap
            recap={recap}
            backendUp={backendUp}
            macroActive={macroActive}
            onMacroClick={onMacroClick}
            settingsActive={settingsActive}
            onSettingsClick={onSettingsClick}
            onBrandClick={onBrandClick}
            onRequestCollapse={requestRecapCollapse}
            onOpenEvent={openRecapEvent}
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
          />
        </div>
        <div ref={spacerRef} className="exploreRecapCollapseSpacer" aria-hidden="true" />
        <div className="explorePageBody">
          <ExploreDirectorySection
            key={`investors-${sectionKicker}-${normalizedQuery}`}
            title="Investors"
            kicker={sectionKicker}
            onOpen={() => navigateExploreInvestors()}
            rows={investorRows}
            RowComponent={ExploreDirectoryInvestorRow}
            onRowClick={onInvestorRowClick}
            scrollRootRef={pageRef}
            compact={compact}
            pageSize={pageSize}
            resetKey={normalizedQuery}
          />

          <ExploreDirectorySection
            key={`companies-${sectionKicker}-${normalizedQuery}`}
            title="Companies"
            kicker={sectionKicker}
            onOpen={() => navigateExploreCompanies()}
            rows={companyRows}
            RowComponent={ExploreDirectoryCompanyRow}
            onRowClick={onCompanyRowClick}
            scrollRootRef={pageRef}
            compact={compact}
            pageSize={pageSize}
            resetKey={normalizedQuery}
          />
        </div>
      </div>
    </div>
  )
}
