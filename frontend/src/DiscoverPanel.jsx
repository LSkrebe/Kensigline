import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { EventBriefAnalysis, formatEventCardDate } from './EventBrief.jsx'
import { DiscoverReactionChart } from './DiscoverReactionChart.jsx'
import {
  DISCOVER_TIMELINE_DEFAULTS,
  fetchDiscoverTimeline,
  peekDiscoverTimelineCache,
} from './discoverClient.js'
import {
  buildDiscoverCardDisplayRows,
  buildDiscoverTimeline,
  DISCOVER_MARKET_MOVE_FILTER_DEFAULT,
  DISCOVER_MARKET_MOVE_FILTER_TYPES,
  DISCOVER_WATCHLIST_FILTER_DEFAULT,
  DISCOVER_WATCHLIST_FILTER_TYPES,
  discoverEventPassesFilters,
  discoverKindLabel,
  discoverWatchlistDaysLabel,
  isDiscoverMarketMove,
  truncateDiscoverSummary,
} from './discoverEvents.js'
import { normalizeResearchPaperSourceKey, RESEARCH_PAPER_SOURCE_CATALOG } from './researchPaperSources.js'
import {
  buildMockMoveReactions,
  filterMacroCalendarDays,
  formatMacroDayHeader,
  formatRippleMove,
  getUpcomingMacroDays,
  MACRO_IMPACT_FILTER_DEFAULT,
  MACRO_IMPACT_FILTER_TYPES,
  rippleMoveClass,
} from './discoverMockData.js'
import { readFilterSet, UI_PREF_KEYS, writeFilterSet } from './uiPreferences.js'

function applyDiscoverSourceFilter(events, enabled) {
  if (!enabled?.size) return []
  return events.filter((event) => discoverEventPassesFilters(event, enabled))
}

const MACRO_REGION_LABEL = {
  US: 'US',
  EU: 'EU',
  CN: 'CN',
  UK: 'UK',
}

const MACRO_REGION_FILTER_TYPES = [
  { id: 'US', label: 'United States', code: 'US' },
  { id: 'EU', label: 'Europe', code: 'EU' },
  { id: 'CN', label: 'China', code: 'CN' },
  { id: 'UK', label: 'United Kingdom', code: 'UK' },
]

const MACRO_REGION_FILTER_DEFAULT = new Set(MACRO_REGION_FILTER_TYPES.map((t) => t.id))

const MACRO_FILTER_SECTIONS = [
  { title: 'Region', types: MACRO_REGION_FILTER_TYPES },
  { title: 'Impact', types: MACRO_IMPACT_FILTER_TYPES },
]

function DiscoverFilterIcon() {
  return (
    <svg className="feedCompactFilterIcon" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 6h16l-6 7v5l-4 2v-7L4 6z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function toggleFilterSet(setter, id) {
  setter((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
}

function DiscoverFilterPicker({ sections, enabled, onToggle, ariaLabel, className = '' }) {
  return (
    <div
      className={['feedCompactFilterPicker', 'scrollThin', className].filter(Boolean).join(' ')}
      role="group"
      aria-label={ariaLabel}
    >
      {sections.map((section, idx) => (
        <div key={section.title || String(idx)} className="feedFilterSection">
          {section.title ? <p className="feedFilterSectionTitle">{section.title}</p> : null}
          {(Array.isArray(section.types) ? section.types : []).map(({ id, label, code }) => (
            <label key={id} className="feedFilterTypeRow">
              <input type="checkbox" checked={enabled?.has(id) ?? false} onChange={() => onToggle(id)} />
              <span className="feedFilterTypeLabel">{label}</span>
              <span className="feedFilterTypeCode mono" title={id}>
                {code ?? id}
              </span>
            </label>
          ))}
        </div>
      ))}
    </div>
  )
}

function DiscoverFeedSearch({ value, onChange, placeholder, ariaLabel }) {
  return (
    <label className="researchFeedSearch discoverSearch">
      <input
        className="researchFeedSearchInput"
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onChange('')
        }}
        aria-label={ariaLabel}
        spellCheck={false}
        autoComplete="off"
      />
      <svg className="researchFeedSearchIcon" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.75" />
        <path d="M16 16 L20 20" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    </label>
  )
}

function discoverPhonePaneClass(isPhone, activePane, paneId) {
  if (!isPhone) return ''
  return activePane === paneId ? '' : 'phonePane--hidden'
}

function DiscoverFeedColumn({
  title,
  children,
  search,
  scrollClassName = '',
  filterSections = null,
  filterEnabled = null,
  filterOpen = false,
  onFilterClick,
  onFilterToggle,
  filterAriaLabel = 'Filters',
  panelClassName = '',
}) {
  const showFilter = Boolean(filterSections?.length)

  return (
    <section
      className={['discoverCol', 'feed', 'feedCompact', showFilter ? 'discoverCol--filter' : '', panelClassName]
        .filter(Boolean)
        .join(' ')}
      aria-label={title}
    >
      <header className="feedCompactHeader discoverColHeadBar">
        <div className="panelTitle feedCompactTitle">{title}</div>
        {showFilter ? (
          <div className="feedCompactHeaderEnd">
            <button
              type="button"
              className={['feedCompactFilterBtn', filterOpen ? 'isActive' : ''].filter(Boolean).join(' ')}
              aria-label="Filter"
              title="Filter"
              aria-pressed={filterOpen || undefined}
              onClick={onFilterClick}
            >
              <DiscoverFilterIcon />
            </button>
          </div>
        ) : null}
      </header>
      <div
        className={['feedCompactBody', 'discoverColBody', filterOpen ? 'feedCompactBody--filterOpen' : '']
          .filter(Boolean)
          .join(' ')}
      >
        <div className="feedCompactMain" aria-hidden={filterOpen || undefined}>
          {search}
          <div className={['discoverColScroll', 'scrollThin', scrollClassName].filter(Boolean).join(' ')}>
            {children}
          </div>
        </div>
        {filterOpen && filterSections?.length ? (
          <DiscoverFilterPicker
            sections={filterSections}
            enabled={filterEnabled}
            onToggle={onFilterToggle}
            ariaLabel={filterAriaLabel}
          />
        ) : null}
      </div>
    </section>
  )
}

function DiscoverWatchlistGap({ label }) {
  const text = String(label ?? '').trim()
  if (!text) return null
  return (
    <div className="discoverWatchlistGap" role="separator" aria-hidden="true">
      <div className="discoverWatchlistGapRow">
        <span className="discoverWatchlistGapRule" />
        <span className="discoverWatchlistGapLabel mono">{text}</span>
      </div>
    </div>
  )
}

function DiscoverMacroDayColumn({ day }) {
  const head = formatMacroDayHeader(day.date)

  return (
    <div className="discoverMacroDay discoverMacroDay--col">
      <header className="discoverMacroDayHead">
        <span className="discoverMacroDayWeekday mono">{head.weekday}</span>
        <span className="discoverMacroDayDate mono dim">{head.label}</span>
        {head.isToday ? <span className="discoverMacroDayToday mono">Today</span> : null}
      </header>
      <div className="discoverMacroDayBody">
        {!(Array.isArray(day?.events) && day.events.length) ? (
          <p className="discoverMacroDayEmpty mono dim">Quiet session</p>
        ) : (
          day.events.map((event) => (
            <article
              key={event.id}
              className={['discoverMacroEvent', `discoverMacroEvent--${event.impact}`].join(' ')}
            >
              <div className="discoverMacroEventLayout">
                <p className="discoverMacroEventTitle">{event.title}</p>
                <div className="discoverMacroEventAside">
                  <span className="discoverMacroEventTime mono">{event.time}</span>
                  <span className="discoverMacroEventRegion mono dim">
                    {MACRO_REGION_LABEL[event.region] ?? event.region}
                  </span>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  )
}

function DiscoverMacroStrip({
  macroDays,
  enabledRegions,
  enabledImpacts,
  filterOpen,
  onFilterClick,
  onFilterToggle,
  loading = false,
  panelClassName = '',
}) {
  const days = useMemo(
    () => filterMacroCalendarDays(macroDays ?? [], { regions: enabledRegions, impacts: enabledImpacts }),
    [macroDays, enabledRegions, enabledImpacts],
  )

  const macroFilterEnabled = useMemo(() => {
    const merged = new Set()
    for (const id of enabledRegions ?? []) merged.add(id)
    for (const id of enabledImpacts ?? []) merged.add(id)
    return merged
  }, [enabledRegions, enabledImpacts])

  const onMacroFilterToggle = useCallback(
    (id) => {
      if (MACRO_REGION_FILTER_DEFAULT.has(id)) {
        onFilterToggle('region', id)
        return
      }
      if (MACRO_IMPACT_FILTER_DEFAULT.has(id)) {
        onFilterToggle('impact', id)
      }
    },
    [onFilterToggle],
  )

  return (
    <section
      className={['discoverMacroStrip', 'discoverCol', 'feed', 'feedCompact', 'discoverCol--filter', panelClassName]
        .filter(Boolean)
        .join(' ')}
      aria-label="Macro calendar"
    >
      <header className="feedCompactHeader discoverColHeadBar">
        <div className="panelTitle feedCompactTitle">MACRO CALENDAR</div>
        <div className="feedCompactHeaderEnd">
          <button
            type="button"
            className={['feedCompactFilterBtn', filterOpen ? 'isActive' : ''].filter(Boolean).join(' ')}
            aria-label="Filter"
            title="Filter"
            aria-pressed={filterOpen || undefined}
            onClick={onFilterClick}
          >
            <DiscoverFilterIcon />
          </button>
        </div>
      </header>
      <div
        className={['feedCompactBody', 'discoverMacroStripBody', filterOpen ? 'feedCompactBody--filterOpen' : '']
          .filter(Boolean)
          .join(' ')}
      >
        <div className="feedCompactMain discoverMacroStripMain" aria-hidden={filterOpen || undefined}>
          <div className="discoverMacroStripScroll scrollThin">
            {!days.length ? (
              <p className="discoverColEmpty mono dim">
                {loading ? 'Loading macro calendar…' : 'No upcoming macro releases.'}
              </p>
            ) : (
              <div className="discoverMacroWeek discoverMacroWeek--horizontal">
                {days.map((day) => (
                  <DiscoverMacroDayColumn key={day.date} day={day} />
                ))}
              </div>
            )}
          </div>
        </div>
        {filterOpen ? (
          <DiscoverFilterPicker
            sections={MACRO_FILTER_SECTIONS}
            enabled={macroFilterEnabled}
            onToggle={onMacroFilterToggle}
            ariaLabel="Macro calendar filters"
            className="discoverMacroFilterPicker"
          />
        ) : null}
      </div>
    </section>
  )
}

function DiscoverMoveCard({ event, movePct, reactionCloses, allowMockFallback = false, onResearch }) {
  const title = String(event.title ?? '').trim() || '—'
  const summary = truncateDiscoverSummary(event.summary)
  const ticker = String(event.ticker ?? '').trim().toUpperCase()
  const hasCloses = Array.isArray(reactionCloses) && reactionCloses.length >= 2
  const showMove = hasCloses && Number.isFinite(movePct)
  const move = showMove ? formatRippleMove(movePct) : ''
  const moveCls = showMove ? rippleMoveClass(movePct) : ''
  const showChart = hasCloses || (allowMockFallback && Number.isFinite(movePct))

  return (
    <button
      type="button"
      className="discoverMoveCard"
      onClick={() => onResearch?.({ ticker: event.ticker, intelMode: event.intelMode })}
    >
      <div className="discoverMoveCardHead">
        <span className="discoverMoveCardTicker mono">{ticker}</span>
        <span className="discoverMoveCardDate mono dim">{formatEventCardDate(event.at)}</span>
        {showMove ? (
          <span className={['discoverMoveCardMove', 'mono', moveCls].filter(Boolean).join(' ')}>{move}</span>
        ) : null}
      </div>
      {showChart ? (
        <DiscoverReactionChart
          ticker={event.ticker}
          movePct={movePct}
          closes={reactionCloses}
          allowMockSeries={allowMockFallback}
        />
      ) : null}
      <div className="discoverMoveCardCopy">
        <p className="discoverMoveCardTitle">{title}</p>
        {summary ? <EventBriefAnalysis text={summary} /> : null}
      </div>
    </button>
  )
}

function catalystSourceLookup(event) {
  const key = normalizeResearchPaperSourceKey(event.source)
  const hit = RESEARCH_PAPER_SOURCE_CATALOG.find((s) => s.id === key)
  return { key, hit }
}

function catalystSourceCode(event) {
  const { key, hit } = catalystSourceLookup(event)
  return hit?.code ?? key
}

function DiscoverCatalystRow({ event, onResearch }) {
  const when = discoverWatchlistDaysLabel(event.at)
  const dateLabel = formatEventCardDate(event.at)
  const phase = event.phase ?? event.programKey
  const kind = discoverKindLabel(event.kind)
  const sourceCode = catalystSourceCode(event)
  const docLabel = [sourceCode, phase, kind].filter(Boolean).join(' · ')
  const atIso = String(event.at ?? '').includes('T') ? event.at : `${event.at}T12:00:00`
  const ticker = String(event.ticker ?? '').trim().toUpperCase()

  return (
    <button
      type="button"
      className={[
        'discoverCatalystCard',
        'discoverEventCard',
        'discoverEventCard--ahead',
        'researchPaperRailCard',
        'researchPaperDocCard',
        'researchPaperDocCard--railTicker',
        'eventBriefDocCard--clickable',
      ].join(' ')}
      onClick={() => onResearch?.({ ticker: event.ticker, intelMode: event.intelMode })}
    >
      <div className="researchPaperRailCardRail researchPaperRailCardRail--ticker">
        <span className="eventBriefRailTicker mono">{ticker}</span>
      </div>
      <div className="researchPaperRailCardMain">
        <div className="researchPaperRailCardGrid">
          <div className="researchPaperRailCardCol">
            <span className="researchPaperDocCardSource mono dim">{docLabel}</span>
          </div>
          <div className="researchPaperRailCardCol researchPaperRailCardCol--end">
            <time className="researchPaperDocCardDate mono dim" dateTime={atIso} title={dateLabel}>
              {when}
            </time>
          </div>
        </div>
        <p className="discoverCatalystCardTitle">{event.title}</p>
      </div>
    </button>
  )
}

function DiscoverCatalystList({ events, onResearch, loading = false }) {
  const displayRows = useMemo(() => buildDiscoverCardDisplayRows(events, 'upcoming'), [events])

  if (!displayRows.length) {
    return (
      <p className="discoverColEmpty mono dim">
        {loading ? 'Loading watchlist catalysts…' : 'No matching catalysts.'}
      </p>
    )
  }

  return (
    <div className="discoverCatalystList">
      {displayRows.map((entry) => (
        <Fragment key={entry.key}>
          {entry.type === 'sep' ? (
            <DiscoverWatchlistGap label={entry.label} />
          ) : (
            <DiscoverCatalystRow event={entry.event} onResearch={onResearch} />
          )}
        </Fragment>
      ))}
    </div>
  )
}

const WATCHLIST_FILTER_SECTIONS = [{ types: DISCOVER_WATCHLIST_FILTER_TYPES }]
const MARKET_MOVE_FILTER_SECTIONS = [{ types: DISCOVER_MARKET_MOVE_FILTER_TYPES }]

export function DiscoverPanel({ backendUp = false, onOpenResearch, isPhone = false, phonePane = 'catalyst' }) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [liveTimeline, setLiveTimeline] = useState(null)
  const [timelineFetching, setTimelineFetching] = useState(false)

  const [watchlistFilterOpen, setWatchlistFilterOpen] = useState(false)
  const [watchlistFilters, setWatchlistFilters] = useState(() =>
    readFilterSet(UI_PREF_KEYS.discoverWatchlistFilters, DISCOVER_WATCHLIST_FILTER_DEFAULT),
  )

  const [macroFilterOpen, setMacroFilterOpen] = useState(false)
  const [macroRegionFilters, setMacroRegionFilters] = useState(() =>
    readFilterSet(UI_PREF_KEYS.discoverMacroRegionFilters, MACRO_REGION_FILTER_DEFAULT),
  )
  const [macroImpactFilters, setMacroImpactFilters] = useState(() =>
    readFilterSet(UI_PREF_KEYS.discoverMacroImpactFilters, MACRO_IMPACT_FILTER_DEFAULT),
  )

  const [movesFilterOpen, setMovesFilterOpen] = useState(false)
  const [movesSourceFilters, setMovesSourceFilters] = useState(() =>
    readFilterSet(UI_PREF_KEYS.discoverMovesFilters, DISCOVER_MARKET_MOVE_FILTER_DEFAULT),
  )

  const toggleWatchlistFilter = useCallback((id) => toggleFilterSet(setWatchlistFilters, id), [])
  const toggleMovesFilter = useCallback((id) => toggleFilterSet(setMovesSourceFilters, id), [])

  const toggleMacroFilter = useCallback((dimension, id) => {
    if (dimension === 'region') toggleFilterSet(setMacroRegionFilters, id)
    else if (dimension === 'impact') toggleFilterSet(setMacroImpactFilters, id)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 280)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    writeFilterSet(UI_PREF_KEYS.discoverWatchlistFilters, watchlistFilters)
  }, [watchlistFilters])

  useEffect(() => {
    writeFilterSet(UI_PREF_KEYS.discoverMacroRegionFilters, macroRegionFilters)
  }, [macroRegionFilters])

  useEffect(() => {
    writeFilterSet(UI_PREF_KEYS.discoverMacroImpactFilters, macroImpactFilters)
  }, [macroImpactFilters])

  useEffect(() => {
    writeFilterSet(UI_PREF_KEYS.discoverMovesFilters, movesSourceFilters)
  }, [movesSourceFilters])

  useEffect(() => {
    if (!backendUp) {
      setLiveTimeline(null)
      setTimelineFetching(false)
      return undefined
    }

    const fetchOpts = { ...DISCOVER_TIMELINE_DEFAULTS, query: debouncedQuery }
    const cached = peekDiscoverTimelineCache(fetchOpts)
    if (cached && Array.isArray(cached.upcoming) && Array.isArray(cached.past)) {
      setLiveTimeline(cached)
    }

    let alive = true
    setTimelineFetching(true)
    void fetchDiscoverTimeline(fetchOpts).then((data) => {
      if (!alive) return
      setTimelineFetching(false)
      if (Array.isArray(data?.upcoming) && Array.isArray(data?.past)) setLiveTimeline(data)
      else if (!cached) setLiveTimeline(null)
    })
    return () => {
      alive = false
    }
  }, [debouncedQuery, backendUp])

  const timelineLoading = backendUp && timelineFetching && liveTimeline == null
  const timelineRefreshing = backendUp && timelineFetching && liveTimeline != null
  const showColumnLoading = timelineLoading || timelineRefreshing

  const mockTimeline = useMemo(() => (backendUp ? null : buildDiscoverTimeline({ query })), [backendUp, query])
  const upcomingSource = useMemo(() => {
    if (backendUp) return liveTimeline?.upcoming ?? []
    return mockTimeline?.upcoming ?? []
  }, [backendUp, liveTimeline?.upcoming, mockTimeline?.upcoming])

  const macroSource = useMemo(() => {
    if (backendUp) return Array.isArray(liveTimeline?.macro) ? liveTimeline.macro : []
    return getUpcomingMacroDays(5)
  }, [backendUp, liveTimeline?.macro])

  const marketMovesSource = useMemo(() => {
    if (backendUp) return liveTimeline?.market_moves ?? []
    return (mockTimeline?.past ?? []).filter(isDiscoverMarketMove)
  }, [backendUp, liveTimeline?.market_moves, mockTimeline?.past])

  const moveReactions = useMemo(() => {
    if (backendUp) return liveTimeline?.moves ?? {}
    const rows = (mockTimeline?.past ?? []).filter(isDiscoverMarketMove)
    return buildMockMoveReactions(rows)
  }, [backendUp, liveTimeline?.moves, mockTimeline?.past])

  const catalysts = useMemo(
    () => applyDiscoverSourceFilter(upcomingSource, watchlistFilters),
    [upcomingSource, watchlistFilters],
  )

  const marketMoves = useMemo(() => {
    return applyDiscoverSourceFilter(marketMovesSource, movesSourceFilters)
  }, [marketMovesSource, movesSourceFilters])

  const watchlistSearch = (
    <DiscoverFeedSearch
      value={query}
      onChange={setQuery}
      placeholder="Search ticker or event"
      ariaLabel="Search watchlist catalysts"
    />
  )

  return (
    <section className="panel discoverPanel" aria-label="Discover">
      <div className="discoverPanelBody">
        <div className="discoverDual">
          <DiscoverFeedColumn
            panelClassName={discoverPhonePaneClass(isPhone, phonePane, 'catalyst')}
            title="WATCHLIST CATALYST"
            search={watchlistSearch}
            filterSections={WATCHLIST_FILTER_SECTIONS}
            filterEnabled={watchlistFilters}
            filterOpen={watchlistFilterOpen}
            onFilterClick={() => setWatchlistFilterOpen((open) => !open)}
            onFilterToggle={toggleWatchlistFilter}
            filterAriaLabel="Watchlist document types"
          >
            <DiscoverCatalystList events={catalysts} onResearch={onOpenResearch} loading={showColumnLoading && !catalysts.length} />
          </DiscoverFeedColumn>
          <div className="discoverSplitRule" aria-hidden="true" />
          <DiscoverFeedColumn
            panelClassName={discoverPhonePaneClass(isPhone, phonePane, 'moves')}
            title="MARKET MOVES"
            scrollClassName="discoverColScroll--marketMoves"
            filterSections={MARKET_MOVE_FILTER_SECTIONS}
            filterEnabled={movesSourceFilters}
            filterOpen={movesFilterOpen}
            onFilterClick={() => setMovesFilterOpen((open) => !open)}
            onFilterToggle={toggleMovesFilter}
            filterAriaLabel="Market move document types"
          >
            {!marketMoves.length ? (
              <p className="discoverColEmpty mono dim">
                {showColumnLoading ? 'Loading market moves…' : 'No highlighted market moves.'}
              </p>
            ) : (
              <div className="discoverMoveList">
                {marketMoves.map((event) => {
                  const reaction = moveReactions[event.id]
                  return (
                    <DiscoverMoveCard
                      key={event.id}
                      event={event}
                      movePct={reaction?.movePct}
                      reactionCloses={reaction?.closes}
                      allowMockFallback={!backendUp}
                      onResearch={onOpenResearch}
                    />
                  )
                })}
              </div>
            )}
          </DiscoverFeedColumn>
        </div>
        <div className="discoverPanelSplit discoverPanelSplit--horizontal" aria-hidden="true" />
        <DiscoverMacroStrip
          panelClassName={discoverPhonePaneClass(isPhone, phonePane, 'macro')}
          macroDays={macroSource}
          enabledRegions={macroRegionFilters}
          enabledImpacts={macroImpactFilters}
          filterOpen={macroFilterOpen}
          onFilterClick={() => setMacroFilterOpen((open) => !open)}
          onFilterToggle={toggleMacroFilter}
          loading={showColumnLoading && !macroSource.some((d) => d.events?.length)}
        />
      </div>
    </section>
  )
}
