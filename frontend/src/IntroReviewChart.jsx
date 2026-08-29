import { useMemo } from 'react'
import { INTRO_REVIEW_PRICES } from './introReviewPrices.js'
import { ORIGIN_STORY_NVDA_PRICES } from './originStoryNvdaPrices.js'

const W = 360
const H = 96
const PAD_X = 3
const PAD_Y = 10

function sliceSeries(source, filedIso, chartEnd) {
  const fi = source.dates.findIndex((d) => d >= filedIso)
  const ei = source.dates.findIndex((d) => d >= chartEnd)
  if (fi === -1) return { dates: [], closes: [] }
  const end = ei === -1 ? source.dates.length : ei + 1
  return {
    dates: source.dates.slice(fi, end),
    closes: source.closes.slice(fi, end),
  }
}

function reviewSeries(ticker, filedIso, chartEnd) {
  if (ticker === 'NVDA') return sliceSeries(ORIGIN_STORY_NVDA_PRICES, filedIso, chartEnd)
  const source = INTRO_REVIEW_PRICES[ticker]
  return source ? { dates: source.dates, closes: source.closes } : { dates: [], closes: [] }
}

function buildGeometry(closes) {
  const chartTop = PAD_Y
  const chartBottom = H - PAD_Y
  const plotW = W - PAD_X * 2
  const plotH = chartBottom - chartTop
  const min = Math.min(...closes)
  const max = Math.max(...closes)
  const span = max - min || 1

  const points = closes.map((close, i) => ({
    x: PAD_X + (i / Math.max(closes.length - 1, 1)) * plotW,
    y: chartTop + (1 - (close - min) / span) * plotH,
  }))

  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ')

  const area = `${line} L ${points[points.length - 1].x.toFixed(2)} ${chartBottom} L ${points[0].x.toFixed(2)} ${chartBottom} Z`

  return { points, line, area, chartBottom }
}

export function IntroReviewChart({ ticker, filedIso, chartEnd }) {
  const geometry = useMemo(() => {
    const { closes } = reviewSeries(ticker, filedIso, chartEnd)
    if (closes.length < 2) return null
    return buildGeometry(closes)
  }, [ticker, filedIso, chartEnd])

  if (!geometry) return null

  return (
    <div className="lpReviewChartWrap">
      <svg
        className="lpReviewChartSvg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d={geometry.line} className="lpReviewChartLine" pathLength="1" />
      </svg>
    </div>
  )
}

export function reviewMovePct(ticker, filedIso, chartEnd) {
  const { closes } = reviewSeries(ticker, filedIso, chartEnd)
  if (closes.length < 2) return null
  return Math.round((closes[closes.length - 1] / closes[0] - 1) * 100)
}
