import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useCollapseScroll } from './collapseScroll.js'
import {
  buildExploreDirectoryHomeLatest,
  buildExploreDirectoryHomePreview,
  buildExploreInvestorEvents,
} from './exploreDirectoryMock.js'
import { fetchExplorePerformanceMembers, loadExploreHomeBundle, peekExploreHomeSnapshot } from './exploreApi.js'
import { EMPTY_EXPLORE_RECAP, isDataModePending, isExploreNetworkMode, isLiveDataMode, isMockDataMode } from './dataMode.js'
import { ExploreDailyRecap } from './ExploreDailyRecap.jsx'
import { ExploreFeaturedCards } from './ExploreFeaturedCards.jsx'
import { filterExploreHomeRows, normalizeExploreSearchQuery } from './exploreDirectorySearch.js'
import { buildExploreWatchlistPeople, extractExploreInvestorEvents, extractExploreWatchlistEvents } from './exploreWatchlistData.js'
import { EXPLORE_WATCHLIST_CATALOG } from './exploreWatchlistCatalog.js'
import { ExploreWatchlistSection, selectExploreFeatured } from './ExploreWatchlistSection.jsx'
import { buildExploreDailyRecap } from './exploreRecapMock.js'
import { isCaptureMode } from './captureMode.js'
import './DeepReport.css'
import './ExplorePage.css'

const EXPLORE_COLLAPSE_RANGE_FALLBACK = 1
const EXPLORE_EXPANDED_FADE_END = 0.72

function exploreCollapseProgressVars(progress) {
  const p = Math.min(1, Math.max(0, progress))
  const expandedOpacity = p <= EXPLORE_EXPANDED_FADE_END ? 1 - p / EXPLORE_EXPANDED_FADE_END : 0
  return {
    '--explore-collapse': String(p),
    '--explore-expanded-opacity': String(expandedOpacity),
  }
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

  const [, setRecap] = useState(initialSnapshot.recap ?? EMPTY_EXPLORE_RECAP)
  const [, setHomePreview] = useState(
    () => initialSnapshot.homePreview ?? { companies: [], investors: [] },
  )
  const [, setHomeSearchPool] = useState(
    () => initialSnapshot.homeSearchPool ?? { companies: [], investors: [] },
  )
  const [investorEvents, setInvestorEvents] = useState(() =>
    isCaptureMode() || isMockDataMode(backendUp) ? buildExploreInvestorEvents() : [],
  )
  const [watchlistEvents, setWatchlistEvents] = useState(() => [])
  const [returnsBySlug, setReturnsBySlug] = useState(() => ({}))
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

  useEffect(() => {
    let cancelled = false
    if (isMockDataMode(backendUp) || isDataModePending(backendUp) || !isLiveDataMode(backendUp)) {
      setReturnsBySlug({})
      return undefined
    }
    void fetchExplorePerformanceMembers(backendUp).then((map) => {
      if (!cancelled && map) setReturnsBySlug(map)
    })
    return () => {
      cancelled = true
    }
  }, [backendUp])

  const [searchQuery, setSearchQuery] = useState('')
  const [range, setRange] = useState('6M')
  const normalizedQuery = normalizeExploreSearchQuery(searchQuery)
  const searching = normalizedQuery.length > 0

  const watchlistRows = useMemo(() => {
    // Curated universe is the only Explore list — personal watchlist is retired.
    const people = EXPLORE_WATCHLIST_CATALOG
    const rows = buildExploreWatchlistPeople(investorEvents, { people, watchlistLatest: watchlistEvents }).map(
      (row) => {
        const metrics = returnsBySlug[String(row.actorSlug ?? '').toLowerCase()]
        if (!metrics) return row
        return {
          ...row,
          returnsByRange: metrics.returns ?? metrics,
          investedUsd: metrics.investedUsd ?? null,
        }
      },
    )
    if (!searching) return rows
    return filterExploreHomeRows(rows, searchQuery)
  }, [investorEvents, watchlistEvents, searchQuery, searching, returnsBySlug])

  const featured = useMemo(() => selectExploreFeatured(watchlistRows, range), [watchlistRows, range])
  const { pageRef, dockRef, spacerRef } = useCollapseScroll({
    progressVars: exploreCollapseProgressVars,
    resetKey: 'explore',
    rangeFallback: EXPLORE_COLLAPSE_RANGE_FALLBACK,
  })
  const heroRef = useRef(null)

  useLayoutEffect(() => {
    const page = pageRef.current
    const dock = dockRef.current
    const hero = heroRef.current
    if (!page || !dock || !hero) return undefined
    const sync = () => {
      const bar = dock.querySelector('.exploreRecapChromeBar')
      const height = (bar?.offsetHeight || 56) + hero.scrollHeight
      page.style.setProperty('--explore-recap-expanded-h', `${height}px`)
    }
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(hero)
    return () => observer.disconnect()
  }, [dockRef, featured, pageRef])

  return (
    <div className="explorePage" ref={pageRef}>
      <div className="exploreRecapStickWrap">
        <div className="exploreRecapDock" ref={dockRef}>
          <ExploreDailyRecap
            backendUp={backendUp}
            macroActive={macroActive}
            onMacroClick={onMacroClick}
            settingsActive={settingsActive}
            onSettingsClick={onSettingsClick}
            onBrandClick={onBrandClick}
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
          />
          <div className="exploreFeaturedHero">
            <div className="exploreFeaturedSheet" ref={heroRef}>
              <ExploreFeaturedCards rows={featured} range={range} loading={homeLoading} onCardClick={onInvestorRowClick} />
            </div>
          </div>
        </div>
        <div className="exploreRecapCollapseSpacer" ref={spacerRef} aria-hidden="true" />
        <div className="explorePageBody">
          <ExploreWatchlistSection
            key={`watchlist-${normalizedQuery}`}
            rows={watchlistRows}
            range={range}
            onRangeChange={setRange}
            onRowClick={onInvestorRowClick}
            loading={homeLoading}
          />
        </div>
      </div>
    </div>
  )
}
