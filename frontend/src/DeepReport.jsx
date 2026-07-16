import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  analyseMockModelForTicker,
  formatAnalyseGridValue,
} from './analyseMockData.js'
import { AnalyseModelGrid } from './AnalyseModelGrid.jsx'
import {
  buildMockActorTrackRecord,
  formatReturnFraction,
} from './deepOutcomes.js'
import { DeepCompactChrome } from './DeepCompactChrome.jsx'
import { formatCountLabel } from './formatCountLabel.js'
import { PRICE_RANGE_OPTS } from './MiniPriceChart.jsx'
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

function useDeepCollapseScroll() {
  const pageRef = useRef(null)
  const dockRef = useRef(null)
  const spacerRef = useRef(null)

  useEffect(() => {
    const page = pageRef.current
    const dock = dockRef.current
    const spacer = spacerRef.current
    if (!page || !dock) return undefined

    let raf = 0

    const syncCollapse = () => {
      raf = 0
      const range = spacer?.offsetHeight || DEEP_COLLAPSE_RANGE_FALLBACK
      const progress = Math.min(1, Math.max(0, page.scrollTop / range))
      for (const [key, value] of Object.entries(deepCollapseProgressVars(progress))) {
        dock.style.setProperty(key, value)
      }
    }

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(syncCollapse)
    }

    const onResize = () => {
      if (!raf) raf = requestAnimationFrame(syncCollapse)
    }

    page.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    syncCollapse()

    return () => {
      page.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return { pageRef, dockRef, spacerRef }
}

function DeepReportShell({
  expandedHeader,
  compactLabel,
  compactPrice,
  compactPriceChange,
  compactPriceChangePct,
  chrome,
  children,
}) {
  const { pageRef, dockRef, spacerRef } = useDeepCollapseScroll()

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
  const compact = useDeepCompactLayout()
  const label = compact ? deepTxnCodeShort(code) : deepTxnCodeWord(code)
  if (!label) {
    return <span className="drpt-docTxn drpt-docTxn--empty">—</span>
  }
  return <span className={`drpt-docTxn drpt-docTxn--${tone}`}>{label}</span>
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
      <span className="drpt-docCode">{code}</span>
      <span className="drpt-docMain">
        <span className="drpt-docKind">{title}</span>
      </span>
      {hideTxn ? null : <DeepDocTxnBadge code={txnCode} tone={txnTone} />}
      <span className="drpt-docAmt">{amount ?? '—'}</span>
      <time className="drpt-docDate">{date ?? '—'}</time>
    </Tag>
  )
}

function sliceTimelineEntries(entries, limit) {
  if (limit == null || limit <= 0) return entries
  if (limit >= countTimelineItems(entries)) return entries

  const out = []
  let itemCount = 0
  let pendingSep = null

  for (const entry of entries) {
    if (entry.type === 'sep') {
      pendingSep = entry
      continue
    }
    if (itemCount >= limit) break
    if (pendingSep) {
      out.push(pendingSep)
      pendingSep = null
    }
    out.push(entry)
    itemCount += 1
  }

  return out
}

function DeepShowMoreButton({ remaining, onClick }) {
  const step = Math.min(DEEP_LIST_STEP, remaining)
  return (
    <button
      type="button"
      className="drpt-showMore"
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

const FUNDAMENTAL_SNAPSHOT_ROWS = [
  { key: 'forwardRevenueGrowth', label: 'Forward rev growth', kind: 'single', format: 'pct' },
  { key: 'grossMargin', label: 'Gross margin', kind: 'sequence', format: 'pct' },
  { key: 'netMargin', label: 'Net margin', kind: 'sequence', format: 'pct' },
  { key: 'fcfMargin', label: 'FCF margin', kind: 'sequence', format: 'pct' },
  { key: 'netCash', label: 'Net cash', kind: 'sequence', format: 'usd' },
  { key: 'revenueGrowth', label: 'Rev growth (YoY)', kind: 'sequence', format: 'pct' },
]

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

function DeepChartRange({ value, onChange }) {
  return (
    <div className="drpt-chartRange researchPriceRange" role="group" aria-label="Chart range">
      {PRICE_RANGE_OPTS.map((r) => (
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

function DeepModelTable({ model, title, historicalOnly = false, maxHistCols = null, fit = false }) {
  if (!model?.quarters?.length) return null
  const estFrom = model.estimateFromIndex ?? model.quarters.length
  const rows = historicalOnly ? model.businessDrivers ?? [] : model.historicalModel ?? []
  if (!rows.length) return null

  if (!fit) {
    return (
      <div className="analyseModelScroll scrollThin">
        <AnalyseModelGrid
          rows={rows}
          quarters={model.quarters}
          estimateFromIndex={estFrom}
          showEstimates={!historicalOnly}
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
  const estQs = historicalOnly ? [] : model.quarters.slice(estFrom)

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
            const estVals = historicalOnly ? [] : row.values.slice(estFrom)
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

function DeepFundamentalsSnapshot({ fundamentals }) {
  if (!fundamentals) return null

  const cards = FUNDAMENTAL_SNAPSHOT_ROWS.map((row) => {
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
    return {
      key: row.key,
      label: row.label,
      value: formatFundamentalCell(value, row.format),
      period: period ?? 'Latest',
    }
  }).filter(Boolean)

  if (!cards.length) return null

  return (
    <div className="drpt-metricGrid">
      {cards.map((card) => (
        <div className="drpt-metricCard" key={card.key}>
          <span className="drpt-metricLabel">{card.label}</span>
          <span className="drpt-metricValue">{card.value}</span>
          <span className="drpt-metricPeriod">{card.period}</span>
        </div>
      ))}
    </div>
  )
}

function countTimelineItems(entries = []) {
  return entries.filter((e) => e?.type !== 'sep').length
}

function DeepChronology({ entries = [], visibleLimit = null }) {
  const displayEntries = useMemo(
    () => sliceTimelineEntries(entries, visibleLimit),
    [entries, visibleLimit],
  )

  if (!entries.length) {
    return <p className="drpt-empty">No filings yet.</p>
  }
  return (
    <ol className="drpt-docList">
      {displayEntries.map((entry) => {
        if (entry.type === 'sep') {
          return (
            <li className="drpt-docYear" key={entry.key}>
              <span>{entry.label}</span>
            </li>
          )
        }
        const item = entry.row?.item
        if (!item) return null

        if (item.kind === 'document') {
          const doc = item.document
          const openUrl = doc?.url
          const meta = documentCardMeta(doc)
          const Tag = openUrl ? 'a' : 'div'
          return (
            <li className="drpt-docItem" key={item.id}>
              <Tag
                className={[
                  'drpt-docRow',
                  openUrl ? 'drpt-docRow--link' : '',
                  meta.flagged ? 'drpt-docRow--notable' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                {...(openUrl
                  ? { href: openUrl, target: '_blank', rel: 'noopener noreferrer' }
                  : {})}
              >
                <span className="drpt-docCode">{meta.source}</span>
                <span className="drpt-docMain">
                  <span className="drpt-docKind">{meta.kind}</span>
                  {meta.detail ? <span className="drpt-docDetail"> - {meta.detail}</span> : null}
                </span>
                <span className="drpt-docAside">
                  <time className="drpt-docDate">{formatChronoDate(doc?.filedAt)}</time>
                </span>
              </Tag>
            </li>
          )
        }

        const openUrl = item.url
        const meta = flowCardMeta(item)
        const Tag = openUrl ? 'a' : 'div'
        return (
          <li className="drpt-docItem" key={item.id}>
            <Tag
              className={openUrl ? 'drpt-docRow drpt-docRow--link' : 'drpt-docRow'}
              {...(openUrl ? { href: openUrl, target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              <span className="drpt-docCode">{meta.source}</span>
              <span className="drpt-docMain">
                <span className="drpt-docKind">{meta.kind}</span>
                {meta.detail ? <span className="drpt-docDetail"> - {meta.detail}</span> : null}
              </span>
              <span className="drpt-docAside">
                <time className="drpt-docDate">{formatChronoDate(item.at)}</time>
              </span>
            </Tag>
          </li>
        )
      })}
    </ol>
  )
}

function DeepBusinessDriversSnapshot({ model }) {
  if (!model?.quarters?.length) return null
  const estFrom = model.estimateFromIndex ?? model.quarters.length
  const histQs = model.quarters.slice(0, estFrom)
  const rows = model.businessDrivers ?? []
  if (!rows.length) return null

  const cards = rows
    .map((row) => {
      const histVals = row.values.slice(0, estFrom)
      let latestIdx = -1
      for (let i = histVals.length - 1; i >= 0; i -= 1) {
        const raw = histVals[i]
        if (raw != null && raw !== '—' && String(raw).trim() !== '') {
          latestIdx = i
          break
        }
      }
      if (latestIdx < 0) return null
      const trailStart = Math.max(0, latestIdx - 3)
      const trail = histVals
        .slice(trailStart, latestIdx + 1)
        .map((v) => formatAnalyseGridValue(v, row))
        .filter((v) => v && v !== '—')
      return {
        key: row.label,
        label: row.label,
        value: formatAnalyseGridValue(histVals[latestIdx], row),
        period: histQs[latestIdx] ?? 'Latest',
        trail,
      }
    })
    .filter(Boolean)

  if (!cards.length) return null

  return (
    <div className="drpt-driverGrid">
      {cards.map((card) => (
        <div className="drpt-driverCard" key={card.key}>
          <span className="drpt-metricLabel">{card.label}</span>
          <span className="drpt-metricValue">{card.value}</span>
          <span className="drpt-metricPeriod">{card.period}</span>
          {card.trail.length > 1 ? (
            <span className="drpt-driverTrail">{card.trail.join(' → ')}</span>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function DeepInvestorList({ rows = [], visibleLimit = null, onInvestorClick = null }) {
  const displayRows = useMemo(() => {
    if (!rows.length) return rows
    if (visibleLimit == null || visibleLimit >= rows.length) return rows
    return rows.slice(0, visibleLimit)
  }, [rows, visibleLimit])

  if (!rows.length) return null

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
              txnTone={row.codeTone ?? deepTxnCodeTone(row.code)}
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
          <span className="researchMiniPriceTooltipDate">
            {[activePoint.dateLabel, activePoint.detailLabel].filter(Boolean).join(' · ')}
          </span>
          <span className="researchMiniPriceTooltipPrice">
            {activePoint.delta != null && activePoint.delta !== 0
              ? formatTrackHoverValue(activePoint.delta)
              : activePoint.eventKind === 'buy'
                ? 'Position opened'
                : formatTrackHoverValue(activePoint.cumulative)}
          </span>
        </div>
      ) : null}
    </div>
  )
}

function DeepTrackRecordChartPanel({ trackRecord }) {
  if (!trackRecord?.points?.length) {
    return <p className="drpt-empty">No trades in scope for a track record yet.</p>
  }

  return (
    <div className="researchMiniPrice researchMiniPrice--chartOnly">
      <DeepTrackRecordChart points={trackRecord.points} />
    </div>
  )
}

function DeepActorMetrics({ trackRecord }) {
  const stats = trackRecord?.stats
  if (!stats) return <p className="drpt-empty">No trades in scope yet.</p>

  const cards = [
    { key: 'win', label: 'Win rate', value: stats.winRate, period: 'Round trips' },
    { key: 'median', label: 'Median gain', value: stats.medianReturn, period: 'Per exit' },
    { key: 'trips', label: 'Round trips', value: stats.roundTrips ?? '—', period: 'Realized' },
    { key: 'cum', label: 'Net P&L', value: stats.cumulativeReturn, period: 'Track record' },
  ]

  return (
    <div className="drpt-metricGrid">
      {cards.map((card) => (
        <div className="drpt-metricCard" key={card.key}>
          <span className="drpt-metricLabel">{card.label}</span>
          <span className="drpt-metricValue">{card.value}</span>
          <span className="drpt-metricPeriod">{card.period}</span>
        </div>
      ))}
    </div>
  )
}

function mockTradeDocumentUrl(row) {
  const tick = String(row?.ticker ?? '').trim().toUpperCase()
  const code = String(row?.code ?? '').trim().toUpperCase()
  const q = [tick, code].filter((part) => part && part !== '—').join(' ')
  if (!q) return 'https://www.sec.gov/edgar/search/'
  return `https://www.sec.gov/edgar/search/#/q=${encodeURIComponent(q)}`
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

function DeepTradeLog({ rows = [], visibleLimit = null }) {
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

function DeepTradedCompaniesList({ companies = [], visibleLimit = null, onCompanyClick = null }) {
  const displayRows = useMemo(() => {
    if (!companies.length) return companies
    if (visibleLimit == null || visibleLimit >= companies.length) return companies
    return companies.slice(0, visibleLimit)
  }, [companies, visibleLimit])

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

function ActorTopBar({ name, detail, modeLabel, tradeCount, companyCount }) {
  return (
    <header className="drpt-topbar drpt-topbar--investor">
      <div className="drpt-topbarIdentity">
        <p className="drpt-kicker">Investor dossier</p>
        <div className="drpt-topbarTitleRow">
          <h1 className="drpt-topbarTicker">{name}</h1>
          <span className="drpt-topbarName">{modeLabel}</span>
        </div>
      </div>
      <div className="drpt-topbarMeta">
        {detail ? <span>{detail}</span> : null}
        <span>{formatCountLabel(tradeCount, 'transaction')}</span>
        <span>{formatCountLabel(companyCount, 'company', 'companies')}</span>
      </div>
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

  return (
    <header className="drpt-topbar">
      <div className="drpt-topbarIdentity">
        <p className="drpt-kicker">Company dossier</p>
        <div className="drpt-topbarTitleRow">
          <h1 className="drpt-topbarTicker">{ticker || '—'}</h1>
          <span className="drpt-topbarName">{displayName}</span>
        </div>
      </div>
      <div className="drpt-topbarMeta">
        {sector ? <span>{sector}</span> : null}
        {domicile ? <span>{domicile}</span> : null}
        {mcap ? <span>{mcap}</span> : null}
        {earnings?.label ? <span>Earnings {earnings.label}</span> : null}
      </div>
      <div
        className={[
          'drpt-topbarPrice',
          'drpt-topbarAside',
          showPrice ? '' : 'drpt-topbarPrice--empty',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-hidden={showPrice ? undefined : true}
      >
        {showPrice ? (
          <>
            <span className="drpt-price">${Number(price).toFixed(2)}</span>
            {ch != null && chPct != null ? (
              <span className={['drpt-priceChange', up ? 'isUp' : 'isDown'].join(' ')}>
                {up ? '+' : ''}
                {ch.toFixed(2)} ({up ? '+' : ''}
                {chPct.toFixed(2)}%)
              </span>
            ) : null}
          </>
        ) : null}
      </div>
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
  fundamentals,
  model,
  modelLoading,
  backendUp,
  chartSlot,
  chartRange = '6M',
  onChartRangeChange,
  chrome,
  onInvestorClick = null,
}) {
  const t = String(ticker ?? '').trim().toUpperCase()
  const displayName = String(companyName ?? '').trim() || t || 'Company'
  const resolvedModel = useMemo(() => {
    if (backendUp && model) return model
    if (backendUp && modelLoading) return null
    return analyseMockModelForTicker(t)
  }, [backendUp, model, modelLoading, t])

  const eventCount = countTimelineItems(timelineEntries)

  return (
    <DeepReportShell
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
        {chartSlot || fundamentals ? (
          <div className="drpt-row drpt-row--market">
            {chartSlot ? (
              <DeepSection
                label="Market"
                title="Price & earnings"
                headExtra={
                  onChartRangeChange ? (
                    <DeepChartRange value={chartRange} onChange={onChartRangeChange} />
                  ) : null
                }
              >
                <div className="drpt-figure drpt-figure--chart">{chartSlot}</div>
              </DeepSection>
            ) : null}

            {fundamentals ? (
              <DeepSection label="Fundamentals" title="Key metrics">
                <DeepFundamentalsSnapshot fundamentals={fundamentals} />
              </DeepSection>
            ) : null}
          </div>
        ) : null}

        {resolvedModel ? (
          <DeepSection label="Forecast" title="Financial model">
            <DeepModelTable model={resolvedModel} />
          </DeepSection>
        ) : null}

        {!resolvedModel && modelLoading ? (
          <p className="drpt-empty drpt-loading">Loading financial model…</p>
        ) : null}

        <div className="drpt-row drpt-row--model">
            {resolvedModel ? (
              <DeepSection label="Model" title="Business drivers">
                <DeepBusinessDriversSnapshot model={resolvedModel} />
              </DeepSection>
            ) : modelLoading ? (
              <DeepSection label="Model" title="Business drivers">
                <p className="drpt-empty drpt-loading">Loading business drivers…</p>
              </DeepSection>
            ) : null}

            <DeepSection
              label="Archive"
              title="Documents"
              headExtra={
                <span className="drpt-sectionCount">
                  {timelineLoading ? 'Loading…' : formatCountLabel(eventCount, 'filing')}
                </span>
              }
            >
              <div className="drpt-docPanel drpt-scroll">
                <DeepExpandablePanel totalCount={timelineLoading ? 0 : eventCount}>
                  {(limit) =>
                    timelineLoading ? (
                      <p className="drpt-empty drpt-loading">Loading filings…</p>
                    ) : (
                      <DeepChronology entries={timelineEntries} visibleLimit={limit} />
                    )
                  }
                </DeepExpandablePanel>
              </div>
            </DeepSection>
          </div>

        {trackedInvestors.length ? (
          <DeepSection label="Flow" title="Tracked investors & filers">
            <div className="drpt-docPanel drpt-scroll">
              <DeepExpandablePanel totalCount={trackedInvestors.length}>
                {(limit) => (
                  <DeepInvestorList
                    rows={trackedInvestors}
                    visibleLimit={limit}
                    onInvestorClick={onInvestorClick}
                  />
                )}
              </DeepExpandablePanel>
            </div>
          </DeepSection>
        ) : null}
    </DeepReportShell>
  )
}

export function DeepActorReport({
  actorRow,
  personDisplay,
  mode = 'insider',
  caseRows = [],
  chrome,
  compactPrice = null,
  compactPriceChange = null,
  compactPriceChangePct = null,
  onCompanyClick = null,
}) {
  const name = String(personDisplay?.fullName ?? actorRow?.actorName ?? '').trim()
  const detail = String(personDisplay?.detail ?? actorRow?.actorDetail ?? '').trim()
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

  const trackRecord = useMemo(
    () => buildMockActorTrackRecord(tradeRows, name),
    [tradeRows, name],
  )

  const companies = useMemo(() => {
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
  }, [tradeRows])

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
      compactLabel={actorCompactLabel}
      compactPrice={compactPrice}
      compactPriceChange={compactPriceChange}
      compactPriceChangePct={compactPriceChangePct}
      chrome={chrome}
      expandedHeader={
        <ActorTopBar
          name={name}
          detail={detail}
          modeLabel={modeLabel}
          tradeCount={tradeRows.length}
          companyCount={companies.length}
        />
      }
    >
        <div className="drpt-row drpt-row--market">
          <DeepSection label="Track record" title="Trading history">
            <div className="drpt-figure drpt-figure--chart">
              <DeepTrackRecordChartPanel trackRecord={trackRecord} />
            </div>
          </DeepSection>

          <DeepSection label="Fundamentals" title="Key metrics">
            <DeepActorMetrics trackRecord={trackRecord} />
          </DeepSection>
        </div>

        <div className="drpt-row drpt-row--archive">
          <DeepSection
            label="Archive"
            title="Trade log"
            headExtra={<span className="drpt-sectionCount">{formatCountLabel(tradeRows.length, 'trade')}</span>}
          >
            <div className="drpt-docPanel drpt-scroll">
              <DeepExpandablePanel totalCount={tradeRows.length}>
                {(limit) => <DeepTradeLog rows={caseRows} visibleLimit={limit} />}
              </DeepExpandablePanel>
            </div>
          </DeepSection>

          <DeepSection
            label="Issuers"
            title="Company archive"
            headExtra={<span className="drpt-sectionCount">{formatCountLabel(companies.length, 'company', 'companies')}</span>}
          >
            <div className="drpt-docPanel drpt-scroll">
              <DeepExpandablePanel totalCount={companies.length}>
                {(limit) => (
                  <DeepTradedCompaniesList
                    companies={companies}
                    visibleLimit={limit}
                    onCompanyClick={onCompanyClick}
                  />
                )}
              </DeepExpandablePanel>
            </div>
          </DeepSection>
        </div>
    </DeepReportShell>
  )
}

export function DeepPage({ mode, company, investor, actor, chrome }) {
  const investorProps = investor ?? actor
  return mode === 'investor' || mode === 'actor' ? (
    <DeepActorReport {...investorProps} chrome={chrome} />
  ) : (
    <DeepCompanyReport {...company} chrome={chrome} />
  )
}
