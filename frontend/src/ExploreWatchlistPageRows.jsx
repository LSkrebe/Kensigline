import { WatchlistRemoveButton } from './WatchlistToggleButton.jsx'
import { useUserWatchlist } from './UserWatchlistContext.jsx'
import { ExploreWatchlistPersonRow } from './ExploreWatchlistRows.jsx'

function watchlistEventRow(personRow, event) {
  return {
    ...personRow,
    id: event.id ?? `${personRow.id}-${event.ticker}-${event.date}`,
    ticker: event.ticker,
    companyName: event.companyName,
    docType: event.docType,
    event: event.event,
    trail: event.trail,
    trailMuted: event.trailMuted,
    up: event.up,
    date: event.date,
    tickers: undefined,
  }
}

export function ExploreWatchlistPagePersonRow({ row, onEventClick = null }) {
  const { removePerson } = useUserWatchlist()
  const events = Array.isArray(row.events) ? row.events : []
  const modeLabel = row.empty ? '—' : row.modeLabel

  return (
    <>
      <li className="exploreDirectoryRow exploreDirectoryRow--investor exploreDirectoryRow--watchlist exploreWatchlistPageNameRow">
        <div className="exploreDirectoryCopy exploreWatchlistPageNameCopy">
          <span className="exploreDirectoryNameLine">
            <span className="exploreDirectoryName">{row.name}</span>
            <WatchlistRemoveButton
              label={`Remove ${row.name} from watchlist`}
              onClick={() => removePerson(row.actorSlug, row.name)}
            />
          </span>
        </div>
        <span className="exploreDirectoryAmount mono" aria-hidden="true" />
        <span className="exploreDirectoryDate mono exploreDirectoryMeta">{modeLabel}</span>
      </li>
      {events.map((event) => (
        <ExploreWatchlistPersonRow
          key={event.id}
          row={watchlistEventRow(row, event)}
          hideName
          onClick={
            onEventClick
              ? () =>
                  onEventClick({
                    ...row,
                    ticker: event.ticker,
                    docType: event.docType,
                    trail: event.trail,
                    date: event.date,
                    id: event.id,
                  })
              : null
          }
        />
      ))}
      {row.empty ? (
        <li className="exploreDirectoryRow exploreDirectoryRow--investor exploreDirectoryRow--watchlist">
          <span className="exploreDirectoryTicker mono" aria-hidden="true">
            —
          </span>
          <div className="exploreDirectoryCopy">
            <span className="exploreDirectoryMeta mono">No filings yet</span>
          </div>
          <span className="exploreDirectoryAmount mono">—</span>
          <span className="exploreDirectoryDate mono">—</span>
        </li>
      ) : null}
    </>
  )
}
