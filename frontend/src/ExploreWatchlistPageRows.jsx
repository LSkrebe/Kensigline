import { useUserWatchlist } from './UserWatchlistContext.jsx'
import { ExplorePersonRow, ImageOrInitials, normalizeInvestorName } from './ExplorePersonRow.jsx'
import portraits from './explorePortraits.json'

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
    events: [event],
    performanceEventIds: [event.id],
  }
}

export function ExploreWatchlistPagePersonRow({ row, onEventClick = null }) {
  const { removePerson } = useUserWatchlist()
  const events = Array.isArray(row.events) ? row.events : []
  const modeLabel = row.empty ? '—' : row.modeLabel

  return (
    <li className="exploreWatchlistGroup">
      <div className="exploreWatchlistGroupHeader">
        <ImageOrInitials src={portraits[normalizeInvestorName(row.name)]?.src} name={row.name} className="explorePersonPortrait"/>
        <span className="explorePersonCopy"><span className="exploreDirectoryName">{row.name}</span><span className="explorePersonMeta mono">{modeLabel}</span></span>
        <button type="button" className="exploreInvestorSave" aria-label={`Remove ${row.name} from watchlist`} title={`Remove ${row.name} from watchlist`} onClick={() => removePerson(row.actorSlug, row.name)}>
          <svg width="16" height="18" viewBox="0 0 20 22" fill="none" aria-hidden="true"><path d="M5 3h10v16l-5-3-5 3V3Z" stroke="currentColor" strokeWidth="1.25"/><path d="M7 10h6" stroke="currentColor" strokeWidth="1.25"/></svg>
        </button>
      </div>
      <ul className="exploreWatchlistGroupTransactions">
      {events.map((event) => (
        <ExplorePersonRow
          key={event.id}
          row={watchlistEventRow(row, event)}
          companyOnly
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
      </ul>
    </li>
  )
}
