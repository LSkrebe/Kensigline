import { useMemo, useState } from 'react'
import {
  buildDiscoverTimeline,
  discoverEventRelativeLabel,
  formatDiscoverDayHead,
  groupEventsByDay,
  truncateDiscoverSummary,
} from './discoverEvents.js'

function DiscoverAheadRow({ event, showDate, dateLabel, onResearch }) {
  return (
    <button
      type="button"
      className={['discoverAgendaRow', 'discoverAgendaRow--ahead', event.impact === 'high' ? 'discoverAgendaRow--key' : '']
        .filter(Boolean)
        .join(' ')}
      onClick={() => onResearch?.({ ticker: event.ticker, intelMode: event.intelMode })}
    >
      <span className="discoverAgendaDate mono dim">{showDate ? dateLabel : ''}</span>
      <span className="discoverAgendaTicker mono">{event.ticker}</span>
      <span className="discoverAgendaTitle">{event.title}</span>
      <span className="discoverAgendaWhen mono">{discoverEventRelativeLabel(event.at)}</span>
    </button>
  )
}

function DiscoverRecentRow({ event, showDate, dateLabel, onResearch }) {
  const summary = truncateDiscoverSummary(event.summary)

  return (
    <button
      type="button"
      className={['discoverAgendaRow', 'discoverAgendaRow--recent', summary ? 'discoverAgendaRow--hasSummary' : '']
        .filter(Boolean)
        .join(' ')}
      onClick={() => onResearch?.({ ticker: event.ticker, intelMode: event.intelMode })}
    >
      <span className="discoverAgendaDate mono dim">{showDate ? dateLabel : ''}</span>
      <span className="discoverAgendaTicker mono">{event.ticker}</span>
      <span className="discoverAgendaTitle">{event.title}</span>
      {summary ? <span className="discoverAgendaSummary">{summary}</span> : null}
    </button>
  )
}

function DiscoverAgendaColumn({ label, emptyLabel, variant, dayGroups, onResearch, Row, columnExtra }) {
  return (
    <div className={`discoverCol discoverCol--${variant}`}>
      <div className="discoverColHead mono dim">{label}</div>
      {columnExtra}
      <div className="discoverColScroll scrollThin">
        {!dayGroups.length ? (
          <p className="discoverColEmpty mono dim">{emptyLabel}</p>
        ) : (
          <div className="discoverAgenda">
            {dayGroups.map((group) =>
              group.events.map((event, idx) => (
                <Row
                  key={event.id}
                  event={event}
                  showDate={idx === 0}
                  dateLabel={formatDiscoverDayHead(group.date)}
                  onResearch={onResearch}
                />
              )),
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function DiscoverPanel({ onOpenResearch, scope = 'all' }) {
  const [query, setQuery] = useState('')

  const { upcoming, past } = useMemo(
    () => buildDiscoverTimeline({ filter: scope, query }),
    [scope, query],
  )

  const aheadGroups = useMemo(() => groupEventsByDay(upcoming, 'upcoming'), [upcoming])
  const recentGroups = useMemo(() => groupEventsByDay(past, 'past'), [past])

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
        <div className="discoverSplit">
          <DiscoverAgendaColumn
            label="Ahead"
            emptyLabel="No upcoming events."
            variant="ahead"
            dayGroups={aheadGroups}
            onResearch={onOpenResearch}
            Row={DiscoverAheadRow}
            columnExtra={discoverSearch}
          />
          <div className="discoverSplitRule" aria-hidden="true" />
          <DiscoverAgendaColumn
            label="Recent"
            emptyLabel="No recent events."
            variant="recent"
            dayGroups={recentGroups}
            onResearch={onOpenResearch}
            Row={DiscoverRecentRow}
          />
        </div>
      </div>
    </section>
  )
}
