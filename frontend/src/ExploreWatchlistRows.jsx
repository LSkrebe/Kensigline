import { ExploreDirectoryEventMeta, exploreRowDateLabel } from './ExploreDirectoryRows.jsx'
import { formatExploreDirectoryTrailLabel, exploreDirectoryTrailTone } from './exploreDirectoryTrail.js'

function ExploreWatchlistPersonRowContent({ row, hideName = false }) {
  const trailTone = exploreDirectoryTrailTone(row)
  const trailLabel = formatExploreDirectoryTrailLabel(row.trail)
  const companySubtitle = String(row.companyName ?? '').trim()

  return (
    <>
      <span className="exploreDirectoryTicker mono">{row.ticker}</span>
      <div className="exploreDirectoryCopy">
        {hideName ? null : <span className="exploreDirectoryName">{row.name}</span>}
        {Array.isArray(row.tickers) && row.tickers.length > 1 ? (
          <span className="exploreDirectoryMeta exploreDirectoryMeta--tickers mono">
            {row.tickers.slice(0, 3).join(' ')}
            {row.tickers.length > 3 ? (
              <span className="exploreDirectoryMetaMore"> +{row.tickers.length - 3}</span>
            ) : null}
          </span>
        ) : hideName && companySubtitle ? (
          <span className="exploreDirectoryMeta">{companySubtitle}</span>
        ) : (
          <ExploreDirectoryEventMeta event={row.event} extraSameDay={0} />
        )}
      </div>
      <span className={['exploreDirectoryAmount', 'mono', trailTone].join(' ')}>{trailLabel}</span>
      <span className="exploreDirectoryDate mono">{exploreRowDateLabel(row)}</span>
    </>
  )
}

export function ExploreWatchlistPersonRow({ row, onClick = null, hideName = false }) {
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
          <ExploreWatchlistPersonRowContent row={row} hideName={hideName} />
        </button>
      </li>
    )
  }

  return (
    <li className="exploreDirectoryRow exploreDirectoryRow--investor exploreDirectoryRow--watchlist">
      <ExploreWatchlistPersonRowContent row={row} hideName={hideName} />
    </li>
  )
}
