import { ExploreDirectoryEventMeta, exploreRowDateLabel } from './ExploreDirectoryRows.jsx'
import { formatExploreDirectoryTrailLabel, exploreDirectoryTrailTone } from './exploreDirectoryTrail.js'

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
      <li className="exploreDirectoryRow exploreDirectoryRow--investor exploreDirectoryRow--watchlist exploreWatchlistPageEventRow">
        <button type="button" className="exploreDirectoryRowBtn" onClick={() => onClick(event)}>
          {content}
        </button>
      </li>
    )
  }

  return (
    <li className="exploreDirectoryRow exploreDirectoryRow--investor exploreDirectoryRow--watchlist exploreWatchlistPageEventRow">
      <div className="exploreWatchlistPageEventInner">{content}</div>
    </li>
  )
}

export function ExploreWatchlistPagePersonRow({ row, onEventClick = null }) {
  const events = Array.isArray(row.events) ? row.events : []
  const modeLabel = row.empty ? '—' : row.modeLabel

  return (
    <li className={['exploreWatchlistPageGroup', row.empty ? 'isEmpty' : ''].filter(Boolean).join(' ')}>
      <div className="exploreDirectoryRow exploreDirectoryRow--investor exploreDirectoryRow--watchlist exploreWatchlistPageGroupHead">
        <span className="exploreDirectoryTicker mono exploreWatchlistPageGroupTicker" aria-hidden="true" />
        <div className="exploreDirectoryCopy">
          <span className="exploreDirectoryName">{row.name}</span>
        </div>
        <span className="exploreDirectoryAmount mono exploreWatchlistPageGroupSpacer" aria-hidden="true" />
        <span className="exploreDirectoryDate mono exploreDirectoryMeta">{modeLabel}</span>
      </div>
      {events.length ? (
        <ul className="exploreWatchlistPageEventList">
          {events.map((event) => (
            <ExploreWatchlistPageEventRow
              key={event.id}
              event={{ ...event, actorSlug: event.actorSlug ?? row.actorSlug, name: row.name }}
              onClick={onEventClick}
            />
          ))}
        </ul>
      ) : row.empty ? (
        <p className="exploreWatchlistPageEmpty mono">No filings yet</p>
      ) : null}
    </li>
  )
}
