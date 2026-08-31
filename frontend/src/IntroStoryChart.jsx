import { useMemo } from 'react'
import { ORIGIN_STORY_NVDA_PRICES } from './originStoryNvdaPrices.js'

const W = 960
const CHART_H = 200
const CHART_PAD_Y = 12
const PAD_X = 4

function dateIndex(dates, target) {
  const i = dates.findIndex((d) => d >= target)
  return i === -1 ? dates.length - 1 : i
}

function priceAt(dates, closes, target) {
  return closes[dateIndex(dates, target)]
}

function buildGeometry(dates, closes) {
  const plotW = W - PAD_X * 2
  const chartTop = CHART_PAD_Y
  const chartBottom = CHART_H - CHART_PAD_Y
  const plotH = chartBottom - chartTop
  const min = Math.min(...closes)
  const max = Math.max(...closes)
  const span = max - min || 1

  const points = closes.map((close, i) => ({
    x: PAD_X + (i / Math.max(closes.length - 1, 1)) * plotW,
    y: chartTop + (1 - (close - min) / span) * plotH,
    pct: ((PAD_X + (i / Math.max(closes.length - 1, 1)) * plotW) / W) * 100,
  }))

  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ')

  const area = `${line} L ${points[points.length - 1].x.toFixed(2)} ${chartBottom} L ${points[0].x.toFixed(2)} ${chartBottom} Z`

  return { points, line, area, chartBottom }
}

function NewsIcon() {
  return (
    <div className="lpStoryNewsIcon" aria-hidden="true">
      <span className="lpStoryNewsIconLine" />
      <span className="lpStoryNewsIconLine" />
      <span className="lpStoryNewsIconLine lpStoryNewsIconLine--short" />
      <span className="lpStoryNewsIconBlock" />
    </div>
  )
}

function StoryCallout({ tone, leftPct, gain, name, photoUrl, photoAlt, brandLogo }) {
  return (
    <div
      className={`lpStoryCallout lpStoryCallout--${tone}`}
      style={{ left: `${leftPct}%` }}
    >
      <p className={`lpStoryCalloutGain lpStoryCalloutGain--${tone}`}>{gain}</p>
      {photoUrl ? (
        brandLogo ? (
          <span className="lpStoryAvatarLogo" aria-hidden="true">
            <img
              className="lpStoryAvatarPhoto lpStoryAvatarPhoto--logo"
              src={photoUrl}
              alt={photoAlt ?? ''}
              width={56}
              height={56}
              loading="lazy"
              decoding="async"
            />
          </span>
        ) : (
          <img
            className="lpStoryAvatarPhoto"
            src={photoUrl}
            alt={photoAlt ?? ''}
            width={56}
            height={56}
            loading="lazy"
            decoding="async"
          />
        )
      ) : (
        <NewsIcon />
      )}
      <p className={`lpStoryCalloutName lpStoryCalloutName--${tone}`}>{name}</p>
    </div>
  )
}

/** Chart + callout diagram — filing vs news on the same price path. */
export function IntroStoryDiagram({ person, timeline, outcome }) {
  const full = ORIGIN_STORY_NVDA_PRICES
  const endIdx = dateIndex(full.dates, timeline.end.date)
  const dates = full.dates.slice(0, endIdx + 1)
  const closes = full.closes.slice(0, endIdx + 1)

  const geometry = useMemo(() => buildGeometry(dates, closes), [dates, closes])

  const filingPoint = geometry.points[dateIndex(dates, timeline.filing.date)]
  const newsPoint = geometry.points[dateIndex(dates, timeline.news.date)]

  const filingPrice = priceAt(dates, closes, timeline.filing.date)
  const newsPrice = priceAt(dates, closes, timeline.news.date)
  const endPrice = closes[closes.length - 1]

  const gainFromFiling = Math.round(((endPrice / filingPrice - 1) * 100))
  const gainFromNews = Math.round(((endPrice / newsPrice - 1) * 100))

  const filingPct = filingPoint.pct
  const newsPct = newsPoint.pct

  return (
    <div
      className="lpStoryDiagram"
      role="img"
      aria-label={`${outcome.ticker} rose ${gainFromFiling}% after the filing; News caught only ${gainFromNews}% of what was left`}
    >
      <div className="lpStoryStage">
        <div className="lpStoryCallouts">
          <StoryCallout
            tone="filing"
            leftPct={filingPct}
            gain={`+${gainFromFiling}%`}
            name={person.name}
            photoUrl={person.photoUrl}
            photoAlt={person.photoAlt}
            brandLogo={person.brandLogo}
          />
          <StoryCallout
            tone="news"
            leftPct={newsPct}
            gain={`+${gainFromNews}%`}
            name={timeline.news.name}
          />
        </div>

        <div className="lpStoryChartWrap">
          <svg
            className="lpStoryChartSvg"
            viewBox={`0 0 ${W} ${CHART_H}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="lpStoryChartArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(125, 206, 160, 0.2)" />
                <stop offset="100%" stopColor="rgba(125, 206, 160, 0)" />
              </linearGradient>
            </defs>

            <line
              x1={filingPoint.x}
              y1={0}
              x2={filingPoint.x}
              y2={filingPoint.y - 6}
              className="lpStoryConnector lpStoryConnector--filing"
            />
            <line
              x1={newsPoint.x}
              y1={0}
              x2={newsPoint.x}
              y2={newsPoint.y - 6}
              className="lpStoryConnector lpStoryConnector--news"
            />

            <path d={geometry.area} className="lpStoryChartArea" fill="url(#lpStoryChartArea)" />
            <path d={geometry.line} className="lpStoryChartLine" pathLength="1" />
          </svg>

          <span
            className="lpStoryMarker lpStoryMarker--filing"
            style={{ left: `${filingPct}%`, top: `${(filingPoint.y / CHART_H) * 100}%` }}
            aria-hidden="true"
          />
          <span
            className="lpStoryMarker lpStoryMarker--news"
            style={{ left: `${newsPct}%`, top: `${(newsPoint.y / CHART_H) * 100}%` }}
            aria-hidden="true"
          />
        </div>
      </div>
    </div>
  )
}

export function originStoryNewsMovePct(filingDate, newsDate) {
  const { dates, closes } = ORIGIN_STORY_NVDA_PRICES
  const filing = priceAt(dates, closes, filingDate)
  const news = priceAt(dates, closes, newsDate)
  return Math.round(((news / filing - 1) * 100))
}
