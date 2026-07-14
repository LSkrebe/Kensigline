import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EXPLORE_DIRECTORY_BLOCK } from './exploreDirectoryMock.js'
import { ExploreDirectoryActorRow, ExploreDirectoryCompanyRow } from './ExploreDirectoryRows.jsx'
import { TerminalTopBarChrome } from './TerminalTopBarChrome.jsx'
import './ExplorePage.css'

const EXPLORE_DIR_COPY = {
  companies: {
    title: 'Companies',
    lead: 'Historical catalyst and filing events across the coverage universe.',
    searchPlaceholder: 'Search company',
  },
  actors: {
    title: 'Actors',
    lead: 'Historical insider, politician, and institution disclosures.',
    searchPlaceholder: 'Search actor',
  },
}

export function ExploreDirectoryListPage({
  kind,
  rows = [],
  backendUp = true,
  macroActive = false,
  onMacroClick,
  settingsActive = false,
  onSettingsClick,
  onBrandClick = null,
  onCompanyRowClick = null,
  onActorRowClick = null,
}) {
  const copy = EXPLORE_DIR_COPY[kind] ?? EXPLORE_DIR_COPY.companies
  const scrollRef = useRef(null)
  const sentinelRef = useRef(null)
  const [visibleCount, setVisibleCount] = useState(EXPLORE_DIRECTORY_BLOCK)

  const visibleRows = useMemo(() => rows.slice(0, visibleCount), [rows, visibleCount])
  const hasMore = visibleCount < rows.length

  const loadMore = useCallback(() => {
    setVisibleCount((n) => Math.min(rows.length, n + EXPLORE_DIRECTORY_BLOCK))
  }, [rows.length])

  useEffect(() => {
    setVisibleCount(EXPLORE_DIRECTORY_BLOCK)
  }, [kind, rows])

  useEffect(() => {
    const root = scrollRef.current
    const sentinel = sentinelRef.current
    if (!root || !sentinel || !hasMore) return undefined

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore()
      },
      { root, rootMargin: '160px 0px', threshold: 0 },
    )

    io.observe(sentinel)
    return () => io.disconnect()
  }, [hasMore, loadMore, visibleCount])

  return (
    <div className="exploreDirShell">
      <div className="exploreDirDock">
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
          searchPlaceholder={copy.searchPlaceholder}
          searchPlaceholderMobile={copy.searchPlaceholder}
        />
      </div>

      <div className="exploreDirScroll" ref={scrollRef}>
        <div className="exploreDirPaper">
          <header className="exploreDirHero">
            <p className="exploreDirKicker mono">Directory</p>
            <h1 className="exploreDirTitle">{copy.title}</h1>
            <p className="exploreDirLead">{copy.lead}</p>
          </header>

          <div className="exploreDirListPanel">
            <ul className="exploreDirectoryList">
              {kind === 'actors'
                ? visibleRows.map((row) => (
                    <ExploreDirectoryActorRow key={row.id} row={row} onClick={onActorRowClick} />
                  ))
                : visibleRows.map((row) => (
                    <ExploreDirectoryCompanyRow key={row.id} row={row} onClick={onCompanyRowClick} />
                  ))}
            </ul>
            {hasMore ? <div ref={sentinelRef} className="exploreDirScrollSentinel" aria-hidden="true" /> : null}
          </div>
        </div>
      </div>
    </div>
  )
}
