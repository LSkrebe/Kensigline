import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatEventCardDate } from './EventBrief.jsx'
import { DiscoverReactionChart } from './DiscoverReactionChart.jsx'
import {
  DISCOVER_TIMELINE_DEFAULTS,
  fetchDiscoverTimeline,
  peekDiscoverTimelineCache,
} from './discoverClient.js'
import {
  buildDiscoverTimeline,
  buildHighlightedMarketMoves,
  DISCOVER_MARKET_MOVE_FILTER_DEFAULT,
  DISCOVER_MARKET_MOVE_FILTER_TYPES,
  discoverEventPassesFilters,
  discoverKindLabel,
  getDiscoverUpcomingEvents,
} from './discoverEvents.js'
import { attachNextUpcomingToMarketMoves, pickCatalystBgMoveIds, resolveDiscoverMoveFooter } from './discoverMoveFooters.js'
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
      className={['panel', 'discoverCol', 'feed', 'feedCompact', showFilter ? 'discoverCol--filter' : '', panelClassName]
        .filter(Boolean)
        .join(' ')}
      aria-label={title}
    >
      <header className="feedCompactHeader">
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

function DiscoverMacroEventCard({ event }) {
  return (
    <article className={['discoverMacroEvent', `discoverMacroEvent--${event.impact}`].join(' ')}>
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
  )
}

function DiscoverMacroDayColumn({ day }) {
  const head = formatMacroDayHeader(day.date)
  const events = Array.isArray(day?.events) ? day.events : []

  return (
    <div className="discoverMacroDay discoverMacroDay--col">
      <header className="discoverMacroDayHead">
        <span className="discoverMacroDayWeekday mono">{head.weekday}</span>
        <span className="discoverMacroDayDate mono dim">{head.label}</span>
        {head.isToday ? <span className="discoverMacroDayToday mono">Today</span> : null}
      </header>
      <div className="discoverMacroDayBody">
        {!events.length ? (
          <p className="discoverMacroDayEmpty mono dim">Quiet session</p>
        ) : events.length === 1 ? (
          <DiscoverMacroEventCard event={events[0]} />
        ) : (
          <article className="discoverMacroEvent discoverMacroEvent--group">
            <div className="discoverMacroEventGroupList">
              {events.map((event) => (
                <div
                  key={event.id}
                  className={['discoverMacroEventRow', `discoverMacroEvent--${event.impact}`].join(' ')}
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
                </div>
              ))}
            </div>
          </article>
        )}
      </div>
    </div>
  )
}

function macroEventMatchesQuery(event, query) {
  const needle = String(query ?? '').trim().toLowerCase()
  if (!needle) return true
  const regionLabel = MACRO_REGION_LABEL[event.region] ?? event.region
  const hay = [event.title, event.region, regionLabel, event.time].filter(Boolean).join(' ').toLowerCase()
  return hay.includes(needle)
}

function filterMacroDaysByQuery(days, query) {
  const needle = String(query ?? '').trim()
  if (!needle) return days
  return days
    .map((day) => ({
      ...day,
      events: (Array.isArray(day?.events) ? day.events : []).filter((event) => macroEventMatchesQuery(event, needle)),
    }))
    .filter((day) => day.events.length > 0)
}

function DiscoverMacroStrip({
  macroDays,
  enabledRegions,
  enabledImpacts,
  search,
  macroQuery = '',
  filterOpen,
  onFilterClick,
  onFilterToggle,
  loading = false,
  panelClassName = '',
}) {
  const filteredDays = useMemo(
    () => filterMacroCalendarDays(macroDays ?? [], { regions: enabledRegions, impacts: enabledImpacts }),
    [macroDays, enabledRegions, enabledImpacts],
  )

  const days = useMemo(() => filterMacroDaysByQuery(filteredDays, macroQuery), [filteredDays, macroQuery])

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
      className={['panel', 'discoverMacroStrip', 'feed', 'feedCompact', 'feed--left', 'discoverCol--filter', panelClassName]
        .filter(Boolean)
        .join(' ')}
      aria-label="Macro calendar"
    >
      <header className="feedCompactHeader">
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
        className={['feedCompactBody', 'discoverColBody', filterOpen ? 'feedCompactBody--filterOpen' : '']
          .filter(Boolean)
          .join(' ')}
      >
        <div className="feedCompactMain" aria-hidden={filterOpen || undefined}>
          {search}
          <div className="discoverColScroll scrollThin">
            {!days.length ? (
              <p className="discoverColEmpty mono dim">
                {loading
                  ? 'Loading macro calendar…'
                  : macroQuery.trim()
                    ? 'No matching macro releases.'
                    : 'No upcoming macro releases.'}
              </p>
            ) : (
              <div className="discoverMacroWeek">
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
          />
        ) : null}
      </div>
    </section>
  )
}

function discoverMoveSourceLabel(event) {
  const source = String(event?.source ?? '').trim()
  if (source) return source
  return discoverKindLabel(event?.kind)
}

function useDiscoverMoveCardModel({
  event,
  movePct,
  reactionCloses,
  upcoming,
  useMockEarnings,
  allowMockFallback,
}) {
  const title = String(event.title ?? '').trim() || '—'
  const summary = String(event.summary ?? '').trim()
  const ticker = String(event.ticker ?? '').trim().toUpperCase()
  const hasCloses = Array.isArray(reactionCloses) && reactionCloses.length >= 2
  const showMove = hasCloses && Number.isFinite(movePct)
  const move = showMove ? formatRippleMove(movePct) : ''
  const moveCls = showMove ? rippleMoveClass(movePct) : ''
  const showChart = hasCloses || (allowMockFallback && Number.isFinite(movePct))
  const footer = useMemo(
    () => resolveDiscoverMoveFooter(event, upcoming, { useMockFallback: useMockEarnings }),
    [event, upcoming, useMockEarnings],
  )
  const sourceLabel = discoverMoveSourceLabel(event)
  const dateLabel = formatEventCardDate(event.at)

  return {
    title,
    summary,
    ticker,
    showMove,
    move,
    moveCls,
    showChart,
    footer,
    sourceLabel,
    dateLabel,
  }
}

function DiscoverMoveRail({ ticker, move, moveCls, showMove, dateLabel, sourceLabel, lead = false }) {
  return (
    <div className={['discoverMoveRail', lead ? 'discoverMoveRail--lead' : ''].filter(Boolean).join(' ')}>
      <span className="discoverMoveCardTicker mono">{ticker}</span>
      {showMove ? (
        <span className={['discoverMoveCardMove', 'mono', moveCls].filter(Boolean).join(' ')}>{move}</span>
      ) : null}
      <span className="discoverMoveCardDate mono dim">{dateLabel}</span>
      {sourceLabel ? <span className="discoverMoveSource mono dim">{sourceLabel}</span> : null}
    </div>
  )
}

function DiscoverMoveCatalystStrip({ footer }) {
  if (!footer) return null
  return (
    <div
      className={['discoverMoveCatalyst', footer.soon ? 'discoverMoveCatalyst--soon' : '']
        .filter(Boolean)
        .join(' ')}
    >
      <span className="discoverMoveCatalystK mono">{footer.label}</span>
      <span className="discoverMoveCatalystV mono">{footer.date}</span>
    </div>
  )
}

function DiscoverMoveCard({
  event,
  movePct,
  reactionCloses,
  upcoming = [],
  useMockEarnings = false,
  allowMockFallback = false,
  catalystBg = false,
  onResearch,
}) {
  const model = useDiscoverMoveCardModel({
    event,
    movePct,
    reactionCloses,
    upcoming,
    useMockEarnings,
    allowMockFallback,
  })

  return (
    <button
      type="button"
      className={['discoverMoveCard', catalystBg ? 'discoverMoveCard--graded' : ''].filter(Boolean).join(' ')}
      onClick={() => onResearch?.({ ticker: event.ticker, companyName: event.companyName })}
    >
      <div
        className={['discoverMoveLeadGrid', model.footer ? '' : 'discoverMoveLeadGrid--noCatalyst']
          .filter(Boolean)
          .join(' ')}
      >
        <DiscoverMoveRail
          lead
          ticker={model.ticker}
          move={model.move}
          moveCls={model.moveCls}
          showMove={model.showMove}
          dateLabel={model.dateLabel}
          sourceLabel={model.sourceLabel}
        />
        {model.showChart ? (
          <div className="discoverMoveLeadChart">
            <DiscoverReactionChart
              ticker={event.ticker}
              movePct={movePct}
              closes={reactionCloses}
              height={112}
              allowMockSeries={allowMockFallback}
            />
          </div>
        ) : (
          <div className="discoverMoveLeadChart discoverMoveLeadChart--empty" aria-hidden="true" />
        )}
        <div className="discoverMoveLeadCopy">
          <p className="discoverMoveCardTitle discoverMoveCardTitle--lead">{model.title}</p>
          {model.summary && model.summary !== model.title ? (
            <p className="discoverMoveLeadSummary researchPaperDocCardAnalysis">{model.summary}</p>
          ) : null}
        </div>
        <DiscoverMoveCatalystStrip footer={model.footer} />
      </div>
    </button>
  )
}

function DiscoverMoveBoard({
  moves,
  moveReactions,
  catalystBgMoveIds,
  upcoming,
  useMockEarnings,
  allowMockFallback,
  onResearch,
}) {
  return (
    <div className="discoverMoveBoard">
      {moves.map((event) => {
        const reaction = moveReactions[event.id]
        return (
          <DiscoverMoveCard
            key={event.id}
            event={event}
            movePct={reaction?.movePct}
            reactionCloses={reaction?.closes}
            upcoming={upcoming}
            useMockEarnings={useMockEarnings}
            allowMockFallback={allowMockFallback}
            catalystBg={catalystBgMoveIds.has(event.id)}
            onResearch={onResearch}
          />
        )
      })}
    </div>
  )
}

const MARKET_MOVE_FILTER_SECTIONS = [{ types: DISCOVER_MARKET_MOVE_FILTER_TYPES }]

export function DiscoverPanel({ backendUp = false, onOpenResearch, isPhone = false, phonePane = 'moves' }) {
  const [query, setQuery] = useState('')
  const [macroQuery, setMacroQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [liveTimeline, setLiveTimeline] = useState(null)
  const [timelineFetching, setTimelineFetching] = useState(false)

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

  const mockTimeline = useMemo(() => {
    if (backendUp) return null
    const base = buildDiscoverTimeline({ query })
    const upcomingPool = getDiscoverUpcomingEvents()
    const market_moves = attachNextUpcomingToMarketMoves(
      buildHighlightedMarketMoves({ query, limit: DISCOVER_TIMELINE_DEFAULTS.limit }),
      upcomingPool,
    )
    return {
      ...base,
      market_moves,
      moves: buildMockMoveReactions(market_moves),
    }
  }, [backendUp, query])

  const macroSource = useMemo(() => {
    if (backendUp) return Array.isArray(liveTimeline?.macro) ? liveTimeline.macro : []
    return getUpcomingMacroDays(5)
  }, [backendUp, liveTimeline?.macro])

  const marketMovesSource = useMemo(() => {
    if (backendUp) return liveTimeline?.market_moves ?? []
    return mockTimeline?.market_moves ?? []
  }, [backendUp, liveTimeline?.market_moves, mockTimeline?.market_moves])

  const moveReactions = useMemo(() => {
    if (backendUp) return liveTimeline?.moves ?? {}
    return mockTimeline?.moves ?? {}
  }, [backendUp, liveTimeline?.moves, mockTimeline?.moves])

  const upcomingForFooters = useMemo(() => {
    if (backendUp) return []
    return getDiscoverUpcomingEvents()
  }, [backendUp])

  const marketMoves = useMemo(() => {
    return applyDiscoverSourceFilter(marketMovesSource, movesSourceFilters)
  }, [marketMovesSource, movesSourceFilters])

  const catalystBgMoveIds = useMemo(() => {
    return pickCatalystBgMoveIds(marketMoves, upcomingForFooters, { useMockFallback: !backendUp })
  }, [marketMoves, upcomingForFooters, backendUp])

  const marketMovesSearch = (
    <DiscoverFeedSearch
      value={query}
      onChange={setQuery}
      placeholder="Search ticker or event"
      ariaLabel="Search market moves"
    />
  )

  const macroSearch = (
    <DiscoverFeedSearch
      value={macroQuery}
      onChange={setMacroQuery}
      placeholder="Search macro release"
      ariaLabel="Search macro calendar"
    />
  )

  return (
    <section className="panel discoverPanel" aria-label="Discover">
      <div className="discoverPanelBody">
        <DiscoverMacroStrip
          panelClassName={discoverPhonePaneClass(isPhone, phonePane, 'macro')}
          macroDays={macroSource}
          enabledRegions={macroRegionFilters}
          enabledImpacts={macroImpactFilters}
          search={macroSearch}
          macroQuery={macroQuery}
          filterOpen={macroFilterOpen}
          onFilterClick={() => setMacroFilterOpen((open) => !open)}
          onFilterToggle={toggleMacroFilter}
          loading={showColumnLoading && !macroSource.some((d) => d.events?.length)}
        />
        <div className="discoverDual">
          <DiscoverFeedColumn
            panelClassName={discoverPhonePaneClass(isPhone, phonePane, 'moves')}
            title="MARKET MOVES"
            search={marketMovesSearch}
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
              <DiscoverMoveBoard
                moves={marketMoves}
                moveReactions={moveReactions}
                catalystBgMoveIds={catalystBgMoveIds}
                upcoming={upcomingForFooters}
                useMockEarnings={!backendUp}
                allowMockFallback={!backendUp}
                onResearch={onOpenResearch}
              />
            )}
          </DiscoverFeedColumn>
        </div>
      </div>
    </section>
  )
}
