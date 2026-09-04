import { useEffect, useMemo, useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import { isMockDataMode } from './dataMode.js'
import { loadExploreDirectoryBundle } from './exploreApi.js'
import { buildExploreInvestorEvents } from './exploreDirectoryMock.js'
import { filterExploreHomeRows, normalizeExploreSearchQuery } from './exploreDirectorySearch.js'
import { ExploreWatchlistPagePersonRow } from './ExploreWatchlistPageRows.jsx'
import { buildExploreWatchlistPeople, extractExploreInvestorEvents, extractExploreWatchlistEvents } from './exploreWatchlistData.js'
import { useUserWatchlist } from './UserWatchlistContext.jsx'
import { useCollapseScroll } from './collapseScroll.js'
import { TerminalTopBarChrome } from './TerminalTopBarChrome.jsx'
import './DeepReport.css'
import './ExplorePage.css'

const EXPLORE_WATCHLIST_COLLAPSE_RANGE_FALLBACK = 1
const EXPLORE_WATCHLIST_EXPANDED_FADE_END = 0.88
const EXPLORE_WATCHLIST_COMPACT_FADE_START = 0

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
  const [searchQuery, setSearchQuery] = useState('')
  const [rowsLoading, setRowsLoading] = useState(() => !isMockDataMode(backendUp))
  const [rows, setRows] = useState(() =>
    isMockDataMode(backendUp)
      ? buildExploreWatchlistPeople(buildExploreInvestorEvents(), { people: watchlistPeople })
      : [],
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
      setRows(buildExploreWatchlistPeople(buildExploreInvestorEvents(), { people: watchlistPeople }))
      setRowsLoading(false)
      return
    }
    setRowsLoading(true)
    ;(async () => {
      const bundle = await loadExploreDirectoryBundle(backendUp)
      if (cancelled) return
      const events = extractExploreInvestorEvents(bundle)
      const latest = extractExploreWatchlistEvents(bundle)
      setRows(buildExploreWatchlistPeople(events, { people: watchlistPeople, watchlistLatest: latest }))
      setRowsLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [backendUp, authUserId, watchlistPeople])

  const filteredRows = useMemo(
    () => filterExploreHomeRows(rows, searchQuery),
    [rows, searchQuery],
  )

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
          <div className="exploreDirListPanel">
            <ul className="exploreDirectoryList exploreWatchlistList">
              {filteredRows.length ? (
                filteredRows.map((row) => (
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
                <li className="exploreDirectoryEmpty mono exploreDirectoryEmpty--loading">Loading…</li>
              ) : searching ? (
                <li className="exploreDirectoryEmpty mono">No matches</li>
              ) : (
                <li className="exploreDirectoryEmpty mono">No one on your watchlist yet</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
