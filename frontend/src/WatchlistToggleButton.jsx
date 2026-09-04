export function WatchlistAddButton({ onClick, label = 'Add to watchlist', hidden = false }) {
  return (
    <button
      type="button"
      className={['exploreWatchlistToggle', 'exploreWatchlistToggle--add', 'mono', hidden ? 'isHidden' : ''].filter(Boolean).join(' ')}
      aria-label={label}
      aria-hidden={hidden ? true : undefined}
      tabIndex={hidden ? -1 : 0}
      onClick={onClick}
    >
      +
    </button>
  )
}

export function WatchlistRemoveButton({ onClick, label = 'Remove from watchlist' }) {
  return (
    <button
      type="button"
      className="exploreWatchlistToggle exploreWatchlistToggle--remove mono"
      aria-label={label}
      onClick={onClick}
    >
      −
    </button>
  )
}
