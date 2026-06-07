import { eventMentionedChain } from './eventBriefs.js'

export function formatEventCardDate(at) {
  const raw = String(at ?? '').trim()
  if (!raw) return '—'
  const d = new Date(raw.includes('T') ? raw : `${raw}T12:00:00`)
  if (Number.isNaN(d.getTime())) return '—'
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
  }
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${mo}-${day}`
}

export function EventBriefAnalysis({ text, className = 'researchPaperDocCardAnalysis' }) {
  const body = String(text ?? '').trim()
  if (!body) return null
  const paras = body.split(/\n\n+/).map((p) => p.trim()).filter(Boolean)
  if (paras.length === 0) {
    return <p className={className}>{body}</p>
  }
  return paras.map((p, i) => (
    <p className={className} key={`event-brief-p-${i}`}>
      {p}
    </p>
  ))
}

export function EventBriefMentioned({ ticker, mentioned }) {
  const chain = eventMentionedChain(ticker, mentioned)
  if (!chain.length) return null
  const current = String(ticker ?? '').trim().toUpperCase()
  return (
    <p className="eventBriefMentionedTickers mono dim">
      {chain.map((t, i) => (
        <span key={`${t}-${i}`}>
          {i > 0 ? (
            <span className="eventBriefMentionedArrow" aria-hidden="true">
              {' → '}
            </span>
          ) : null}
          <span className={t.toUpperCase() === current ? 'eventBriefMentionedCurrent' : undefined}>{t}</span>
        </span>
      ))}
    </p>
  )
}

export function EventBriefBody({ ticker, analysis, mentioned }) {
  const hasAnalysis = Boolean(String(analysis ?? '').trim())
  const hasMentioned = eventMentionedChain(ticker, mentioned).length > 0
  if (!hasAnalysis && !hasMentioned) return null
  return (
    <div className="eventBriefBody">
      {hasAnalysis ? <EventBriefAnalysis text={analysis} /> : null}
      {hasMentioned ? <EventBriefMentioned ticker={ticker} mentioned={mentioned} /> : null}
    </div>
  )
}

export function DiscoverTimelineGap({ label }) {
  const text = String(label ?? '').trim()
  if (!text) return null
  return (
    <div className="researchPaperTodayGap" aria-hidden="true">
      <div className="researchPaperTodayGapRow">
        <span className="researchPaperTodayGapRule" />
        <span className="researchPaperTodayGapLabel mono">{text}</span>
      </div>
    </div>
  )
}

function EventBriefDocOpenIcon() {
  return (
    <svg className="researchPaperDocOpenIconSvg" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M14 4h6v6M10 20 20 10M20 10h-6M20 10v6M4 14V4h10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  )
}

export function EventBriefDocCard({
  ticker,
  railTicker,
  source = 'Filing',
  dateTime,
  dateLabel,
  analysis,
  mentioned,
  url,
  onCardClick,
  railContent,
  className = '',
  captureId,
  openLabel,
}) {
  const Tag = onCardClick ? 'button' : 'article'
  const label = openLabel ?? `Open ${source}`
  const railLabel = String(railTicker ?? '').trim().toUpperCase()

  return (
    <Tag
      type={onCardClick ? 'button' : undefined}
      data-paper-capture-id={captureId}
      className={[
        'researchPaperRailCard',
        'researchPaperDocCard',
        onCardClick ? 'eventBriefDocCard--clickable' : '',
        railLabel ? 'researchPaperDocCard--railTicker' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onCardClick}
    >
      <div
        className={[
          'researchPaperRailCardRail',
          railLabel ? 'researchPaperRailCardRail--ticker' : '',
          railContent ? 'researchPaperRailCardRail--capture' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {railLabel ? <span className="eventBriefRailTicker mono">{railLabel}</span> : null}
        {railContent}
      </div>
      <div className="researchPaperRailCardMain">
        <div className="researchPaperRailCardGrid">
          <div className="researchPaperRailCardCol">
            <span className="researchPaperDocCardSource mono dim">{source}</span>
          </div>
          <div className="researchPaperRailCardCol researchPaperRailCardCol--end">
            <time className="researchPaperDocCardDate mono dim" dateTime={dateTime ?? undefined}>
              {dateLabel ?? '—'}
            </time>
          </div>
        </div>
        <EventBriefBody ticker={ticker} analysis={analysis} mentioned={mentioned} />
        {url ? (
          <a
            className="researchPaperDocOpen"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={label}
            title={label}
            onClick={(e) => e.stopPropagation()}
          >
            <EventBriefDocOpenIcon />
          </a>
        ) : null}
      </div>
    </Tag>
  )
}
