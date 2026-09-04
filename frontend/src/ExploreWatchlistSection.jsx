import { ExploreWatchlistPersonRow } from './ExploreWatchlistRows.jsx'

export function ExploreWatchlistSection({
  kicker,
  rows = [],
  onOpen,
  onRowClick = null,
  loading = false,
}) {
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
        <ul className="exploreDirectoryList exploreWatchlistList">
          {rows.length ? (
            rows.map((row) => (
              <ExploreWatchlistPersonRow key={row.id} row={row} onClick={onRowClick} />
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
