import { useCallback, useEffect, useMemo, useState } from 'react'
import { EXPLORE_DIRECTORY_BLOCK } from './exploreDirectoryMock.js'
import { useCollapseScroll } from './collapseScroll.js'
import { ExploreDirectoryListCompanyRow, ExploreDirectoryListInvestorRow } from './ExploreDirectoryRows.jsx'
import { filterExploreDirectoryListRows, normalizeExploreSearchQuery } from './exploreDirectorySearch.js'
import { TerminalTopBarChrome } from './TerminalTopBarChrome.jsx'
import { useExploreScrollList } from './useExploreScrollList.js'
import './DeepReport.css'
import './ExplorePage.css'

const EXPLORE_DIR_COLLAPSE_RANGE_FALLBACK = 1
const EXPLORE_DIR_EXPANDED_FADE_END = 0.88
const EXPLORE_DIR_COMPACT_FADE_START = 0
const EXPLORE_DIR_COMPACT_MQ = '(max-width: 960px)'
const EXPLORE_DIR_COMPACT_STEP = 10

const EXPLORE_DIR_COPY = {
  companies: {
    title: 'Companies',
    lead: 'Historical catalyst and filing events across the coverage universe.',
    searchPlaceholder: 'Search company',
  },
  investors: {
    title: 'Investors',
    lead: 'Historical insider, politician, and institution disclosures.',
    searchPlaceholder: 'Search investor',
  },
}

function exploreDirCollapseProgressVars(progress) {
  const p = Math.min(1, Math.max(0, progress))
  const expandedOpacity = p <= EXPLORE_DIR_EXPANDED_FADE_END ? 1 - p / EXPLORE_DIR_EXPANDED_FADE_END : 0
  const compactOpacity =
    p <= EXPLORE_DIR_COMPACT_FADE_START
      ? 0
      : (p - EXPLORE_DIR_COMPACT_FADE_START) / (1 - EXPLORE_DIR_COMPACT_FADE_START)
  return {
    '--deep-collapse': String(p),
    '--deep-expanded-opacity': String(expandedOpacity),
    '--deep-compact-opacity': String(compactOpacity),
  }
}

function useExploreDirCompactLayout() {
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(EXPLORE_DIR_COMPACT_MQ).matches,
  )

  useEffect(() => {
    const mq = window.matchMedia(EXPLORE_DIR_COMPACT_MQ)
    const onChange = () => setCompact(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return compact
}

function ExploreDirShowMoreButton({ remaining, onClick }) {
  const step = Math.min(EXPLORE_DIR_COMPACT_STEP, remaining)
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

export function ExploreDirectoryListPage({
  kind,
  rows = [],
  rowsLoading = false,
  backendUp = true,
  macroActive = false,
  onMacroClick,
  settingsActive = false,
  onSettingsClick,
  onBrandClick = null,
  onCloseClick = null,
  onCompanyRowClick = null,
  onInvestorRowClick = null,
}) {
  const copy = EXPLORE_DIR_COPY[kind] ?? EXPLORE_DIR_COPY.companies
  const compact = useExploreDirCompactLayout()
  const pageSize = compact ? EXPLORE_DIR_COMPACT_STEP : EXPLORE_DIRECTORY_BLOCK
  const [searchQuery, setSearchQuery] = useState('')
  const { pageRef, dockRef, spacerRef } = useCollapseScroll({
    progressVars: exploreDirCollapseProgressVars,
    resetKey: kind,
    rangeFallback: EXPLORE_DIR_COLLAPSE_RANGE_FALLBACK,
  })
  const normalizedQuery = normalizeExploreSearchQuery(searchQuery)

  const filteredRows = useMemo(
    () => filterExploreDirectoryListRows(rows, searchQuery, kind),
    [rows, searchQuery, kind],
  )

  const { visibleRows, hasMore, remaining, loadMore, sentinelRef } = useExploreScrollList({
    rows: filteredRows,
    pageSize,
    compact,
    scrollRootRef: pageRef,
    loadStep: compact ? EXPLORE_DIR_COMPACT_STEP : EXPLORE_DIRECTORY_BLOCK,
    resetKey: `${kind}:${normalizedQuery}`,
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
                collapsibleSearch
                showSearch
                showClose={!!onCloseClick}
                onCloseClick={onCloseClick}
                searchPlaceholder={copy.searchPlaceholder}
                searchPlaceholderMobile={copy.searchPlaceholder}
                searchValue={searchQuery}
                onSearchChange={setSearchQuery}
              />
            </div>
            <div className="drpt-expanded">
              <header className="drpt-topbar drpt-topbar--directory">
                <div className="drpt-topbarIdentity">
                  <p className="drpt-kicker">Directory</p>
                  <div className="drpt-topbarTitleRow">
                    <h1 className="drpt-topbarTicker">{copy.title}</h1>
                  </div>
                </div>
                <div className="drpt-topbarMeta">
                  <span>{copy.lead}</span>
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
            <ul className="exploreDirectoryList">
              {visibleRows.length ? (
                kind === 'investors' ? (
                  visibleRows.map((row) => (
                    <ExploreDirectoryListInvestorRow key={row.id} row={row} onClick={onInvestorRowClick} />
                  ))
                ) : (
                  visibleRows.map((row) => (
                    <ExploreDirectoryListCompanyRow key={row.id} row={row} onClick={onCompanyRowClick} />
                  ))
                )
              ) : (
                <li className="exploreDirectoryEmpty mono">
                  {searching ? 'No matches' : rowsLoading ? 'Loading…' : 'No rows'}
                </li>
              )}
            </ul>
            {compact && hasMore ? (
              <ExploreDirShowMoreButton
                remaining={remaining}
                onClick={() => loadMore(EXPLORE_DIR_COMPACT_STEP)}
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
