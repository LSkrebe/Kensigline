import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useCollapseScroll } from './collapseScroll.js'
import {
  analyseMockModelForTicker,
  formatAnalyseGridValue,
} from './analyseMockData.js'
import { isLiveDataMode, isMockDataMode } from './dataMode.js'
import { AnalyseModelGrid } from './AnalyseModelGrid.jsx'
import { resolveDocumentOpenUrl } from './documentOpenUrl.js'
import {
  buildMockActorTrackRecord,
  filterTrackTradesByRange,
  formatReturnFraction,
} from './deepOutcomes.js'
import { DeepCompactChrome } from './DeepCompactChrome.jsx'
import { formatCountLabel } from './formatCountLabel.js'
import { PRICE_RANGE_OPTS, priceRangeLabel, availablePriceRangesFromTimestamps, coercePriceRangeFromOptions } from './MiniPriceChart.jsx'
import {
  normalizeResearchPaperSourceKey,
  RESEARCH_PAPER_SOURCE_CATALOG,
} from './researchPaperSources.js'
import './DeepReport.css'
import './ExplorePage.css'

const DEEP_COLLAPSE_RANGE_FALLBACK = 1
/** Scroll progress (0–1) at which expanded header / bg finishes fading. */
const DEEP_EXPANDED_FADE_END = 0.88
/** Strip bg_2 fades in from the start of collapse through 100% scroll. */
const DEEP_COMPACT_FADE_START = 0

function deepCollapseProgressVars(progress) {
  const p = Math.min(1, Math.max(0, progress))
  const expandedOpacity = p <= DEEP_EXPANDED_FADE_END ? 1 - p / DEEP_EXPANDED_FADE_END : 0
  const compactOpacity =
    p <= DEEP_COMPACT_FADE_START
      ? 0
      : (p - DEEP_COMPACT_FADE_START) / (1 - DEEP_COMPACT_FADE_START)
  return {
    '--deep-collapse': String(p),
    '--deep-expanded-opacity': String(expandedOpacity),
    '--deep-compact-opacity': String(compactOpacity),
  }
}

function DeepReportShell({
  scrollResetKey = 'deep',
  expandedHeader,
  compactLabel,
  compactPrice,
  compactPriceChange,
  compactPriceChangePct,
  chrome,
  children,
}) {
  const { pageRef, dockRef, spacerRef } = useCollapseScroll({
    progressVars: deepCollapseProgressVars,
    resetKey: scrollResetKey,
    rangeFallback: DEEP_COLLAPSE_RANGE_FALLBACK,
  })

  return (
    <article className="drpt" ref={pageRef}>
      <div className="drpt-stickWrap">
        <div ref={dockRef} className="drpt-dock">
          <div className="drpt-viewport">
            <div className="drpt-expandedBg" aria-hidden="true" />

            <div className="drpt-chromeBar">
              <div className="drpt-compactBg" aria-hidden="true" />
              <DeepCompactChrome
                backendUp={chrome?.backendUp}
                macroActive={chrome?.macroActive}
                onMacroClick={chrome?.onMacroClick}
                settingsActive={chrome?.settingsActive}
                onSettingsClick={chrome?.onSettingsClick}
                onBrandClick={chrome?.onBrandClick}
                onCloseClick={chrome?.onCloseClick}
                subjectLabel={compactLabel}
                price={compactPrice}
                priceChange={compactPriceChange}
                priceChangePct={compactPriceChangePct}
              />
            </div>

            <div className="drpt-expanded">{expandedHeader}</div>
          </div>
        </div>
        <div ref={spacerRef} className="drpt-collapseSpacer" aria-hidden="true" />
        <div className="drpt-paper drpt-scroll">{children}</div>
      </div>
    </article>
  )
}

const DEEP_COMPACT_MQ = '(max-width: 960px)'
const DEEP_LIST_INITIAL = 10
const DEEP_LIST_STEP = 10

function deepTxnCodeTone(code, ad) {
  const c = String(code ?? '').toUpperCase()
  const side = String(ad ?? '').toUpperCase()
  if (c === 'S' || c === 'F' || (c === 'D' && side === 'D') || c === 'E' || c === 'K' || c === 'U' || c === 'Z')
    return 'sell'
  if (c === 'P' || c === 'A' || c === 'M' || c === 'V' || (c === 'I' && side === 'A')) return 'buy'
  return 'neutral'
}

/** One-word txn badge for deep flow rows (tracked investors / trade log). */
const DEEP_TXN_CODE_WORDS = {
  P: 'BUY',
  S: 'SELL',
  A: 'AWARD',
  M: 'EXERCISE',
  F: 'TAX',
  G: 'GIFT',
  D: 'DISPOSE',
  V: 'VOLUNTARY',
  I: 'DISCRETION',
  C: 'CONVERT',
  E: 'EXPIRE',
  H: 'EXPIRE',
  J: 'OTHER',
  K: 'SWAP',
  L: 'BUY',
  O: 'EXERCISE',
  U: 'TENDER',
  W: 'HEIR',
  Z: 'TRUST',
  X: 'EXERCISE',
  INC: 'INCREASE',
  NEW: 'NEW',
  RED: 'REDUCE',
  BUY: 'BUY',
  SELL: 'SELL',
  PURCHASE: 'BUY',
  SALE: 'SELL',
  EXCHANGE: 'EXCHANGE',
}

function deepTxnCodeWord(code) {
  const raw = String(code ?? '').trim()
  if (!raw || raw === '—') return null
  const upper = raw.toUpperCase()
  if (DEEP_TXN_CODE_WORDS[upper]) return DEEP_TXN_CODE_WORDS[upper]
  // Multi-word activity strings (e.g. "Increased stake") → first token map or fallback.
  const first = upper.split(/[\s/_-]+/).filter(Boolean)[0] ?? upper
  if (first === 'INCREASED' || first === 'INCREASE') return 'INCREASE'
  if (first === 'REDUCED' || first === 'REDUCE') return 'REDUCE'
  if (first === 'NEW') return 'NEW'
  if (DEEP_TXN_CODE_WORDS[first]) return DEEP_TXN_CODE_WORDS[first]
  return first
}

/** Compact badge: letter / short codes (P, S, INC). */
function deepTxnCodeShort(code) {
  const raw = String(code ?? '').trim()
  if (!raw || raw === '—') return null
  const upper = raw.toUpperCase()
  if (/^[A-Z0-9]{1,3}$/.test(upper)) return upper

  const first = upper.split(/[\s/_-]+/).filter(Boolean)[0] ?? upper
  if (first === 'INCREASED' || first === 'INCREASE') return 'INC'
  if (first === 'REDUCED' || first === 'REDUCE') return 'RED'
  if (first === 'NEW') return 'NEW'
  if (first === 'BUY' || first === 'PURCHASE') return 'P'
  if (first === 'SELL' || first === 'SALE') return 'S'
  if (first === 'EXCHANGE') return 'E'
  if (first === 'AWARD') return 'A'
  if (first === 'EXERCISE') return 'M'
  if (first === 'GIFT') return 'G'
  if (first === 'TAX') return 'F'
  if (first === 'DISPOSE') return 'D'
  if (first === 'CONVERT') return 'C'
  if (first === 'EXPIRE') return 'E'
  if (first === 'SWAP') return 'K'
  if (first === 'TENDER') return 'U'
  if (first === 'HEIR') return 'W'
  if (first === 'TRUST') return 'Z'
  if (first === 'OTHER') return 'J'
  if (first === 'VOLUNTARY') return 'V'
  if (first === 'DISCRETION') return 'I'
  return first.slice(0, 3)
}

function useDeepCompactLayout() {
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(DEEP_COMPACT_MQ).matches,
  )

  useEffect(() => {
    const mq = window.matchMedia(DEEP_COMPACT_MQ)
    const onChange = () => setCompact(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return compact
}

const TRACKED_INVESTOR_SOURCE = {
  insider: 'F4',
  politician: 'PTR',
  institution: '13F',
}

function DeepDocTxnBadge({ code, tone = 'neutral' }) {
  const label = deepTxnCodeWord(code)
  if (!label) {
    return <span className="drpt-docTxn drpt-docTxn--empty">—</span>
  }
  return <span className={`drpt-docTxn drpt-docTxn--${tone}`}>{label}</span>
}

function deepAmountTone(txnTone, amount) {
  const tone = String(txnTone ?? '')
  if (tone === 'buy' || tone === 'instInc' || tone === 'instNew') return 'isUp'
  if (tone === 'sell' || tone === 'instRed') return 'isDown'
  const raw = String(amount ?? '').trim()
  if (raw.startsWith('+')) return 'isUp'
  if (raw.startsWith('-') || raw.startsWith('−')) return 'isDown'
  return 'isFlat'
}

function DeepFlowRow({
  code,
  title,
  txnCode,
  txnTone,
  amount,
  date,
  tightTrail = false,
  onClick = null,
  href = null,
  openLabel = null,
  hideTxn = false,
}) {
  const hasHref = Boolean(href)
  const hasClick = typeof onClick === 'function'
  const clickable = hasHref || hasClick
  const Tag = hasHref ? 'a' : hasClick ? 'button' : 'div'
  return (
    <Tag
      type={hasClick && !hasHref ? 'button' : undefined}
      href={hasHref ? href : undefined}
      target={hasHref ? '_blank' : undefined}
      rel={hasHref ? 'noopener noreferrer' : undefined}
      className={[
        'drpt-docRow',
        'drpt-docRow--flow',
        tightTrail ? 'drpt-docRow--flowTight' : '',
        hideTxn ? 'drpt-docRow--flowNoTxn' : '',
        clickable ? 'drpt-docRow--link' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={hasClick && !hasHref ? onClick : undefined}
      aria-label={clickable ? openLabel || (hasHref ? `Open document for ${title}` : `Open ${title} dossier`) : undefined}
    >
      <span className="drpt-docCode mono">{code}</span>
      <div className="drpt-docCopy">
        <span className="drpt-docKind">{title}</span>
      </div>
      {hideTxn ? null : <DeepDocTxnBadge code={txnCode} tone={txnTone} />}
      <span
        className={['drpt-docAmt', 'mono', deepAmountTone(txnTone, amount)].filter(Boolean).join(' ')}
      >
        {amount ?? '—'}
      </span>
      <time className="drpt-docDate mono">{date ?? '—'}</time>
    </Tag>
  )
}

function sliceTimelineEntries(entries, limit) {
  if (limit == null || limit <= 0) return entries
  const items = entries.filter((e) => e?.type !== 'sep')
  if (limit >= items.length) return entries
  return items.slice(0, limit)
}

function DeepShowMoreButton({ remaining, onClick }) {
  const step = Math.min(DEEP_LIST_STEP, remaining)
  return (
    <button
      type="button"
      className="drpt-showMore exploreDirShowMore"
      onClick={onClick}
      aria-label={`Show ${step} more`}
    >
      <span className="drpt-showMoreChip" aria-hidden="true">
        <span className="drpt-showMoreSign">+</span>
        <span className="drpt-showMoreLabel">{step}</span>
      </span>
    </button>
  )
}

function DeepDocPanel({ children }) {
  const compact = useDeepCompactLayout()
  const contentRef = useRef(null)
  const hTrackRef = useRef(null)
  const ignoreTrackRef = useRef(false)
  const ignoreContentRef = useRef(false)
  const measureRafRef = useRef(0)
  const syncHFromVRafRef = useRef(0)
  const [hScrollWidth, setHScrollWidth] = useState(0)
  const [showHScroll, setShowHScroll] = useState(false)

  const getScrollMetrics = useCallback(() => {
    const el = contentRef.current
    const track = hTrackRef.current
    if (!el) return null
    const maxV = Math.max(0, el.scrollHeight - el.clientHeight)
    const maxH = track ? Math.max(0, track.scrollWidth - track.clientWidth) : 0
    return { el, track, maxV, maxH }
  }, [])

  const syncHFromV = useCallback(() => {
    if (ignoreContentRef.current) return
    const m = getScrollMetrics()
    if (!m?.track || m.maxV <= 0 || m.maxH <= 0) return
    const nextLeft = Math.round((m.el.scrollTop / m.maxV) * m.maxH)
    if (Math.abs(m.track.scrollLeft - nextLeft) < 1) return
    ignoreTrackRef.current = true
    m.track.scrollLeft = nextLeft
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        ignoreTrackRef.current = false
      })
    })
  }, [getScrollMetrics])

  const syncVFromH = useCallback(() => {
    if (ignoreTrackRef.current) return
    const m = getScrollMetrics()
    if (!m?.track || m.maxV <= 0 || m.maxH <= 0) return
    const nextTop = Math.round((m.track.scrollLeft / m.maxH) * m.maxV)
    if (Math.abs(m.el.scrollTop - nextTop) < 1) return
    ignoreContentRef.current = true
    m.el.scrollTop = nextTop
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        ignoreContentRef.current = false
      })
    })
  }, [getScrollMetrics])

  const onContentScroll = useCallback(() => {
    if (syncHFromVRafRef.current) return
    syncHFromVRafRef.current = requestAnimationFrame(() => {
      syncHFromVRafRef.current = 0
      syncHFromV()
    })
  }, [syncHFromV])

  const measure = useCallback(() => {
    if (compact) {
      setShowHScroll(false)
      setHScrollWidth(0)
      return
    }
    const el = contentRef.current
    if (!el) return
    const maxScroll = el.scrollHeight - el.clientHeight
    const overflow = maxScroll > 1
    setShowHScroll(overflow)
    if (overflow) {
      const ratio = el.scrollHeight / el.clientHeight
      const nextWidth = Math.ceil(el.clientWidth * ratio)
      setHScrollWidth((prev) => (prev === nextWidth ? prev : nextWidth))
    } else {
      setHScrollWidth((prev) => (prev === 0 ? prev : 0))
    }
  }, [compact])

  const scheduleMeasure = useCallback(() => {
    if (measureRafRef.current) cancelAnimationFrame(measureRafRef.current)
    measureRafRef.current = requestAnimationFrame(() => {
      measureRafRef.current = 0
      measure()
    })
  }, [measure])

  useEffect(() => {
    scheduleMeasure()
    const el = contentRef.current
    if (!el) return undefined

    const ro = new ResizeObserver(scheduleMeasure)
    ro.observe(el)

    return () => {
      ro.disconnect()
      if (measureRafRef.current) cancelAnimationFrame(measureRafRef.current)
      if (syncHFromVRafRef.current) cancelAnimationFrame(syncHFromVRafRef.current)
    }
  }, [scheduleMeasure])

  useLayoutEffect(() => {
    if (!showHScroll || compact) return undefined
    syncHFromV()
    return undefined
  }, [showHScroll, hScrollWidth, compact, syncHFromV])

  return (
    <div className="drpt-docPanel">
      <div ref={contentRef} className="drpt-docPanelScroll" onScroll={onContentScroll}>
        {children}
      </div>
      {showHScroll && !compact ? (
        <div
          ref={hTrackRef}
          className="drpt-docPanelHScroll"
          onScroll={syncVFromH}
          aria-hidden="true"
        >
          <div className="drpt-docPanelHScrollInner" style={{ width: hScrollWidth }} />
        </div>
      ) : null}
    </div>
  )
}

function DeepExpandablePanel({ totalCount, children }) {
  const compact = useDeepCompactLayout()
  const [visibleCount, setVisibleCount] = useState(DEEP_LIST_INITIAL)

  useEffect(() => {
    setVisibleCount(DEEP_LIST_INITIAL)
  }, [totalCount])

  const limit = compact && totalCount > DEEP_LIST_INITIAL ? visibleCount : null
  const remaining = compact ? Math.max(0, totalCount - visibleCount) : 0
  const showMore = compact && remaining > 0

  return (
    <div
      className={['drpt-expandPanel', showMore ? 'drpt-expandPanel--truncated' : '']
        .filter(Boolean)
        .join(' ')}
    >
      {children(limit)}
      {showMore ? (
        <DeepShowMoreButton
          remaining={remaining}
          onClick={() => setVisibleCount((n) => Math.min(totalCount, n + DEEP_LIST_STEP))}
        />
      ) : null}
    </div>
  )
}

function formatChronoDate(at) {
  if (!at) return '—'
  const d = at instanceof Date ? at : new Date(at)
  if (Number.isNaN(d.getTime())) return '—'
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatFundamentalCell(value, format) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  const n = Number(value)
  if (format === 'pct') return `${n.toFixed(1)}%`
  if (format === 'valuationDiscount') {
    if (Math.abs(n) < 0.5) return 'In line'
    if (n > 0) return `${n.toFixed(0)}% discount`
    return `${Math.abs(n).toFixed(0)}% premium`
  }
  if (format === 'usd') {
    const abs = Math.abs(n)
    if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
    if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
    if (abs >= 1e3) return `$${(n / 1e3).toFixed(0)}K`
    return `$${n.toFixed(0)}`
  }
  if (format === 'shares') {
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
    return n.toLocaleString()
  }
  return String(n)
}

const DEEP_METRIC_SLOT_COUNT = 4

/** Each slot picks the first row that has data — always four boxes when fundamentals exist. */
const DEEP_METRIC_SLOTS = [
  [
    { key: 'valuationDiscountPct', label: 'Vs historic valuation', kind: 'single', format: 'valuationDiscount' },
    { key: 'revenueGrowth', label: 'Rev growth (YoY)', kind: 'sequence', format: 'pct' },
    { key: 'netCash', label: 'Net cash', kind: 'sequence', format: 'usd' },
  ],
  [{ key: 'grossMargin', label: 'Gross margin', kind: 'sequence', format: 'pct' }],
  [{ key: 'netMargin', label: 'Net margin', kind: 'sequence', format: 'pct' }],
  [
    { key: 'fcfMargin', label: 'FCF margin', kind: 'sequence', format: 'pct' },
    { key: 'netCash', label: 'Net cash', kind: 'sequence', format: 'usd' },
    { key: 'forwardRevenueGrowth', label: 'Forward rev growth', kind: 'single', format: 'pct' },
  ],
]

function buildDeepMetricCard(fundamentals, row) {
  if (row.kind === 'single') {
    if (fundamentals[row.key] == null) return null
    return {
      key: row.key,
      label: row.label,
      value: formatFundamentalCell(fundamentals[row.key], row.format),
      period: 'Forward',
    }
  }
  const { value, period } = latestSequenceValue(fundamentals, row.key)
  if (value == null) return null
  const label =
    row.key === 'netCash' && Number(value) < 0 ? 'Net debt' : row.label
  return {
    key: row.key,
    label,
    value: formatFundamentalCell(value, row.format),
    period: period ?? 'Latest',
  }
}

const DEEP_METRIC_EXTRA_ROWS = [
  { key: 'netCash', label: 'Net cash', kind: 'sequence', format: 'usd' },
  { key: 'revenueGrowth', label: 'Rev growth (YoY)', kind: 'sequence', format: 'pct' },
  { key: 'forwardRevenueGrowth', label: 'Forward rev growth', kind: 'single', format: 'pct' },
]

function buildDeepMetricCards(fundamentals) {
  const cards = []
  const usedKeys = new Set()

  for (const slot of DEEP_METRIC_SLOTS) {
    let card = null
    for (const row of slot) {
      if (usedKeys.has(row.key)) continue
      card = buildDeepMetricCard(fundamentals, row)
      if (card) break
    }
    if (card) {
      cards.push(card)
      usedKeys.add(card.key)
    }
  }

  if (cards.length < DEEP_METRIC_SLOT_COUNT) {
    for (const row of DEEP_METRIC_EXTRA_ROWS) {
      if (cards.length >= DEEP_METRIC_SLOT_COUNT) break
      if (usedKeys.has(row.key)) continue
      const card = buildDeepMetricCard(fundamentals, row)
      if (!card) continue
      cards.push(card)
      usedKeys.add(card.key)
    }
  }

  return cards.slice(0, DEEP_METRIC_SLOT_COUNT)
}

function lookupSourceCatalog(source) {
  const key = normalizeResearchPaperSourceKey(source)
  return RESEARCH_PAPER_SOURCE_CATALOG.find((entry) => entry.id === key) ?? null
}

function normalizeCardText(text) {
  return String(text ?? '')
    .replace(/\s·\s/g, ' - ')
    .replace(/·/g, '-')
    .trim()
}

function documentCardMeta(doc) {
  const source = String(doc?.source ?? 'Filing').trim()
  const catalog = lookupSourceCatalog(source)
  const title = normalizeCardText(doc?.title)
  const sourceNorm = normalizeCardText(source)
  const detail = title && title.toUpperCase() !== sourceNorm.toUpperCase() ? title : null
  return {
    source: catalog?.code ?? source,
    kind: catalog?.label ?? source,
    detail,
    flagged: Boolean(doc?.idea_best),
  }
}

function flowCardMeta(item) {
  const flowSource = item.source ?? 'Activity'
  const flowCatalog = lookupSourceCatalog(flowSource)
  const name = normalizeCardText(item.name ?? '—')
  const amount = normalizeCardText(item.amount ?? '')
  const detail = amount && amount !== '—' ? `${name} - ${amount}` : name
  return {
    source: flowCatalog?.code ?? normalizeCardText(flowSource),
    kind: flowCatalog?.label ?? normalizeCardText(flowSource),
    detail,
  }
}

function DeepSection({ label, title, children, headExtra = null }) {
  return (
    <section className="drpt-section">
      {label ? <p className="drpt-sectionLabel">{label}</p> : null}
      {title || headExtra ? (
        <div className="drpt-sectionHead">
          {title ? <h2 className="drpt-sectionTitle">{title}</h2> : null}
          {headExtra}
        </div>
      ) : null}
      {children}
    </section>
  )
}

function DeepModelExportButton({ ticker, companyName, model }) {
  const [busy, setBusy] = useState(false)

  const onExport = useCallback(async () => {
    if (!model || busy) return
    setBusy(true)
    try {
      const { exportAnalyseModelToExcel } = await import('./analyseExcelExport.js')
      await exportAnalyseModelToExcel({
        ticker,
        companyName,
        model,
      })
    } catch (err) {
      console.error('Financial model Excel export failed', err)
    } finally {
      setBusy(false)
    }
  }, [busy, companyName, model, ticker])

  return (
    <button
      type="button"
      className="drpt-exportBtn"
      disabled={busy || !model}
      aria-label="Export financial model to Excel"
      onClick={() => void onExport()}
    >
      {busy ? 'Exporting…' : 'Export to Excel'}
    </button>
  )
}

function DeepChartRange({ value, onChange, options = PRICE_RANGE_OPTS }) {
  if (!options.length) return null
  return (
    <div className="drpt-chartRange researchPriceRange" role="group" aria-label="Chart range">
      {options.map((r) => (
        <button
          key={r}
          type="button"
          className={['researchPriceRangeBtn', value === r ? 'isActive' : ''].filter(Boolean).join(' ')}
          onClick={() => onChange?.(r)}
          aria-pressed={value === r}
        >
          {r}
        </button>
      ))}
    </div>
  )
}

function DeepModelTable({ model, title, maxHistCols = null, fit = false }) {
  if (!model?.quarters?.length) return null
  const estFrom = model.estimateFromIndex ?? model.quarters.length
  const rows = model.historicalModel ?? []
  if (!rows.length) return null

  if (!fit) {
    return (
      <div className="analyseModelScroll scrollThin">
        <AnalyseModelGrid
          rows={rows}
          quarters={model.quarters}
          estimateFromIndex={estFrom}
          showEstimates
        />
      </div>
    )
  }

  let histStart = 0
  let histQs = model.quarters.slice(0, estFrom)
  if (maxHistCols && histQs.length > maxHistCols) {
    histStart = histQs.length - maxHistCols
    histQs = histQs.slice(histStart)
  }
  const estQs = model.quarters.slice(estFrom)

  return (
    <div className="drpt-tableWrap drpt-tableWrap--fit">
      {title ? <p className="drpt-tableHint">{title}</p> : null}
      <table
        className="drpt-table drpt-table--fit"
        style={{ '--drpt-cols': histQs.length + estQs.length }}
      >
        <thead>
          <tr>
            <th scope="col">Metric</th>
            {histQs.map((q) => (
              <th key={q} scope="col">
                {q}
              </th>
            ))}
            {estQs.map((q) => (
              <th key={q} scope="col">
                {q}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const histVals = row.values.slice(histStart, estFrom)
            const estVals = row.values.slice(estFrom)
            return (
              <tr key={row.label}>
                <td>{row.label}</td>
                {histVals.map((v, i) => (
                  <td key={`h-${i}`}>{formatAnalyseGridValue(v, row)}</td>
                ))}
                {estVals.map((v, i) => (
                  <td key={`e-${i}`} className="isEstimate">
                    {formatAnalyseGridValue(v, row)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function latestSequenceValue(fundamentals, key) {
  const arr = fundamentals?.[key]
  if (!Array.isArray(arr) || !arr.length) return { value: null, period: null }
  for (let i = arr.length - 1; i >= 0; i -= 1) {
    if (arr[i] != null && Number.isFinite(Number(arr[i]))) {
      const labels = fundamentals.periodLabels ?? []
      const period = labels[i] ?? (i === arr.length - 1 ? 'Latest' : null)
      return { value: arr[i], period }
    }
  }
  return { value: null, period: null }
}

function DeepFundamentalsSnapshot({ fundamentals, loading = false }) {
  if (loading && !fundamentals) {
    return <p className="drpt-empty drpt-loading">Loading key metrics…</p>
  }
  if (!fundamentals) {
    return <p className="drpt-empty">No key metrics yet.</p>
  }

  const cards = buildDeepMetricCards(fundamentals)

  if (!cards.length) {
    return loading ? (
      <p className="drpt-empty drpt-loading">Loading key metrics…</p>
    ) : (
      <p className="drpt-empty">No key metrics yet.</p>
    )
  }

  return (
    <div className="drpt-metricGrid">
      {cards.map((card) => (
        <div className="drpt-metricCard" key={card.key}>
          <span className="drpt-metricLabel">{card.label}</span>
          <span className="drpt-metricValue">{card.value}</span>
          {card.period ? <span className="drpt-metricPeriod">{card.period}</span> : null}
        </div>
      ))}
    </div>
  )
}

function countTimelineItems(entries = []) {
  return entries.filter((e) => e?.type !== 'sep').length
}

function DeepChronology({ entries = [], visibleLimit = null }) {
  const displayEntries = useMemo(() => {
    const items = entries.filter((e) => e?.type !== 'sep')
    return sliceTimelineEntries(items, visibleLimit)
  }, [entries, visibleLimit])

  if (!entries.length) {
    return <p className="drpt-empty">No filings yet.</p>
  }
  return (
    <ol className="drpt-docList">
      {displayEntries.map((entry) => {
        const item = entry.row?.item
        if (!item) return null

        if (item.kind === 'document') {
          const doc = item.document
          const meta = documentCardMeta(doc)
          const openUrl =
            resolveDocumentOpenUrl({
              url: doc?.url,
              ticker: null,
              kind: 'document',
              source: meta.source,
            }) || null
          const Tag = openUrl ? 'a' : 'div'
          return (
            <li className="drpt-docItem" key={item.id}>
              <Tag
                className={['drpt-docRow', openUrl ? 'drpt-docRow--link' : ''].filter(Boolean).join(' ')}
                {...(openUrl
                  ? { href: openUrl, target: '_blank', rel: 'noopener noreferrer' }
                  : {})}
              >
                <span className="drpt-docCode mono">{meta.source}</span>
                <div className="drpt-docCopy">
                  <span className="drpt-docKind">{meta.kind}</span>
                  {meta.detail ? <span className="drpt-docDetail mono">{meta.detail}</span> : null}
                </div>
                <time className="drpt-docDate mono">{formatChronoDate(doc?.filedAt)}</time>
              </Tag>
            </li>
          )
        }

        const meta = flowCardMeta(item)
        const openUrl =
          resolveDocumentOpenUrl({
            url: item.url,
            ticker: item.ticker,
            kind: item.kind,
            source: item.source,
            chamber: item.chamber,
          }) || null
        const Tag = openUrl ? 'a' : 'div'
        return (
          <li className="drpt-docItem" key={item.id}>
            <Tag
              className={openUrl ? 'drpt-docRow drpt-docRow--link' : 'drpt-docRow'}
              {...(openUrl ? { href: openUrl, target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              <span className="drpt-docCode mono">{meta.source}</span>
              <div className="drpt-docCopy">
                <span className="drpt-docKind">{meta.kind}</span>
                {meta.detail ? <span className="drpt-docDetail mono">{meta.detail}</span> : null}
              </div>
              <time className="drpt-docDate mono">{formatChronoDate(item.at)}</time>
            </Tag>
          </li>
        )
      })}
    </ol>
  )
}

function DeepInvestorList({ rows = [], visibleLimit = null, onInvestorClick = null, loading = false }) {
  const displayRows = useMemo(() => {
    if (!rows.length) return rows
    if (visibleLimit == null || visibleLimit >= rows.length) return rows
    return rows.slice(0, visibleLimit)
  }, [rows, visibleLimit])

  if (loading) {
    return <p className="drpt-empty drpt-loading">Loading tracked investors…</p>
  }
  if (!rows.length) {
    return <p className="drpt-empty">No tracked investor activity yet.</p>
  }

  return (
    <ol className="drpt-docList">
      {displayRows.map((row) => {
        const typeKey = String(row?.typeKey ?? row?.type ?? 'insider').toLowerCase()
        const normalizedKey =
          typeKey === 'politician' ? 'politician' : typeKey === 'institution' ? 'institution' : 'insider'
        const source = row.source ?? TRACKED_INVESTOR_SOURCE[normalizedKey] ?? '—'
        return (
          <li className="drpt-docItem" key={row.id ?? `${row.name}-${normalizedKey}`}>
            <DeepFlowRow
              code={source}
              title={row.name}
              txnCode={row.code}
              txnTone={
                row.codeTone ??
                (Number(row.totalUsd) < 0
                  ? 'sell'
                  : Number(row.totalUsd) > 0
                    ? 'buy'
                    : deepTxnCodeTone(row.code))
              }
              amount={row.amount}
              date={row.date}
              onClick={onInvestorClick ? () => onInvestorClick(row) : null}
            />
          </li>
        )
      })}
    </ol>
  )
}

function formatTrackHoverValue(v) {
  return formatReturnFraction(v)
}

/** Same fuller date style as company MiniPriceChart hover (e.g. 17 Jul 2026). */
function formatTrackHoverDate(point) {
  const raw = point?.ts ?? point?.dateLabel
  if (raw == null || raw === '') return '—'
  const d = raw instanceof Date ? raw : new Date(raw)
  if (Number.isNaN(d.getTime())) return String(point?.dateLabel ?? '—')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const OUTCOME_CHART_AREA_TOP = 'var(--intel-accent-area-top)'
const OUTCOME_CHART_AREA_BOTTOM = 'var(--intel-accent-area-bottom)'
const OUTCOME_GRAPH_PATH = { stroke: 'var(--intel-accent-stroke-strong)', strokeWidth: 2, fill: 'none' }

function DeepTrackRecordChart({ points = [] }) {
  const wrapRef = useRef(null)
  const gradId = useId()
  const compact = useDeepCompactLayout()
  const hoverEnabled = !compact
  const [size, setSize] = useState(null)
  const [hoverIdx, setHoverIdx] = useState(null)
  const [hoverPos, setHoverPos] = useState(null)

  const vals = useMemo(() => points.map((p) => p.cumulative), [points])

  useLayoutEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return undefined
    function measure() {
      const rect = wrap.getBoundingClientRect()
      const w = Math.max(160, rect.width)
      const h = Math.max(160, rect.height)
      setSize((prev) => (prev?.w !== w || prev?.h !== h ? { w, h } : prev))
    }
    measure()
    const ro = new ResizeObserver(() => requestAnimationFrame(measure))
    ro.observe(wrap)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  const w = size?.w ?? 0
  const h = size?.h ?? 0
  const n = Math.max(1, vals.length)
  const margin = { l: 0, r: 0, t: 6, b: 6 }
  const plotTop = margin.t
  const axisY = h - margin.b
  const innerW = Math.max(1, w - margin.l - margin.r)
  const innerH = Math.max(1, axisY - plotTop)

  const rawMin = vals.length ? Math.min(...vals, 0) : 0
  const rawMax = vals.length ? Math.max(...vals, 0) : 0.01
  let loP = Math.floor(rawMin * 100)
  let hiP = Math.ceil(rawMax * 100)
  if (hiP <= loP) hiP = loP + 1
  const min = loP / 100
  const max = hiP / 100
  const span = max - min || 1

  function xAt(i) {
    return margin.l + (i / Math.max(1, n - 1)) * innerW
  }
  function yAt(v) {
    return plotTop + (1 - (v - min) / span) * innerH
  }

  const { linePath, areaPath } = useMemo(() => {
    if (vals.length < 2) return { linePath: '', areaPath: '' }
    let d = ''
    for (let i = 0; i < vals.length; i++) {
      const x = xAt(i)
      const y = yAt(vals[i])
      d += `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)} `
    }
    const lastX = xAt(vals.length - 1)
    const firstX = xAt(0)
    const areaD = `${d.trim()} L ${lastX.toFixed(2)} ${axisY.toFixed(2)} L ${firstX.toFixed(2)} ${axisY.toFixed(2)} Z`
    return { linePath: d.trim(), areaPath: areaD }
  }, [vals, w, h, min, max, axisY])

  const activeIdx = hoverIdx != null && hoverIdx >= 0 && hoverIdx < points.length ? hoverIdx : null
  const activePoint = activeIdx != null ? points[activeIdx] : null

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

  if (vals.length < 2) return null

  return (
    <div
      className={[
        'researchMiniPriceWrap',
        'researchMiniPriceWrap--flush',
        hoverEnabled ? 'researchMiniPriceWrap--interactive' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      ref={wrapRef}
      role="img"
      aria-label="Cumulative realized track record"
      onPointerMove={hoverEnabled ? (e) => updateHoverFromClient(e.clientX, e.clientY) : undefined}
      onPointerLeave={hoverEnabled ? clearHover : undefined}
    >
      {size ? (
        <svg
          className="graphSvg"
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          overflow="visible"
          role="img"
        >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={OUTCOME_CHART_AREA_TOP} stopOpacity="1" />
            <stop offset="100%" stopColor={OUTCOME_CHART_AREA_BOTTOM} stopOpacity="1" />
          </linearGradient>
        </defs>
        {areaPath ? <path className="graphArea" d={areaPath} fill={`url(#${gradId})`} /> : null}
        {linePath ? (
          <path className="graphPath" style={OUTCOME_GRAPH_PATH} d={linePath} vectorEffect="non-scaling-stroke" />
        ) : null}
        {activeIdx != null && hoverEnabled ? (
          <g className="graphHoverMarker" aria-hidden="true">
            <line className="graphHoverLine" x1={xAt(activeIdx)} x2={xAt(activeIdx)} y1={plotTop} y2={axisY} />
            <circle className="graphHoverDot" cx={xAt(activeIdx)} cy={yAt(vals[activeIdx])} r={3.5} />
          </g>
        ) : null}
      </svg>
      ) : null}
      {activePoint && hoverPos && hoverEnabled ? (
        <div
          className="researchMiniPriceTooltip mono"
          style={{
            left: Math.min(Math.max(8, hoverPos.x + 12), Math.max(8, w - 120)),
            top: Math.max(8, hoverPos.y - 36),
          }}
        >
          <span className="researchMiniPriceTooltipDate">{formatTrackHoverDate(activePoint)}</span>
          <span className="researchMiniPriceTooltipPrice">
            {formatTrackHoverValue(activePoint.cumulative)}
          </span>
        </div>
      ) : null}
    </div>
  )
}

function DeepTrackRecordChartPanel({ trackRecord, loading = false }) {
  if (loading && !trackRecord?.points?.length) {
    return <p className="drpt-empty drpt-loading">Loading track record…</p>
  }
  if (!trackRecord?.points?.length) {
    return <p className="drpt-empty">No trades in scope for a track record yet.</p>
  }

  return (
    <div className="researchMiniPrice researchMiniPrice--chartOnly">
      <DeepTrackRecordChart points={trackRecord.points} />
    </div>
  )
}

function DeepActorMetrics({ trackRecord, chartRange = '6M', loading = false }) {
  const stats = trackRecord?.stats
  if (loading && !stats) {
    return <p className="drpt-empty drpt-loading">Loading key metrics…</p>
  }
  if (!stats) return <p className="drpt-empty">No trades in scope yet.</p>

  const rangeLabel = priceRangeLabel(chartRange) || 'Track record'

  const cards = [
    { key: 'win', label: 'Win rate', value: stats.winRate, period: 'Round trips' },
    { key: 'median', label: 'Median gain', value: stats.medianReturn, period: 'Per exit' },
    { key: 'trips', label: 'Round trips', value: stats.roundTrips ?? '—', period: 'Realized' },
    { key: 'cum', label: 'Net P&L', value: stats.cumulativeReturn, period: rangeLabel },
  ]

  return (
    <div className="drpt-metricGrid">
      {cards.map((card) => (
        <div className="drpt-metricCard" key={card.key}>
          <span className="drpt-metricLabel">{card.label}</span>
          <span className="drpt-metricValue">{card.value}</span>
          {card.period ? <span className="drpt-metricPeriod">{card.period}</span> : null}
        </div>
      ))}
    </div>
  )
}

function mockTradeDocumentUrl(row) {
  return resolveDocumentOpenUrl({
    url: row?.url ?? row?.documentUrl ?? row?.filingUrl ?? null,
    ticker: row?.ticker ?? null,
    kind: row?.layout === 'txnPolitician' ? 'politician' : row?.__source ?? 'insider',
    source: row?.__source ?? row?.codeTitle ?? null,
    chamber: row?.chamber ?? null,
    accession: row?.accession ?? row?.filingId ?? null,
    cik: row?.cik ?? null,
  })
}

function tradeRowMeta(row) {
  const tick = String(row?.ticker ?? '').trim().toUpperCase()
  const code = String(row?.code ?? '').trim().toUpperCase() || '—'
  const amount = row?.value ?? row?.v ?? null
  const date = row?.when ?? '—'

  if (row?.layout === 'txnCompany') {
    const company = String(row?.companyName ?? '').trim()
    return {
      ticker: tick || '—',
      title: company || tick || 'Trade',
      code,
      codeTone: row.codeTone ?? deepTxnCodeTone(code, row.acquiredDisposed),
      amount,
      date,
    }
  }

  const who = String(row?.who ?? row?.k ?? '').trim()
  return {
    ticker: tick || '—',
    title: tick || who || 'Trade',
    code,
    codeTone: row.codeTone ?? deepTxnCodeTone(code, row.acquiredDisposed),
    amount,
    date,
  }
}

function DeepTradeLog({ rows = [], visibleLimit = null, loading = false }) {
  const items = useMemo(
    () =>
      rows.filter(
        (r) => r?.type !== 'meta' && r?.layout !== 'two' && (r?.type === 'trade' || r?.layout?.startsWith('txn')),
      ),
    [rows],
  )
  const displayRows = useMemo(() => {
    if (visibleLimit == null || visibleLimit >= items.length) return items
    return items.slice(0, visibleLimit)
  }, [items, visibleLimit])

  if (loading && !items.length) {
    return <p className="drpt-empty drpt-loading">Loading trades…</p>
  }
  if (!items.length) {
    return <p className="drpt-empty">No trades in the selected window.</p>
  }

  return (
    <ol className="drpt-docList">
      {displayRows.map((row, i) => {
        const meta = tradeRowMeta(row)
        const href = mockTradeDocumentUrl(row)
        return (
          <li className="drpt-docItem" key={`${row.ts ?? i}-${meta.ticker}-${meta.date}`}>
            <DeepFlowRow
              code={meta.ticker}
              title={meta.title}
              txnCode={meta.code}
              txnTone={meta.codeTone}
              amount={meta.amount}
              date={meta.date}
              href={href}
              openLabel={`Open filing for ${meta.ticker !== '—' ? meta.ticker : meta.title}`}
            />
          </li>
        )
      })}
    </ol>
  )
}

function DeepTradedCompaniesList({
  companies = [],
  visibleLimit = null,
  onCompanyClick = null,
  loading = false,
}) {
  const displayRows = useMemo(() => {
    if (!companies.length) return companies
    if (visibleLimit == null || visibleLimit >= companies.length) return companies
    return companies.slice(0, visibleLimit)
  }, [companies, visibleLimit])

  if (loading && !companies.length) {
    return <p className="drpt-empty drpt-loading">Loading companies…</p>
  }
  if (!companies.length) {
    return <p className="drpt-empty">No traded companies in scope yet.</p>
  }

  return (
    <ol className="drpt-docList">
      {displayRows.map((co) => {
        const ticker = String(co.ticker ?? '').trim().toUpperCase()
        const canOpen = Boolean(onCompanyClick && ticker)
        return (
          <li className="drpt-docItem" key={ticker}>
            <DeepFlowRow
              code={ticker}
              title={co.name || ticker}
              amount={formatCountLabel(co.tradeCount, 'trade')}
              date={co.lastDate || '—'}
              tightTrail
              hideTxn
              onClick={canOpen ? () => onCompanyClick({ ticker, name: co.name }) : null}
              openLabel={canOpen ? `Open ${ticker} dossier` : null}
            />
          </li>
        )
      })}
    </ol>
  )
}

function ActorTopBar({
  name,
  detail,
  detailSecondary = '',
  modeLabel,
  tradeCount,
  companyCount,
  rangeReturnPct = null,
  chartRange = null,
  winRate = null,
  medianReturn = null,
  loading = false,
}) {
  const pct =
    rangeReturnPct != null && Number.isFinite(Number(rangeReturnPct)) ? Number(rangeReturnPct) * 100 : null
  const up = pct != null ? pct >= 0 : true
  const showReturn = pct != null && !loading
  const hasMedian = medianReturn && medianReturn !== '—'
  const hasWin = winRate && winRate !== '—'
  const rangeLabel = chartRange ? priceRangeLabel(chartRange) : null

  let secondary = null
  if (hasMedian && hasWin) {
    secondary = `${medianReturn} med (${winRate} win)`
  } else if (hasWin && rangeLabel) {
    secondary = `${winRate} win · ${rangeLabel}`
  } else if (hasMedian && rangeLabel) {
    secondary = `${medianReturn} med · ${rangeLabel}`
  } else if (hasWin) {
    secondary = `${winRate} win`
  } else if (rangeLabel) {
    secondary = rangeLabel
  }

  const metaBits = [
    detail || null,
    detailSecondary || null,
    !loading || tradeCount > 0 ? formatCountLabel(tradeCount, 'transaction') : null,
    !loading || companyCount > 0 ? formatCountLabel(companyCount, 'company', 'companies') : null,
  ].filter(Boolean)

  return (
    <header className={['drpt-topbar', 'drpt-topbar--investor', metaBits.length ? '' : 'drpt-topbar--noMeta'].filter(Boolean).join(' ')}>
      <div className="drpt-topbarIdentity">
        <p className="drpt-kicker">Investor dossier</p>
        <div className="drpt-topbarTitleRow">
          <h1 className="drpt-topbarTicker">{name}</h1>
          <span className="drpt-topbarName">{modeLabel}</span>
        </div>
      </div>
      {metaBits.length ? (
        <div className="drpt-topbarMeta">
          {metaBits.map((bit) => (
            <span key={bit}>{bit}</span>
          ))}
        </div>
      ) : null}
      {showReturn ? (
        <div className="drpt-topbarPrice drpt-topbarAside">
          {secondary ? (
            <span className={['drpt-priceChange', up ? 'isUp' : 'isDown'].join(' ')}>{secondary}</span>
          ) : null}
          <span className="drpt-price">{formatReturnFraction(rangeReturnPct)}</span>
        </div>
      ) : null}
    </header>
  )
}

function CompanyTopBar({
  ticker,
  displayName,
  sector,
  domicile,
  mcap,
  earnings,
  price,
  priceChange,
  priceChangePct,
}) {
  const ch = priceChange != null && Number.isFinite(Number(priceChange)) ? Number(priceChange) : null
  const chPct =
    priceChangePct != null && Number.isFinite(Number(priceChangePct)) ? Number(priceChangePct) : null
  const up = ch != null ? ch >= 0 : true
  const showPrice = price != null && Number.isFinite(Number(price))
  const metaBits = [
    domicile || null,
    mcap || null,
    sector || null,
    earnings?.label ? `Earnings ${earnings.label}` : null,
  ]
    .map((bit) => (bit == null ? '' : String(bit).trim()))
    .filter((bit) => bit && bit !== '—' && bit !== '-' && bit !== '–' && bit !== '--')

  const tickerLabel = String(ticker ?? '').trim().toUpperCase()
  const nameLabel = String(displayName ?? '').trim()
  const showName = nameLabel && nameLabel.toUpperCase() !== tickerLabel

  return (
    <header className={['drpt-topbar', 'drpt-topbar--company', metaBits.length ? '' : 'drpt-topbar--noMeta'].filter(Boolean).join(' ')}>
      <div className="drpt-topbarIdentity">
        <p className="drpt-kicker">Company dossier</p>
        <div className="drpt-topbarTitleRow">
          <h1 className="drpt-topbarTicker">{ticker || '—'}</h1>
          {showName ? <span className="drpt-topbarName">{displayName}</span> : null}
        </div>
      </div>
      {metaBits.length ? (
        <div className="drpt-topbarMeta">
          {metaBits.map((bit) => (
            <span key={bit}>{bit}</span>
          ))}
        </div>
      ) : null}
      {showPrice ? (
        <div className="drpt-topbarPrice drpt-topbarAside">
          {ch != null && chPct != null ? (
            <span className={['drpt-priceChange', up ? 'isUp' : 'isDown'].join(' ')}>
              {up ? '+' : ''}
              {ch.toFixed(2)} ({up ? '+' : ''}
              {chPct.toFixed(2)}%)
            </span>
          ) : null}
          <span className="drpt-price">${Number(price).toFixed(2)}</span>
        </div>
      ) : null}
    </header>
  )
}

export function DeepCompanyReport({
  ticker,
  companyName,
  sector,
  domicile,
  mcap,
  price,
  priceChange,
  priceChangePct,
  earnings,
  timelineEntries = [],
  timelineLoading = false,
  trackedInvestors = [],
  trackedInvestorsLoading = false,
  fundamentals,
  fundamentalsLoading = false,
  model,
  modelLoading,
  backendUp,
  chartSlot,
  chartLoading = false,
  chartRange = '6M',
  chartRangeOptions = PRICE_RANGE_OPTS,
  onChartRangeChange,
  chrome,
  onInvestorClick = null,
  scrollResetKey = null,
}) {
  const t = String(ticker ?? '').trim().toUpperCase()
  const displayName = String(companyName ?? '').trim() || t || 'Company'
  const resolvedModel = useMemo(() => {
    if (isLiveDataMode(backendUp)) return model ?? null
    if (isMockDataMode(backendUp)) return analyseMockModelForTicker(t)
    return null
  }, [backendUp, model, t])

  const eventCount = countTimelineItems(timelineEntries)

  return (
    <DeepReportShell
      scrollResetKey={scrollResetKey ?? t}
      compactLabel={t}
      compactPrice={price}
      compactPriceChange={priceChange}
      compactPriceChangePct={priceChangePct}
      chrome={chrome}
      expandedHeader={
        <CompanyTopBar
          ticker={t}
          displayName={displayName}
          sector={sector}
          domicile={domicile}
          mcap={mcap}
          earnings={earnings}
          price={price}
          priceChange={priceChange}
          priceChangePct={priceChangePct}
        />
      }
    >
        <div className="drpt-row drpt-row--market">
          <DeepSection
            label="Market"
            title="Price & earnings"
            headExtra={
              onChartRangeChange ? (
                <DeepChartRange value={chartRange} onChange={onChartRangeChange} options={chartRangeOptions} />
              ) : null
            }
          >
            {chartSlot ? (
              <div className="drpt-figure drpt-figure--chart">{chartSlot}</div>
            ) : chartLoading ? (
              <div className="drpt-figure drpt-figure--chart drpt-figure--empty">
                <p className="drpt-empty drpt-loading">Loading price…</p>
              </div>
            ) : (
              <div className="drpt-figure drpt-figure--chart drpt-figure--empty">
                <p className="drpt-empty">No price series yet.</p>
              </div>
            )}
          </DeepSection>

          <DeepSection label="Fundamentals" title="Key metrics">
            <DeepFundamentalsSnapshot fundamentals={fundamentals} loading={fundamentalsLoading} />
          </DeepSection>
        </div>

        <DeepSection
          label="Forecast"
          title="Financial model"
          headExtra={
            resolvedModel ? (
              <DeepModelExportButton ticker={t} companyName={displayName} model={resolvedModel} />
            ) : null
          }
        >
          {resolvedModel ? (
            <DeepModelTable model={resolvedModel} />
          ) : modelLoading ? (
            <p className="drpt-empty drpt-loading">Loading financial model…</p>
          ) : (
            <p className="drpt-empty">No financial model yet.</p>
          )}
        </DeepSection>

        <div className="drpt-row drpt-row--archive">
          <DeepSection
            label="Flow"
            title="Tracked investors & filers"
            headExtra={
              <span className="drpt-sectionCount">
                {trackedInvestorsLoading
                  ? 'Loading…'
                  : formatCountLabel(trackedInvestors.length, 'investor')}
              </span>
            }
          >
            <DeepDocPanel>
              <DeepExpandablePanel totalCount={trackedInvestorsLoading ? 0 : trackedInvestors.length}>
                {(limit) => (
                  <DeepInvestorList
                    rows={trackedInvestors}
                    visibleLimit={limit}
                    loading={trackedInvestorsLoading}
                    onInvestorClick={onInvestorClick}
                  />
                )}
              </DeepExpandablePanel>
            </DeepDocPanel>
          </DeepSection>

          <DeepSection
            label="Archive"
            title="Documents"
            headExtra={
              <span className="drpt-sectionCount">
                {timelineLoading ? 'Loading…' : formatCountLabel(eventCount, 'filing')}
              </span>
            }
          >
            <DeepDocPanel>
              <DeepExpandablePanel totalCount={timelineLoading ? 0 : eventCount}>
                {(limit) =>
                  timelineLoading ? (
                    <p className="drpt-empty drpt-loading">Loading filings…</p>
                  ) : (
                    <DeepChronology entries={timelineEntries} visibleLimit={limit} />
                  )
                }
              </DeepExpandablePanel>
            </DeepDocPanel>
          </DeepSection>
        </div>
    </DeepReportShell>
  )
}

export function DeepActorReport({
  actorRow,
  personDisplay,
  mode = 'insider',
  caseRows = [],
  caseRowsLoading = false,
  chrome,
  compactPrice = null,
  compactPriceChange = null,
  compactPriceChangePct = null,
  onCompanyClick = null,
  scrollResetKey = null,
}) {
  const [chartRange, setChartRange] = useState('6M')
  const name = String(personDisplay?.fullName ?? actorRow?.actorName ?? '').trim()
  const detail = String(personDisplay?.detail ?? actorRow?.actorDetail ?? '').trim()
  const detailSecondary = String(
    personDisplay?.detailSecondary ?? actorRow?.actorDetailSecondary ?? '',
  ).trim()
  const modeLabel =
    mode === 'politicians' ? 'Politician' : mode === 'institutions' ? 'Institution' : 'Insider'

  const tradeRows = useMemo(
    () =>
      caseRows.filter(
        (r) =>
          r?.type !== 'meta' &&
          r?.layout !== 'two' &&
          (r?.type === 'trade' || r?.layout?.startsWith('txn')),
      ),
    [caseRows],
  )

  const chartRangeOptions = useMemo(
    () => availablePriceRangesFromTimestamps(tradeRows.map((row) => row?.ts).filter(Boolean)),
    [tradeRows],
  )

  useEffect(() => {
    setChartRange((prev) => coercePriceRangeFromOptions(prev, chartRangeOptions))
  }, [chartRangeOptions])

  const sectionsLoading = Boolean(caseRowsLoading)
  // While hunting, hide thin stub trades — same as company dossier waiting on explore.
  const showSectionLoading = sectionsLoading

  const rangedTradeRows = useMemo(
    () => (showSectionLoading ? [] : filterTrackTradesByRange(tradeRows, chartRange)),
    [tradeRows, chartRange, showSectionLoading],
  )

  const trackRecord = useMemo(
    () => (showSectionLoading ? null : buildMockActorTrackRecord(rangedTradeRows, name)),
    [rangedTradeRows, name, showSectionLoading],
  )

  const rangeReturnRaw = trackRecord?.stats?.cumulativeReturnRaw
  const rangeReturnPct =
    rangeReturnRaw != null && Number.isFinite(Number(rangeReturnRaw)) ? Number(rangeReturnRaw) : null
  const compactReturnPct =
    compactPriceChangePct != null && Number.isFinite(Number(compactPriceChangePct))
      ? Number(compactPriceChangePct)
      : rangeReturnPct != null
        ? rangeReturnPct * 100
        : null

  const companies = useMemo(() => {
    if (showSectionLoading) return []
    const map = new Map()
    for (const r of tradeRows) {
      const tick = String(r.ticker ?? '').trim().toUpperCase()
      if (!tick) continue
      const companyName = String(r.companyName ?? '').trim()
      const when = String(r.when ?? '').trim()
      const prev = map.get(tick)
      if (!prev) {
        map.set(tick, {
          ticker: tick,
          name: companyName || tick,
          tradeCount: 1,
          lastDate: when || null,
        })
        continue
      }
      prev.tradeCount += 1
      if (companyName) prev.name = companyName
      if (when) prev.lastDate = when
    }
    return [...map.values()].sort((a, b) => b.tradeCount - a.tradeCount || a.ticker.localeCompare(b.ticker))
  }, [tradeRows, showSectionLoading])

  if (!name) {
    return (
      <article className="drpt">
        <div className="drpt-paper drpt-scroll">
          <p className="drpt-empty">
            Select an investor in Investigate to open their dossier here.
          </p>
        </div>
      </article>
    )
  }

  const actorCompactLabel = name

  return (
    <DeepReportShell
      scrollResetKey={scrollResetKey ?? name}
      compactLabel={actorCompactLabel}
      compactPrice={compactPrice}
      compactPriceChange={compactPriceChange}
      compactPriceChangePct={compactReturnPct}
      chrome={chrome}
      expandedHeader={
        <ActorTopBar
          name={name}
          detail={detail}
          detailSecondary={detailSecondary}
          modeLabel={modeLabel}
          tradeCount={tradeRows.length}
          companyCount={companies.length}
          rangeReturnPct={rangeReturnPct}
          chartRange={chartRange}
          winRate={trackRecord?.stats?.winRate ?? null}
          medianReturn={trackRecord?.stats?.medianReturn ?? null}
          loading={showSectionLoading}
        />
      }
    >
        <div className="drpt-row drpt-row--market">
          <DeepSection
            label="Track record"
            title="Trading history"
            headExtra={<DeepChartRange value={chartRange} onChange={setChartRange} options={chartRangeOptions} />}
          >
            <div className="drpt-figure drpt-figure--chart">
              <DeepTrackRecordChartPanel
                trackRecord={trackRecord}
                loading={showSectionLoading}
              />
            </div>
          </DeepSection>

          <DeepSection label="Fundamentals" title="Key metrics">
            <DeepActorMetrics
              trackRecord={trackRecord}
              chartRange={chartRange}
              loading={showSectionLoading}
            />
          </DeepSection>
        </div>

        <div className="drpt-row drpt-row--archive">
          <DeepSection
            label="Archive"
            title="Trade log"
            headExtra={
              <span className="drpt-sectionCount">
                {showSectionLoading
                  ? 'Loading…'
                  : formatCountLabel(tradeRows.length, 'trade')}
              </span>
            }
          >
            <DeepDocPanel>
              <DeepExpandablePanel totalCount={showSectionLoading ? 0 : tradeRows.length}>
                {(limit) => (
                  <DeepTradeLog
                    rows={caseRows}
                    visibleLimit={limit}
                    loading={showSectionLoading}
                  />
                )}
              </DeepExpandablePanel>
            </DeepDocPanel>
          </DeepSection>

          <DeepSection
            label="Issuers"
            title="Company archive"
            headExtra={
              <span className="drpt-sectionCount">
                {showSectionLoading
                  ? 'Loading…'
                  : formatCountLabel(companies.length, 'company', 'companies')}
              </span>
            }
          >
            <DeepDocPanel>
              <DeepExpandablePanel totalCount={showSectionLoading ? 0 : companies.length}>
                {(limit) => (
                  <DeepTradedCompaniesList
                    companies={companies}
                    visibleLimit={limit}
                    onCompanyClick={onCompanyClick}
                    loading={showSectionLoading}
                  />
                )}
              </DeepExpandablePanel>
            </DeepDocPanel>
          </DeepSection>
        </div>
    </DeepReportShell>
  )
}

export function DeepPage({ mode, company, investor, actor, chrome, scrollResetKey = null }) {
  const investorProps = investor ?? actor
  return mode === 'investor' || mode === 'actor' ? (
    <DeepActorReport {...investorProps} chrome={chrome} scrollResetKey={scrollResetKey} />
  ) : (
    <DeepCompanyReport {...company} chrome={chrome} scrollResetKey={scrollResetKey} />
  )
}
