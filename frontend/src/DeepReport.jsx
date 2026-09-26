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
  buildDailyTrackRecord,
  formatReturnFraction,
} from './deepOutcomes.js'
import { DeepCompactChrome } from './DeepCompactChrome.jsx'
import { formatCountLabel } from './formatCountLabel.js'
import { PRICE_RANGE_OPTS, priceRangeLabel, availablePriceRangesFromTimestamps, coercePriceRangeFromOptions } from './MiniPriceChart.jsx'
import {
  normalizeResearchPaperSourceKey,
  RESEARCH_PAPER_SOURCE_CATALOG,
} from './researchPaperSources.js'
import { ExplorePersonRow, ImageOrInitials, normalizeInvestorName } from './ExplorePersonRow.jsx'
import { exploreInvestorSlug } from './exploreDirectoryNav.js'
import { EXECUTIVE_INVESTOR_SLUGS, SENATE_INVESTOR_SLUGS } from './exploreWatchlistCatalog.js'
import portraits from './explorePortraits.json'
import { companyLogoFallback, companyLogoSrc } from './localImages.js'
import './DeepReport.css'
import { EmptyChart, EmptyList, EmptyReturn, EmptyStats, SkeletonChart, SkeletonList, SkeletonReturn, SkeletonStats } from './AppSkeleton.jsx'
import { copyDossierShareCard } from './dossierShareCard.js'
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

function DossierHeroMedia({ src, heroColor = null, name, title, kicker, logo = false }) {
  const flat = Boolean(heroColor)
  return (
    <div
      className={`drpt-heroMedia${logo && !flat ? ' drpt-heroMedia--logo' : ''}${flat ? ' drpt-heroMedia--flat' : ''}`}
      style={flat ? { '--drpt-hero-flat': heroColor } : undefined}
    >
      <span className="drpt-heroPhoto" aria-hidden="true">
        {src ? (
          <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
        ) : (
          <ImageOrInitials className="drpt-heroPhotoInner" src={null} name={name} logo={logo} discover={false} />
        )}
      </span>
      <div className="drpt-heroCopy">
        {kicker ? <p className="drpt-heroKicker">{kicker}</p> : null}
        <h1 className="drpt-heroTitle">{title}</h1>
      </div>
    </div>
  )
}

function DeepReportShell({
  scrollResetKey = 'deep',
  expandedHeader,
  flat = false,
  collapsedTitle = '',
  compactLabel,
  compactPrice,
  compactPriceChange,
  compactPriceChangePct,
  chrome,
  onShareClick = null,
  shareLabel = 'Share',
  children,
}) {
  const { pageRef, dockRef, spacerRef } = useCollapseScroll({
    progressVars: deepCollapseProgressVars,
    resetKey: scrollResetKey,
    rangeFallback: DEEP_COLLAPSE_RANGE_FALLBACK,
  })

  return (
    <article className={['drpt', flat ? 'drpt--flatHead' : '', collapsedTitle ? 'drpt--dossier' : ''].filter(Boolean).join(' ')} ref={pageRef}>
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
                subjectLabel={collapsedTitle ? '' : compactLabel}
                price={collapsedTitle ? null : compactPrice}
                priceChange={collapsedTitle ? null : compactPriceChange}
                priceChangePct={collapsedTitle ? null : compactPriceChangePct}
                hideTrail={!!collapsedTitle}
                onShareClick={onShareClick}
                shareLabel={shareLabel}
              />
              {collapsedTitle ? <p className="drpt-collapsedName">{collapsedTitle}</p> : null}
            </div>

            {expandedHeader ? <div className="drpt-expanded">{expandedHeader}</div> : null}
          </div>
        </div>
        <div ref={spacerRef} className="drpt-collapseSpacer" aria-hidden="true" />
        <div className="drpt-paper">{children}</div>
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
  HLD: 'HOLDING',
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
  const raw = String(amount ?? '').trim()
  if (!raw || /^[-–—−]+$/.test(raw)) return 'isFlat'
  const tone = String(txnTone ?? '')
  if (tone === 'buy' || tone === 'instInc' || tone === 'instNew') return 'isUp'
  if (tone === 'sell' || tone === 'instRed') return 'isDown'
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
  image = null,
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
        image ? 'drpt-docRow--portrait' : '',
        tightTrail ? 'drpt-docRow--flowTight' : '',
        hideTxn ? 'drpt-docRow--flowNoTxn' : '',
        clickable ? 'drpt-docRow--link' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={hasClick && !hasHref ? onClick : undefined}
      aria-label={clickable ? openLabel || (hasHref ? `Open document for ${title}` : `Open ${title} dossier`) : undefined}
    >
      {image ? <ImageOrInitials className={`drpt-rowImage${image.logo ? ' drpt-rowImage--logo' : ''}`} src={image.src} name={image.name} logo={image.logo} /> : <span className="drpt-docCode mono">{code}</span>}
      <div className="drpt-docCopy">
        <span className="drpt-docKind">{title}</span>
        {image ? <span className="drpt-rowSubline">{code}<span className="drpt-rowCompactDate">, {date ?? '—'}</span></span> : null}
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
    if (abs >= 1e3) {
      const k = Math.round(abs / 1e3)
      if (k >= 1000) return `$${(abs / 1e6).toFixed(1)}M`
      return `$${k}K`
    }
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

const DEEP_METRIC_MARGIN_KEYS = new Set(['grossMargin', 'netMargin', 'fcfMargin'])
const MIN_METRIC_REVENUE_USD = 5_000_000
const MAX_METRIC_MARGIN_PCT = 300

/** Each slot picks the first row that has data — always four boxes when fundamentals exist. */
const DEEP_METRIC_SLOTS = [
  [
    { key: 'valuationDiscountPct', label: 'Vs historic valuation', kind: 'single', format: 'valuationDiscount' },
    { key: 'revenueGrowth', label: 'Rev growth (YoY)', kind: 'sequence', format: 'pct' },
    { key: 'netCash', label: 'Net cash', kind: 'sequence', format: 'usd' },
  ],
  [
    { key: 'grossMargin', label: 'Gross margin', kind: 'sequence', format: 'pct' },
    { key: 'revenueGrowth', label: 'Rev growth (YoY)', kind: 'sequence', format: 'pct' },
  ],
  [
    { key: 'netMargin', label: 'Net margin', kind: 'sequence', format: 'pct' },
    { key: 'netIncomeGrowth', label: 'Net income growth', kind: 'sequence', format: 'pct' },
  ],
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
  const latest = DEEP_METRIC_MARGIN_KEYS.has(row.key)
    ? latestMeaningfulSequenceValue(fundamentals, row.key)
    : latestSequenceValue(fundamentals, row.key)
  const { value, period } = latest
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

/** Prefer the latest quarter with enough revenue for margin % to be meaningful. */
function latestMeaningfulSequenceValue(fundamentals, key) {
  const arr = fundamentals?.[key]
  const revenue = fundamentals?.revenueUsd
  if (!Array.isArray(arr) || !arr.length) return { value: null, period: null }
  for (let i = arr.length - 1; i >= 0; i -= 1) {
    const v = arr[i]
    if (v == null || !Number.isFinite(Number(v))) continue
    const rev = revenue?.[i]
    if (rev != null && Math.abs(Number(rev)) < MIN_METRIC_REVENUE_USD) continue
    if (Math.abs(Number(v)) > MAX_METRIC_MARGIN_PCT) continue
    const labels = fundamentals.periodLabels ?? []
    const period = labels[i] ?? (i === arr.length - 1 ? 'Latest' : null)
    return { value: v, period }
  }
  return { value: null, period: null }
}

function DeepFundamentalsSnapshot({ fundamentals, loading = false, priceChangePct = null, chartRange, strip = false }) {
  const change = priceChangePct != null && Number.isFinite(Number(priceChangePct)) ? Number(priceChangePct) : null
  const cards = [
    ...(strip ? [] : [{key:'priceChange', label:'Price change', value:change == null ? '—' : `${change > 0 ? '+' : ''}${change.toFixed(2)}%`, period:priceRangeLabel(chartRange), tone:change == null ? '' : change >= 0 ? 'isUp' : 'isDown'}]),
    ...(fundamentals ? buildDeepMetricCards(fundamentals).filter(card => card.key !== 'valuationDiscountPct').slice(0, 3) : []),
  ]
  if (loading && cards.length < DEEP_METRIC_SLOT_COUNT) {
    return <SkeletonStats />
  }


  if (!cards.length) {
    return loading ? (
      <SkeletonStats />
    ) : (
      <EmptyStats label="No key metrics yet" />
    )
  }

  const shown = strip ? cards.slice(0, 3) : cards
  return (
    <div className={strip ? 'drpt-statStrip' : 'drpt-metricGrid'}>
      {shown.map((card) => (
        strip ? (
          <div className="drpt-stat" key={card.key}>
            <span className="drpt-statLabel">{card.label}</span>
            <span className={`drpt-statValue ${card.tone ?? ''}`}>{card.value}</span>
          </div>
        ) : (
        <div className="drpt-metricCard" key={card.key}>
          <span className="drpt-metricLabel">{card.label}</span>
          <span className={`drpt-metricValue ${card.tone ?? ''}`}>{card.value}</span>
          {card.period ? <span className="drpt-metricPeriod">{card.period}</span> : null}
        </div>
        )
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

function DeepInvestorList({ rows = [], onInvestorClick = null, loading = false, ticker }) {
  if (loading) return <SkeletonList count={3} />
  if (!rows.length) return <p className="drpt-empty">No tracked investor activity yet.</p>
  return <ul className="exploreDirPaper drpt-activityList">
    {rows.map((row, i) => <ExplorePersonRow key={row.id ?? i} investorOnly
      row={{...row, ticker, docType:row.source ?? TRACKED_INVESTOR_SOURCE[row.typeKey] ?? 'Form 4',
        event:deepTxnCodeWord(row.code), trail:row.amount, dateLabel:row.date}}
      onClick={onInvestorClick ? () => onInvestorClick({...row,ticker}) : null}
    />)}
  </ul>
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
  const hoverEnabled = true
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
    let frame = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    })
    ro.observe(wrap)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      cancelAnimationFrame(frame)
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
      aria-label="Daily disclosed-stock percentage index"
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
    return <SkeletonChart />
  }
  if (!trackRecord?.points?.length) {
    return <EmptyChart label="No price data" />
  }

  return (
    <div className="researchMiniPrice researchMiniPrice--chartOnly">
      <DeepTrackRecordChart points={trackRecord.points} />
    </div>
  )
}

/** Sample curve so the Pelosi dossier can be reviewed before a verified series exists. */
function pelosiSamplePerformance() {
  const end = new Date(2026, 8, 23)
  end.setHours(12, 0, 0, 0)
  const targets = { '1M': 0.042, '3M': 0.124, '6M': 0.246, '1Y': 0.274, YTD: 0.198 }
  const endLevel = targets['1Y']
  const levelAt = (fraction) => (1 + endLevel) / (1 + fraction) - 1
  const ytd = new Date(2026, 0, 1)
  ytd.setHours(12, 0, 0, 0)
  const ytdBack = Math.round((end.getTime() - ytd.getTime()) / 86400000)
  const anchors = [
    [365, 0],
    [ytdBack, levelAt(targets.YTD)],
    [180, levelAt(targets['6M'])],
    [90, levelAt(targets['3M'])],
    [30, levelAt(targets['1M'])],
    [0, endLevel],
  ].sort((a, b) => b[0] - a[0])
  const points = []
  for (let back = 365; back >= 0; back -= 1) {
    let i = 0
    while (i < anchors.length - 1 && anchors[i + 1][0] > back) i += 1
    const [fromBack, fromLevel] = anchors[i]
    const [toBack, toLevel] = anchors[Math.min(i + 1, anchors.length - 1)]
    const span = fromBack - toBack || 1
    const t = (fromBack - back) / span
    const wave = Math.sin(t * Math.PI * 7) * 0.012 + Math.sin(t * Math.PI * 3) * 0.006
    const cumulative = fromLevel + (toLevel - fromLevel) * t + (fromBack === toBack ? 0 : wave)
    const day = new Date(end)
    day.setDate(end.getDate() - back)
    const y = day.getFullYear()
    const m = String(day.getMonth() + 1).padStart(2, '0')
    const d = String(day.getDate()).padStart(2, '0')
    points.push({ ts: `${y}-${m}-${d}T12:00:00`, cumulative })
  }
  return { daily: { points, symbols: 8 } }
}

function formatTrackSpan(points) {
  if (!points?.length) return null
  const fmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const start = new Date(points[0].ts)
  const end = new Date(points.at(-1).ts)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  return `${fmt.format(start)} – ${fmt.format(end)}`
}

function heroReturnFromFraction(fraction) {
  if (fraction == null || !Number.isFinite(Number(fraction))) return null
  const pct = Number(fraction) * 100
  const abs = Math.abs(pct).toFixed(1)
  if (pct > 0.05) return { text: `+${abs}%`, tone: 'isUp' }
  if (pct < -0.05) return { text: `−${abs}%`, tone: 'isDown' }
  return { text: '0.0%', tone: '' }
}

function heroReturnFromPercent(percent) {
  if (percent == null || !Number.isFinite(Number(percent))) return null
  const pct = Number(percent)
  const abs = Math.abs(pct).toFixed(1)
  if (pct > 0.05) return { text: `+${abs}%`, tone: 'isUp' }
  if (pct < -0.05) return { text: `−${abs}%`, tone: 'isDown' }
  return { text: '0.0%', tone: '' }
}

function formatLongDate(ms) {
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d)
}

function formatAum(n) {
  if (!(n > 0)) return '—'
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`
  return `$${Math.round(n)}`
}

function formatDelay(days) {
  if (!Number.isFinite(days)) return '—'
  const rounded = Math.max(0, Math.round(days))
  if (rounded >= 6) {
    const weeks = Math.max(1, Math.round(rounded / 7))
    if (Math.abs(rounded - weeks * 7) <= 2) return weeks === 1 ? '1 week' : `${weeks} weeks`
  }
  return rounded === 1 ? '1 day' : `${rounded} days`
}

function formatWeight(n) {
  if (!Number.isFinite(n) || n < 0.05) return '0%'
  return `${n.toFixed(1)}%`
}

function shortCompany(name, ticker) {
  const cleaned = String(name || ticker || '')
    .replace(/,?\s+(Inc\.|Incorporated|Corporation|Corp\.|N\.V\.|Ltd\.|Limited|plc|S\.A\.)$/i, '')
    .replace(/,?\s+Holdings$/i, '')
    .replace(/\.com$/i, '')
    .trim()
  return cleaned || ticker || '—'
}

function dayKey(ms) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function integerWeights(rows) {
  const total = rows.reduce((sum, row) => sum + row.dollars, 0)
  if (!(total > 0)) return rows.map((row) => ({ ...row, pct: 0 }))
  const ranked = rows.map((row, index) => {
    const exact = (row.dollars / total) * 100
    return { ...row, index, exact, pct: Math.floor(exact), frac: exact - Math.floor(exact) }
  })
  let left = 100 - ranked.reduce((sum, row) => sum + row.pct, 0)
  ranked.sort((a, b) => b.frac - a.frac || a.index - b.index)
  for (let i = 0; i < ranked.length && left > 0; i += 1) {
    ranked[i].pct += 1
    left -= 1
  }
  return ranked.sort((a, b) => a.index - b.index)
}

function isDossierTrade(row) {
  return row?.type !== 'meta' && row?.layout !== 'two' && (row?.type === 'trade' || String(row?.layout ?? '').startsWith('txn'))
}

function tradeDollars(row) {
  const n = Number(row?.amountUsd)
  if (n > 1) return n
  const text = String(row?.value ?? '').replace(/[$,]/g, '')
  const range = text.match(/([\d.]+)\s*-\s*([\d.]+)\s*([kmb])?/i)
  if (range) {
    const unit = String(range[3] || '').toLowerCase()
    const scale = unit === 'b' ? 1e9 : unit === 'm' ? 1e6 : unit === 'k' ? 1e3 : 1
    return ((Number(range[1]) + Number(range[2])) / 2) * scale
  }
  const single = text.match(/([\d.]+)\s*([kmb])?/i)
  if (!single) return 0
  const unit = String(single[2] || '').toLowerCase()
  const scale = unit === 'b' ? 1e9 : unit === 'm' ? 1e6 : unit === 'k' ? 1e3 : 1
  return Number(single[1]) * scale
}

function buildDossierActivity(rows) {
  const trades = (rows ?? []).filter(isDossierTrade).map((row) => {
    const meta = tradeRowMeta(row)
    const tradeMs = new Date(row?.tradeTs ?? row?.ts ?? 0).getTime()
    const filedMs = new Date(row?.filedAt ?? row?.tradeTs ?? row?.ts ?? 0).getTime()
    return {
      row,
      ticker: meta.ticker,
      name: shortCompany(row?.companyName || meta.title, meta.ticker),
      fullName: String(row?.companyName || meta.title || meta.ticker).trim(),
      dollars: tradeDollars(row),
      sell: meta.codeTone === 'sell',
      tradeMs: Number.isFinite(tradeMs) ? tradeMs : null,
      filedMs: Number.isFinite(filedMs) ? filedMs : null,
    }
  }).filter((trade) => trade.ticker && trade.ticker !== '—' && trade.tradeMs != null)
  trades.sort((a, b) => a.tradeMs - b.tradeMs || a.filedMs - b.filedMs)
  if (!trades.length) return null

  const book = new Map()
  const groups = new Map()
  for (const trade of trades) {
    const key = dayKey(trade.filedMs ?? trade.tradeMs)
    if (!groups.has(key)) groups.set(key, { key, filedMs: trade.filedMs ?? trade.tradeMs, trades: [] })
    groups.get(key).trades.push(trade)
  }
  const ordered = [...groups.values()].sort((a, b) => a.filedMs - b.filedMs)
  const filings = []
  for (const group of ordered) {
    const before = new Map(book)
    for (const trade of group.trades) {
      const next = Math.max(0, (book.get(trade.ticker)?.dollars ?? 0) + (trade.sell ? -trade.dollars : trade.dollars))
      if (next <= 1) book.delete(trade.ticker)
      else book.set(trade.ticker, { dollars: next, name: trade.name, fullName: trade.fullName || book.get(trade.ticker)?.fullName })
    }
    const totalBefore = [...before.values()].reduce((sum, item) => sum + item.dollars, 0)
    const totalAfter = [...book.values()].reduce((sum, item) => sum + item.dollars, 0)
    const weight = (map, total, ticker) => (total > 0 ? ((map.get(ticker)?.dollars ?? 0) / total) * 100 : 0)
    const seen = new Set()
    const changes = []
    for (const trade of group.trades) {
      if (seen.has(trade.ticker)) continue
      seen.add(trade.ticker)
      const from = weight(before, totalBefore, trade.ticker)
      const to = weight(book, totalAfter, trade.ticker)
      const net = group.trades
        .filter((item) => item.ticker === trade.ticker)
        .reduce((sum, item) => sum + (item.sell ? -item.dollars : item.dollars), 0)
      const had = (before.get(trade.ticker)?.dollars ?? 0) > 1
      const has = (book.get(trade.ticker)?.dollars ?? 0) > 1
      const kind = !had && has ? 'new' : had && !has ? 'closed' : net > 0 ? 'increased' : net < 0 ? 'decreased' : 'unchanged'
      const fullName = book.get(trade.ticker)?.fullName || before.get(trade.ticker)?.fullName || trade.fullName
      if (from < 0.05 && to < 0.05) continue
      if (kind === 'unchanged') continue
      changes.push({ ticker: trade.ticker, name: book.get(trade.ticker)?.name || before.get(trade.ticker)?.name || trade.name, fullName, from, to, kind })
    }
    const unchanged = []
    for (const [ticker, item] of book) {
      if (seen.has(ticker)) continue
      const to = weight(book, totalAfter, ticker)
      if (to < 0.05) continue
      unchanged.push({
        ticker,
        name: item.name,
        fullName: item.fullName || item.name,
        from: weight(before, totalBefore, ticker),
        to,
        kind: 'unchanged',
      })
    }
    unchanged.sort((a, b) => b.to - a.to)
    filings.push({ ...group, changes, unchanged })
  }

  const holdings = integerWeights([...book.entries()].map(([ticker, item]) => ({ ticker, name: item.name, fullName: item.fullName || item.name, dollars: item.dollars })))
    .filter((row) => row.dollars > 1)
    .sort((a, b) => b.pct - a.pct || b.dollars - a.dollars)
  const delays = trades
    .filter((trade) => trade.filedMs != null && trade.tradeMs != null && trade.filedMs >= trade.tradeMs)
    .map((trade) => (trade.filedMs - trade.tradeMs) / 86400000)
  const aum = holdings.reduce((sum, row) => sum + row.dollars, 0)
  return {
    since: formatLongDate(trades[0].tradeMs),
    aum: formatAum(aum),
    delay: formatDelay(delays.length ? delays.reduce((sum, n) => sum + n, 0) / delays.length : null),
    positions: String(holdings.length),
    holdings,
    filings: filings.filter((filing) => filing.changes.length).reverse(),
  }
}

function filingSentence(person, changes) {
  const last = String(person ?? '').trim().split(/\s+/).filter(Boolean).at(-1) || 'Filing'
  const names = (kind) => {
    const list = [...new Set(changes.filter((change) => change.kind === kind).map((change) => change.name))]
    if (list.length <= 1) return list[0] ?? ''
    return `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`
  }
  const opened = names('new')
  const increased = names('increased')
  const decreased = names('decreased')
  const closed = names('closed')
  if (opened && increased && !decreased && !closed) return `${last} filing update. New position in ${opened}, and increase in ${increased}.`
  if ((opened || increased) && !decreased && !closed) return `${last} goes long on ${[opened, increased].filter(Boolean).join(' and ')}.`
  if (closed && !opened && !increased && !decreased) return `${last} closed ${closed}.`
  const bits = []
  if (opened) bits.push(`new position in ${opened}`)
  if (increased) bits.push(`increase in ${increased}`)
  if (decreased) bits.push(`decrease in ${decreased}`)
  if (closed) bits.push(`closed ${closed}`)
  if (!bits.length) return `${last} filing update.`
  return `${last} filing update. ${bits[0][0].toUpperCase()}${bits[0].slice(1)}${bits.slice(1).map((bit) => `, and ${bit}`).join('')}.`
}

function DeepActorMetrics({ activity, loading = false }) {
  if (loading && !activity) return <SkeletonStats />
  if (!activity) return <EmptyStats label="Metrics unavailable" />
  const cards = [
    { key: 'aum', label: 'AUM', value: activity.aum },
    { key: 'delay', label: 'Avg. delay', value: activity.delay },
    { key: 'positions', label: 'Positions', value: activity.positions },
  ]
  const blank = cards.every((card) => {
    const v = card.value
    return v == null || v === '—' || v === '-' || v === '' || v === 0 || v === '0'
  })
  if (blank) return <EmptyStats label="Metrics unavailable" />
  return (
    <div className="drpt-statStrip">
      {cards.map((card) => (
        <div className="drpt-stat" key={card.key}>
          <span className="drpt-statLabel">{card.label}</span>
          <span className="drpt-statValue">{card.value}</span>
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

function FilingModal({ filing, name, portraitSrc, heroColor = null, onClose }) {
  const sections = [
    ['new', 'New positions', filing.changes],
    ['closed', 'Closed positions', filing.changes],
    ['increased', 'Increased positions', filing.changes],
    ['decreased', 'Decreased positions', filing.changes],
    ['unchanged', 'Unchanged positions', filing.unchanged ?? []],
  ]
  const meterColor = heroColor || 'rgba(92, 184, 138, 0.95)'
  return (
    <div className="drpt-filingPage drpt--dossier" role="dialog" aria-modal="true" aria-label={`${formatLongDate(filing.filedMs)} trades`}>
      <div className="drpt-chromeBar">
        <DeepCompactChrome onCloseClick={onClose} hideTrail showShare={false} closeAriaLabel="Close" />
        <p className="drpt-collapsedName">{formatLongDate(filing.filedMs)}</p>
      </div>
      <div className="drpt-filingBody">
        <div className="drpt-filingHero">
          <h2 className="drpt-sectionTitle">Made {filing.trades.length} {filing.trades.length === 1 ? 'trade' : 'trades'}</h2>
          <div
            className="drpt-filingMeter"
            aria-hidden="true"
            style={{
              '--drpt-filing-meter': meterColor,
            }}
          />
          <ImageOrInitials className="drpt-filingPortrait" src={portraitSrc} name={name} discover={false} />
          <p className="drpt-filingName">{name}</p>
          <p className="drpt-filingBlurb">{filingSentence(name, filing.changes)}</p>
        </div>
        {sections.map(([kind, title, source]) => {
          const rows = (source ?? []).filter((change) => change.kind === kind)
          if (!rows.length) return null
          return (
            <section className="drpt-section" key={kind}>
              <h3 className="drpt-sectionTitle">{title}</h3>
              <ol className="drpt-holdingList">
                {rows.map((change) => (
                  <li key={change.ticker}>
                    <div className="drpt-holdingBtn">
                      <ImageOrInitials
                        className="drpt-holdingLogo"
                        src={companyLogoSrc(change.ticker)}
                        fallbackSrc={companyLogoFallback(change.ticker)}
                        name={change.ticker}
                        logo
                        discover={false}
                      />
                      <span className="drpt-holdingName">
                        <span>{change.ticker}</span>
                        <span>{change.fullName || change.name}</span>
                      </span>
                      <span className="drpt-holdingAction">
                        {kind === 'unchanged' ? formatWeight(change.to) : `${formatWeight(change.from)} → ${formatWeight(change.to)}`}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function DeepTradeLog({ rows = [], loading = false, name = '', portraitSrc = null, heroColor = null, expanded = false }) {
  const [active, setActive] = useState(null)
  const activity = useMemo(() => buildDossierActivity(rows), [rows])
  const filings = activity?.filings ?? []
  const visible = expanded ? filings : filings.slice(0, 5)
  if (loading && !filings.length) return <SkeletonList count={3} />
  if (!filings.length) return <EmptyList label="No trades yet" />
  return (
    <>
      <ol className="drpt-tradeList">
        {visible.map((filing) => {
          const logosShown = filing.changes.slice(0, 3)
          const extra = filing.changes.length - logosShown.length
          return (
            <li className="drpt-tradeItem" key={filing.key}>
              <button type="button" className="drpt-tradeBtn" onClick={() => setActive(filing)}>
                <span className="drpt-tradeDate">{formatLongDate(filing.filedMs)}</span>
                <span className="drpt-tradeTitle">{filingSentence(name, filing.changes)}</span>
                <span className="drpt-tradeLogos">
                  {logosShown.map((change) => (
                    <ImageOrInitials
                      key={change.ticker}
                      className="drpt-tradeLogo"
                      src={companyLogoSrc(change.ticker)}
                        fallbackSrc={companyLogoFallback(change.ticker)}
                      name={change.ticker}
                      logo
                      discover={false}
                    />
                  ))}
                  {extra > 0 ? <span>+{extra} more</span> : null}
                </span>
                <span className="drpt-tradeChevron" aria-hidden="true">›</span>
              </button>
            </li>
          )
        })}
      </ol>
      {active ? (
        <FilingModal filing={active} name={name} portraitSrc={portraitSrc} heroColor={heroColor} onClose={() => setActive(null)} />
      ) : null}
    </>
  )
}

function DeepHoldings({ rows = [], loading = false, expanded = false }) {
  const holdings = useMemo(() => buildDossierActivity(rows)?.holdings ?? [], [rows])
  const visible = expanded ? holdings : holdings.slice(0, 5)
  if (loading && !holdings.length) return <SkeletonList count={3} />
  if (!holdings.length) return <EmptyList label="No holdings yet" />
  return (
    <>
      <ol className="drpt-holdingList">
        {visible.map((holding) => (
          <li key={holding.ticker}>
            <div className="drpt-holdingBtn">
              <ImageOrInitials
                className="drpt-holdingLogo"
                src={companyLogoSrc(holding.ticker)}
                fallbackSrc={companyLogoFallback(holding.ticker)}
                name={holding.ticker}
                logo
                discover={false}
              />
              <span className="drpt-holdingName">
                <span>{holding.ticker}</span>
                <span>{holding.name}</span>
              </span>
              <span className="drpt-holdingAction">{holding.pct}%</span>
            </div>
          </li>
        ))}
      </ol>
    </>
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
    return <SkeletonList count={3} />
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
  const heroReturn = heroReturnFromPercent(priceChangePct)
  const secondary = sector && !['—', '-'].includes(sector) ? sector : 'Company'

  return (
    <DeepReportShell
      scrollResetKey={scrollResetKey ?? t}
      collapsedTitle={displayName}
      compactLabel={t}
      compactPrice={price}
      compactPriceChange={priceChange}
      compactPriceChangePct={priceChangePct}
      chrome={chrome}
      expandedHeader={
        <DossierHeroMedia
          src={companyLogoSrc(t)}
          fallbackSrc={companyLogoFallback(t)}
          name={t}
          title={displayName}
          kicker={secondary}
          logo
        />
      }
    >
      <div className="drpt-dossier">
        <div className="drpt-dossierLead">
          <div className="drpt-dossierLeadCopy">
            {heroReturn ? <p className={`drpt-heroReturn ${heroReturn.tone}`}>{heroReturn.text}</p> : null}
            <p className="drpt-heroSpan">{priceRangeLabel(chartRange)}</p>
            {chartSlot ? (
              <div className="drpt-figure drpt-figure--chart">{chartSlot}</div>
            ) : chartLoading ? (
                <SkeletonChart />
            ) : (
                <EmptyChart label="No price data" />
            )}
            {onChartRangeChange ? (
              <DeepChartRange value={chartRange} onChange={onChartRangeChange} options={chartRangeOptions} />
            ) : null}
        </div>
        </div>
        <DeepSection title="Stats">
          <DeepFundamentalsSnapshot strip fundamentals={fundamentals} loading={fundamentalsLoading} priceChangePct={priceChangePct} chartRange={chartRange} />
        </DeepSection>
        <DeepSection title="Tracked investors">
            <DeepInvestorList rows={trackedInvestors} loading={trackedInvestorsLoading} onInvestorClick={onInvestorClick} ticker={t} />
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
  const [listsOpen, setListsOpen] = useState(false)
  const [shareState, setShareState] = useState('idle')
  const shareTimer = useRef(null)
  useEffect(() => () => window.clearTimeout(shareTimer.current), [])
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

  const dossierPerformance = useMemo(() => {
    if (actorRow?.performance?.daily?.points?.length) return actorRow.performance
    if (normalizeInvestorName(name) !== 'nancypelosi') return actorRow?.performance ?? null
    return pelosiSamplePerformance()
  }, [actorRow?.performance, name])

  const chartRangeOptions = useMemo(
    () => availablePriceRangesFromTimestamps((dossierPerformance?.daily?.points ?? tradeRows).map((row) => row?.ts).filter(Boolean)),
    [tradeRows, dossierPerformance],
  )

  useEffect(() => {
    setChartRange((prev) => coercePriceRangeFromOptions(prev, chartRangeOptions))
  }, [chartRangeOptions])

  const sectionsLoading = Boolean(caseRowsLoading)
  // While hunting, hide thin stub trades — same as company dossier waiting on explore.
  const showSectionLoading = sectionsLoading

  const trackRecord = useMemo(
    () => (showSectionLoading ? null : buildDailyTrackRecord(dossierPerformance, chartRange)),
    [dossierPerformance, chartRange, showSectionLoading],
  )

  const activity = useMemo(() => (showSectionLoading ? null : buildDossierActivity(tradeRows)), [tradeRows, showSectionLoading])

  const rangeReturnRaw = trackRecord?.stats?.cumulativeReturnRaw
  const rangeReturnPct =
    rangeReturnRaw != null && Number.isFinite(Number(rangeReturnRaw)) ? Number(rangeReturnRaw) : null
  const compactReturnPct =
    compactPriceChangePct != null && Number.isFinite(Number(compactPriceChangePct))
      ? Number(compactPriceChangePct)
      : rangeReturnPct != null
        ? rangeReturnPct * 100
        : null


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
  const heroReturn = heroReturnFromFraction(rangeReturnPct)
  const rawRole = detail && detail !== '—' && detail.toLowerCase() !== modeLabel.toLowerCase() ? detail : null
  const role = rawRole?.replace(/^(house|senate)$/i, (value) => value[0].toUpperCase() + value.slice(1).toLowerCase())
  const sourceLabel = mode === 'politicians'
    ? (/executive|oge/i.test(`${detail} ${role ?? ''}`) || EXECUTIVE_INVESTOR_SLUGS.has(exploreInvestorSlug(name))
      ? 'Executive'
      : /senate/i.test(`${detail} ${role ?? ''}`) || SENATE_INVESTOR_SLUGS.has(exploreInvestorSlug(name))
        ? 'Senate'
        : 'House')
    : 'SEC'
  const portrait = portraits[normalizeInvestorName(name)]
  const sourceMark = sourceLabel === 'Senate'
    ? '/seals/senate.png'
    : sourceLabel === 'House'
      ? '/seals/house.png'
      : '/seals/sec.png'

  const shareLabel = shareState === 'copied' ? 'Copied' : shareState === 'saved' ? 'Saved' : 'Share'
  const onShareClick = () => {
    if (shareState === 'busy') return
    setShareState('busy')
    window.clearTimeout(shareTimer.current)
    void copyDossierShareCard({
      name,
      portraitSrc: portrait?.src || null,
      heroColor: portrait?.hero || null,
      sourceLabel,
      sourceMark,
      aum: activity?.aum && activity.aum !== '—' ? activity.aum : null,
      returnText: heroReturn?.text ?? null,
      tone: heroReturn?.tone ?? '',
      rangeLabel: priceRangeLabel(chartRange),
      range: chartRange,
      ranges: chartRangeOptions,
      points: trackRecord?.points ?? [],
    })
      .then((result) => {
        setShareState(result === 'saved' ? 'saved' : 'copied')
        shareTimer.current = window.setTimeout(() => setShareState('idle'), 1600)
      })
      .catch(() => setShareState('idle'))
  }

  return (
    <DeepReportShell
      scrollResetKey={scrollResetKey ?? name}
      collapsedTitle={name}
      onShareClick={onShareClick}
      shareLabel={shareLabel}
      compactLabel={actorCompactLabel}
      compactPrice={compactPrice}
      compactPriceChange={compactPriceChange}
      compactPriceChangePct={compactReturnPct}
      chrome={chrome}
      expandedHeader={
        <DossierHeroMedia
          src={portrait?.src}
          heroColor={portrait?.hero || null}
          name={name}
          title={name}
          kicker={sourceLabel}
          logo={portrait?.kind === 'logo'}
        />
      }
    >
      <div className="drpt-dossier">
        <div className="drpt-dossierLead">
          <div className="drpt-dossierIntro">
            <div className="drpt-bylineRow">
              <ImageOrInitials className="drpt-bylineMark" src={sourceMark} name={sourceLabel} logo discover={false} />
              <span>by {sourceLabel}</span>
            </div>
            {showSectionLoading && !heroReturn ? (
              <SkeletonReturn />
            ) : heroReturn ? (
              <>
                <p className={`drpt-heroReturn ${heroReturn.tone}`}>{heroReturn.text}</p>
                <p className="drpt-heroSpan">{activity?.since ? `Since ${activity.since}` : priceRangeLabel(chartRange)}</p>
              </>
            ) : (
              <EmptyReturn label="Performance unavailable" />
            )}
          </div>
          <div className="drpt-dossierChart">
            <div className="drpt-figure drpt-figure--chart">
              <DeepTrackRecordChartPanel trackRecord={trackRecord} loading={showSectionLoading} />
            </div>
            <DeepChartRange value={chartRange} onChange={setChartRange} options={chartRangeOptions} />
        </div>
        </div>
        <DeepSection title="Stats">
          <DeepActorMetrics activity={activity} loading={showSectionLoading} />
        </DeepSection>
        <div className="drpt-dossierSide">
          <DeepSection title="Recent trades">
            <DeepTradeLog
              rows={tradeRows}
              loading={showSectionLoading}
              name={name}
              portraitSrc={portrait?.src}
              heroColor={portrait?.hero || null}
              expanded={listsOpen}
            />
          </DeepSection>
          <DeepSection title="Current holdings">
            <DeepHoldings rows={tradeRows} loading={showSectionLoading} expanded={listsOpen} />
          </DeepSection>
          {!listsOpen && ((activity?.filings?.length ?? 0) > 5 || (activity?.holdings?.length ?? 0) > 5) ? (
            <div className="exploreTapeMoreWrap">
              <button type="button" className="exploreTapeMore" onClick={() => setListsOpen(true)}>More</button>
            </div>
          ) : null}
        </div>
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
