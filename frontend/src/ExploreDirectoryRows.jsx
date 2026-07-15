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

function ExploreDirectoryListCompanyContent({ row }) {
  return (
    <>
      <span className="exploreDirectoryTicker mono">{row.ticker}</span>
      <div className="exploreDirectoryCopy">
        <span className="exploreDirectoryName">{row.name}</span>
        <ExploreDirectoryEventMeta event={row.event} extraSameDay={row.extraSameDay} />
      </div>
      <span className="exploreDirectoryDate mono">{row.publishedDateLabel}</span>
    </>
  )
}

const ACTOR_TICKER_PREVIEW = 3

function ExploreDirectoryActorTickers({ tickers, max = ACTOR_TICKER_PREVIEW }) {
  const list = Array.isArray(tickers) ? tickers.filter(Boolean) : []
  if (!list.length) return null

  const shown = list.slice(0, max)
  const extra = Math.max(0, list.length - shown.length)

  return (
    <span className="exploreDirectoryMeta exploreDirectoryMeta--tickers mono">
      {shown.join(' ')}
      {extra > 0 ? <span className="exploreDirectoryMetaMore"> +{extra}</span> : null}
    </span>
  )
}

function ExploreDirectoryListActorContent({ row }) {
  const net = row.netFlowUsd ?? 0
  const netTone = net > 0 ? 'isUp' : net < 0 ? 'isDown' : 'isFlat'

  return (
    <>
      <span className="exploreDirectoryTicker mono">{row.modeCode}</span>
      <div className="exploreDirectoryCopy">
        <span className="exploreDirectoryName">{row.name}</span>
        <ExploreDirectoryActorTickers tickers={row.tickers} />
      </div>
      <span className="exploreDirectoryStat mono">
        <span className="exploreDirectoryStatCount">{row.positionCount}</span>
        <span className="exploreDirectoryStatLabel">pos</span>
      </span>
      <span
        className={['exploreDirectoryAmount mono', netTone].join(' ')}
      >
        {row.netFlowLabel ?? '—'}
      </span>
    </>
  )
}

export function ExploreDirectoryListCompanyRow({ row, onClick = null }) {
  const label = `${row.name} (${row.ticker})`

  if (onClick) {
    return (
      <li className="exploreDirectoryRow exploreDirectoryRow--company exploreDirectoryRow--list">
        <button
          type="button"
          className="exploreDirectoryRowBtn"
          aria-label={`Open ${label}`}
          onClick={() => onClick(row)}
        >
          <ExploreDirectoryListCompanyContent row={row} />
        </button>
      </li>
    )
  }

  return (
    <li className="exploreDirectoryRow exploreDirectoryRow--company exploreDirectoryRow--list">
      <ExploreDirectoryListCompanyContent row={row} />
    </li>
  )
}

export function ExploreDirectoryListActorRow({ row, onClick = null }) {
  const label = row.name

  if (onClick) {
    return (
      <li className="exploreDirectoryRow exploreDirectoryRow--actor exploreDirectoryRow--list">
        <button
          type="button"
          className="exploreDirectoryRowBtn"
          aria-label={`Open ${label}`}
          onClick={() => onClick(row)}
        >
          <ExploreDirectoryListActorContent row={row} />
        </button>
      </li>
    )
  }

  return (
    <li className="exploreDirectoryRow exploreDirectoryRow--actor exploreDirectoryRow--list">
      <ExploreDirectoryListActorContent row={row} />
    </li>
  )
}
