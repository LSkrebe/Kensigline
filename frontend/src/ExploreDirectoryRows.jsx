import {
  exploreDirectoryNetFlowTone,
  exploreDirectoryTrailTone,
  formatExploreDirectoryTrailLabel,
} from './exploreDirectoryTrail.js'
import { WatchlistAddButton } from './WatchlistToggleButton.jsx'
import { useUserWatchlist } from './UserWatchlistContext.jsx'
import { investorRowWatchlistSlug, normalizeWatchlistCompanyTicker } from './userWatchlist.js'

export function ExploreDirectoryEventMeta({ event, extraSameDay = 0 }) {
  return (
    <span className="exploreDirectoryMeta mono">
      {event}
      {extraSameDay > 0 ? <span className="exploreDirectoryMetaMore"> +{extraSameDay}</span> : null}
    </span>
  )
}

export function exploreRowDateLabel(row) {
  if (row.publishedDateLabel) return row.publishedDateLabel
  if (row.lastDateLabel) return row.lastDateLabel
  if (row.dateLabel) return row.dateLabel
  const date = String(row.date ?? row.lastDate ?? '').trim()
  if (!date) return '—'
  const then = new Date(`${date}T12:00:00`)
  if (Number.isNaN(then.getTime())) return '—'
  const mm = String(then.getMonth() + 1).padStart(2, '0')
  const dd = String(then.getDate()).padStart(2, '0')
  return `${mm}-${dd}`
}

function ExploreDirectoryRowContent({ row, kind }) {
  const trailClass = kind === 'investor' ? 'exploreDirectoryAmount' : 'exploreDirectoryMove'
  const tickers = kind === 'investor' && Array.isArray(row.tickers) ? row.tickers.filter(Boolean) : []
  const trailTone =
    kind === 'investor'
      ? exploreDirectoryTrailTone(row)
      : row.trailMuted
        ? 'isFlat'
        : row.up
          ? 'isUp'
          : 'isDown'
  const trailLabel = kind === 'investor' ? formatExploreDirectoryTrailLabel(row.trail) : row.trail

  return (
    <>
      <span className="exploreDirectoryTicker mono">{row.ticker}</span>
      <div className="exploreDirectoryCopy">
        <span className="exploreDirectoryName">{row.name}</span>
        {tickers.length > 1 ? (
          <ExploreDirectoryInvestorTickers tickers={tickers} />
        ) : (
          <ExploreDirectoryEventMeta event={row.event} extraSameDay={row.extraSameDay} />
        )}
      </div>
      <span className={[trailClass, 'mono', trailTone].join(' ')}>{trailLabel}</span>
      <span className="exploreDirectoryDate mono">{exploreRowDateLabel(row)}</span>
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

export function ExploreDirectoryInvestorRow({ row, onClick = null, className = null }) {
  const label = row.name
  const rowClass = ['exploreDirectoryRow', 'exploreDirectoryRow--investor', className].filter(Boolean).join(' ')

  if (onClick) {
    return (
      <li className={rowClass}>
        <button
          type="button"
          className="exploreDirectoryRowBtn"
          aria-label={`Open ${label}`}
          onClick={() => onClick(row)}
        >
          <ExploreDirectoryRowContent row={row} kind="investor" />
        </button>
      </li>
    )
  }

  return (
    <li className={rowClass}>
      <ExploreDirectoryRowContent row={row} kind="investor" />
    </li>
  )
}

/** @deprecated Use ExploreDirectoryInvestorRow */
export const ExploreDirectoryActorRow = ExploreDirectoryInvestorRow

function ExploreDirectoryListCompanyContent({ row }) {
  const { hasCompany, addCompany } = useUserWatchlist()
  const ticker = normalizeWatchlistCompanyTicker(row.ticker)
  const onWatchlist = hasCompany(ticker)

  return (
    <>
      <span className="exploreDirectoryTicker mono">{row.ticker}</span>
      <div className="exploreDirectoryCopy">
        <span className="exploreDirectoryNameLine">
          <span className="exploreDirectoryName">{row.name}</span>
          <WatchlistAddButton
            hidden={onWatchlist}
            label={`Add ${row.name} to watchlist`}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              addCompany(ticker, row.name)
            }}
          />
        </span>
        <ExploreDirectoryEventMeta event={row.event} extraSameDay={row.extraSameDay} />
      </div>
      <span className={['exploreDirectoryMove', 'mono', row.trail === '—' ? 'isFlat' : row.up ? 'isUp' : 'isDown'].join(' ')}>
        {row.trail ?? '—'}
      </span>
      <span className="exploreDirectoryDate mono">{row.publishedDateLabel}</span>
    </>
  )
}

const INVESTOR_TICKER_PREVIEW = 3

function ExploreDirectoryInvestorTickers({ tickers, max = INVESTOR_TICKER_PREVIEW }) {
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

function ExploreDirectoryListInvestorContent({ row }) {
  const { hasPerson, addPersonFromRow } = useUserWatchlist()
  const slug = investorRowWatchlistSlug(row)
  const onWatchlist = hasPerson(slug, row.name)
  const netTone = exploreDirectoryNetFlowTone(row)
  const count = Number.isFinite(Number(row.positionCount))
    ? Math.max(0, Math.trunc(Number(row.positionCount)))
    : 0

  return (
    <>
      <span className="exploreDirectoryTicker mono">{row.modeCode}</span>
      <div className="exploreDirectoryCopy">
        <span className="exploreDirectoryNameLine">
          <span className="exploreDirectoryName">{row.name}</span>
          <WatchlistAddButton
            hidden={onWatchlist}
            label={`Add ${row.name} to watchlist`}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              addPersonFromRow(row)
            }}
          />
        </span>
        <ExploreDirectoryInvestorTickers tickers={row.tickers} />
      </div>
      <span className="exploreDirectoryStat mono">
        <span className="exploreDirectoryStatCount">{count}</span>
        <span className="exploreDirectoryStatLabel">Pos.</span>
      </span>
      <span className={['exploreDirectoryAmount mono', netTone].join(' ')}>
        {formatExploreDirectoryTrailLabel(row.netFlowLabel ?? '—')}
      </span>
      <span className="exploreDirectoryDate mono">{row.lastDateLabel ?? '—'}</span>
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

export function ExploreDirectoryListInvestorRow({ row, onClick = null }) {
  const label = row.name

  if (onClick) {
    return (
      <li className="exploreDirectoryRow exploreDirectoryRow--investor exploreDirectoryRow--list">
        <button
          type="button"
          className="exploreDirectoryRowBtn"
          aria-label={`Open ${label}`}
          onClick={() => onClick(row)}
        >
          <ExploreDirectoryListInvestorContent row={row} />
        </button>
      </li>
    )
  }

  return (
    <li className="exploreDirectoryRow exploreDirectoryRow--investor exploreDirectoryRow--list">
      <ExploreDirectoryListInvestorContent row={row} />
    </li>
  )
}

/** @deprecated Use ExploreDirectoryListInvestorRow */
export const ExploreDirectoryListActorRow = ExploreDirectoryListInvestorRow
