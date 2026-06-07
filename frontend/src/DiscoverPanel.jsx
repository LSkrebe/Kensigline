import { Fragment, useCallback, useMemo, useState } from 'react'
import { DiscoverTimelineGap, EventBriefDocCard, formatEventCardDate } from './EventBrief.jsx'
import {
  buildDiscoverCardDisplayRows,
  buildDiscoverTimeline,
  DISCOVER_DOCUMENT_FILTER_TYPES,
  DISCOVER_FILTER_DEFAULT,
  getEventMentioned,
} from './discoverEvents.js'

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

function DiscoverFilterPicker({ enabled, onToggle }) {
  return (
    <div className="feedCompactFilterPicker scrollThin discoverFeedFilterPicker" role="group" aria-label="Discover filters">
      {DISCOVER_DOCUMENT_FILTER_TYPES.map(({ id, label, code }) => (
        <label key={id} className="feedFilterTypeRow">
          <input
            type="checkbox"
            checked={enabled?.has(id) ?? false}
            onChange={() => onToggle?.(id)}
          />
          <span className="feedFilterTypeLabel">{label}</span>
          <span className="feedFilterTypeCode mono" title={id}>
            {code}
          </span>
        </label>
      ))}
    </div>
  )
}

function DiscoverEventCard({ event, onResearch, showMentioned = false, interactive = false }) {
  const mentioned = showMentioned ? getEventMentioned(event.briefKey) : null
  const source = event.source ?? 'Filing'
  const dateTime = event.at?.includes('T') ? event.at : `${event.at}T12:00:00`
  const body = String(event.summary ?? event.title ?? '').trim()

  return (
    <EventBriefDocCard
      className={['discoverEventCard', interactive ? '' : 'discoverEventCard--ahead'].filter(Boolean).join(' ')}
      railTicker={event.ticker}
      ticker={event.ticker}
      source={source}
      dateTime={dateTime}
      dateLabel={formatEventCardDate(event.at)}
      analysis={body}
      mentioned={mentioned}
      url={interactive ? event.url : undefined}
      openLabel={interactive ? `Open ${source}` : undefined}
      onCardClick={
        interactive
          ? () => onResearch?.({ ticker: event.ticker, intelMode: event.intelMode })
          : undefined
      }
    />
  )
}

function DiscoverEventList({ events, variant, onResearch }) {
  const displayRows = useMemo(
    () => buildDiscoverCardDisplayRows(events, variant === 'recent' ? 'past' : 'upcoming'),
    [events, variant],
  )

  if (!displayRows.length) {
    return <p className="discoverColEmpty mono dim">No matching events.</p>
  }

  return (
    <div className="discoverEventList researchPaperDocuments">
      {displayRows.map((entry, idx) => (
        <Fragment key={entry.key}>
          {idx > 0 ? <div className="researchPaperDocConnector" aria-hidden="true" /> : null}
          {entry.type === 'sep' ? (
            <DiscoverTimelineGap label={entry.label} />
          ) : (
            <DiscoverEventCard
              event={entry.event}
              onResearch={onResearch}
              showMentioned={variant === 'recent'}
              interactive={variant === 'recent'}
            />
          )}
        </Fragment>
      ))}
    </div>
  )
}

function DiscoverAgendaColumn({ label, emptyLabel, variant, events, onResearch, headerEnd, columnExtra }) {
  return (
    <div className={`discoverCol discoverCol--${variant}`}>
      <header className="discoverColHead discoverColHeadBar">
        <span className="discoverColHeadLabel mono dim">{label}</span>
        {headerEnd}
      </header>
      {columnExtra}
      <div className="discoverColScroll scrollThin">
        {!events.length ? (
          <p className="discoverColEmpty mono dim">{emptyLabel}</p>
        ) : (
          <DiscoverEventList events={events} variant={variant} onResearch={onResearch} />
        )}
      </div>
    </div>
  )
}

export function DiscoverPanel({ onOpenResearch }) {
  const [query, setQuery] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [enabledFilters, setEnabledFilters] = useState(() => new Set(DISCOVER_FILTER_DEFAULT))

  const { upcoming, past } = useMemo(
    () => buildDiscoverTimeline({ query, enabledFilters }),
    [query, enabledFilters],
  )

  const toggleFilter = useCallback((id) => {
    setEnabledFilters((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const onFilterClick = useCallback(() => {
    setFilterOpen((open) => !open)
  }, [])

  const filterBtn = (
    <button
      type="button"
      className={['feedCompactFilterBtn', filterOpen ? 'isActive' : ''].filter(Boolean).join(' ')}
      aria-label="Filter events"
      title="Filter"
      aria-pressed={filterOpen || undefined}
      onClick={onFilterClick}
    >
      <DiscoverFilterIcon />
    </button>
  )

  const discoverSearch = (
    <div className="discoverColSearch">
      <label className="researchFeedSearch discoverSearch">
        <input
          className="researchFeedSearchInput"
          type="search"
          value={query}
          placeholder="Search ticker or event"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setQuery('')
          }}
          aria-label="Search ticker or event"
          spellCheck={false}
          autoComplete="off"
        />
        <svg className="researchFeedSearchIcon" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.75" />
          <path d="M16 16 L20 20" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      </label>
    </div>
  )

  return (
    <section className="panel discoverPanel" aria-label="Discover">
      <div className="discoverPanelBody">
        <div className={['discoverSplit', filterOpen ? 'discoverSplit--filterOpen' : ''].filter(Boolean).join(' ')}>
          {filterOpen ? (
            <div className="discoverCol discoverCol--filter">
              <header className="discoverColHead discoverColHeadBar">
                <span className="discoverColHeadLabel mono dim">Filter</span>
                {filterBtn}
              </header>
              <div className="feedCompactBody feedCompactBody--filterOpen">
                <DiscoverFilterPicker enabled={enabledFilters} onToggle={toggleFilter} />
              </div>
            </div>
          ) : (
            <DiscoverAgendaColumn
              label="Ahead"
              emptyLabel="No upcoming events."
              variant="ahead"
              events={upcoming}
              onResearch={onOpenResearch}
              headerEnd={filterBtn}
              columnExtra={discoverSearch}
            />
          )}
          <div className="discoverSplitRule" aria-hidden="true" />
          <DiscoverAgendaColumn
            label="Recent"
            emptyLabel="No recent events."
            variant="recent"
            events={past}
            onResearch={onOpenResearch}
          />
        </div>
      </div>
    </section>
  )
}
