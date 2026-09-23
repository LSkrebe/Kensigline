import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import { isMockDataMode } from './dataMode.js'
import { loadExploreDirectoryBundle } from './exploreApi.js'
import { buildExploreInvestorEvents, EXPLORE_DIRECTORY_BLOCK } from './exploreDirectoryMock.js'
import { filterExploreHomeRows, normalizeExploreSearchQuery } from './exploreDirectorySearch.js'
import { ExploreWatchlistPagePersonRow } from './ExploreWatchlistPageRows.jsx'
import { buildExploreWatchlistPeople, extractExploreInvestorEvents, extractExploreWatchlistEvents } from './exploreWatchlistData.js'
import { useUserWatchlist } from './UserWatchlistContext.jsx'
import { useCollapseScroll } from './collapseScroll.js'
import { TerminalTopBarChrome } from './TerminalTopBarChrome.jsx'
import { useExploreScrollList } from './useExploreScrollList.js'
import { SkeletonRow } from './AppSkeleton.jsx'
import './DeepReport.css'
import './ExplorePage.css'

const EXPLORE_WATCHLIST_COLLAPSE_RANGE_FALLBACK = 1
const EXPLORE_WATCHLIST_EXPANDED_FADE_END = 0.88
const EXPLORE_WATCHLIST_COMPACT_FADE_START = 0
const EXPLORE_WATCHLIST_COMPACT_MQ = '(max-width: 960px)'
const EXPLORE_WATCHLIST_COMPACT_STEP = 10

function exploreWatchlistCollapseProgressVars(progress) {
  const p = Math.min(1, Math.max(0, progress))
  const expandedOpacity = p <= EXPLORE_WATCHLIST_EXPANDED_FADE_END ? 1 - p / EXPLORE_WATCHLIST_EXPANDED_FADE_END : 0
  const compactOpacity =
    p <= EXPLORE_WATCHLIST_COMPACT_FADE_START
      ? 0
      : (p - EXPLORE_WATCHLIST_COMPACT_FADE_START) / (1 - EXPLORE_WATCHLIST_COMPACT_FADE_START)
  return {
    '--deep-collapse': String(p),
    '--deep-expanded-opacity': String(expandedOpacity),
    '--deep-compact-opacity': String(compactOpacity),
  }
}

function useExploreWatchlistCompactLayout() {
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(EXPLORE_WATCHLIST_COMPACT_MQ).matches,
  )

  useEffect(() => {
    const mq = window.matchMedia(EXPLORE_WATCHLIST_COMPACT_MQ)
    const onChange = () => setCompact(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return compact
}

function ExploreWatchlistShowMoreButton({ remaining, onClick }) {
  const step = Math.min(EXPLORE_WATCHLIST_COMPACT_STEP, remaining)
  return (
    <button
      type="button"
      className="drpt-showMore exploreDirShowMore"
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

export function ExploreWatchlistPage({
  backendUp = null,
  macroActive = false,
  onMacroClick,
  settingsActive = false,
  onSettingsClick,
  onBrandClick = null,
  onCloseClick = null,
  onInvestorRowClick = null,
}) {
  const { user } = useAuth()
  const authUserId = user?.id ?? null
  const { watchlistPeople } = useUserWatchlist()
  const compact = useExploreWatchlistCompactLayout()
  const pageSize = compact ? EXPLORE_WATCHLIST_COMPACT_STEP : EXPLORE_DIRECTORY_BLOCK
  const [searchQuery, setSearchQuery] = useState('')
  const [rowsLoading, setRowsLoading] = useState(() => !isMockDataMode(backendUp))
  const [rows, setRows] = useState(() =>
    isMockDataMode(backendUp)
      ? buildExploreWatchlistPeople(buildExploreInvestorEvents(), { people: watchlistPeople })
      : [],
  )
  const bundleCacheRef = useRef(null)
  const fetchKeyRef = useRef(`${backendUp}:${authUserId ?? ''}`)
  const { pageRef, dockRef, spacerRef } = useCollapseScroll({
    progressVars: exploreWatchlistCollapseProgressVars,
    resetKey: 'watchlist',
    rangeFallback: EXPLORE_WATCHLIST_COLLAPSE_RANGE_FALLBACK,
  })
  const normalizedQuery = normalizeExploreSearchQuery(searchQuery)
  const watchlistPeopleKey = useMemo(
    () =>
      watchlistPeople
        .map((person) => `${person.name}:${person.slug ?? ''}:${person.mode ?? ''}`)
        .join('|'),
    [watchlistPeople],
  )

  useEffect(() => {
    let cancelled = false
    const fetchKey = `${backendUp}:${authUserId ?? ''}`
    if (fetchKeyRef.current !== fetchKey) {
      fetchKeyRef.current = fetchKey
      bundleCacheRef.current = null
    }

    if (isMockDataMode(backendUp)) {
      setRows(buildExploreWatchlistPeople(buildExploreInvestorEvents(), { people: watchlistPeople }))
      setRowsLoading(false)
      return
    }

    const rebuildFromCache = () => {
      const bundle = bundleCacheRef.current
      if (!bundle) return false
      const events = extractExploreInvestorEvents(bundle)
      const latest = extractExploreWatchlistEvents(bundle)
      setRows(buildExploreWatchlistPeople(events, { people: watchlistPeople, watchlistLatest: latest }))
      return true
    }

    if (rebuildFromCache()) {
      setRowsLoading(false)
      return
    }

    setRowsLoading(true)
    ;(async () => {
      const bundle = await loadExploreDirectoryBundle(backendUp)
      if (cancelled) return
      bundleCacheRef.current = bundle
      const events = extractExploreInvestorEvents(bundle)
      const latest = extractExploreWatchlistEvents(bundle)
      setRows(buildExploreWatchlistPeople(events, { people: watchlistPeople, watchlistLatest: latest }))
      setRowsLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [backendUp, authUserId, watchlistPeopleKey, watchlistPeople])

  const filteredRows = useMemo(
    () => filterExploreHomeRows(rows, searchQuery),
    [rows, searchQuery],
  )

  const { visibleRows, hasMore, remaining, loadMore, sentinelRef } = useExploreScrollList({
    rows: filteredRows,
    pageSize,
    compact,
    scrollRootRef: pageRef,
    loadStep: compact ? EXPLORE_WATCHLIST_COMPACT_STEP : EXPLORE_DIRECTORY_BLOCK,
    resetKey: `watchlist:${normalizedQuery}:${watchlistPeopleKey}`,
  })

  const searching = normalizedQuery.length > 0

  return (
    <div className="exploreDirShell" ref={pageRef}>
      <div className="drpt-stickWrap">
        <div ref={dockRef} className="drpt-dock">
          <div className="drpt-viewport">
            <div className="drpt-expandedBg" aria-hidden="true" />
            <div className="drpt-chromeBar">
              <div className="drpt-compactBg" aria-hidden="true" />
              <TerminalTopBarChrome
                className="exploreRecapChrome"
                logoSrc="/mercerline_mark.png"
                backendUp={backendUp}
                macroActive={macroActive}
                onMacroClick={onMacroClick}
                settingsActive={settingsActive}
                onSettingsClick={onSettingsClick}
                onBrandClick={onBrandClick}
                showClose={!!onCloseClick}
                onCloseClick={onCloseClick}
                searchPlaceholder="Search watchlist"
                searchPlaceholderMobile="Search watchlist"
                searchValue={searchQuery}
                onSearchChange={setSearchQuery}
              />
            </div>
            <div className="drpt-expanded">
              <header className="drpt-topbar drpt-topbar--directory">
                <div className="drpt-topbarIdentity">
                  <p className="drpt-kicker">Directory</p>
                  <div className="drpt-topbarTitleRow">
                    <h1 className="drpt-topbarTicker">Watchlist</h1>
                  </div>
                </div>
                <div className="drpt-topbarMeta">
                  <span>Recent disclosures from politicians, insiders, and institutions people track most.</span>
                </div>
              </header>
            </div>
          </div>
        </div>

        <div ref={spacerRef} className="drpt-collapseSpacer" aria-hidden="true" />

        <div className="exploreDirPaper">
          <div
            className={['exploreDirListPanel', compact && hasMore ? 'exploreDirListPanel--truncated' : '']
              .filter(Boolean)
              .join(' ')}
          >
            <ul className="exploreDirectoryList exploreWatchlistList">
              {visibleRows.length ? (
                visibleRows.map((row) => (
                  <ExploreWatchlistPagePersonRow
                    key={row.id}
                    row={row}
                    onEventClick={
                      onInvestorRowClick
                        ? (event) =>
                            onInvestorRowClick({
                              ...row,
                              ticker: event.ticker,
                              docType: event.docType,
                              trail: event.trail,
                              date: event.date,
                              id: event.id,
                            })
                        : null
                    }
                  />
                ))
              ) : rowsLoading ? (
                Array.from({ length: 4 }, (_, index) => <SkeletonRow key={index} tag="li" />)
              ) : searching ? (
                <li className="exploreDirectoryEmpty mono">No matches</li>
              ) : (
                <li className="exploreDirectoryEmpty mono">No one on your watchlist yet</li>
              )}
            </ul>
            {compact && hasMore ? (
              <ExploreWatchlistShowMoreButton
                remaining={remaining}
                onClick={() => loadMore(EXPLORE_WATCHLIST_COMPACT_STEP)}
              />
            ) : null}
            {!compact && hasMore ? (
              <div ref={sentinelRef} className="exploreDirScrollSentinel" aria-hidden="true" />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
