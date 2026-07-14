export function ExploreDirectoryEventMeta({ event, extraSameDay = 0 }) {
  return (
    <span className="exploreDirectoryMeta mono">
      {event}
      {extraSameDay > 0 ? <span className="exploreDirectoryMetaMore"> +{extraSameDay}</span> : null}
    </span>
  )
}

function ExploreDirectoryRowContent({ row, kind }) {
  const trailClass = kind === 'actor' ? 'exploreDirectoryAmount' : 'exploreDirectoryMove'

  return (
    <>
      <span className="exploreDirectoryTicker mono">{row.ticker}</span>
      <div className="exploreDirectoryCopy">
        <span className="exploreDirectoryName">{row.name}</span>
        <ExploreDirectoryEventMeta event={row.event} extraSameDay={row.extraSameDay} />
      </div>
      <span className={[trailClass, 'mono', row.up ? 'isUp' : 'isDown'].join(' ')}>{row.trail}</span>
    </>
  )
}

export function ExploreDirectoryCompanyRow({ row, onClick = null }) {
  const label = `${row.name} (${row.ticker})`

  if (onClick) {
    return (
      <li className="exploreDirectoryRow exploreDirectoryRow--company">
        <button
          type="button"
          className="exploreDirectoryRowBtn"
          aria-label={`Open ${label}`}
          onClick={() => onClick(row)}
        >
          <ExploreDirectoryRowContent row={row} kind="company" />
        </button>
      </li>
    )
  }

  return (
    <li className="exploreDirectoryRow exploreDirectoryRow--company">
      <ExploreDirectoryRowContent row={row} kind="company" />
    </li>
  )
}

export function ExploreDirectoryActorRow({ row, onClick = null }) {
  const label = row.name

  if (onClick) {
    return (
      <li className="exploreDirectoryRow exploreDirectoryRow--actor">
        <button
          type="button"
          className="exploreDirectoryRowBtn"
          aria-label={`Open ${label}`}
          onClick={() => onClick(row)}
        >
          <ExploreDirectoryRowContent row={row} kind="actor" />
        </button>
      </li>
    )
  }

  return (
    <li className="exploreDirectoryRow exploreDirectoryRow--actor">
      <ExploreDirectoryRowContent row={row} kind="actor" />
    </li>
  )
}
