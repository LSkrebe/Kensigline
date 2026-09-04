import { useEffect, useMemo, useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import { isMockDataMode } from './dataMode.js'
import { loadExploreDirectoryBundle } from './exploreApi.js'
import { buildExploreInvestorEvents } from './exploreDirectoryMock.js'
import { filterExploreHomeRows, normalizeExploreSearchQuery } from './exploreDirectorySearch.js'
import { ExploreDirectoryInvestorRow } from './ExploreDirectoryRows.jsx'
import { buildExploreWatchlistRows, extractExploreInvestorEvents } from './exploreWatchlistData.js'
import { WATCHLIST_TXNS_PER_PERSON } from './exploreWatchlistCatalog.js'
import { useCollapseScroll } from './collapseScroll.js'
import { TerminalTopBarChrome } from './TerminalTopBarChrome.jsx'
import { useExploreScrollList } from './useExploreScrollList.js'
import { EXPLORE_DIRECTORY_BLOCK } from './exploreDirectoryMock.js'
import './DeepReport.css'
import './ExplorePage.css'

const EXPLORE_WATCHLIST_COLLAPSE_RANGE_FALLBACK = 1
const EXPLORE_WATCHLIST_EXPANDED_FADE_END = 0.88
const EXPLORE_WATCHLIST_COMPACT_FADE_START = 0
const EXPLORE_WATCHLIST_COMPACT_MQ = '(max-width: 960px)'
const EXPLORE_WATCHLIST_COMPACT_STEP = 12

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
  const compact = useExploreWatchlistCompactLayout()
  const pageSize = compact ? EXPLORE_WATCHLIST_COMPACT_STEP : EXPLORE_DIRECTORY_BLOCK
  const [searchQuery, setSearchQuery] = useState('')
  const [rowsLoading, setRowsLoading] = useState(() => !isMockDataMode(backendUp))
  const [rows, setRows] = useState(() =>
    isMockDataMode(backendUp) ? buildExploreWatchlistRows(buildExploreInvestorEvents()) : [],
  )
  const { pageRef, dockRef, spacerRef } = useCollapseScroll({
    progressVars: exploreWatchlistCollapseProgressVars,
    resetKey: 'watchlist',
    rangeFallback: EXPLORE_WATCHLIST_COLLAPSE_RANGE_FALLBACK,
  })
  const normalizedQuery = normalizeExploreSearchQuery(searchQuery)

  useEffect(() => {
    let cancelled = false
    if (isMockDataMode(backendUp)) {
      setRows(buildExploreWatchlistRows(buildExploreInvestorEvents()))
      setRowsLoading(false)
      return
    }
    setRowsLoading(true)
    ;(async () => {
      const bundle = await loadExploreDirectoryBundle(backendUp)
      if (cancelled) return
      const events = extractExploreInvestorEvents(bundle)
      setRows(buildExploreWatchlistRows(events))
      setRowsLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [backendUp, authUserId])

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
    resetKey: `watchlist:${normalizedQuery}`,
  })

  const groupSize = WATCHLIST_TXNS_PER_PERSON

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
                collapsibleSearch
                showSearch
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
                visibleRows.map((row, index) => (
                  <ExploreDirectoryInvestorRow
                    key={row.id}
                    row={row}
                    onClick={onInvestorRowClick}
                    className={
                      (index + 1) % groupSize === 0 && index < visibleRows.length - 1
                        ? 'exploreWatchlistRowGroupEnd'
                        : undefined
                    }
                  />
                ))
              ) : rowsLoading ? (
                <li className="exploreDirectoryEmpty mono exploreDirectoryEmpty--loading">Loading…</li>
              ) : (
                <li className="exploreDirectoryEmpty mono">No matches</li>
              )}
            </ul>
            {hasMore ? (
              <ExploreWatchlistShowMoreButton remaining={remaining} onClick={loadMore} />
            ) : null}
            <div ref={sentinelRef} className="exploreDirScrollSentinel" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  )
}
