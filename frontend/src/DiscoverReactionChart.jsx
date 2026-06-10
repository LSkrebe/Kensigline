import { useEffect, useMemo, useRef, useState } from 'react'
import { mockReactionSeries } from './discoverMockData.js'

export { mockReactionSeries } from './discoverMockData.js'

const CHART_AREA_GRAD_TOP = 'var(--intel-accent-area-top)'
const CHART_AREA_GRAD_BOTTOM = 'var(--intel-accent-area-bottom)'

export function DiscoverReactionChart({ ticker, movePct, closes, height = 72, allowMockSeries = false }) {
  const wrapRef = useRef(null)
  const [width, setWidth] = useState(280)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return undefined
    const ro = new ResizeObserver(() => {
      const w = Math.max(120, el.getBoundingClientRect().width)
      setWidth((prev) => (prev !== w ? w : prev))
    })
    ro.observe(el)
    setWidth(Math.max(120, el.getBoundingClientRect().width))
    return () => ro.disconnect()
  }, [])

  const vals = useMemo(() => {
    const raw = Array.isArray(closes) ? closes.map((v) => Number(v)).filter(Number.isFinite) : []
    if (raw.length >= 2) {
      const base = raw[0]
      if (!Number.isFinite(base) || base <= 0) return raw
      return raw.map((v) => (v / base) * 100)
    }
    if (allowMockSeries) return mockReactionSeries(ticker, movePct)
    return []
  }, [ticker, movePct, closes, allowMockSeries])
  const w = width
  const h = height
  const margin = { l: 0, r: 4, t: 6, b: 14 }
  const innerW = Math.max(1, w - margin.l - margin.r)
  const innerH = Math.max(1, h - margin.t - margin.b)
  const min = vals.length ? Math.min(...vals) : 0
  const max = vals.length ? Math.max(...vals) : 1
  const span = max - min || 1

  const xAt = (i) => margin.l + (i / Math.max(1, vals.length - 1)) * innerW
  const yAt = (v) => margin.t + (1 - (v - min) / span) * innerH

  const path = useMemo(() => {
    if (!vals.length) return ''
    let d = ''
    for (let i = 0; i < vals.length; i++) {
      const x = xAt(i)
      const y = yAt(vals[i])
      d += `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)} `
    }
    return d.trim()
  }, [vals, w, h])

  const areaPath = useMemo(() => {
    if (!vals.length) return ''
    const yBase = h - margin.b
    let d = `M ${xAt(0).toFixed(2)} ${yBase.toFixed(2)} `
    for (let i = 0; i < vals.length; i++) {
      d += `L ${xAt(i).toFixed(2)} ${yAt(vals[i]).toFixed(2)} `
    }
    d += `L ${xAt(vals.length - 1).toFixed(2)} ${yBase.toFixed(2)} Z`
    return d.trim()
  }, [vals, w, h])

  const gradId = useMemo(() => {
    const s = String(ticker ?? 'PRICE')
    let hash = 2166136261
    for (let i = 0; i < s.length; i++) hash = Math.imul(hash ^ s.charCodeAt(i), 16777619)
    return `discoverFill-${(hash >>> 0).toString(16)}`
  }, [ticker])

  const eventX = vals.length ? xAt(vals.length - 1) : margin.l
  const eventY = vals.length ? yAt(vals.at(-1)) : margin.t

  return (
    <div ref={wrapRef} className="discoverMoveChart researchMiniPriceWrap" style={{ height }} aria-hidden="true">
      {!vals.length ? null : (
        <svg className="graphSvg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_AREA_GRAD_TOP} stopOpacity="1" />
              <stop offset="100%" stopColor={CHART_AREA_GRAD_BOTTOM} stopOpacity="1" />
            </linearGradient>
          </defs>
          {areaPath ? <path className="graphArea" d={areaPath} fill={`url(#${gradId})`} /> : null}
          <path
            className="graphAxis"
            d={`M ${margin.l} ${margin.t} L ${margin.l} ${h - margin.b} L ${w - margin.r} ${h - margin.b}`}
            stroke="rgba(255, 255, 255, 0.14)"
            strokeWidth="0.85"
            fill="none"
          />
          <path
            className="graphPath"
            d={path}
            stroke="var(--intel-accent-stroke-strong)"
            strokeWidth="1.75"
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
          <circle
            className="discoverMoveChartMarker"
            cx={eventX}
            cy={eventY}
            r="2.5"
            fill="rgba(255, 255, 255, 0.88)"
            stroke="rgba(255, 255, 255, 0.35)"
            strokeWidth="0.75"
          />
        </svg>
      )}
    </div>
  )
}
