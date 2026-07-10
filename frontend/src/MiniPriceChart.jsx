import { useEffect, useMemo, useRef, useState } from 'react'

const EMPTY = '-'
const CHART_AREA_GRAD_TOP = 'var(--intel-accent-area-top)'
const CHART_AREA_GRAD_BOTTOM = 'var(--intel-accent-area-bottom)'
const GRAPH_SVG_FONT =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
const GRAPH_SVG_TICK = {
  fill: 'rgba(255, 255, 255, 0.38)',
  fontSize: 11,
  fontFamily: GRAPH_SVG_FONT,
}
const GRAPH_SVG_TICK_LINE = { stroke: 'rgba(255, 255, 255, 0.16)', strokeWidth: 1, fill: 'none' }
const GRAPH_SVG_AXIS = { stroke: 'rgba(255, 255, 255, 0.16)', strokeWidth: 0.85, fill: 'none' }
const GRAPH_SVG_PATH = { stroke: 'var(--intel-accent-stroke-strong)', strokeWidth: 2, fill: 'none' }
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const PRICE_RANGE_OPTS = ['1M', '3M', '6M', '1Y', 'ALL']
const PRICE_RANGE_DAYS = { '1M': 30, '3M': 90, '6M': 180, '1Y': 365, ALL: null }
const OVERLAY_QUARTERS_BY_RANGE = { '1M': 1, '3M': 1, '6M': 2, '1Y': 4, ALL: 8 }

export function slicePriceSeriesByRange(series, range) {
  const arr = Array.isArray(series) ? series : []
  const days = PRICE_RANGE_DAYS[range]
  if (!days || arr.length <= days) return arr
  return arr.slice(-days)
}

function trimLeadingFlatSeries(arr, { minRemain = 32, maxTrimFraction = 0.9 } = {}) {
  if (!Array.isArray(arr) || arr.length < minRemain + 2) return arr
  const n = arr.length
  for (let k = 0; k < n; k++) if (!Number.isFinite(arr[k])) return arr
  const lo = Math.min(...arr)
  const hi = Math.max(...arr)
  const span = hi - lo || 1
  const tol = Math.max(span * 1e-10, 1e-12)
  let i = 0
  while (i < n - 1 && Math.abs(arr[i + 1] - arr[0]) <= tol) i++
  if (i <= 0) return arr
  if (i / n > maxTrimFraction) return arr
  const sliced = arr.slice(i)
  return sliced.length >= minRemain ? sliced : arr
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x))
}

function priceTicks(min, max, n = 4) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return []
  if (min === max) return [min]
  const out = []
  for (let i = 0; i < n; i++) out.push(min + (i / (n - 1)) * (max - min))
  return out
}

function formatPriceTick(v) {
  const x = Number(v)
  if (!Number.isFinite(x)) return EMPTY
  const abs = Math.abs(x)
  if (abs >= 1000) return String(Math.round(x))
  if (abs >= 100) return String(Math.round(x))
  if (abs >= 10) {
    const r = Math.round(x * 10) / 10
    return Number.isInteger(r) ? String(r) : r.toFixed(1)
  }
  if (abs >= 1) return x.toFixed(2)
  return x.toFixed(2)
}

function estimateChartTickLabelWidth(labels, fontSize = 11) {
  const texts = (Array.isArray(labels) ? labels : []).map((s) => String(s ?? ''))
  if (!texts.length) return 0
  if (typeof document !== 'undefined') {
    try {
      const ctx = document.createElement('canvas').getContext('2d')
      if (ctx) {
        ctx.font = `${fontSize}px ${GRAPH_SVG_FONT}`
        return Math.max(...texts.map((t) => ctx.measureText(t).width))
      }
    } catch {
      /* canvas unavailable */
    }
  }
  const maxLen = Math.max(...texts.map((t) => t.length))
  return Math.ceil(maxLen * fontSize * 0.62 + Math.max(0, maxLen - 1) * fontSize * 0.05)
}

function chartYAxisMargin(labels, { gap = 5, fontSize = 11, min = 24, max = 48 } = {}) {
  const textW = estimateChartTickLabelWidth(labels, fontSize)
  return Math.min(max, Math.max(min, textW + gap))
}

export function MiniPriceChart({
  series,
  label,
  showMeta = true,
  trimLeadingPlateau = false,
  showRangeSelector = false,
  chartRange: chartRangeProp,
  onChartRangeChange,
  chartAlign = 'default',
  rangeHeaderLabel = null,
  layoutSize = null,
  insiderMarkers = [],
  politicianMarkers = [],
  quarterlyRevenueOverlay = null,
}) {
  void insiderMarkers
  void politicianMarkers

  const wrapRef = useRef(null)
  const [size, setSize] = useState(() => ({
    w: layoutSize?.w ?? 360,
    h: layoutSize?.h ?? 192,
  }))
  const [internalRange, setInternalRange] = useState('6M')
  const priceRange = chartRangeProp ?? internalRange
  const setPriceRange = onChartRangeChange ?? setInternalRange

  useEffect(() => {
    if (layoutSize?.w && layoutSize?.h) {
      setSize({ w: layoutSize.w, h: layoutSize.h })
      return
    }
    const wrap = wrapRef.current
    if (!wrap) return
    function measure() {
      const rect = wrap.getBoundingClientRect()
      const w = Math.max(240, rect.width)
      const h = Math.max(64, rect.height)
      setSize((prev) => (prev.w !== w || prev.h !== h ? { w, h } : prev))
    }
    const ro = new ResizeObserver(() => requestAnimationFrame(measure))
    ro.observe(wrap)
    measure()
    return () => ro.disconnect()
  }, [layoutSize?.w, layoutSize?.h])

  const w = size.w
  const h = size.h

  const vals = useMemo(() => {
    let base = Array.isArray(series) ? series : []
    if (chartRangeProp != null || showRangeSelector) base = slicePriceSeriesByRange(base, priceRange)
    if (!trimLeadingPlateau || base.length < 8) return base
    const t = trimLeadingFlatSeries(base)
    return t.length >= 2 ? t : base
  }, [series, trimLeadingPlateau, showRangeSelector, chartRangeProp, priceRange])

  const min = vals.length ? Math.min(...vals) : 0
  const max = vals.length ? Math.max(...vals) : 1
  const span = max - min || 1

  const yTicks = useMemo(() => priceTicks(min, max, 4), [min, max])
  const yTickGap = 5
  const yTickTexts = useMemo(() => yTicks.map((v) => formatPriceTick(v)), [yTicks])
  const yAxisMarginOpts =
    chartAlign === 'context' ? { gap: yTickGap, min: 32, max: 56 } : { gap: yTickGap, min: 22, max: 44 }
  const marginL = useMemo(() => chartYAxisMargin(yTickTexts, yAxisMarginOpts), [yTickTexts, chartAlign])
  const marginSides =
    chartAlign === 'context' ? { r: 0, t: 14, b: 22 } : { r: 6, t: 8, b: 18 }
  const margin = { l: marginL, ...marginSides }
  const plotTop = margin.t
  const axisY = h - margin.b
  const innerW = Math.max(1, w - margin.l - margin.r)
  const innerH = Math.max(1, axisY - plotTop)
  const yTickLabelX = margin.l - yTickGap

  const dates = useMemo(() => {
    const n = Math.max(0, vals.length)
    if (!n) return []
    const now = new Date()
    const out = []
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      out.push(d)
    }
    return out
  }, [vals.length])

  function xAt(i) {
    return margin.l + (i / Math.max(1, vals.length - 1)) * innerW
  }
  function yAt(v) {
    return plotTop + (1 - (v - min) / span) * innerH
  }

  const path = useMemo(() => {
    if (!vals.length) return ''
    let d = ''
    for (let i = 0; i < vals.length; i++) {
      const x = xAt(i)
      const y = yAt(vals[i])
      d += `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)} `
    }
    return d.trim()
  }, [vals, min, span, innerW, innerH, plotTop, margin.l])

  const areaPath = useMemo(() => {
    if (!vals.length) return ''
    const yBase = axisY
    let d = `M ${xAt(0).toFixed(2)} ${yBase.toFixed(2)} `
    for (let i = 0; i < vals.length; i++) {
      const x = xAt(i)
      const y = yAt(vals[i])
      d += `L ${x.toFixed(2)} ${y.toFixed(2)} `
    }
    d += `L ${xAt(vals.length - 1).toFixed(2)} ${yBase.toFixed(2)} Z`
    return d.trim()
  }, [vals, axisY, innerW, innerH, plotTop, margin.l, min, span])

  const gradId = useMemo(() => {
    const s = String(label ?? 'PRICE')
    let h0 = 2166136261
    for (let i = 0; i < s.length; i++) h0 = Math.imul(h0 ^ s.charCodeAt(i), 16777619)
    return `miniFill-${(h0 >>> 0).toString(16)}`
  }, [label])

  const xTickIdx = useMemo(() => {
    const n = Math.max(0, vals.length)
    if (n <= 1) return []
    return [0.08, 0.32, 0.56, 0.8].map((p) => Math.round(clamp01(p) * (n - 1)))
  }, [vals.length])

  const last = Array.isArray(series) && series.length ? series.at(-1) : null
  const prev = Array.isArray(series) && series.length > 1 ? series.at(-2) : null
  const ch = last != null && prev != null ? last - prev : null
  const chPct = last != null && prev ? ((last - prev) / Math.max(1e-6, prev)) * 100 : null
  const up = ch != null ? ch >= 0 : true

  const quarterlyRevenueGeom = useMemo(() => {
    const values = quarterlyRevenueOverlay?.values
    if (!Array.isArray(values) || values.length < 1) return null
    const n = vals.length
    if (n < 2) return null

    const take = OVERLAY_QUARTERS_BY_RANGE[priceRange] ?? values.length
    const numeric = values
      .slice(-Math.min(take, values.length))
      .map((v) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null))
      .filter((v) => v != null)
    if (!numeric.length) return null

    const minG = Math.min(...numeric)
    const maxG = Math.max(...numeric)
    const spanG = maxG - minG || 1
    const bandTop = plotTop + innerH * 0.06
    const bandH = innerH * 0.44

    function yForGrowth(g) {
      return bandTop + bandH * (1 - (g - minG) / spanG)
    }

    const count = numeric.length
    const steps = []
    for (let i = 0; i < count; i++) {
      const xIdx = count <= 1 ? 0 : Math.round((i / Math.max(1, count - 1)) * (n - 1))
      steps.push({ x: xAt(xIdx), y: yForGrowth(numeric[i]) })
    }

    let stepPath = ''
    if (steps.length >= 2) {
      stepPath = `M ${steps[0].x.toFixed(2)} ${steps[0].y.toFixed(2)}`
      for (let i = 1; i < steps.length; i++) {
        stepPath += ` H ${steps[i].x.toFixed(2)} V ${steps[i].y.toFixed(2)}`
      }
    } else {
      stepPath = `M ${xAt(0).toFixed(2)} ${steps[0].y.toFixed(2)} H ${xAt(n - 1).toFixed(2)}`
    }

    return stepPath || null
  }, [quarterlyRevenueOverlay, vals.length, priceRange, innerH, plotTop, margin.l, innerW, min, span])

  return (
    <div
      className={['researchMiniPrice', showMeta ? '' : 'researchMiniPrice--chartOnly'].filter(Boolean).join(' ')}
      aria-label="Price chart"
    >
      {showRangeSelector ? (
        <div
          className={[
            'researchPriceRangeBar',
            rangeHeaderLabel ? 'researchPriceRangeBar--labeled' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {rangeHeaderLabel ? (
            <div className="researchPriceRangeLabel contextCompanyTicker">{rangeHeaderLabel}</div>
          ) : null}
          <div className="researchPriceRange" role="group" aria-label="Chart range">
            {PRICE_RANGE_OPTS.map((r) => (
              <button
                key={r}
                type="button"
                className={['researchPriceRangeBtn', priceRange === r ? 'isActive' : ''].filter(Boolean).join(' ')}
                onClick={() => setPriceRange(r)}
                aria-pressed={priceRange === r}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {showMeta ? (
        <div className="researchMiniPriceMeta">
          <div className="mono dim">{label ?? 'PRICE'}</div>
          <div className="mono">{last != null ? `$${Number(last).toFixed(2)}` : '—'}</div>
          <div className={['mono', 'researchMiniDelta', up ? 'isUp' : 'isDown'].filter(Boolean).join(' ')}>
            {ch != null && chPct != null ? `${up ? '+' : ''}${ch.toFixed(2)} (${up ? '+' : ''}${chPct.toFixed(2)}%)` : '—'}
          </div>
        </div>
      ) : null}
      <div ref={wrapRef} className="researchMiniPriceWrap" role="img" aria-label="Mini price sparkline">
        {!vals.length ? (
          <div className="graphEmpty mono dim" role="status">
            No price data.
          </div>
        ) : (
          <svg className="graphSvg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" role="img">
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_AREA_GRAD_TOP} stopOpacity="1" />
                <stop offset="100%" stopColor={CHART_AREA_GRAD_BOTTOM} stopOpacity="1" />
              </linearGradient>
            </defs>
            {areaPath ? <path className="graphArea" d={areaPath} fill={`url(#${gradId})`} /> : null}
            <path
              className="graphAxis"
              style={GRAPH_SVG_AXIS}
              d={`M ${margin.l} ${plotTop} L ${margin.l} ${axisY} L ${w - margin.r} ${axisY}`}
            />

            {yTicks.map((v, i) => {
              const y = yAt(v)
              const nT = yTicks.length
              const onFloor = nT === 1 ? false : i === 0
              const onCeil = nT === 1 ? false : i === nT - 1
              const ty = onFloor ? axisY : y
              const baseline = onFloor ? 'alphabetic' : onCeil ? 'hanging' : 'middle'
              const tyAdj = onCeil ? plotTop + 2 : onFloor ? axisY - 1 : ty
              return (
                <g key={`yt-${i}`}>
                  <text
                    className="graphTick graphTick--y"
                    style={GRAPH_SVG_TICK}
                    textAnchor="end"
                    dominantBaseline={baseline}
                    x={yTickLabelX}
                    y={tyAdj}
                  >
                    {yTickTexts[i]}
                  </text>
                  <path
                    className="graphTickLine"
                    style={GRAPH_SVG_TICK_LINE}
                    d={`M ${margin.l} ${y} L ${margin.l + (chartAlign === 'context' ? 4 : 6)} ${y}`}
                  />
                </g>
              )
            })}

            {xTickIdx.map((idx, i) => {
              const x = xAt(idx)
              const d = dates[idx]
              const m = d instanceof Date && !Number.isNaN(d.getTime()) ? MONTHS_SHORT[d.getMonth()] : EMPTY
              return (
                <g key={`xt-${i}`}>
                  <text className="graphTick graphTick--x" style={GRAPH_SVG_TICK} x={x} y={h - 4}>
                    {m}
                  </text>
                </g>
              )
            })}

            {quarterlyRevenueGeom ? (
              <path className="analyseQuarterlyRevenueStep" d={quarterlyRevenueGeom} vectorEffect="non-scaling-stroke" />
            ) : null}

            <path className="graphPath" style={GRAPH_SVG_PATH} d={path} vectorEffect="non-scaling-stroke" />
          </svg>
        )}
      </div>
    </div>
  )
}
