import { useCallback, useEffect, useMemo, useState } from 'react'
import { useCollapseScroll } from './collapseScroll.js'
import {
  buildExploreDirectoryHomeLatest,
  buildExploreDirectoryHomePreview,
  buildExploreInvestorEvents,
  formatExploreRecency,
  formatExplorePublishDate,
  HOME_DIRECTORY_PREVIEW,
} from './exploreDirectoryMock.js'
import { loadExploreHomeBundle, peekExploreHomeSnapshot } from './exploreApi.js'
import { EMPTY_EXPLORE_RECAP, isDataModePending, isExploreNetworkMode, isLiveDataMode, isMockDataMode } from './dataMode.js'
import { ExploreDirectoryCompanyRow, ExploreDirectoryInvestorRow } from './ExploreDirectoryRows.jsx'
import { ExploreDailyRecap } from './ExploreDailyRecap.jsx'
import { ExploreStoryCards } from './ExploreStoryCards.jsx'
import {
  EXPLORE_RECAP_HERO_MAX,
  EXPLORE_RECAP_MAX_SLIDES,
  splitExploreRecapSlides,
} from './exploreRecapCatalog.js'
import { filterExploreHomeRows, normalizeExploreSearchQuery } from './exploreDirectorySearch.js'
import { buildExploreWatchlistPeople, extractExploreInvestorEvents, extractExploreWatchlistEvents } from './exploreWatchlistData.js'
import { ExploreWatchlistSection } from './ExploreWatchlistSection.jsx'
import { useUserWatchlist } from './UserWatchlistContext.jsx'
import { buildExploreDailyRecap } from './exploreRecapMock.js'
import { isCaptureMode } from './captureMode.js'
import { navigateExploreCompanies, navigateExploreEventDetail, navigateExploreInvestors, navigateExploreWatchlist } from './terminalRoute.js'
import './DeepReport.css'
import './ExplorePage.css'

const COLLAPSE_RANGE_FALLBACK = 1
/** Scroll progress (0–1) at which recap hero / expanded bg finishes fading. */
const EXPLORE_EXPANDED_FADE_END = 0.92
/** Keep compact strip dark until near the end so the hero photo doesn't morph mid-collapse. */
const EXPLORE_COMPACT_FADE_START = 0.62
const EXPLORE_HOME_STORY_PREVIEW = Math.max(0, EXPLORE_RECAP_MAX_SLIDES - EXPLORE_RECAP_HERO_MAX)

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

function ExploreDirectorySection({
  title,
  kicker,
  onOpen,
  rows,
  RowComponent,
  onRowClick,
  previewLimit,
  loading = false,
}) {
  const previewRows = useMemo(() => rows.slice(0, previewLimit), [rows, previewLimit])

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
      <div className="exploreHomeListPanel">
        <ul className="exploreDirectoryList">
          {previewRows.length ? (
            previewRows.map((row) => <RowComponent key={row.id} row={row} onClick={onRowClick} />)
          ) : loading ? (
            <li className="exploreDirectoryEmpty mono exploreDirectoryEmpty--loading">Loading…</li>
          ) : (
            <li className="exploreDirectoryEmpty mono">No matches</li>
          )}
        </ul>
      </div>
    </section>
  )
}

export function ExplorePage({
  backendUp = null,
  macroActive = false,
  onMacroClick,
  settingsActive = false,
  onSettingsClick,
  onBrandClick = null,
  onCompanyRowClick = null,
  onInvestorRowClick = null,
  onEventClick = null,
}) {
  const { watchlistPeople } = useUserWatchlist()
  const initialSnapshot = useMemo(() => {
    if (isCaptureMode() || isMockDataMode(backendUp)) {
      return {
        recap: buildExploreDailyRecap(),
        homePreview: buildExploreDirectoryHomePreview(),
        homeSearchPool: buildExploreDirectoryHomeLatest(),
        homeLoading: false,
      }
    }
    const cached = peekExploreHomeSnapshot(backendUp)
    if (cached?.recap && cached?.homePreview) {
      return {
        recap: cached.recap,
        homePreview: cached.homePreview,
        homeSearchPool: cached.homeLatest ?? { companies: [], investors: [] },
        homeLoading: false,
      }
    }
    return {
      recap: null,
      homePreview: null,
      homeSearchPool: null,
      homeLoading: isExploreNetworkMode(backendUp) && !cached?.recap,
    }
  }, [backendUp])

  const [recap, setRecap] = useState(initialSnapshot.recap ?? EMPTY_EXPLORE_RECAP)
  const [homePreview, setHomePreview] = useState(
    () => initialSnapshot.homePreview ?? { companies: [], investors: [] },
  )
  const [homeSearchPool, setHomeSearchPool] = useState(
    () => initialSnapshot.homeSearchPool ?? { companies: [], investors: [] },
  )
  const [investorEvents, setInvestorEvents] = useState(() =>
    isCaptureMode() || isMockDataMode(backendUp) ? buildExploreInvestorEvents() : [],
  )
  const [watchlistEvents, setWatchlistEvents] = useState(() => [])
  const [homeLoading, setHomeLoading] = useState(initialSnapshot.homeLoading)

  const syncDirectoryState = useCallback((directory) => {
    if (!directory) return
    setHomePreview(directory.homePreview ?? { companies: [], investors: [] })
    setHomeSearchPool(directory.homeLatest ?? { companies: [], investors: [] })
    setInvestorEvents(extractExploreInvestorEvents(directory))
    setWatchlistEvents(extractExploreWatchlistEvents(directory))
  }, [])

  useEffect(() => {
    let cancelled = false

    if (isMockDataMode(backendUp)) {
      setRecap(buildExploreDailyRecap())
      setHomePreview(buildExploreDirectoryHomePreview())
      setHomeSearchPool(buildExploreDirectoryHomeLatest())
      setInvestorEvents(buildExploreInvestorEvents())
      setHomeLoading(false)
      return
    }

    if (isDataModePending(backendUp)) {
      const cached = peekExploreHomeSnapshot(null)
      if (cached?.recap && cached?.homePreview) {
        setRecap(cached.recap)
        setHomePreview(cached.homePreview)
        setHomeSearchPool(cached.homeLatest ?? { companies: [], investors: [] })
        setHomeLoading(cached.stale === true)
      } else {
        setHomeLoading(true)
      }
      void loadExploreHomeBundle(null, { force: false }).then((bundle) => {
        if (cancelled || !bundle?.recap) return
        if (bundle.stale) {
          setHomeLoading(true)
          void loadExploreHomeBundle(null, { force: true }).then((fresh) => {
            if (cancelled || !fresh?.recap) return
            setRecap(fresh.recap)
            if (fresh.directory) syncDirectoryState(fresh.directory)
            setHomeLoading(false)
          })
          return
        }
        setRecap(bundle.recap)
        if (bundle.directory) syncDirectoryState(bundle.directory)
        setHomeLoading(false)
      })
      return
    }

    if (!isLiveDataMode(backendUp)) {
      setHomeLoading(false)
      return
    }

    const cached = peekExploreHomeSnapshot(backendUp)
    if (cached?.recap && cached?.homePreview) {
      setRecap(cached.recap)
      setHomePreview(cached.homePreview)
      setHomeSearchPool(cached.homeLatest ?? { companies: [], investors: [] })
      setHomeLoading(cached.stale === true)
    } else {
      setHomeLoading(true)
    }

    void loadExploreHomeBundle(backendUp, { force: false }).then((bundle) => {
      if (cancelled || !bundle?.recap) return
      if (bundle.stale) {
        setHomeLoading(true)
        void loadExploreHomeBundle(backendUp, { force: true }).then((fresh) => {
          if (cancelled || !fresh?.recap) return
          setRecap(fresh.recap)
          if (fresh.directory) syncDirectoryState(fresh.directory)
          setHomeLoading(false)
        })
        return
      }
      setRecap(bundle.recap)
      if (bundle.directory) syncDirectoryState(bundle.directory)
      setHomeLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [backendUp, syncDirectoryState])

  const [searchQuery, setSearchQuery] = useState('')
  const { pageRef, dockRef, spacerRef } = useCollapseScroll({
    progressVars: collapseProgressVars,
    resetKey: 'explore-home',
    rangeFallback: COLLAPSE_RANGE_FALLBACK,
  })
  const normalizedQuery = normalizeExploreSearchQuery(searchQuery)
  const searching = normalizedQuery.length > 0
  const useUtcDates = isLiveDataMode(backendUp)
  const displayMeta = useMemo(() => {
    const displayDayKey = recap?.displayDayKey ?? homePreview?.displayDayKey ?? null
    const isFallback = recap?.isFallback === true || homePreview?.isFallback === true
    return { displayDayKey, isFallback }
  }, [recap, homePreview])
  const fallbackDayLabel = useMemo(() => {
    if (!displayMeta.isFallback || !displayMeta.displayDayKey) return null
    return formatExploreRecency(displayMeta.displayDayKey, { utc: useUtcDates })
  }, [displayMeta.displayDayKey, displayMeta.isFallback, useUtcDates])
  const sectionKicker = searching ? 'Matches' : fallbackDayLabel ?? 'Latest'
  const previewLimit = HOME_DIRECTORY_PREVIEW

  const investorRows = useMemo(() => {
    if (!searching) return homePreview.investors
    return filterExploreHomeRows(homeSearchPool.investors, searchQuery)
  }, [searching, homePreview.investors, homeSearchPool.investors, searchQuery])

  const companyRows = useMemo(() => {
    if (!searching) return homePreview.companies
    return filterExploreHomeRows(homeSearchPool.companies, searchQuery)
  }, [searching, homePreview.companies, homeSearchPool.companies, searchQuery])

  const watchlistRows = useMemo(() => {
    const rows = buildExploreWatchlistPeople(investorEvents, { people: watchlistPeople, watchlistLatest: watchlistEvents })
    if (!searching) return rows
    return filterExploreHomeRows(rows, searchQuery)
  }, [investorEvents, watchlistEvents, watchlistPeople, searchQuery, searching])

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

  const { heroSlides, storySlides } = useMemo(
    () => splitExploreRecapSlides(recap?.slides),
    [recap?.slides],
  )

  const heroRecap = useMemo(
    () => ({
      ...recap,
      slides: heroSlides,
    }),
    [recap, heroSlides],
  )

  const storyPreviewSlides = useMemo(
    () => storySlides.slice(0, EXPLORE_HOME_STORY_PREVIEW),
    [storySlides],
  )

  const storyDateLabel = useMemo(
    () => (displayMeta.displayDayKey ? formatExplorePublishDate(displayMeta.displayDayKey) : null),
    [displayMeta.displayDayKey],
  )

  const requestRecapCollapse = useCallback(() => {
    const page = pageRef.current
    const spacer = spacerRef.current
    if (!page || !spacer) return
    page.scrollTo({ top: spacer.offsetHeight, behavior: 'smooth' })
  }, [pageRef, spacerRef])

  return (
    <div className="explorePage" ref={pageRef}>
      <div className="exploreRecapStickWrap">
        <div ref={dockRef} className="exploreRecapDock">
          <ExploreDailyRecap
            recap={heroRecap}
            loading={homeLoading}
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
          {!searching ? (
            <ExploreStoryCards
              slides={storyPreviewSlides}
              onOpenEvent={openRecapEvent}
              sectionKicker={sectionKicker}
              dateLabel={storyDateLabel}
            />
          ) : null}

          <ExploreWatchlistSection
            key={`watchlist-${sectionKicker}-${normalizedQuery}`}
            kicker={sectionKicker}
            rows={watchlistRows}
            onOpen={() => navigateExploreWatchlist()}
            onRowClick={onInvestorRowClick}
            loading={homeLoading}
          />

          <ExploreDirectorySection
            key={`investors-${sectionKicker}-${normalizedQuery}`}
            title="Investors"
            kicker={sectionKicker}
            onOpen={() => navigateExploreInvestors()}
            rows={investorRows}
            RowComponent={ExploreDirectoryInvestorRow}
            onRowClick={onInvestorRowClick}
            previewLimit={previewLimit}
            loading={homeLoading}
          />

          <ExploreDirectorySection
            key={`companies-${sectionKicker}-${normalizedQuery}`}
            title="Companies"
            kicker={sectionKicker}
            onOpen={() => navigateExploreCompanies()}
            rows={companyRows}
            RowComponent={ExploreDirectoryCompanyRow}
            onRowClick={onCompanyRowClick}
            previewLimit={previewLimit}
            loading={homeLoading}
          />
        </div>
      </div>
    </div>
  )
}
