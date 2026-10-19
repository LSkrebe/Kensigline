const W = 960
const CHART_H = 200
const AXIS_X = 1
const AXIS_Y = CHART_H - 1
const PAD_TOP = 10
const PAD_RIGHT = 8

export function formatSignedPct(fraction) {
  const pct = Number(fraction) * 100
  if (!Number.isFinite(pct)) return null
  const digits = Math.abs(pct) >= 10 ? 0 : 1
  const text = Math.abs(pct).toFixed(digits)
  if (pct > 0) return `+${text}%`
  if (pct < 0) return `-${text}%`
  return '0%'
}

function buildGeometry(points) {
  const plotW = W - AXIS_X - PAD_RIGHT
  const plotH = AXIS_Y - PAD_TOP
  const values = points.flatMap((point) => [point.investors, point.spy])
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1

  const at = (value, index) => ({
    x: AXIS_X + (index / Math.max(points.length - 1, 1)) * plotW,
    y: PAD_TOP + (1 - (value - min) / span) * plotH,
  })

  const lineFor = (key) =>
    points
      .map((point, index) => {
        const spot = at(point[key], index)
        return `${index === 0 ? 'M' : 'L'}${spot.x.toFixed(2)} ${spot.y.toFixed(2)}`
      })
      .join(' ')

  const investorLine = lineFor('investors')
  const last = at(points[points.length - 1].investors, points.length - 1)
  const area = `${investorLine} L ${last.x.toFixed(2)} ${AXIS_Y} L ${AXIS_X} ${AXIS_Y} Z`

  return { investorLine, marketLine: lineFor('spy'), area }
}

export function IntroStoryLegend({ investorGain, marketGain }) {
  return (
    <div className="lpStoryLegend">
      <p className="lpStoryLegendItem">
        <span className="lpStoryLegendMark" aria-hidden="true" />
        <span className="lpStoryLegendName">Investors</span>
        <span className="lpStoryLegendValue lpStoryLegendValue--investors">{investorGain}</span>
      </p>
      <p className="lpStoryLegendItem">
        <span className="lpStoryLegendMark lpStoryLegendMark--market" aria-hidden="true" />
        <span className="lpStoryLegendName">S&amp;P</span>
        <span className="lpStoryLegendValue">{marketGain}</span>
      </p>
    </div>
  )
}

/** Two closes over the same month: leading investors in green, the S&P in gray. */
export function IntroStoryDiagram({ points }) {
  const series = Array.isArray(points) ? points.filter((point) => Number.isFinite(point?.investors) && Number.isFinite(point?.spy)) : []
  const geometry = series.length >= 2 ? buildGeometry(series) : null
  const last = series[series.length - 1]
  const investorGain = formatSignedPct(last?.investors)
  const marketGain = formatSignedPct(last?.spy)

  if (!geometry || !investorGain || !marketGain) {
    return <p className="lpStoryCaption">The month's closes load with the leaderboard.</p>
  }

  return (
    <div
      className="lpStoryDiagram"
      role="img"
      aria-label={`Investors ${investorGain} this past month. The S&P ${marketGain} over the same days.`}
    >
      <div className="lpStoryStage">
        <div className="lpStoryChartWrap">
          <svg className="lpStoryChartSvg" viewBox={`0 0 ${W} ${CHART_H}`} preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="lpStoryChartArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(125, 206, 160, 0.2)" />
                <stop offset="100%" stopColor="rgba(125, 206, 160, 0)" />
              </linearGradient>
            </defs>
            <path d={geometry.area} className="lpStoryChartArea" fill="url(#lpStoryChartArea)" />
            <line className="lpStoryAxis" x1={AXIS_X} y1={PAD_TOP} x2={AXIS_X} y2={AXIS_Y} />
            <line className="lpStoryAxis" x1={AXIS_X} y1={AXIS_Y} x2={W - PAD_RIGHT} y2={AXIS_Y} />
            <path d={geometry.marketLine} className="lpStoryChartLine lpStoryChartLine--market" />
            <path d={geometry.investorLine} className="lpStoryChartLine" />
          </svg>
        </div>
      </div>
    </div>
  )
}
