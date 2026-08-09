import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EXPLORE_DIRECTORY_BLOCK } from './exploreDirectoryMock.js'
import { ExploreDirectoryListCompanyRow, ExploreDirectoryListInvestorRow } from './ExploreDirectoryRows.jsx'
import { TerminalTopBarChrome } from './TerminalTopBarChrome.jsx'
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
  const pageRef = useRef(null)
  const dockRef = useRef(null)
  const spacerRef = useRef(null)
  const sentinelRef = useRef(null)
  const compact = useExploreDirCompactLayout()
  const pageSize = compact ? EXPLORE_DIR_COMPACT_STEP : EXPLORE_DIRECTORY_BLOCK
  const [visibleCount, setVisibleCount] = useState(pageSize)

  const visibleRows = useMemo(() => rows.slice(0, visibleCount), [rows, visibleCount])
  const hasMore = visibleCount < rows.length
  const remaining = Math.max(0, rows.length - visibleCount)

  const loadMore = useCallback(
    (step = pageSize) => {
      setVisibleCount((n) => Math.min(rows.length, n + step))
    },
    [pageSize, rows.length],
  )

  useEffect(() => {
    setVisibleCount(pageSize)
  }, [kind, rows, pageSize])

  useEffect(() => {
    const page = pageRef.current
    const dock = dockRef.current
    const spacer = spacerRef.current
    if (!page || !dock) return undefined

    let raf = 0

    const syncCollapse = () => {
      raf = 0
      const range = spacer?.offsetHeight || EXPLORE_DIR_COLLAPSE_RANGE_FALLBACK
      const progress = Math.min(1, Math.max(0, page.scrollTop / range))
      for (const [key, value] of Object.entries(exploreDirCollapseProgressVars(progress))) {
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
  }, [kind])

  // Wide window: infinite scroll. Compact ≤960px: click +10 (dossier-style).
  useEffect(() => {
    if (compact) return undefined
    const root = pageRef.current
    const sentinel = sentinelRef.current
    if (!root || !sentinel || !hasMore) return undefined

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore(EXPLORE_DIRECTORY_BLOCK)
      },
      { root, rootMargin: '160px 0px', threshold: 0 },
    )

    io.observe(sentinel)
    return () => io.disconnect()
  }, [compact, hasMore, loadMore, visibleCount])

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
          <div className={['exploreDirListPanel', compact && hasMore ? 'exploreDirListPanel--truncated' : '']
            .filter(Boolean)
            .join(' ')}
          >
            <ul className="exploreDirectoryList">
              {kind === 'investors'
                ? visibleRows.map((row) => (
                    <ExploreDirectoryListInvestorRow key={row.id} row={row} onClick={onInvestorRowClick} />
                  ))
                : visibleRows.map((row) => (
                    <ExploreDirectoryListCompanyRow key={row.id} row={row} onClick={onCompanyRowClick} />
                  ))}
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
