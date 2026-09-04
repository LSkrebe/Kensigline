import { ExploreDirectoryEventMeta } from './ExploreDirectoryRows.jsx'
import { formatExploreDirectoryTrailLabel, exploreDirectoryTrailTone } from './exploreDirectoryTrail.js'

function ExploreWatchlistPersonRowContent({ row }) {
  const trailTone = exploreDirectoryTrailTone(row)
  const trailLabel = formatExploreDirectoryTrailLabel(row.trail)

  return (
    <>
      <span className="exploreDirectoryTicker mono">{row.ticker}</span>
      <div className="exploreDirectoryCopy">
        <span className="exploreDirectoryName">{row.name}</span>
        {Array.isArray(row.tickers) && row.tickers.length > 1 ? (
          <span className="exploreDirectoryMeta exploreDirectoryMeta--tickers mono">
            {row.tickers.slice(0, 3).join(' ')}
            {row.tickers.length > 3 ? (
              <span className="exploreDirectoryMetaMore"> +{row.tickers.length - 3}</span>
            ) : null}
          </span>
        ) : (
          <ExploreDirectoryEventMeta event={row.event} extraSameDay={row.extraSameDay} />
        )}
      </div>
      <span className={['exploreDirectoryAmount', 'mono', trailTone].join(' ')}>{trailLabel}</span>
    </>
  )
}

export function ExploreWatchlistPersonRow({ row, onClick = null }) {
  const label = row.name

  if (onClick) {
    return (
      <li className="exploreDirectoryRow exploreDirectoryRow--investor exploreDirectoryRow--watchlist">
        <button
          type="button"
          className="exploreDirectoryRowBtn"
          aria-label={`Open ${label}`}
          onClick={() => onClick(row)}
        >
          <ExploreWatchlistPersonRowContent row={row} />
        </button>
      </li>
    )
  }

  return (
    <li className="exploreDirectoryRow exploreDirectoryRow--investor exploreDirectoryRow--watchlist">
      <ExploreWatchlistPersonRowContent row={row} />
    </li>
  )
}
