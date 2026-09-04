import { useMemo } from 'react'
import { ExploreDirectoryInvestorRow } from './ExploreDirectoryRows.jsx'
import { WATCHLIST_TXNS_PER_PERSON } from './exploreWatchlistCatalog.js'

export function ExploreWatchlistSection({
  kicker,
  rows = [],
  onOpen,
  onRowClick = null,
  loading = false,
}) {
  const groupSize = WATCHLIST_TXNS_PER_PERSON

  const previewRows = useMemo(() => rows, [rows])

  return (
    <section className="exploreDirectorySection exploreWatchlistSection">
      <button
        type="button"
        className="exploreDirectorySectionHead"
        aria-label="Open Watchlist"
        onClick={onOpen}
      >
        <span className="exploreDirectorySectionHeadCopy">
          <span className="exploreDirectorySectionKicker mono">{kicker}</span>
          <span className="exploreDirectorySectionTitleRow">
            <span className="exploreDirectorySectionTitle">Watchlist</span>
            <span className="exploreDirectorySectionChevron mono" aria-hidden="true">
              &gt;
            </span>
          </span>
        </span>
      </button>
      <div className="exploreHomeListPanel">
        <ul className="exploreDirectoryList">
          {previewRows.length ? (
            previewRows.map((row, index) => (
              <ExploreDirectoryInvestorRow
                key={row.id}
                row={row}
                onClick={onRowClick}
                className={
                  (index + 1) % groupSize === 0 && index < previewRows.length - 1
                    ? 'exploreWatchlistRowGroupEnd'
                    : undefined
                }
              />
            ))
          ) : loading ? (
            <li className="exploreDirectoryEmpty mono exploreDirectoryEmpty--loading">Loading…</li>
          ) : (
            <li className="exploreDirectoryEmpty mono">No activity</li>
          )}
        </ul>
      </div>
    </section>
  )
}
