import { useState } from 'react'
import { ExploreDirectoryEventMeta, exploreRowDateLabel } from './ExploreDirectoryRows.jsx'
import { formatExploreDirectoryTrailLabel, exploreDirectoryTrailTone } from './exploreDirectoryTrail.js'

function watchlistPersonSublabel(row) {
  if (row.empty) return 'No filings yet'
  const parts = [row.modeLabel].filter(Boolean)
  const ticker = String(row.ticker ?? '').trim()
  if (ticker && ticker !== '—') parts.push(ticker)
  return parts.join(' · ')
}

function ExploreWatchlistPageEventRow({ event, onClick = null }) {
  const trailTone = exploreDirectoryTrailTone(event)
  const trailLabel = formatExploreDirectoryTrailLabel(event.trail)

  const content = (
    <>
      <span className="exploreDirectoryTicker mono">{event.ticker}</span>
      <div className="exploreDirectoryCopy">
        <ExploreDirectoryEventMeta event={event.event} extraSameDay={0} />
      </div>
      <span className={['exploreDirectoryAmount', 'mono', trailTone].join(' ')}>{trailLabel}</span>
      <span className="exploreDirectoryDate mono">{exploreRowDateLabel(event)}</span>
    </>
  )

  if (onClick) {
    return (
      <li className="exploreWatchlistPageEventRow">
        <button type="button" className="exploreWatchlistPageEventBtn" onClick={() => onClick(event)}>
          {content}
        </button>
      </li>
    )
  }

  return <li className="exploreWatchlistPageEventRow">{content}</li>
}

export function ExploreWatchlistPagePersonRow({ row, onEventClick = null }) {
  const [open, setOpen] = useState(false)
  const events = Array.isArray(row.events) ? row.events : []
  const expandable = events.length > 0
  const trailTone = exploreDirectoryTrailTone(row)
  const trailLabel = formatExploreDirectoryTrailLabel(row.trail)
  const sublabel = watchlistPersonSublabel(row)

  return (
    <li className={['exploreWatchlistPageGroup', open ? 'isOpen' : '', row.empty ? 'isEmpty' : ''].filter(Boolean).join(' ')}>
      <button
        type="button"
        className="exploreWatchlistPageGroupHead"
        aria-expanded={expandable ? open : undefined}
        disabled={!expandable}
        onClick={() => {
          if (expandable) setOpen((v) => !v)
        }}
      >
        <span className="exploreWatchlistPageGroupChevron mono" aria-hidden="true">
          {expandable ? (open ? '−' : '+') : '·'}
        </span>
        <span className="exploreWatchlistPageGroupCopy">
          <span className="exploreWatchlistPageGroupName">{row.name}</span>
          <span className="exploreWatchlistPageGroupMeta mono">{sublabel}</span>
        </span>
        <span className="exploreWatchlistPageGroupStat">
          <span className={['exploreWatchlistPageGroupAmount', 'mono', trailTone].join(' ')}>{trailLabel}</span>
          <span className="exploreWatchlistPageGroupDate mono">{row.date ? exploreRowDateLabel(row) : '—'}</span>
        </span>
      </button>
      {open && events.length ? (
        <ul className="exploreWatchlistPageEventList">
          {events.map((event) => (
            <ExploreWatchlistPageEventRow
              key={event.id}
              event={{ ...event, actorSlug: event.actorSlug ?? row.actorSlug, name: row.name }}
              onClick={onEventClick}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}
