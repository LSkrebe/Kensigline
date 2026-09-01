import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  buildExploreDirectoryHomeLatest,
  buildExploreDirectoryHomePreview,
  formatExploreRecency,
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
import { buildExploreDailyRecap } from './exploreRecapMock.js'
import { navigateExploreCompanies, navigateExploreEventDetail, navigateExploreInvestors } from './terminalRoute.js'
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
  const initialSnapshot = useMemo(() => {
    if (isMockDataMode(backendUp)) {
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
  const [homeLoading, setHomeLoading] = useState(initialSnapshot.homeLoading)

  useEffect(() => {
    let cancelled = false

    if (isMockDataMode(backendUp)) {
      setRecap(buildExploreDailyRecap())
      setHomePreview(buildExploreDirectoryHomePreview())
      setHomeSearchPool(buildExploreDirectoryHomeLatest())
      setHomeLoading(false)
      return
    }

    if (isDataModePending(backendUp)) {
      const cached = peekExploreHomeSnapshot(null)
      if (cached?.recap && cached?.homePreview) {
        setRecap(cached.recap)
        setHomePreview(cached.homePreview)
        setHomeSearchPool(cached.homeLatest ?? { companies: [], investors: [] })
        setHomeLoading(false)
      } else {
        setHomeLoading(true)
      }
      void loadExploreHomeBundle(null, { force: false }).then((bundle) => {
        if (cancelled || !bundle?.recap) return
        setRecap(bundle.recap)
        if (bundle.directory) {
          setHomePreview(bundle.directory.homePreview ?? { companies: [], investors: [] })
          setHomeSearchPool(bundle.directory.homeLatest ?? { companies: [], investors: [] })
        }
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
      setHomeLoading(false)
    } else {
      setHomeLoading(true)
    }

    void loadExploreHomeBundle(backendUp, { force: false }).then((bundle) => {
      if (cancelled || !bundle?.recap) return
      setRecap(bundle.recap)
      if (bundle.directory) {
        setHomePreview(bundle.directory.homePreview ?? { companies: [], investors: [] })
        setHomeSearchPool(bundle.directory.homeLatest ?? { companies: [], investors: [] })
      }
      setHomeLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [backendUp])

  const [searchQuery, setSearchQuery] = useState('')
  const pageRef = useRef(null)
  const dockRef = useRef(null)
  const spacerRef = useRef(null)
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
            <ExploreStoryCards slides={storyPreviewSlides} onOpenEvent={openRecapEvent} sectionKicker={sectionKicker} />
          ) : null}

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
