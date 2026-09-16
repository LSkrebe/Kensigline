import { useLayoutEffect, useMemo, useRef, useState, useEffect } from 'react'

const COMPACT_CHART_MQ = '(max-width: 960px)'

function useCompactChartLayout() {
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(COMPACT_CHART_MQ).matches,
  )

  useEffect(() => {
    const mq = window.matchMedia(COMPACT_CHART_MQ)
    const onChange = () => setCompact(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return compact
}

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

export const PRICE_RANGE_OPTS = ['1M', '3M', '6M', '1Y', 'YTD']
const PRICE_RANGE_DAYS = { '1M': 30, '3M': 90, '6M': 180, '1Y': 365, YTD: null }
const OVERLAY_QUARTERS_BY_RANGE = { '1M': 1, '3M': 1, '6M': 2, '1Y': 4, YTD: 4 }

/** Human labels for range chips / dossier aside (e.g. Net P&L subtitle). */
export const PRICE_RANGE_LABELS = {
  '1M': '1 Month',
  '3M': '3 Months',
  '6M': '6 Months',
  '1Y': '1 Year',
  YTD: 'Year to date',
}

export function priceRangeLabel(range) {
  return PRICE_RANGE_LABELS[range] ?? String(range ?? '')
}

/** Calendar-day count for series slicing (YTD = days since Jan 1). */
export function priceRangeDayCount(range, ref = new Date()) {
  if (range === 'YTD') {
    const start = new Date(ref.getFullYear(), 0, 1)
    start.setHours(0, 0, 0, 0)
    const end = new Date(ref)
    end.setHours(0, 0, 0, 0)
    return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
  }
  const days = PRICE_RANGE_DAYS[range]
  return typeof days === 'number' ? days : null
}

export function slicePriceSeriesByRange(series, range, seriesDays = null) {
  const arr = Array.isArray(series) ? series : []
  if (!arr.length) return arr

  const daysList = Array.isArray(seriesDays) && seriesDays.length === arr.length ? seriesDays : null
  if (daysList) {
    const start = priceRangeWindowStart(range)
    if (!start) return arr
    const y = start.getFullYear()
    const m = String(start.getMonth() + 1).padStart(2, '0')
    const d = String(start.getDate()).padStart(2, '0')
    const startIso = `${y}-${m}-${d}`
    let i = 0
    while (i < daysList.length && String(daysList[i]).slice(0, 10) < startIso) i += 1
    return i > 0 ? arr.slice(i) : arr
  }

  const days = priceRangeDayCount(range)
  if (!days || arr.length <= days) return arr
  return arr.slice(-days)
}

/** Start of calendar window for chart range (local midnight, inclusive). */
export function priceRangeWindowStart(range, ref = new Date()) {
  if (range === 'YTD') {
    const start = new Date(ref.getFullYear(), 0, 1)
    start.setHours(0, 0, 0, 0)
    return start
  }
  const days = PRICE_RANGE_DAYS[range]
  if (days == null) return null
  const start = new Date(ref)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - days)
  return start
}

function parseSeriesDay(iso, ref = new Date()) {
  if (iso == null || iso === '') return null
  const d = iso instanceof Date ? new Date(iso.getTime()) : new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  d.setHours(0, 0, 0, 0)
  return d
}

/** Earliest/latest calendar days covered by a price series. */
export function getPriceSeriesDateBounds(series, seriesDays = null, ref = new Date()) {
  const arr = Array.isArray(series) ? series : []
  const days =
    Array.isArray(seriesDays) && seriesDays.length === arr.length ? seriesDays : null

  if (days?.length) {
    const start = parseSeriesDay(days[0], ref)
    const end = parseSeriesDay(days[days.length - 1], ref)
    if (start && end) return { start, end }
  }

  if (!arr.length) return { start: null, end: null }

  const end = new Date(ref)
  end.setHours(0, 0, 0, 0)
  if (arr.length === 1) return { start: end, end }

  const start = new Date(end)
  start.setDate(start.getDate() - (arr.length - 1))
  return { start, end }
}

/** Ranges we can fully cover: oldest bar on/before the window start. */
export function availablePriceRangesForStart(dataStart, ref = new Date()) {
  if (!dataStart) return []
  const matched = PRICE_RANGE_OPTS.filter((range) => {
    const windowStart = priceRangeWindowStart(range, ref)
    if (!windowStart) return true
    return dataStart.getTime() <= windowStart.getTime()
  })
  return matched.length ? matched : ['1M']
}

/** Preset ranges supported by a price series (or trade timestamps). */
export function availablePriceRanges(series, seriesDays = null, ref = new Date()) {
  const { start } = getPriceSeriesDateBounds(series, seriesDays, ref)
  return availablePriceRangesForStart(start, ref)
}

export function availablePriceRangesFromTimestamps(timestamps, ref = new Date()) {
  const times = (Array.isArray(timestamps) ? timestamps : [])
    .map((ts) => new Date(ts).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
  if (!times.length) return []
  const start = new Date(times[0])
  start.setHours(0, 0, 0, 0)
  return availablePriceRangesForStart(start, ref)
}

export function coercePriceRangeFromOptions(range, allowed) {
  const opts = Array.isArray(allowed) ? allowed.filter(Boolean) : []
  if (!opts.length) return range
  if (opts.includes(range)) return range
  return opts[opts.length - 1]
}

export function coercePriceRange(range, series, seriesDays = null, ref = new Date()) {
  return coercePriceRangeFromOptions(range, availablePriceRanges(series, seriesDays, ref))
}

/** First→last $ / % change over the same window the chart uses. */
export function priceChangeForRange(series, range, seriesDays = null) {
  const rows = slicePriceSeriesByRange(series, range, seriesDays)
  if (!Array.isArray(rows) || rows.length < 2) return null
  const first = Number(rows[0])
  const last = Number(rows.at(-1))
  if (!Number.isFinite(first) || !Number.isFinite(last) || first === 0) return null
  const delta = last - first
  return { delta, pct: (delta / Math.abs(first)) * 100, last }
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

function formatHoverDate(d) {
  if (!d || Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function MiniPriceChart({
  series,
  seriesDays = null,
  label,
  showMeta = true,
  trimLeadingPlateau = false,
  showRangeSelector = false,
  chartRange: chartRangeProp,
  onChartRangeChange,
  chartAlign = 'default',
  rangeHeaderLabel = null,
  rangeHeaderHint = null,
  layoutSize = null,
  insiderMarkers = [],
  politicianMarkers = [],
  quarterlyRevenueOverlay = null,
  hideAxisLabels = false,
  flushEdges = false,
  plotInset = 0,
  showHoverTooltip = false,
  lineOnly = false,
  loading = false,
}) {
  void insiderMarkers
  void politicianMarkers

  const wrapRef = useRef(null)
  const [size, setSize] = useState(() =>
    layoutSize?.w && layoutSize?.h ? { w: layoutSize.w, h: layoutSize.h } : null,
  )
  const [internalRange, setInternalRange] = useState('6M')
  const [hoverIdx, setHoverIdx] = useState(null)
  const [hoverPos, setHoverPos] = useState(null)
  const priceRange = chartRangeProp ?? internalRange
  const setPriceRange = onChartRangeChange ?? setInternalRange
  const compactChart = useCompactChartLayout()
  const hoverEnabled = showHoverTooltip

  const rangeOptions = useMemo(
    () => availablePriceRanges(series, seriesDays),
    [series, seriesDays],
  )

  useEffect(() => {
    if (!rangeOptions.length) return
    const next = coercePriceRangeFromOptions(priceRange, rangeOptions)
    if (next !== priceRange) setPriceRange(next)
  }, [rangeOptions, priceRange, setPriceRange])

  useLayoutEffect(() => {
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
      setSize((prev) => (prev?.w !== w || prev?.h !== h ? { w, h } : prev))
    }
    measure()
    let frame = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    })
    ro.observe(wrap)
    return () => { ro.disconnect(); cancelAnimationFrame(frame) }
  }, [layoutSize?.w, layoutSize?.h])

  const w = size?.w ?? 0
  const h = size?.h ?? 0

  const sliced = useMemo(() => {
    let base = Array.isArray(series) ? series : []
    let days = Array.isArray(seriesDays) && seriesDays.length === base.length ? seriesDays : null
    if (chartRangeProp != null || showRangeSelector) {
      if (days) {
        const start = priceRangeWindowStart(priceRange)
        if (start) {
          const y = start.getFullYear()
          const m = String(start.getMonth() + 1).padStart(2, '0')
          const d = String(start.getDate()).padStart(2, '0')
          const startIso = `${y}-${m}-${d}`
          let i = 0
          while (i < days.length && String(days[i]).slice(0, 10) < startIso) i += 1
          if (i > 0) {
            base = base.slice(i)
            days = days.slice(i)
          }
        }
      } else {
        base = slicePriceSeriesByRange(base, priceRange)
      }
    }
    if (!trimLeadingPlateau || base.length < 8) return { vals: base, days }
    const t = trimLeadingFlatSeries(base)
    if (t.length < 2 || t.length === base.length) return { vals: base, days }
    const trimCount = base.length - t.length
    return { vals: t, days: days ? days.slice(trimCount) : null }
  }, [series, seriesDays, trimLeadingPlateau, showRangeSelector, chartRangeProp, priceRange])

  const vals = sliced.vals
  const slicedDays = sliced.days
  const min = vals.length ? Math.min(...vals) : 0
  const max = vals.length ? Math.max(...vals) : 1
  const span = max - min || 1

  const yTicks = useMemo(() => priceTicks(min, max, 4), [min, max])
  const yTickGap = 5
  const yTickTexts = useMemo(() => yTicks.map((v) => formatPriceTick(v)), [yTicks])
  const yAxisMarginOpts =
    chartAlign === 'context' ? { gap: yTickGap, min: 32, max: 56 } : { gap: yTickGap, min: 22, max: 44 }
  const edgePad = flushEdges ? Math.max(0, plotInset) : 0
  const marginL = useMemo(
    () =>
      flushEdges
        ? edgePad
        : hideAxisLabels
          ? 0
          : chartYAxisMargin(yTickTexts, yAxisMarginOpts),
    [flushEdges, edgePad, hideAxisLabels, yTickTexts, chartAlign],
  )
  const marginSides = flushEdges
    ? { r: edgePad, t: edgePad, b: edgePad }
    : chartAlign === 'context'
      ? { r: 0, t: 14, b: 22 }
      : { r: 6, t: 8, b: 18 }
  const margin = { l: marginL, ...marginSides }
  const plotTop = margin.t
  const axisY = h - margin.b
  const innerW = Math.max(1, w - margin.l - margin.r)
  const innerH = Math.max(1, axisY - plotTop)
  const yTickLabelX = margin.l - yTickGap

  const dates = useMemo(() => {
    const n = Math.max(0, vals.length)
    if (!n) return []
    if (Array.isArray(slicedDays) && slicedDays.length === n) {
      return slicedDays.map((day) => {
        const raw = String(day ?? '').slice(0, 10)
        const d = new Date(`${raw}T12:00:00`)
        return Number.isNaN(d.getTime()) ? null : d
      })
    }
    const now = new Date()
    const out = []
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      out.push(d)
    }
    return out
  }, [vals.length, slicedDays])

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

  const last = vals.length ? vals.at(-1) : null
  const first = vals.length > 1 ? vals[0] : null
  const ch = last != null && first != null ? last - first : null
  const chPct = last != null && first ? ((last - first) / Math.max(1e-6, Math.abs(first))) * 100 : null
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

  const activeIdx =
    hoverIdx != null && hoverIdx >= 0 && hoverIdx < vals.length ? hoverIdx : null

  function updateHoverFromClient(clientX, clientY) {
    if (!hoverEnabled || !vals.length || !wrapRef.current) return
    const rect = wrapRef.current.getBoundingClientRect()
    if (!rect.width) return
    const fracX = (clientX - rect.left) / rect.width
    const relX = fracX * w
    const idx = Math.round((relX / Math.max(1, w)) * (vals.length - 1))
    const clamped = Math.max(0, Math.min(vals.length - 1, idx))
    setHoverIdx(clamped)
    setHoverPos({
      x: clientX - rect.left,
      y: clientY - rect.top,
    })
  }

  function clearHover() {
    setHoverIdx(null)
    setHoverPos(null)
  }

  return (
    <div
      className={['researchMiniPrice', showMeta ? '' : 'researchMiniPrice--chartOnly'].filter(Boolean).join(' ')}
      aria-label="Price chart"
    >
      {showRangeSelector && rangeOptions.length ? (
        <div
          className={[
            'researchPriceRangeBar',
            rangeHeaderLabel ? 'researchPriceRangeBar--labeled' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {rangeHeaderLabel ? (
            <div className="researchPriceRangeHeader">
              <div className="researchPriceRangeLabel contextCompanyTicker">{rangeHeaderLabel}</div>
              {rangeHeaderHint ? (
                <div className="researchPriceRangeHint mono dim">{rangeHeaderHint}</div>
              ) : null}
            </div>
          ) : null}
          <div className="researchPriceRange" role="group" aria-label="Chart range">
            {rangeOptions.map((r) => (
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
      <div
        ref={wrapRef}
        className={[
          'researchMiniPriceWrap',
          flushEdges ? 'researchMiniPriceWrap--flush' : '',
          hoverEnabled ? 'researchMiniPriceWrap--interactive' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        role="img"
        aria-label="Mini price sparkline"
        onPointerMove={hoverEnabled ? (e) => updateHoverFromClient(e.clientX, e.clientY) : undefined}
        onPointerLeave={hoverEnabled ? clearHover : undefined}
      >
        {!vals.length ? (
          <div className="graphEmpty mono dim" role="status">
            {loading ? 'Loading price…' : 'No price data.'}
          </div>
        ) : !size ? null : (
          <svg
            className="graphSvg"
            viewBox={`0 0 ${w} ${h}`}
            preserveAspectRatio={flushEdges ? 'none' : 'xMidYMid meet'}
            overflow={hoverEnabled ? 'visible' : undefined}
            role="img"
          >
            {!lineOnly ? (
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_AREA_GRAD_TOP} stopOpacity="1" />
                  <stop offset="100%" stopColor={CHART_AREA_GRAD_BOTTOM} stopOpacity="1" />
                </linearGradient>
              </defs>
            ) : null}
            {!lineOnly && areaPath ? <path className="graphArea" d={areaPath} fill={`url(#${gradId})`} /> : null}
            {!hideAxisLabels ? (
              <path
                className="graphAxis"
                style={GRAPH_SVG_AXIS}
                d={`M ${margin.l} ${plotTop} L ${margin.l} ${axisY} L ${w - margin.r} ${axisY}`}
              />
            ) : null}

            {!hideAxisLabels
              ? yTicks.map((v, i) => {
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
                })
              : null}

            {!hideAxisLabels
              ? xTickIdx.map((idx, i) => {
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
                })
              : null}

            {quarterlyRevenueGeom ? (
              <path className="analyseQuarterlyRevenueStep" d={quarterlyRevenueGeom} vectorEffect="non-scaling-stroke" />
            ) : null}

            <path className="graphPath" style={GRAPH_SVG_PATH} d={path} vectorEffect="non-scaling-stroke" />

            {activeIdx != null && hoverEnabled ? (
              <g className="graphHoverMarker" aria-hidden="true">
                <line
                  className="graphHoverLine"
                  x1={xAt(activeIdx)}
                  x2={xAt(activeIdx)}
                  y1={plotTop}
                  y2={axisY}
                />
                <circle className="graphHoverDot" cx={xAt(activeIdx)} cy={yAt(vals[activeIdx])} r={3.5} />
              </g>
            ) : null}
          </svg>
        )}
        {activeIdx != null && hoverPos && hoverEnabled ? (
          <div
            className="researchMiniPriceTooltip mono"
            style={{
              left: Math.min(Math.max(8, hoverPos.x + 12), Math.max(8, w - 120)),
              top: Math.max(8, hoverPos.y - 36),
            }}
          >
            <span className="researchMiniPriceTooltipDate">{formatHoverDate(dates[activeIdx])}</span>
            <span className="researchMiniPriceTooltipPrice">
              ${Number(vals[activeIdx]).toFixed(2)}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  )
}
