import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { EventBriefAnalysis, formatEventCardDate } from './EventBrief.jsx'
import { DiscoverReactionChart } from './DiscoverReactionChart.jsx'
import { fetchDiscoverTimeline } from './discoverClient.js'
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
  truncateDiscoverSummary,
} from './discoverEvents.js'
import { normalizeResearchPaperSourceKey, RESEARCH_PAPER_SOURCE_CATALOG } from './researchPaperSources.js'
import {
  filterMacroCalendarDays,
  formatMacroDayHeader,
  formatRippleMove,
  getUpcomingMacroDays,
  MACRO_IMPACT_FILTER_DEFAULT,
  MACRO_IMPACT_FILTER_TYPES,
  MOCK_DISCOVER_MOVE_PCT,
  rippleMoveClass,
} from './discoverMockData.js'

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

function DiscoverFilterPicker({ sections, enabled, onToggle, ariaLabel }) {
  return (
    <div className="feedCompactFilterPicker scrollThin" role="group" aria-label={ariaLabel}>
      {sections.map((section) => (
        <Fragment key={section.title}>
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
        </Fragment>
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
}) {
  const showFilter = Boolean(filterSections?.length)

  return (
    <section
      className={['discoverCol', 'feed', 'feedCompact', showFilter ? 'discoverCol--filter' : '']
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

function DiscoverMacroDaySection({ day }) {
  const head = formatMacroDayHeader(day.date)

  return (
    <section className="discoverMacroDay">
      <header className="discoverMacroDayHead">
        <span className="discoverMacroDayWeekday mono">{head.weekday}</span>
        <span className="discoverMacroDayDate mono dim">{head.label}</span>
        {head.isToday ? <span className="discoverMacroDayToday mono">Today</span> : null}
      </header>
      <div className="discoverMacroDayBody">
        {!day.events.length ? (
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
    </section>
  )
}

function DiscoverMacroColumn({
  enabledRegions,
  enabledImpacts,
  filterOpen,
  onFilterClick,
  onFilterToggle,
}) {
  const days = useMemo(
    () => filterMacroCalendarDays(getUpcomingMacroDays(5), { regions: enabledRegions, impacts: enabledImpacts }),
    [enabledRegions, enabledImpacts],
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
    <DiscoverFeedColumn
      title="MACRO CALENDAR"
      filterSections={MACRO_FILTER_SECTIONS}
      filterEnabled={macroFilterEnabled}
      filterOpen={filterOpen}
      onFilterClick={onFilterClick}
      onFilterToggle={onMacroFilterToggle}
      filterAriaLabel="Macro calendar filters"
    >
      <div className="discoverMacroWeek">
        {!days.length ? (
          <p className="discoverColEmpty mono dim">No upcoming macro releases.</p>
        ) : (
          days.map((day) => <DiscoverMacroDaySection key={day.date} day={day} />)
        )}
      </div>
    </DiscoverFeedColumn>
  )
}

function DiscoverMoveCard({ event, movePct, onResearch }) {
  const title = String(event.title ?? '').trim() || '—'
  const summary = truncateDiscoverSummary(event.summary)
  const ticker = String(event.ticker ?? '').trim().toUpperCase()
  const showMove = Number.isFinite(movePct)
  const move = showMove ? formatRippleMove(movePct) : ''
  const moveCls = showMove ? rippleMoveClass(movePct) : ''

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
      {showMove ? <DiscoverReactionChart ticker={event.ticker} movePct={movePct} /> : null}
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

function DiscoverCatalystList({ events, onResearch }) {
  const displayRows = useMemo(() => buildDiscoverCardDisplayRows(events, 'upcoming'), [events])

  if (!displayRows.length) {
    return <p className="discoverColEmpty mono dim">No matching catalysts.</p>
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

export function DiscoverPanel({ onOpenResearch }) {
  const [query, setQuery] = useState('')
  const [liveTimeline, setLiveTimeline] = useState(null)

  const [watchlistFilterOpen, setWatchlistFilterOpen] = useState(false)
  const [watchlistFilters, setWatchlistFilters] = useState(() => new Set(DISCOVER_WATCHLIST_FILTER_DEFAULT))

  const [macroFilterOpen, setMacroFilterOpen] = useState(false)
  const [macroRegionFilters, setMacroRegionFilters] = useState(() => new Set(MACRO_REGION_FILTER_DEFAULT))
  const [macroImpactFilters, setMacroImpactFilters] = useState(() => new Set(MACRO_IMPACT_FILTER_DEFAULT))

  const [movesFilterOpen, setMovesFilterOpen] = useState(false)
  const [movesSourceFilters, setMovesSourceFilters] = useState(() => new Set(DISCOVER_MARKET_MOVE_FILTER_DEFAULT))

  const toggleWatchlistFilter = useCallback((id) => toggleFilterSet(setWatchlistFilters, id), [])
  const toggleMovesFilter = useCallback((id) => toggleFilterSet(setMovesSourceFilters, id), [])

  const toggleMacroFilter = useCallback((dimension, id) => {
    if (dimension === 'region') toggleFilterSet(setMacroRegionFilters, id)
    else if (dimension === 'impact') toggleFilterSet(setMacroImpactFilters, id)
  }, [])

  useEffect(() => {
    let alive = true
    void fetchDiscoverTimeline({ query, limit: 120, pastDays: 90, aheadDays: 180 }).then((data) => {
      if (alive && Array.isArray(data?.upcoming) && Array.isArray(data?.past)) setLiveTimeline(data)
    })
    return () => {
      alive = false
    }
  }, [query])

  const mockTimeline = useMemo(() => buildDiscoverTimeline({ query }), [query])
  const upcomingSource = liveTimeline?.upcoming ?? mockTimeline.upcoming
  const pastSource = liveTimeline?.past ?? mockTimeline.past

  const catalysts = useMemo(
    () => applyDiscoverSourceFilter(upcomingSource, watchlistFilters),
    [upcomingSource, watchlistFilters],
  )

  const marketMoves = useMemo(() => {
    const rows = pastSource.filter((event) => String(event.summary ?? '').trim() && event.kind !== 'flow')
    return applyDiscoverSourceFilter(rows, movesSourceFilters)
  }, [pastSource, movesSourceFilters])

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
      <div className="discoverPanelBody discoverTriple">
        <DiscoverFeedColumn
          title="WATCHLIST CATALYST"
          search={watchlistSearch}
          filterSections={WATCHLIST_FILTER_SECTIONS}
          filterEnabled={watchlistFilters}
          filterOpen={watchlistFilterOpen}
          onFilterClick={() => setWatchlistFilterOpen((open) => !open)}
          onFilterToggle={toggleWatchlistFilter}
          filterAriaLabel="Watchlist document types"
        >
          <DiscoverCatalystList events={catalysts} onResearch={onOpenResearch} />
        </DiscoverFeedColumn>
        <div className="discoverSplitRule" aria-hidden="true" />
        <DiscoverMacroColumn
          enabledRegions={macroRegionFilters}
          enabledImpacts={macroImpactFilters}
          filterOpen={macroFilterOpen}
          onFilterClick={() => setMacroFilterOpen((open) => !open)}
          onFilterToggle={toggleMacroFilter}
        />
        <div className="discoverSplitRule" aria-hidden="true" />
        <DiscoverFeedColumn
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
            <p className="discoverColEmpty mono dim">No recent market moves.</p>
          ) : (
            <div className="discoverMoveList">
              {marketMoves.map((event) => (
                <DiscoverMoveCard
                  key={event.id}
                  event={event}
                  movePct={MOCK_DISCOVER_MOVE_PCT[event.id]}
                  onResearch={onOpenResearch}
                />
              ))}
            </div>
          )}
        </DiscoverFeedColumn>
      </div>
    </section>
  )
}
