import { Fragment, forwardRef, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { toBlob } from 'html-to-image'
import { fetchJsonSafe } from './api.js'
import { useAuth } from './AuthContext.jsx'
import { isCaptureMode } from './captureMode.js'
import { useAlertWatchlist } from './alertsWatchlist.js'
import { useActorAlertWatchlist } from './alertsActorWatchlist.js'
import { investigateActorCanonicalKey } from './investigateActorKey.js'
import { SettingsPanel } from './SettingsPanel.jsx'
import './App.css'
import { markAppReady } from './marketingShell.js'
import { MacroCalendarPanel } from './MacroCalendarPanel.jsx'
import { prefetchMacroCalendar } from './macroClient.js'
import { DeepResearchLayout } from './DeepResearchLayout.jsx'
import { DeepPage } from './DeepCompanyPage.jsx'
import { ExplorePage } from './ExplorePage.jsx'
import { ExploreCompaniesPage } from './ExploreCompaniesPage.jsx'
import { ExploreInvestorsPage } from './ExploreInvestorsPage.jsx'
import { ExploreEventPage } from './ExploreEventPage.jsx'
import {
  applyExploreInvestorFeedSelection,
  exploreInvestorModeFromDocType,
  exploreInvestorModeFromTypeKey,
  exploreInvestorSlug,
  findExploreInvestorInFeedsByName,
  resolveExploreInvestorDossier,
  stubActorRowFromExploreInvestor,
} from './exploreDirectoryNav.js'
import { buildExploreDirectoryFullList } from './exploreDirectoryMock.js'
import {
  isTerminalAppPath,
  navigateExploreBack,
  navigateExploreCompanyDetail,
  navigateExploreEventDetail,
  navigateExploreHome,
  navigateExploreInvestorDetail,
  navigateMacro,
  navigateSettings,
  useTerminalRoute,
} from './terminalRoute.js'
import { formatCountLabel } from './formatCountLabel.js'
import { resolveDocumentOpenUrl } from './documentOpenUrl.js'
import { MiniPriceChart, priceChangeForRange } from './MiniPriceChart.jsx'
import { mockAtDaysAgo, mockDateOnlyDaysAgo, mockFlowAtFromRaw } from './mockDates.js'
import {
  buildMockResearchFeedRows,
  buildMockWeekContextFlows,
  buildMockWeekResearchDocSpecs,
  discoverPastForTicker,
  MOCK_FEED_UNIVERSE,
  MOCK_INSIDER_PEOPLE,
  MOCK_INVESTIGATE_FEED_ROWS,
  MOCK_SEMIS,
  mockFeedTodayEventCount,
  mockIdeaBestForRowIndex,
  mockIdeaFieldsForRow,
  mockInvestigateActorNameForRow,
  mockInvestigateFeedAtForIndex,
  polishOfflineInvestigateActorFeed,
} from './mockWeekData.js'
import { mockShowcasePriceSeries, showcaseCompanyName } from './mockShowcasePrices.js'
import { fetchAnalyseModel } from './analyseClient.js'
import { FEED_INITIAL_PAGE_SIZE, FEED_PAGE_SIZE, feedPageQuery, mergeFeedPages } from './feedPagination.js'
import {
  applyFeedCache,
  FEED_BACKGROUND_REFRESH_MS,
  fetchFeedPage,
  persistFeedCache,
} from './feedLoad.js'
import { EventBriefAnalysis } from './EventBrief.jsx'
import { politicianCommitteeFromRow } from './politicianCommittees.js'
import {
  isCompanyDeepDocumentSource,
  normalizeResearchPaperSourceKey,
  researchPaperSourceTypes,
} from './researchPaperSources.js'
import {
  readChartRange,
  readFilterSet,
  readInvestigateMode,
  UI_PREF_KEYS,
  writeChartRange,
  writeFilterSet,
  writeInvestigateMode,
} from './uiPreferences.js'

const PHONE_VIEWPORT_MQ = '(max-width: 640px)'

function usePhoneViewport() {
  const [isPhone, setIsPhone] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(PHONE_VIEWPORT_MQ).matches,
  )
  useEffect(() => {
    const mq = window.matchMedia(PHONE_VIEWPORT_MQ)
    const onChange = () => setIsPhone(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return isPhone
}

function phonePaneHiddenClass(isPhone, activePane, paneId) {
  if (!isPhone) return ''
  return activePane === paneId ? '' : 'phonePane--hidden'
}

function PhoneSubNav({ items, value, onChange, ariaLabel, className = '' }) {
  return (
    <nav className={['phoneSubNav', className].filter(Boolean).join(' ')} aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={['phoneSubNavBtn', value === item.id ? 'isActive' : ''].filter(Boolean).join(' ')}
          aria-current={value === item.id ? 'page' : undefined}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  )
}


const INVESTIGATE_MODE_OPTIONS = [
  { id: 'insider', label: 'Ins', labelFull: 'Insiders' },
  { id: 'politicians', label: 'Pol', labelFull: 'Politicians' },
  { id: 'institutions', label: 'Inst', labelFull: 'Institutions' },
]

const RESEARCH_PHONE_PANES = [
  { id: 'feed', label: 'Feed' },
  { id: 'paper', label: 'Paper' },
  { id: 'context', label: 'Context' },
]

const INVESTIGATE_PHONE_PANES = [
  { id: 'feed', label: 'Feed' },
  { id: 'case', label: 'Case' },
  { id: 'chart', label: 'Chart' },
]

const ANALYSE_PHONE_PANES = [
  { id: 'feed', label: 'Feed' },
  { id: 'analyse', label: 'Analyse' },
]

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n))
}

const IDEA_SCORE_BEST_THRESHOLD = 75

function ideaHighlightClass(best) {
  return best ? 'ideaHighlight--A' : ''
}

const mockIdeaFields = mockIdeaFieldsForRow

const EMPTY = '-'

function PanelStatusMessage({ label, className = 'panelStatusMessage' }) {
  const text = String(label ?? '').trim() || '\u00a0'
  return (
    <p className={[className, 'mono', 'dim'].filter(Boolean).join(' ')} role="status" aria-live="polite">
      {text}
    </p>
  )
}

function contextMetricsHasData(data, rows) {
  if (!data || typeof data !== 'object') return false
  return (rows ?? []).some((row) => {
    const raw = data[row.key]
    if (raw == null || raw === '') return false
    if (Array.isArray(raw)) return raw.some((v) => v != null && v !== '' && v !== '—' && v !== EMPTY)
    return raw !== '—' && raw !== EMPTY
  })
}

/* Chart area fill under line. */
const CHART_AREA_GRAD_TOP = 'var(--intel-accent-area-top)'
const CHART_AREA_GRAD_BOTTOM = 'var(--intel-accent-area-bottom)'

/** Inline SVG paint: avoids WebKit/CSS cascade quirks on <text> and export rasterizers. */
const GRAPH_SVG_FONT =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
const GRAPH_SVG_TICK = {
  fill: 'rgba(255, 255, 255, 0.42)',
  fontSize: 11,
  fontFamily: GRAPH_SVG_FONT,
  letterSpacing: 0,
}
const GRAPH_SVG_TICK_LINE = { stroke: 'rgba(255, 255, 255, 0.16)', strokeWidth: 1, fill: 'none' }
const GRAPH_SVG_AXIS = { stroke: 'rgba(255, 255, 255, 0.16)', strokeWidth: 0.85, fill: 'none' }
const GRAPH_SVG_PATH = { stroke: 'var(--intel-accent-stroke-strong)', strokeWidth: 2, fill: 'none' }
const GRAPH_SVG_MARKER = { stroke: 'rgba(255, 255, 255, 0.2)', strokeWidth: 0.85, fill: 'none' }
const GRAPH_SVG_MARKER_SEL = { stroke: 'rgba(255, 255, 255, 0.42)', strokeWidth: 0.85, fill: 'none' }

const DIAGRAM_EDGE_STROKE = 'rgba(255, 255, 255, 0.38)'
const DIAGRAM_EDGE_LOOP_STROKE = 'rgba(255, 255, 255, 0.24)'
const DIAGRAM_ARROW_FILL = 'rgba(255, 255, 255, 0.38)'
/** Same base as context EARNINGS / `--context-surface-inset` */
const DIAGRAM_NODE_SURFACE = 'var(--diagram-node-surface)'
const DIAGRAM_NODE_RIM = 'rgba(0, 0, 0, 0.32)'
/** Match price chart area fill (`--intel-accent-area-top` / `--intel-accent-tint`) */
const DIAGRAM_NODE_WASH_A = 'rgba(255, 255, 255, 0.14)'
const DIAGRAM_NODE_WASH_B = 'rgba(255, 255, 255, 0.04)'

/**
 * Drop a leading run of closes equal to the first bar (within tolerance). Some `/api/bars` payloads
 * repeat the same close for a long prefix; plotting that wastes the whole X span on a flat line.
 */
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

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function isSameLocalCalendarDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function graphCalendarDayKey(d) {
  const x = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(x.getTime())) return null
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

/** Map a trade timestamp onto the chart series index (by calendar day, else days-ago from now). */
function graphIndexForTradeDate(dates, tradeDate, { now = new Date() } = {}) {
  const n = Math.max(0, dates?.length ?? 0)
  if (n <= 1) return 0
  const d = tradeDate instanceof Date ? tradeDate : new Date(tradeDate)
  if (Number.isNaN(d.getTime())) return 0
  const key = graphCalendarDayKey(d)
  if (key) {
    for (let i = 0; i < n; i++) {
      const x = dates[i]
      if (!(x instanceof Date) || Number.isNaN(x.getTime())) continue
      if (graphCalendarDayKey(x) === key) return i
    }
  }
  const daysAgo = Math.floor((now.getTime() - d.getTime()) / 86400000)
  return clamp(n - 1 - daysAgo, 0, n - 1)
}

/** Event timestamp falls on today’s calendar day in local time (matches feed date stamps). */
function isAtLocalToday(at) {
  const d = at instanceof Date ? at : new Date(at)
  if (Number.isNaN(d.getTime())) return false
  return isSameLocalCalendarDay(d, new Date())
}

/** Feed count column: worksheet/CASE events for this company on today’s local calendar day only. */
function countCompanyFeedEventsToday(row) {
  const cs = row?.caseSheet
  const sheetRows = cs?.rows
  const formType = String(cs?.formType ?? '')
    .trim()
    .toUpperCase()
  const isMixedAll = formType === 'ALL'
  const isPtr =
    !isMixedAll &&
    (formType === 'PTR' || Boolean(row?.politicians?.length))
  const isForm4 = Boolean(cs?.isForm4)
  if (Array.isArray(sheetRows) && sheetRows.length) {
    let n = 0
    for (const r of sheetRows) {
      if (!r?.ts || !isAtLocalToday(r.ts)) continue
      if (isMixedAll) {
        const kind = caseSheetRowSourceKind(r)
        if (kind === 'politicians') {
          if (!politicianCaseRowHasTxn(r)) continue
        } else if (kind === 'institutions') {
          if (!institutionCaseRowHasTxn(r)) continue
        } else {
          const code = String(r?.transactionCode ?? '').trim()
          const usd = Number(r?.amountUsd ?? 0)
          if (!code && !(Number.isFinite(usd) && usd > 0)) continue
        }
      } else if (isPtr) {
        if (!politicianCaseRowHasTxn(r)) continue
      } else if (!isForm4) {
        continue
      } else {
        const code = String(r?.transactionCode ?? '').trim()
        const usd = Number(r?.amountUsd ?? 0)
        if (!code && !(Number.isFinite(usd) && usd > 0)) continue
      }
      n += 1
    }
    return n
  }
  return 0
}

/** Newest worksheet/CASE txn timestamp for a company feed row (matches CASE panel top row). */
function feedRowLastEventAt(row) {
  let best = null
  let bestT = -Infinity
  for (const r of row?.caseSheet?.rows ?? []) {
    const ts = r?.ts
    if (!ts) continue
    const t = new Date(ts).getTime()
    if (Number.isFinite(t) && t > bestT) {
      bestT = t
      best = ts
    }
  }
  if (best) return best
  const fallback = row?.at ?? row?.feed_at ?? null
  return fallback != null ? String(fallback) : null
}

function feedRowTodayEventCount(row) {
  const preset = Number(row?.mockTodayCount)
  if (Number.isFinite(preset) && preset > 0) return preset
  if (row?.caseSheet?.rows?.length) return countCompanyFeedEventsToday(row)
  const api = Number(row?.count)
  if (Number.isFinite(api) && api >= 0) return api
  return countCompanyFeedEventsToday(row)
}

/** Count label when the company has at least one event today; else hidden. */
function feedRowDisplayCount(row) {
  const n = feedRowTodayEventCount(row)
  return n > 0 ? n : null
}

function normalizeFeedRowActivity(row) {
  const lastAt = feedRowLastEventAt(row)
  const base = lastAt ? { ...row, at: lastAt } : row
  const cs = base.caseSheet
  const caseSheet = cs && lastAt ? { ...cs, filedAt: lastAt } : cs
  return { ...base, caseSheet, count: feedRowDisplayCount(base) }
}

function applyFeedTodayEventCounts(rows) {
  return rows.map((r) => normalizeFeedRowActivity(r))
}

function caseSheetDocumentUrl(cluster, fallback) {
  const filing = cluster?.filing ?? {}
  const dataFiling = cluster?.data?.filing ?? {}
  return (
    trimNonEmpty(fallback?.url) ||
    trimNonEmpty(cluster?.url) ||
    trimNonEmpty(filing.pdf_url) ||
    trimNonEmpty(filing.index_url) ||
    trimNonEmpty(filing.url) ||
    trimNonEmpty(dataFiling.pdf_url) ||
    trimNonEmpty(dataFiling.index_url) ||
    trimNonEmpty(dataFiling.url) ||
    null
  )
}

function trimNonEmpty(v) {
  const s = String(v ?? '').trim()
  return s || null
}

function insiderCaseSheetFromClusterLive(cluster, fallback) {
  const wsRows = Array.isArray(cluster?.cluster?.worksheet_rows) ? cluster.cluster.worksheet_rows : []
  const fallbackName = insiderFallbackNameFromFeed(fallback)
  return {
    filingId: cluster?.filing?.accession_no ?? fallback?.id ?? fallback?.ticker ?? '—',
    formType: cluster?.filing?.form_type ?? 'Form 4',
    issuer: cluster?.issuer?.name ?? fallback?.company ?? fallback?.ticker ?? '—',
    ticker: cluster?.issuer?.ticker ?? fallback?.ticker ?? '—',
    isForm4: true,
    filedAt: cluster?.filing?.filed_at ?? fallback?.at ?? null,
    documentUrl: caseSheetDocumentUrl(cluster, fallback),
    cik: cluster?.issuer?.cik ?? null,
    rows: wsRows.map((r) => {
      const key = String(r?.key ?? '').trim() || 'Insider'
      const bogusKey = isBogusInsiderWorksheetKey(key)
      const insider_name =
        r?.insider_name != null
          ? String(r.insider_name)
          : bogusKey && fallbackName
            ? fallbackName
            : null
      return {
        key: bogusKey && insider_name ? `${r?.role ?? 'OFF'} ${insider_name}` : key,
        role: r?.role != null ? String(r.role) : insiderRoleFromKey(key),
        insider_name,
        surname:
          r?.surname != null
            ? String(r.surname)
            : insider_name
              ? lastName(insider_name)
              : r?.insider_name != null
                ? lastName(r.insider_name)
                : insiderSurnameFromKey(key),
        transactionCode:
          r?.transaction_code != null ? String(r.transaction_code) : r?.code != null ? String(r.code) : 'P',
        acquiredDisposed: r?.acquired_disposed != null ? String(r.acquired_disposed) : 'A',
        amountUsd: r?.amount_usd != null ? Number(r.amount_usd) : null,
        shares: r?.shares != null ? Number(r.shares) : null,
        isDerivative: Boolean(r?.is_derivative ?? r?.derivative),
        ts: r?.ts != null ? String(r.ts) : null,
        url: trimNonEmpty(r?.url) || null,
      }
    }),
  }
}

function politiciansCaseSheetFromClusterLive(cluster, fallback) {
  const wsRows = Array.isArray(cluster?.cluster?.worksheet_rows) ? cluster.cluster.worksheet_rows : []
  const chamberFromRow = wsRows.map((r) => String(r?.chamber ?? '').trim().toLowerCase()).find(Boolean)
  const chamber = chamberFromRow || fallback?.chamber || 'house'
  const filedAt = cluster?.filing?.filed_at ?? fallback?.at ?? null
  const companyName =
    formatCompanyDisplayName(String(cluster?.issuer?.name ?? '').trim()) ||
    formatCompanyDisplayName(String(fallback?.company ?? '').trim()) ||
    fallback?.ticker ||
    '—'
  return {
    filingId: cluster?.filing?.accession_no ?? fallback?.id ?? fallback?.ticker ?? '—',
    formType: cluster?.filing?.form_type ?? 'PTR',
    issuer: companyName,
    ticker: cluster?.issuer?.ticker ?? fallback?.ticker ?? '—',
    isForm4: true,
    filedAt,
    documentUrl: caseSheetDocumentUrl(cluster, fallback),
    cik: cluster?.issuer?.cik ?? null,
    rows: wsRows.map((r) => {
      const fullName = String(r?.key ?? '').trim() || 'Politician'
      return {
        key: fullName,
        politician_name: fullName,
        surname: lastName(fullName),
        chamber: String(r?.chamber ?? chamber).trim().toLowerCase() || chamber,
        committee: String(r?.committee ?? '').trim() || null,
        transactionType:
          r?.transaction_type != null
            ? String(r.transaction_type)
            : r?.description != null
              ? String(r.description)
              : null,
        assetTicker: r?.ticker != null ? String(r.ticker) : fallback?.ticker ?? null,
        assetName: r?.asset_name != null ? String(r.asset_name) : null,
        amountRange: r?.amount_range != null ? String(r.amount_range) : null,
        amountUsd:
          r?.amount_usd_mid != null
            ? Number(r.amount_usd_mid)
            : r?.amount_usd != null
              ? Number(r.amount_usd)
              : null,
        acquiredDisposed: 'A',
        ts: r?.ts != null ? String(r.ts) : filedAt != null ? String(filedAt) : null,
        url: trimNonEmpty(r?.url) || null,
      }
    }),
  }
}

function institutionCaseSheetFromClusterLive(cluster, fallback) {
  const wsRows = Array.isArray(cluster?.cluster?.worksheet_rows) ? cluster.cluster.worksheet_rows : []
  const companyName =
    String(cluster?.issuer?.name ?? '').trim() ||
    String(fallback?.company ?? '').trim() ||
    fallback?.ticker ||
    '—'
  return {
    filingId: cluster?.filing?.accession_no ?? fallback?.id ?? fallback?.ticker ?? '—',
    formType: cluster?.filing?.form_type ?? '13F',
    issuer: companyName,
    ticker: cluster?.issuer?.ticker ?? fallback?.ticker ?? '—',
    isForm4: true,
    filedAt: cluster?.filing?.filed_at ?? fallback?.at ?? null,
    documentUrl: caseSheetDocumentUrl(cluster, fallback),
    cik: cluster?.issuer?.cik ?? null,
    rows: wsRows.map((r) => {
      const filer = String(r?.institution_name ?? r?.key ?? '').trim() || 'Institution'
      return {
        key: filer,
        institution_name: filer,
        surname: filer,
        activity: r?.activity != null ? String(r.activity) : null,
        amountUsd: r?.amount_usd != null ? Number(r.amount_usd) : null,
        ts: r?.ts != null ? String(r.ts) : null,
        url: trimNonEmpty(r?.url) || null,
      }
    }),
  }
}

function patchInvestigateFeedRowFromCluster(rows, ticker, cluster, buildCaseSheet) {
  if (!ticker || !cluster) return rows
  const tick = String(ticker).toUpperCase()
  return rows.map((r) => {
    if (String(r.ticker ?? '').toUpperCase() !== tick) return r
    const caseSheet = buildCaseSheet(cluster, r)
    if (!Array.isArray(caseSheet?.rows) || !caseSheet.rows.length) return r
    // Keep feed sort keys from the API row; cluster data is for CASE panel only.
    return { ...r, caseSheet, at: r.at, count: r.count }
  })
}

function investigateClusterMatchesTicker(cluster, ticker) {
  const want = String(ticker ?? '').trim().toUpperCase()
  if (!want || !cluster) return false
  const got = String(cluster?.issuer?.ticker ?? '').trim().toUpperCase()
  return !got || got === want
}

function feedCountVisible(count) {
  const n = Number(count)
  return Number.isFinite(n) && n > 0
}

function feedRowHasTodayEvents(row) {
  return feedCountVisible(row?.count)
}

/** Investigate FEED: rows with today’s events first, then the rest (newest `at` within each band). */
function sortFeedRowsTodayEventsFirst(rows) {
  const today = []
  const rest = []
  for (const r of rows) {
    if (feedRowHasTodayEvents(r)) today.push(r)
    else rest.push(r)
  }
  const byAt = (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
  return [...today.sort(byAt), ...rest.sort(byAt)]
}

/** Event timestamp falls in the current calendar month (local time). */
function isAtLocalThisMonth(at, ref = new Date()) {
  const d = at instanceof Date ? at : new Date(at)
  const r = ref instanceof Date ? ref : new Date(ref)
  if (Number.isNaN(d.getTime()) || Number.isNaN(r.getTime())) return false
  return d.getFullYear() === r.getFullYear() && d.getMonth() === r.getMonth()
}

function formatMmDd(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}-${dd}`
}

function formatHhMmLocal(d) {
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

/**
 * ISO or Date → feed date label:
 * - today (local): HH:MM
 * - this year: MM-DD
 * - else: YY-MM-DD
 */
function formatFeedDate(at) {
  const d = at instanceof Date ? at : new Date(at)
  if (Number.isNaN(d.getTime())) return EMPTY
  const now = new Date()
  if (isSameLocalCalendarDay(d, now)) return formatHhMmLocal(d)
  // Never show year in feeds; MM-DD is enough.
  return formatMmDd(d)
}

/** When a row sits below the TODAY band, stamp time as MM-DD even if `at` is calendar-today. */
function formatFeedDateForRow(at, { belowTodayBand = false } = {}) {
  if (belowTodayBand) {
    const d = at instanceof Date ? at : new Date(at)
    if (Number.isNaN(d.getTime())) return EMPTY
    return formatMmDd(d)
  }
  return formatFeedDate(at)
}

/** Newest events first (by `at`). */
function sortFeedRowsByAtDesc(rows) {
  return [...rows].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
}

/** Rows for compact feed UI: inserts separators for timeline groups (newest-first lists). */
function buildFeedDisplayRows(items, opts = {}) {
  const sepMode = opts?.sepMode ?? 'today' // today | year | today+years
  const isTodayRow = opts?.isTodayRow ?? ((row) => isAtLocalToday(row?.at))
  const out = []
  const wantTodaySep = sepMode === 'today' || sepMode === 'today+years'
  const wantMonthSep = wantTodaySep || sepMode === 'year' || sepMode === 'today+years'
  const wantYearSeps = sepMode === 'year' || sepMode === 'today+years'

  for (let i = 0; i < items.length; i++) {
    const row = items[i]
    const prev = i > 0 ? items[i - 1] : null

    const gapCandidates = []
    if (wantTodaySep && prev && isTodayRow(prev) && !isTodayRow(row)) {
      gapCandidates.push({ rank: 0, key: `today-sep-before-${row.id}`, label: 'TODAY' })
    }
    if (wantMonthSep && prev && isAtLocalThisMonth(prev.at) && !isAtLocalThisMonth(row.at)) {
      gapCandidates.push({ rank: 1, key: `month-sep-before-${row.id}`, label: 'THIS MONTH' })
    }
    if (wantYearSeps && prev) {
      const y0 = new Date(prev.at).getFullYear()
      const y1 = new Date(row.at).getFullYear()
      const maxYear = new Date().getFullYear() + 1
      if (Number.isFinite(y0) && Number.isFinite(y1) && y1 !== y0 && y1 <= maxYear && y0 <= maxYear) {
        gapCandidates.push({ rank: 2, key: `year-${y1}-sep-before-${row.id}`, label: String(y1) })
      }
    }
    if (gapCandidates.length) {
      if (opts.exclusiveSeps) {
        gapCandidates.sort((a, b) => a.rank - b.rank)
        const g = gapCandidates[0]
        out.push({ type: 'sep', key: g.key, label: g.label })
      } else {
        for (const g of gapCandidates) out.push({ type: 'sep', key: g.key, label: g.label })
      }
    }

    out.push({ type: 'item', row, idx: i })
  }
  return out
}

function buildProgramGroupedDisplayRows(items) {
  const out = []
  let lastGroup = null
  for (let i = 0; i < items.length; i++) {
    const row = items[i]
    const g = row?.group ?? null
    if (g && g !== lastGroup) {
      out.push({ type: 'sep', key: `prog-${g}-${i}`, label: g })
      lastGroup = g
    }
    out.push({ type: 'item', row, idx: i })
  }
  return out
}

function formatProgramTimelineDate(at) {
  const d = at instanceof Date ? at : new Date(at)
  if (Number.isNaN(d.getTime())) return EMPTY
  return formatFeedDate(d)
}

const INSIDER_KINDS = ['P Purchase']
/** Realistic issuer tickers (pair with INSIDER_ISSUERS). */
const INSIDER_TICKERS = MOCK_SEMIS.map((c) => c.ticker)

/** Insider roles for CASE txn rows (WHO column). */
const INSIDER_TXN_ROLES = ['CEO', 'DIR', 'CFO', 'OFF', 'TRUST']

/**

 * Showcase cluster (feed row 0): every Form 4 code / value shape from Option C mocks.
 * `ad`: A = acquired, D = disposed (for signed $ display).
 */
const FORM4_TXN_MOCK_SAMPLES = [
  { role: 'CEO', code: 'P', amountUsd: 12_400_000, ad: 'A' },
  { role: 'CEO', code: 'P', amountUsd: 1_200_000, ad: 'A' },
  { role: 'CEO', code: 'P', amountUsd: 890_000, ad: 'A' },
  { role: 'CEO', code: 'P', amountUsd: 12_400, ad: 'A' },
  { role: 'CEO', code: 'P', amountUsd: 999, ad: 'A' },
  { role: 'CEO', code: 'S', amountUsd: 12_400_000, ad: 'D' },
  { role: 'CEO', code: 'S', amountUsd: 1_200_000, ad: 'D' },
  { role: 'CEO', code: 'S', amountUsd: 890_000, ad: 'D' },
  { role: 'CEO', code: 'S', amountUsd: 12_400, ad: 'D' },
  { role: 'CEO', code: 'S', amountUsd: 999, ad: 'D' },
  { role: 'DIR', code: 'V', amountUsd: 1_200_000, ad: 'A' },
  { role: 'DIR', code: 'V', amountUsd: 890_000, ad: 'D' },
  { role: 'DIR', code: 'V', ad: 'A' },
  { role: 'CFO', code: 'A', amountUsd: 0, ad: 'A' },
  { role: 'CFO', code: 'A', ad: 'A' },
  { role: 'CFO', code: 'A', shares: 45_000, ad: 'A' },
  { role: 'CFO', code: 'A', shares: 1_200_000, ad: 'A' },
  { role: 'CEO', code: 'D', amountUsd: 1_200_000, ad: 'D', isDerivative: true },
  { role: 'CEO', code: 'D', ad: 'D', isDerivative: true },
  { role: 'CEO', code: 'D', shares: 8_000, ad: 'D', isDerivative: true },
  { role: 'OFF', code: 'F', ad: 'D' },
  { role: 'OFF', code: 'F', shares: 2_100, ad: 'D' },
  { role: 'OFF', code: 'F', amountUsd: 0, ad: 'D' },
  { role: 'TRUST', code: 'I', amountUsd: 500_000, ad: 'A' },
  { role: 'TRUST', code: 'I', amountUsd: 200_000, ad: 'D' },
  { role: 'TRUST', code: 'I', ad: 'A' },
  { role: 'CFO', code: 'M', shares: 12_400, ad: 'A' },
  { role: 'CFO', code: 'M', amountUsd: 850_000, ad: 'A' },
  { role: 'CEO', code: 'G', shares: 5_000, ad: 'A' },
  { role: 'CEO', code: 'G', ad: 'D' },
  { role: 'DIR', code: 'C', shares: 1_000, ad: 'A' },
  { role: 'CEO', code: 'E', shares: 3_200, ad: 'D' },
  { role: 'OFF', code: 'H', ad: 'A' },
  { role: 'CEO', code: 'J', shares: 500, ad: 'A' },
  { role: 'DIR', code: 'K', ad: 'D' },
  { role: 'CFO', code: 'L', amountUsd: 120_000, ad: 'A' },
  { role: 'CEO', code: 'O', ad: 'A' },
  { role: 'CEO', code: 'U', shares: 2_000, ad: 'D' },
  { role: 'CEO', code: 'W', shares: 10_000, ad: 'A' },
  { role: 'DIR', code: 'Z', ad: 'D' },
  { role: 'CEO', code: 'P', amountUsd: 50_000, ad: 'A', isDerivative: true },
  { role: 'CEO', code: 'S', amountUsd: 25_000, ad: 'D', isDerivative: true },
  { role: 'CFO', code: 'X', ad: 'A' },
  { role: 'OFF', code: 'P', amountUsd: 340_000, ad: 'A' },
]

const FORM4_TXN_CODES_CYCLE = ['P', 'S', 'A', 'M', 'F', 'G', 'D', 'V', 'I', 'C', 'E', 'H', 'J', 'K', 'L', 'O', 'U', 'W', 'Z', 'X']

const FORM4_TXN_LABELS = {
  P: 'Purchase',
  S: 'Sale',
  A: 'Award / grant',
  M: 'Option exercise',
  F: 'Tax withholding',
  G: 'Gift',
  D: 'Disposition to issuer',
  V: 'Voluntary',
  I: 'Discretionary',
  C: 'Conversion',
  E: 'Expiration',
  H: 'Expiration (short)',
  J: 'Other',
  K: 'Equity swap',
  L: 'Small acquisition',
  O: 'Exercise out-of-the-money',
  U: 'Tender',
  W: 'Will / inheritance',
  Z: 'Voting trust',
  X: 'Exercise in-the-money',
}

/** Shorter FEED filter labels — code letter is shown in the right column. */
const FORM4_TXN_FILTER_LABELS = {
  P: 'Purchase',
  S: 'Sale',
  A: 'Award / grant',
  M: 'Option exercise',
  F: 'Withholding',
  G: 'Gift',
  D: 'To issuer',
  V: 'Voluntary',
  I: 'Discretionary',
  C: 'Conversion',
  E: 'Expiration',
  H: 'Short expiry',
  J: 'Other',
  K: 'Swap',
  L: 'Small buy',
  O: 'OTM exercise',
  U: 'Tender',
  W: 'Inheritance',
  Z: 'Trust',
  X: 'ITM exercise',
}

const INVESTIGATE_INSIDER_TXN_TYPES = FORM4_TXN_CODES_CYCLE.map((id) => ({
  id,
  label: FORM4_TXN_FILTER_LABELS[id] ?? FORM4_TXN_LABELS[id] ?? 'Other',
}))

const INVESTIGATE_POLITICIAN_TXN_TYPES = [
  { id: 'P', label: 'Purchase' },
  { id: 'S', label: 'Sale' },
  { id: 'E', label: 'Exchange' },
]

const INVESTIGATE_INSTITUTION_TXN_TYPES = [
  { id: 'Increased stake', label: 'Increased stake', code: 'INC' },
  { id: 'New position', label: 'New position', code: 'NEW' },
  { id: 'Reduced stake', label: 'Reduced stake', code: 'RED' },
]

const INSTITUTION_ACTIVITY_CYCLE = ['Increased stake', 'New position', 'Reduced stake']

/** 13F activity display in CASE — letter codes + tones (aligned with Form 4 / PTR). */
const INSTITUTION_ACTIVITY_META = {
  'Increased stake': { code: 'INC', tone: 'instInc', label: 'Increased stake' },
  'New position': { code: 'NEW', tone: 'instNew', label: 'New position' },
  'Reduced stake': { code: 'RED', tone: 'instRed', label: 'Reduced stake' },
}

function institutionTxnFromActivity(activity) {
  const key = String(activity ?? '').trim()
  return (
    INSTITUTION_ACTIVITY_META[key] ?? {
      code: key ? key.slice(0, 3).toUpperCase() : '—',
      tone: 'neutral',
      label: key || '13F filing',
    }
  )
}

/** Mock 13F filers for Investigate institutions mode. */
const INSTITUTION_FILERS = [
  'Vanguard Group',
  'BlackRock',
  'Capital Group',
  'State Street Global Advisors',
  'Fidelity Management',
  'T. Rowe Price',
  'Goldman Sachs',
  'Morgan Stanley',
  'JPMorgan Chase',
  'Citadel Advisors',
  'Renaissance Technologies',
  'Perceptive Advisors',
  'Ra Capital',
  'EcoR1 Capital',
  'Wellington Management',
  'Invesco',
]

/** Realistic semis issuers for offline Investigate screenshots. */
const INSIDER_ISSUERS = MOCK_SEMIS.map((c) => c.name)

// Insider pipeline: Form 4 (all SEC transaction codes); Form 3/5 via separate queue types.
const FORM_TYPES_INSIDER = ['Form 4']

// Politicians: mock names used in CASE key column (in place of insider roles).
const POLITICIAN_NAMES = [
  'Nancy Pelosi',
  'Dan Crenshaw',
  'Josh Gottheimer',
  'Ro Khanna',
  'Tommy Tuberville',
  'Michael McCaul',
  'John Thune',
  'Mark Kelly',
  'Gina Raimondo',
  'Bernie Sanders',
  'Ted Cruz',
  'Marco Rubio',
]

/** CASE chamber column (House / Senate / Executive). */
function politicianChamberCode(chamber) {
  const k = String(chamber ?? 'house').trim().toLowerCase()
  if (k === 'senate') return 'SEN'
  if (k === 'executive') return 'EXE'
  if (k === 'house') return 'HSE'
  return 'PTR'
}

function politicianChamberLabelFromCode(code) {
  const c = String(code ?? '').trim().toUpperCase()
  if (c === 'SEN') return 'Senate'
  if (c === 'EXE') return 'Executive'
  if (c === 'HSE') return 'House'
  return 'House'
}

function politicianWhoDetail(fullName, chamberCode) {
  return politicianChamberLabelFromCode(chamberCode)
}

function politicianWhoCommittee(rowOrName) {
  if (rowOrName && typeof rowOrName === 'object') {
    return politicianCommitteeFromRow(rowOrName)
  }
  return ''
}

function politicianDisplayNameFromRow(r) {
  const full = String(r?.whoFullName ?? '').trim()
  if (full.includes(',')) {
    const after = full.split(',').pop()?.trim()
    if (after) return after
  }
  return full
}

/** Match politician names (full, partial, or last name) against a feed search query. */
function politicianNamesMatchQuery(names, query) {
  const tokens = String(query ?? '')
    .trim()
    .toUpperCase()
    .split(/[\s,]+/)
    .filter(Boolean)
  if (!tokens.length) return false
  for (const raw of names) {
    const n = String(raw ?? '').trim().toUpperCase()
    if (!n) continue
    const parts = n.split(/\s+/).filter(Boolean)
    const last = parts.at(-1) ?? ''
    if (
      tokens.every(
        (tok) =>
          n.includes(tok) ||
          last === tok ||
          last.startsWith(tok) ||
          parts.some((p) => p === tok || p.startsWith(tok)),
      )
    ) {
      return true
    }
  }
  return false
}

function politicianFeedRowNames(row) {
  const names = new Set()
  for (const p of row?.politicians ?? []) {
    const v = String(p ?? '').trim()
    if (v) names.add(v)
  }
  for (const r of row?.caseSheet?.rows ?? []) {
    const full = String(r?.politician_name ?? r?.key ?? '').trim()
    if (full) names.add(full)
    if (r?.surname) names.add(String(r.surname))
    const fromKey = lastName(r?.key)
    if (fromKey && fromKey !== '—') names.add(fromKey)
  }
  return [...names]
}

function politicianFeedRowMatchesCompanyQuery(row, queryRaw) {
  const s = String(queryRaw ?? '').trim().toUpperCase()
  if (!s) return true
  const ticker = String(row?.ticker ?? '').toUpperCase()
  const company = String(row?.company ?? '').toUpperCase()
  return ticker.includes(s) || company.includes(s)
}

/** Politicians FEED: companies where a disclosed politician matches the query. */
function politicianFeedRowMatchesPoliticianQuery(row, queryRaw) {
  const s = String(queryRaw ?? '').trim()
  if (!s) return true
  return politicianNamesMatchQuery(politicianFeedRowNames(row), s)
}

function institutionFeedRowNames(row) {
  const names = new Set()
  for (const p of row?.institutions ?? []) {
    const v = String(p ?? '').trim()
    if (v) names.add(v)
  }
  for (const r of row?.caseSheet?.rows ?? []) {
    const full = String(r?.institution_name ?? r?.key ?? '').trim()
    if (full) names.add(full)
    if (r?.surname) names.add(String(r.surname))
  }
  return [...names]
}

function institutionFeedRowMatchesInstitutionQuery(row, queryRaw) {
  const s = String(queryRaw ?? '').trim()
  if (!s) return true
  return politicianNamesMatchQuery(institutionFeedRowNames(row), s)
}

function caseTxnPersonNameMatchesQuery(row, queryRaw) {
  const s = String(queryRaw ?? '').trim()
  if (!s) return false
  const names = Array.isArray(row?.matchNames)
    ? row.matchNames.map((x) => String(x))
    : row?.whoName
      ? [String(row.whoName)]
      : []
  return politicianNamesMatchQuery(names, s)
}

function insiderFeedRowPersonNames(row) {
  const names = new Set()
  for (const p of row?.insiders ?? []) {
    const raw = String(p ?? '').trim()
    if (!raw) continue
    const s = insiderSurnameFromKey(raw) || lastName(raw)
    if (s && s !== '—') names.add(s)
  }
  for (const r of row?.caseSheet?.rows ?? []) {
    const full = String(r?.insider_name ?? r?.person ?? insiderReportingOwnerName(r) ?? '').trim()
    if (full) names.add(full)
    if (r?.surname) names.add(String(r.surname))
    const fromKey = insiderSurnameFromKey(r?.key)
    if (fromKey) names.add(fromKey)
    if (r?.insider_name) {
      const n = lastName(r.insider_name)
      if (n && n !== '—') names.add(n)
    }
  }
  return [...names]
}

function insiderFeedRowMatchesCompanyQuery(row, queryRaw) {
  const s = String(queryRaw ?? '').trim().toUpperCase()
  if (!s) return true
  const ticker = String(row?.ticker ?? '').toUpperCase()
  const company = String(row?.company ?? '').toUpperCase()
  return ticker.includes(s) || company.includes(s)
}

function insiderFeedRowMatchesPersonQuery(row, queryRaw) {
  const s = String(queryRaw ?? '').trim()
  if (!s) return true
  return politicianNamesMatchQuery(insiderFeedRowPersonNames(row), s)
}

/** Investigate FEED: one query matches company/ticker or person/institution name. */
function investigateFeedRowMatchesSearch(row, queryRaw, mode) {
  const q = String(queryRaw ?? '').trim()
  if (!q) return true
  if (mode === 'insider') {
    return (
      insiderFeedRowMatchesCompanyQuery(row, q) || insiderFeedRowMatchesPersonQuery(row, q)
    )
  }
  if (mode === 'politicians') {
    return (
      politicianFeedRowMatchesCompanyQuery(row, q) ||
      politicianFeedRowMatchesPoliticianQuery(row, q)
    )
  }
  if (mode === 'institutions') {
    return (
      politicianFeedRowMatchesCompanyQuery(row, q) ||
      institutionFeedRowMatchesInstitutionQuery(row, q)
    )
  }
  return true
}

const INVESTIGATE_SOURCE_ROLE_SHORT = {
  insider: 'INS',
  politicians: 'POL',
  institutions: 'INST',
}

function investigateSourceRoleShort(mode) {
  return INVESTIGATE_SOURCE_ROLE_SHORT[mode] ?? 'INS'
}

function investigateTxnFiltersForMode(filters, mode) {
  if (filters && typeof filters === 'object' && filters.insider instanceof Set) {
    return mode === 'politicians'
      ? filters.politicians
      : mode === 'institutions'
        ? filters.institutions
        : filters.insider
  }
  return filters
}

function investigateActorKeyFromCaseRow(r, mode) {
  if (mode === 'politicians') {
    const name = String(r?.politician_name ?? r?.person ?? r?.key ?? '')
      .trim()
      .toLowerCase()
    const chamber = String(r?.chamber ?? '').trim().toLowerCase()
    return name ? `${chamber}:${name}` : ''
  }
  if (mode === 'institutions') {
    return String(r?.institution_name ?? r?.key ?? '').trim().toLowerCase()
  }
  const full = insiderReportingOwnerName(r) || String(r?.insider_name ?? r?.key ?? '').trim()
  return full.toLowerCase() || String(r?.key ?? '').trim().toLowerCase()
}

function investigateActorFullNameFromCaseRow(r, mode) {
  if (mode === 'politicians') {
    return String(r?.politician_name ?? r?.person ?? r?.key ?? '').trim()
  }
  if (mode === 'institutions') {
    return String(r?.institution_name ?? r?.key ?? '').trim()
  }
  return insiderReportingOwnerName(r) || String(r?.insider_name ?? r?.key ?? '').trim()
}

function investigateActorDetailFromCaseRow(r, mode) {
  if (mode === 'politicians') {
    return politicianChamberLabelFromCode(politicianChamberCode(r?.chamber))
  }
  if (mode === 'institutions') {
    return institutionFilerLabelFromFilingName(investigateActorFullNameFromCaseRow(r, mode))
  }
  const role = r?.role ? String(r.role).toUpperCase() : insiderRoleFromKey(r?.key)
  return role || 'Insider'
}

function investigateActorDetailSecondaryFromCaseRow(r, mode) {
  if (mode !== 'politicians') return ''
  return politicianWhoCommittee(r)
}

function investigateActorTxnEntryFromCompanyRow(companyRow, sheetRow, mode) {
  const ticker = String(sheetRow?.assetTicker ?? companyRow?.ticker ?? '')
    .trim()
    .toUpperCase()
  const company = String(
    sheetRow?.assetName ?? companyRow?.company ?? companyRow?.caseSheet?.issuer ?? '',
  ).trim()
  return {
    sheetRow,
    ticker,
    company,
    companyRow,
    showMoney: Boolean(companyRow?.caseSheet?.isForm4),
    ts: sheetRow?.ts ?? companyRow?.at ?? null,
    source: mode,
  }
}

function investigateActorCaseRowCountsToday(txn, mode) {
  const r = txn?.sheetRow
  if (!r?.ts || !isAtLocalToday(r.ts)) return 0
  if (mode === 'politicians') {
    return politicianCaseRowHasTxn(r) ? 1 : 0
  }
  if (mode === 'institutions') {
    return institutionCaseRowHasTxn(r) ? 1 : 0
  }
  if (!txn.showMoney) return 0
  const code = String(r?.transactionCode ?? '').trim()
  const usd = Number(r?.amountUsd ?? 0)
  return code || (Number.isFinite(usd) && usd > 0) ? 1 : 0
}

function countActorFeedEventsToday(actorRow) {
  let n = 0
  for (const txn of actorRow?.transactions ?? []) {
    n += investigateActorCaseRowCountsToday(txn, txn.source ?? actorRow.source ?? 'insider')
  }
  return n
}

function normalizeInvestigateActorFeedRow(actor) {
  let bestAt = null
  let bestT = -Infinity
  for (const txn of actor.transactions ?? []) {
    const ts = txn?.ts
    if (!ts) continue
    const t = new Date(ts).getTime()
    if (Number.isFinite(t) && t > bestT) {
      bestT = t
      bestAt = ts
    }
  }
  const countN =
    Number.isFinite(Number(actor._mockTodayCount)) && Number(actor._mockTodayCount) > 0
      ? Number(actor._mockTodayCount)
      : countActorFeedEventsToday(actor)
  return {
    ...actor,
    at: bestAt ?? actor.at ?? null,
    count: countN > 0 ? countN : null,
  }
}

function buildInvestigateActorFeed(companyRows, mode) {
  const byActor = new Map()
  for (const companyRow of companyRows ?? []) {
    const cs = companyRow?.caseSheet
    if (!Array.isArray(cs?.rows) || !cs.rows.length) continue
    for (const sheetRow of cs.rows) {
      if (mode === 'politicians') {
        if (!politicianCaseRowHasTxn(sheetRow)) continue
      } else if (mode === 'institutions') {
        if (!institutionCaseRowHasTxn(sheetRow)) continue
      } else if (!cs.isForm4) {
        continue
      }
      const actorKey = investigateActorKeyFromCaseRow(sheetRow, mode)
      if (!actorKey) continue
      const entry = investigateActorTxnEntryFromCompanyRow(companyRow, sheetRow, mode)
      const fullName = investigateActorFullNameFromCaseRow(sheetRow, mode)
      const canonicalKey = investigateActorCanonicalKey(fullName, mode)
      let actor = byActor.get(actorKey)
      if (!actor) {
        actor = {
          id: `${mode}:${actorKey}`,
          actorKey,
          canonicalKey,
          actorRole: investigateSourceRoleShort(mode),
          actorName: fullName,
          actorDetail: investigateActorDetailFromCaseRow(sheetRow, mode),
          actorDetailSecondary: investigateActorDetailSecondaryFromCaseRow(sheetRow, mode),
          matchNames: [
            ...new Set(
              [fullName, lastName(fullName), institutionDisplayShortName(fullName)].filter(Boolean),
            ),
          ],
          source: mode,
          sources: [mode],
          transactions: [],
          at: null,
          count: null,
          idea_score: Number(companyRow.idea_score) || 0,
          idea_best: Boolean(companyRow.idea_best),
        }
        byActor.set(actorKey, actor)
      }
      actor.transactions.push(entry)
      actor.idea_score = Math.max(actor.idea_score, Number(companyRow.idea_score) || 0)
      actor.idea_best = actor.idea_best || Boolean(companyRow.idea_best)
    }
  }
  const out = []
  for (const actor of byActor.values()) {
    actor.transactions.sort((a, b) => new Date(b.ts ?? 0).getTime() - new Date(a.ts ?? 0).getTime())
    if (!actor.transactions.length) continue
    out.push(normalizeInvestigateActorFeedRow(actor))
  }
  return out
}

function investigateActorFeedRowMatchesSearch(row, queryRaw) {
  const q = String(queryRaw ?? '').trim()
  if (!q) return true
  if (politicianNamesMatchQuery([row?.actorName, ...(row?.matchNames ?? [])], q)) return true
  const qu = q.toUpperCase()
  for (const txn of row?.transactions ?? []) {
    const ticker = String(txn?.ticker ?? '').toUpperCase()
    const company = String(txn?.company ?? '').toUpperCase()
    if (ticker.includes(qu) || company.includes(qu)) return true
  }
  return false
}

function caseSheetRowToCompanyCaseFeedRow(r, { ticker, company, showMoney, mode, documentUrl = null, cik = null, filingId = null }) {
  const base =
    mode === 'politicians'
      ? caseSheetRowToPoliticianTxnFeedRow(r, { showMoney })
      : mode === 'institutions'
        ? caseSheetRowToInstitutionTxnFeedRow(r, { showMoney })
        : caseSheetRowToTxnFeedRow(r, { showMoney })
  if (!base) return null
  const tick = String(ticker ?? '').trim().toUpperCase()
  const companyName = String(company ?? '').trim() || tick
  return {
    ...base,
    layout: 'txnCompany',
    ticker: tick,
    companyName,
    matchCompanies: [tick, companyName],
    __source: mode,
    url: trimNonEmpty(r?.url) || trimNonEmpty(documentUrl) || null,
    documentUrl: trimNonEmpty(documentUrl) || trimNonEmpty(r?.url) || null,
    cik: cik ?? null,
    filingId: filingId ?? null,
    accession: filingId ?? null,
    chamber: r?.chamber ?? base.chamber ?? null,
  }
}

function buildActorCaseFeedRows(actorRow, filters, chartRange) {
  if (!actorRow?.transactions?.length) return []
  const trades = []
  for (const txn of actorRow.transactions) {
    const txnMode = txn.source ?? actorRow.source ?? 'insider'
    const enabled = investigateTxnFiltersForMode(filters, txnMode)
    if (!investigateCaseRowPassesTxnFilter(txn.sheetRow, enabled, txnMode)) continue
    const row = caseSheetRowToCompanyCaseFeedRow(txn.sheetRow, {
      ticker: txn.ticker,
      company: txn.company,
      showMoney: txn.showMoney,
      mode: txnMode,
      documentUrl: txn.companyRow?.caseSheet?.documentUrl ?? txn.companyRow?.url ?? null,
      cik: txn.companyRow?.caseSheet?.cik ?? null,
      filingId: txn.companyRow?.caseSheet?.filingId ?? null,
    })
    if (row) trades.push(row)
  }
  trades.sort((a, b) => new Date(b.ts ?? 0).getTime() - new Date(a.ts ?? 0).getTime())
  return appendCaseTxnTimeline([], filterCaseTradesForPriceRange(trades, chartRange), 'today+years', {
    priceRange: chartRange,
  })
}

function actorPersonDisplayFromRow(actorRow) {
  if (!actorRow?.actorName) return null
  return {
    fullName: actorRow.actorName,
    detail: String(actorRow.actorDetail ?? '').trim() || EMPTY,
    detailSecondary: String(actorRow.actorDetailSecondary ?? '').trim(),
  }
}

function findCompanyFeedRowByTicker(rows, ticker) {
  const want = String(ticker ?? '').trim().toUpperCase()
  if (!want) return null
  return (rows ?? []).find((r) => String(r?.ticker ?? '').trim().toUpperCase() === want) ?? null
}

function tagInvestigateFeedSource(rows, source) {
  return (rows ?? []).map((r) => ({ ...r, __investigateSource: source }))
}

function pickNewerFeedAt(a, b) {
  const ta = new Date(a ?? 0).getTime()
  const tb = new Date(b ?? 0).getTime()
  if (!Number.isFinite(ta)) return b ?? a ?? null
  if (!Number.isFinite(tb)) return a ?? b ?? null
  return tb > ta ? b : a
}

function mergeFeedRowTodayCounts(a, b) {
  const ca = feedRowTodayEventCount(a)
  const cb = feedRowTodayEventCount(b)
  const sum = (Number.isFinite(ca) ? ca : 0) + (Number.isFinite(cb) ? cb : 0)
  return sum > 0 ? sum : ca ?? cb ?? null
}

function pickBetterFeedCompanyName(a, b, ticker) {
  const na = String(a?.company ?? '').trim()
  const nb = String(b?.company ?? '').trim()
  const aOk = isPlausibleFeedCompanyName(na, ticker)
  const bOk = isPlausibleFeedCompanyName(nb, ticker)
  if (aOk && !bOk) return na
  if (bOk && !aOk) return nb
  if (na.length >= nb.length) return na || nb
  return nb || na
}

/** ALL mode FEED: one row per ticker, tracking which sources contributed. */
function dedupeInvestigateFeedByTicker(rows) {
  const byTicker = new Map()
  for (const row of rows ?? []) {
    const ticker = String(row?.ticker ?? '').trim().toUpperCase()
    if (!ticker) continue
    const src = row.__investigateSource
    const prev = byTicker.get(ticker)
    if (!prev) {
      byTicker.set(ticker, {
        ...row,
        id: `all:${ticker}`,
        ticker,
        __investigateSources: src ? [src] : [],
        __sourceRows: src ? { [src]: row } : {},
      })
      continue
    }
    const sources =
      src && !prev.__investigateSources.includes(src)
        ? [...prev.__investigateSources, src]
        : prev.__investigateSources
    const sourceRows = src ? { ...prev.__sourceRows, [src]: row } : prev.__sourceRows
    const at = pickNewerFeedAt(prev.at, row.at)
    const count = mergeFeedRowTodayCounts(prev, row)
    const company = pickBetterFeedCompanyName(prev, row, ticker)
    const ideaScore = Math.max(Number(prev.idea_score) || 0, Number(row.idea_score) || 0)
    byTicker.set(ticker, {
      ...prev,
      company,
      at,
      count,
      idea_score: ideaScore || prev.idea_score || row.idea_score,
      idea_best: Boolean(prev.idea_best || row.idea_best || ideaScore >= IDEA_SCORE_BEST_THRESHOLD),
      __investigateSources: sources,
      __sourceRows: sourceRows,
      insiders: [...new Set([...(prev.insiders ?? []), ...(row.insiders ?? [])])],
      politicians: [...new Set([...(prev.politicians ?? []), ...(row.politicians ?? [])])],
      institutions: [...new Set([...(prev.institutions ?? []), ...(row.institutions ?? [])])],
    })
  }
  return [...byTicker.values()].map((r) => normalizeFeedRowActivity(r))
}

function caseSheetRowSourceKind(r) {
  if (r?.politician_name != null || r?.chamber != null) return 'politicians'
  if (r?.institution_name != null || (r?.activity != null && r?.transactionCode == null)) return 'institutions'
  return 'insider'
}

const ALL_INVESTIGATE_SOURCES = ['insider', 'politicians', 'institutions']

function allModeSourceKinds(row) {
  const srcs = row?.__investigateSources
  if (Array.isArray(srcs) && srcs.length) return srcs
  return ALL_INVESTIGATE_SOURCES
}

function findInvestigateFeedRowByTicker(rows, ticker) {
  const want = String(ticker ?? '').trim().toUpperCase()
  if (!want) return null
  return (rows ?? []).find((r) => String(r.ticker ?? '').trim().toUpperCase() === want) ?? null
}

function allModeSourceFeedRow(kind, { selected, ticker, feedRows }) {
  const fromFeed = findInvestigateFeedRowByTicker(feedRows, ticker)
  if (fromFeed) return fromFeed
  return selected?.__sourceRows?.[kind] ?? null
}

function resolveInvestigateCaseSheetForSource(
  kind,
  { ticker, cluster, sourceRow, fallbackRow, filters, backendUp = false },
) {
  const want = String(ticker ?? '').trim().toUpperCase()
  if (!want) return null
  const row = sourceRow ?? fallbackRow
  if (backendUp && investigateClusterMatchesTicker(cluster, want)) {
    const fromCluster =
      kind === 'insider'
        ? insiderCaseSheetFromClusterLive(cluster, row)
        : kind === 'politicians'
          ? politiciansCaseSheetFromClusterLive(cluster, row)
          : institutionCaseSheetFromClusterLive(cluster, row)
    if (fromCluster?.rows?.length) return fromCluster
  }
  if (!row) return null
  const filtered = applyInvestigateTxnFilterToFeedRow(row, filters, kind)
  const cs = filtered?.caseSheet
  return Array.isArray(cs?.rows) && cs.rows.length ? cs : null
}

function allModeCaseTradesFromFeedRow(row, filters, mode, toRow, source) {
  if (!row) return []
  const resolved = applyInvestigateTxnFilterToFeedRow(row, filters, mode)
  const cs = resolved?.caseSheet
  if (!cs?.rows?.length) return []
  const showMoney = Boolean(cs.isForm4)
  const out = []
  for (const r of cs.rows) {
    if (!investigateCaseRowPassesTxnFilter(r, filters, mode)) continue
    const trade = toRow(r, { showMoney })
    if (trade) out.push({ ...trade, __source: source })
  }
  return out
}

function collectAllModeCaseSheets({
  selected,
  insiderCluster,
  politiciansCluster,
  institutionsCluster,
  feedFallbacks,
  filters,
  backendUp = false,
}) {
  if (!selected) return []
  const ticker = String(selected.ticker ?? '').trim().toUpperCase()
  const sourceRows = selected.__sourceRows ?? {}
  const sheets = []
  for (const kind of allModeSourceKinds(selected)) {
    const cluster =
      kind === 'insider'
        ? insiderCluster
        : kind === 'politicians'
          ? politiciansCluster
          : institutionsCluster
    const feedRows =
      kind === 'insider'
        ? feedFallbacks?.insider
        : kind === 'politicians'
          ? feedFallbacks?.politicians
          : feedFallbacks?.institutions
    const sourceRow = allModeSourceFeedRow(kind, { selected, ticker, feedRows })
    const filterSet =
      kind === 'politicians'
        ? filters?.politicians
        : kind === 'institutions'
          ? filters?.institutions
          : filters?.insider
    const cs = resolveInvestigateCaseSheetForSource(kind, {
      ticker,
      cluster,
      sourceRow,
      fallbackRow: selected,
      filters: filterSet,
      backendUp,
    })
    if (cs?.rows?.length) sheets.push(cs)
  }
  return sheets
}

function buildAllModeCaseFeedTrades({
  selected,
  insiderCluster,
  politiciansCluster,
  institutionsCluster,
  feedFallbacks,
  filters,
  backendUp = false,
}) {
  if (!selected) return []
  const ticker = String(selected.ticker ?? '').trim().toUpperCase()
  const trades = []
  for (const kind of allModeSourceKinds(selected)) {
    const cluster =
      kind === 'insider'
        ? insiderCluster
        : kind === 'politicians'
          ? politiciansCluster
          : institutionsCluster
    const feedRows =
      kind === 'insider'
        ? feedFallbacks?.insider
        : kind === 'politicians'
          ? feedFallbacks?.politicians
          : feedFallbacks?.institutions
    const sourceRow = allModeSourceFeedRow(kind, { selected, ticker, feedRows })
    const filterSet =
      kind === 'politicians'
        ? filters.politicians
        : kind === 'institutions'
          ? filters.institutions
          : filters.insider
    if (kind === 'insider') {
      trades.push(
        ...allModeCaseTradesFromFeedRow(
          sourceRow,
          filterSet,
          'insider',
          caseSheetRowToTxnFeedRow,
          'insider',
        ),
      )
    } else if (kind === 'politicians') {
      trades.push(
        ...allModeCaseTradesFromFeedRow(
          sourceRow,
          filterSet,
          'politicians',
          caseSheetRowToPoliticianTxnFeedRow,
          'politicians',
        ),
      )
    } else {
      trades.push(
        ...allModeCaseTradesFromFeedRow(
          sourceRow,
          filterSet,
          'institutions',
          caseSheetRowToInstitutionTxnFeedRow,
          'institutions',
        ),
      )
    }
    if (backendUp && investigateClusterMatchesTicker(cluster, ticker)) {
      const cs = resolveInvestigateCaseSheetForSource(kind, {
        ticker,
        cluster,
        sourceRow,
        fallbackRow: selected,
        filters: filterSet,
        backendUp: true,
      })
      if (cs?.rows?.length) {
        const showMoney = Boolean(cs.isForm4)
        const toRow =
          kind === 'politicians'
            ? caseSheetRowToPoliticianTxnFeedRow
            : kind === 'institutions'
              ? caseSheetRowToInstitutionTxnFeedRow
              : caseSheetRowToTxnFeedRow
        const seen = new Set(trades.map((t) => `${t.who}-${t.code}-${t.ts}`))
        for (const r of cs.rows) {
          if (!investigateCaseRowPassesTxnFilter(r, filterSet, kind)) continue
          const row = toRow(r, { showMoney })
          if (!row) continue
          const key = `${row.who}-${row.code}-${row.ts}`
          if (seen.has(key)) continue
          seen.add(key)
          trades.push({ ...row, __source: kind })
        }
      }
    }
  }
  trades.sort((a, b) => {
    const ta = new Date(a?.ts ?? 0).getTime()
    const tb = new Date(b?.ts ?? 0).getTime()
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0)
  })
  return trades
}

function mergeAllModeCaseSheets(sheets) {
  const valid = (sheets ?? []).filter((cs) => Array.isArray(cs?.rows) && cs.rows.length)
  if (!valid.length) return null
  const allRows = []
  for (const cs of valid) {
    for (const r of cs.rows) allRows.push(r)
  }
  allRows.sort((a, b) => {
    const ta = new Date(a?.ts ?? 0).getTime()
    const tb = new Date(b?.ts ?? 0).getTime()
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0)
  })
  const first = valid[0]
  const ticker = String(first?.ticker ?? '').trim().toUpperCase()
  const issuer =
    valid.map((cs) => String(cs?.issuer ?? '').trim()).find((n) => isPlausibleFeedCompanyName(n, ticker)) ||
    String(first?.issuer ?? '').trim() ||
    ticker ||
    '—'
  return {
    filingId: first.filingId ?? ticker,
    formType: 'ALL',
    issuer,
    ticker: first.ticker ?? ticker,
    isForm4: true,
    filedAt: allRows[0]?.ts ?? first.filedAt ?? null,
    rows: allRows,
  }
}

// ------------------------------------------------------------
// Research tab — mock causal graph system
// ------------------------------------------------------------
const RESEARCH_TICKER_MARKET = 'ASML'

const MOCK_ASML_FEED_ROW = {
  rowKey: 'fb-ASML',
  ticker: 'ASML',
  name: 'ASML Holding N.V.',
  at: mockAtDaysAgo(0, 11, 10),
  ...mockIdeaFields(0, 'research'),
}

/** Research feed — one row per issuer, activity staggered across the week. */
const RESEARCH_FEED_ROWS = buildMockResearchFeedRows()

function formatCompanyDisplayName(name) {
  let s = String(name ?? '').trim()
  if (!s) return s
  s = s
    .replace(/\s+common\s+stock$/i, '')
    .replace(/\s+class\s+[a-z0-9]+$/i, '')
    .trim()
  const letters = s.replace(/[^A-Za-z]/g, '')
  const upperLetters = letters.replace(/[^A-Z]/g, '').length
  const secStyle = letters.length > 0 && upperLetters / letters.length >= 0.8
  if (!secStyle) return s
  s = s
    .replace(/\s*\/DE\/\s*$/i, '')
    .replace(/\s+DEL\s*$/i, '')
    .replace(/\s+PLC\s+IRELAND\s*$/i, '')
    .replace(/\s+PLC\s*$/i, '')
    .replace(/\s+CORP(?:ORATION)?\.?\s*$/i, '')
    .replace(/\s+INC(?:ORPORATED)?\.?\s*$/i, '')
    .replace(/\s+CO\.?\s*$/i, '')
    .replace(/\s+LTD\.?\s*$/i, '')
    .replace(/\s+LIMITED\s*$/i, '')
    .replace(/\s+LLC\.?\s*$/i, '')
    .trim()
  if (!s) return s
  const small = new Set(['of', 'the', 'and', 'or', 'in', 'for', 'a', 'an', 'to', 'at', 'by', 'on'])
  return s
    .split(/\s+/)
    .map((w, i) => {
      const lower = w.toLowerCase()
      if (i > 0 && small.has(lower)) return lower
      if (/^[A-Z]\.?[A-Z]\.?$/.test(w)) return w
      if (w.length <= 3 && /^[A-Z]+$/.test(w)) return w
      return lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join(' ')
}

/** Middle FEED column: full company name from DB (never memo headline / feed_label). */
function isPlausibleFeedCompanyName(name, ticker) {
  const n = String(name ?? '').trim()
  const t = String(ticker ?? '').trim().toUpperCase()
  if (!n || n.toUpperCase() === t) return false
  if (n.length > 72) return false
  if (/->|⇒|=>|→/.test(n)) return false
  if (/\b(LOCATION|DESCRIPTION|Dividends|Real estate|Agency Account|Rent None)\b/i.test(n)) return false
  if (/\bIRa\b/i.test(n)) return false
  if (/g f e d c/i.test(n)) return false
  if (/\[[A-Z]{1,5}\]/.test(n)) return false
  if ((n.match(/\s+/g) ?? []).length >= 9) return false
  if (/\$\d/.test(n)) return false
  return true
}

function researchFeedRowLabel(item) {
  const ticker = String(item?.ticker ?? '').trim().toUpperCase()
  const companyName = String(item?.company_name ?? item?.company ?? item?.name ?? '').trim()
  if (companyName && isPlausibleFeedCompanyName(companyName, ticker)) {
    return formatCompanyDisplayName(companyName)
  }
  return ticker
}

/** Offline curated feed rows (RESEARCH_FEED_ROWS) — no live feed_kind metadata. */
function isOfflineCuratedResearchFeedRow(row) {
  const key = String(row?.rowKey ?? row?.id ?? '')
  return key.startsWith('fb-')
}

function isOfflineShowcaseResearchTicker(ticker) {
  const t = String(ticker ?? '').trim().toUpperCase()
  return t === 'ASML'
}

/** Offline research/analyse feed — always includes ASML showcase row. */
function offlineResearchFeed() {
  const base = RESEARCH_FEED_ROWS
  const seen = new Set(base.map((x) => String(x.ticker ?? '').toUpperCase()))
  if (seen.has('ASML')) return base
  return sortFeedRowsByAtDesc([MOCK_ASML_FEED_ROW, ...base])
}


const RESEARCH_ALLOWED_EDGE_TYPES = new Set([
  'catalyst',
  'timing_link',
  'insider_activity',
  'political_exposure',
  'indirect_risk',
  'initiated_by',
  'affects',
])

function mockPriceSeries(seed, n = 400) {
  let v = 80 + (seed % 23)
  const out = []
  for (let i = 0; i < n; i++) {
    const drift = 0.08 + ((seed % 7) - 3) * 0.012
    const noise = (seededJitter(seed + i * 29, 10) - 5) * 0.22
    v = Math.max(12, v + drift + noise)
    out.push(Math.round(v * 100) / 100)
  }
  return out
}

function _explainerForTicker(ticker) {
  const t = String(ticker ?? '').toUpperCase()
  if (t === 'ASML') {
    return [
      'ASML remains the bottleneck supplier for leading-edge EUV capacity.',
      'Downstream AI demand can reprice faster than upstream lithography constraints.',
      'Track filings and policy signals that tighten or ease EUV allocation pressure.',
    ]
  }
  return [
    `${t} is being reviewed through a market-first lens focused on filings and flow timing.`,
    'Focus on dated disclosures and whether signal quality improves into known windows.',
    'Use this paper to map what changed first, what followed, and what likely comes next.',
  ]
}

function buildMockResearchDatasetForTicker(ticker) {
  const t = String(ticker ?? '').toUpperCase()
  const co = MOCK_SEMIS.find((c) => c.ticker === t)
  const narratives = discoverPastForTicker(t)
  const eventSource =
    narratives.length > 0
      ? narratives
      : [
          {
            title: `${t} supply-chain and demand update`,
            kind: 'filing',
            impact: 'medium',
            idea_best: false,
          },
        ]
  const events = eventSource.slice(0, 3).map((n, i) => ({
    id: `${t.toLowerCase()}-ev-${i}`,
    type: n.kind === 'flow' ? 'insider_activity' : 'capacity_signal',
    title: n.title,
    date: mockDateOnlyDaysAgo(3 + i * 5),
    entities: ['c1'],
    sentiment: n.idea_best ? 'bullish' : 'neutral',
    impact: n.impact ?? 'medium',
  }))
  return {
    entities: [{ id: 'c1', type: 'company', name: co?.name ?? showcaseCompanyName(t) }],
    events,
    edges: [],
    price: mockShowcasePriceSeries(t),
  }
}

function mockDatasetForTicker(ticker) {
  const t = String(ticker ?? '').toUpperCase()
  if (MOCK_RESEARCH_DATASETS[t]) return MOCK_RESEARCH_DATASETS[t]
  return buildMockResearchDatasetForTicker(t)
}

const MOCK_RESEARCH_DATASETS = Object.fromEntries(
  MOCK_SEMIS.map((co) => [co.ticker, buildMockResearchDatasetForTicker(co.ticker)]),
)

const POLITICIAN_CHAMBER_LABELS = {
  house: 'House',
  senate: 'Senate',
  executive: 'Executive',
}

function paperPoliticianChamberLabel(chamber) {
  const k = String(chamber ?? 'house').trim().toLowerCase()
  return POLITICIAN_CHAMBER_LABELS[k] ?? 'House'
}

/** Form 4 paper/context row: role then reporting owner name. */
function paperInsiderTxnLabel(role, personName) {
  const r = String(role ?? '').trim()
  const p = String(personName ?? '').trim()
  if (r && p) return `${r}, ${p}`
  return r || p || '—'
}

/** 13F paper row: filer name only. */
function paper13fTxnLabel(filer) {
  const f = String(filer ?? '').trim()
  return f || '—'
}

function form4TxnActionLabel(code) {
  const c = String(code ?? '').trim().toUpperCase()
  if (!c) return ''
  return FORM4_TXN_FILTER_LABELS[c] ?? FORM4_TXN_LABELS[c] ?? c
}

function politicianTxnActionLabel(raw) {
  const code = politicianTxnCodeFromRaw(raw)
  if (!code || code === '—') return ''
  const entry = INVESTIGATE_POLITICIAN_TXN_TYPES.find((t) => t.id === code)
  return entry?.label ?? code
}

/** Paper txn card source chip: filing type + action (e.g. Form 4 · Purchase). */
function paperTxnSourceLabel(docType, actionRaw, kind) {
  const base = String(docType ?? '').trim() || 'Filing'
  let action = ''
  if (kind === 'insider') action = form4TxnActionLabel(actionRaw)
  else if (kind === 'politician') action = politicianTxnActionLabel(actionRaw)
  else if (kind === '13f') action = String(actionRaw ?? '').trim()
  return action ? `${base} · ${action}` : base
}

/** PTR paper/context row: chamber then member name. */
function paperPoliticianTxnLabel(chamber, name) {
  const prefix = paperPoliticianChamberLabel(chamber)
  const n = String(name ?? '').trim()
  if (!n) return prefix
  return `${prefix}, ${n}`
}

/** Research CONTEXT panel mock profiles (offline); keyed to feed/paper tickers. */
function contextCountryLabel(country) {
  const raw = String(country ?? '').trim()
  if (!raw) return null
  const names = {
    US: 'United States',
    USA: 'United States',
    NL: 'Netherlands',
    UK: 'United Kingdom',
    GB: 'United Kingdom',
    DE: 'Germany',
    FR: 'France',
    CH: 'Switzerland',
    IE: 'Ireland',
    CA: 'Canada',
    JP: 'Japan',
    TW: 'Taiwan',
    TWN: 'Taiwan',
    CN: 'China',
    CHN: 'China',
  }
  const key = raw.toUpperCase()
  if (names[key]) return names[key]
  const cleaned = raw.replace(/-based$/i, '').trim()
  return cleaned || null
}

const CONTEXT_MOCK_PROFILES = {
  ASML: {
    sector: 'Semiconductor equipment',
    country: 'NL',
    mcap: '$350B',
    earningsDaysAhead: 17,
    ownership: {
      insiders: [0.17, 0.17, 0.18, 0.18],
      institutions: [71.4, 72.3, 73.1, 74.2],
      politicians: [0.08, 0.09, 0.11, 0.12],
    },
    fundamentals: {
      forwardRevenueGrowth: 58,
      revenueGrowth: [12, 18, 24, 31],
      grossMargin: [52, 54, 55, 56],
      netMargin: [24, 26, 27, 28],
      fcfMargin: [20, 22, 23, 24],
      netIncomeGrowth: [14, 22, 28, 35],
      fcfGrowth: [12, 18, 24, 30],
      netCash: [8_200_000_000, 9_100_000_000, 10_400_000_000, 11_800_000_000],
      sharesOutstanding: [392_000_000, 388_000_000, 385_000_000, 380_000_000],
    },
  },
}

function semisContextFundamentalsForTicker(ticker) {
  const t = String(ticker ?? '').toUpperCase()
  const seed = seedFromTicker(t)
  const mult = 0.9 + (seed % 18) / 100
  const growthBoost =
    t === 'NVDA' ? 1.45 : t === 'AMD' || t === 'MU' ? 1.25 : t === 'INTC' ? 0.82 : 1.05
  const marginBoost = t === 'NVDA' || t === 'AVGO' ? 1.12 : t === 'INTC' ? 0.88 : 1.0
  const cashScale =
    t === 'NVDA' ? 28 : t === 'TSM' ? 22 : t === 'AVGO' ? 18 : t === 'INTC' ? 8 : 6
  const shareBase =
    t === 'NVDA' ? 2_460_000_000 : t === 'TSM' ? 5_180_000_000 : t === 'INTC' ? 4_280_000_000 : 620_000_000
  return {
    forwardRevenueGrowth: Math.round(22 * mult * growthBoost),
    revenueGrowth: [8, 12, 16, 20].map((v) => Math.round(v * mult * growthBoost)),
    grossMargin: [44, 46, 48, 50].map((v) => Math.round(v * marginBoost)),
    netMargin: [16, 18, 20, 22].map((v) => Math.round(v * marginBoost * mult)),
    fcfMargin: [14, 16, 18, 20].map((v) => Math.round(v * mult)),
    netIncomeGrowth: [10, 16, 22, 28].map((v) => Math.round(v * growthBoost)),
    fcfGrowth: [8, 14, 20, 26].map((v) => Math.round(v * growthBoost)),
    netCash: [1, 2, 3, 4].map((q) => Math.round(cashScale * 1e9 * (0.85 + q * 0.08) * mult)),
    sharesOutstanding: [0, 1, 2, 3].map((i) => Math.round(shareBase * (1 - i * 0.012))),
  }
}

function semisContextCountry(ticker) {
  const t = String(ticker ?? '').toUpperCase()
  if (t === 'ASML') return 'NL'
  if (t === 'TSM') return 'TW'
  return 'US'
}

for (const co of MOCK_SEMIS) {
  if (co.ticker === 'ASML') continue
  CONTEXT_MOCK_PROFILES[co.ticker] = {
    sector: co.sector,
    country: semisContextCountry(co.ticker),
    mcap: co.mcap,
    earningsDaysAhead: 11 + (seedFromTicker(co.ticker) % 24),
    fundamentals: semisContextFundamentalsForTicker(co.ticker),
    ownership: null,
  }
}

function contextMockFlowDate(row, dateDaysAgo, seed = 0) {
  const parsed = mockFlowAtFromRaw(row?.at, seed)
  if (parsed) return parsed
  if (row?.daysAgo != null) return dateDaysAgo(row.daysAgo, 10 + (seed % 7), 12 + (seed * 5) % 48)
  return dateDaysAgo(0, 10 + (seed % 6), 20)
}

const CONTEXT_MOCK_PROFILE_DEFAULT = {
  sector: 'Semiconductors',
  country: 'US',
  mcap: '—',
  earningsDaysAhead: 21,
  leadDrug: null,
  programs: [],
  insiders: [],
  politicians: [],
  filings13f: [],
  fundamentals: null,
  ownership: null,
}

const CONTEXT_FUNDAMENTALS_MOCK_TEMPLATE = {
  forwardRevenueGrowth: 22,
  revenueGrowth: [8, 12, 16, 20],
  grossMargin: [44, 46, 48, 50],
  netMargin: [16, 18, 20, 22],
  fcfMargin: [14, 16, 18, 20],
  netIncomeGrowth: [10, 16, 22, 28],
  fcfGrowth: [8, 14, 20, 26],
  netCash: [6_000_000_000, 8_500_000_000, 11_000_000_000, 14_000_000_000],
  sharesOutstanding: [820_000_000, 805_000_000, 790_000_000, 775_000_000],
}

const CONTEXT_OWNERSHIP_MOCK_TEMPLATE = {
  insiders: [12, 14, 17, 20],
  institutions: [40, 42, 45, 47],
  politicians: [0.1, 0.2, 0.3, 0.4],
}

function contextMockOwnershipForTicker(ticker, profileOwnership = null) {
  if (profileOwnership && typeof profileOwnership === 'object') {
    return { ...CONTEXT_OWNERSHIP_MOCK_TEMPLATE, ...profileOwnership }
  }
  const seed = seedFromTicker(String(ticker ?? 'TICK'))
  const factor = 0.9 + (seed % 20) / 100
  return {
    insiders: scaleFundamentalSequence(CONTEXT_OWNERSHIP_MOCK_TEMPLATE.insiders, factor),
    institutions: scaleFundamentalSequence(
      CONTEXT_OWNERSHIP_MOCK_TEMPLATE.institutions,
      0.98 + (seed % 5) / 100,
    ),
    politicians: CONTEXT_OWNERSHIP_MOCK_TEMPLATE.politicians.map(
      (v) => Math.round(v * factor * 10) / 10,
    ),
  }
}

function contextOwnershipQuarterLabel(year, quarter) {
  const yy = String(year % 100).padStart(2, '0')
  return `${yy}Q${quarter}`
}

/** Analyse chart quarter labels — e.g. Q1'24 */
function analyseChartQuarterLabel(year, quarter) {
  const yy = String(year % 100)
  return `Q${quarter}'${yy}`
}

/** Trailing calendar quarters for the analyse earnings overlay, oldest → newest. */
function analyseTrailingQuarterLabels(count = 8, asOf = new Date()) {
  let year = asOf.getFullYear()
  let quarter = Math.floor(asOf.getMonth() / 3) + 1
  const out = []
  for (let i = 0; i < count; i++) {
    out.unshift(analyseChartQuarterLabel(year, quarter))
    quarter -= 1
    if (quarter < 1) {
      quarter = 4
      year -= 1
    }
  }
  return out
}

const ANALYSE_MOCK_QUARTERLY_REV_GROWTH = [32.4, 35.1, 38.6, 41.2, 43.3, 44.9, 42.5, 40.1]

/** Equipment / large-cap semis — modest YoY revenue growth overlay for analyse chart. */
const ANALYSE_MOCK_QUARTERLY_REV_GROWTH_ASML = [8.4, 10.1, 12.6, 14.2, 13.5, 12.8, 11.6, 10.3]

function analyseMockQuarterlyRevenueOverlay(ticker) {
  const labels = analyseTrailingQuarterLabels(8)
  const t = String(ticker ?? 'TICK').toUpperCase()
  const base = t === 'ASML' ? ANALYSE_MOCK_QUARTERLY_REV_GROWTH_ASML : ANALYSE_MOCK_QUARTERLY_REV_GROWTH
  const seed = seedFromTicker(t)
  const factor = t === 'ASML' ? 1 : 0.82 + (seed % 28) / 100
  const values = base.map((v, i) =>
    Math.round(v * factor * (1 + ((seed + i * 7) % 9) / 100) * 10) / 10,
  )
  return { labels, values }
}

/** Trailing calendar quarters ending at the current quarter, oldest → newest. */
function contextOwnershipTrailingQuarterLabels(count = 4, asOf = new Date()) {
  let year = asOf.getFullYear()
  let quarter = Math.floor(asOf.getMonth() / 3) + 1
  const out = []
  for (let i = 0; i < count; i++) {
    out.unshift(contextOwnershipQuarterLabel(year, quarter))
    quarter -= 1
    if (quarter < 1) {
      quarter = 4
      year -= 1
    }
  }
  return out
}

function scaleFundamentalSequence(values, factor, { round = true } = {}) {
  if (!Array.isArray(values)) return values
  return values.map((v) => {
    const n = Number(v)
    if (!Number.isFinite(n)) return v
    const out = n * factor
    return round ? Math.round(out) : Math.round(out * 10) / 10
  })
}

function contextMockFundamentalsForTicker(ticker, profileFundamentals = null) {
  if (profileFundamentals && typeof profileFundamentals === 'object') {
    return { ...CONTEXT_FUNDAMENTALS_MOCK_TEMPLATE, ...profileFundamentals }
  }
  const seed = seedFromTicker(String(ticker ?? 'TICK'))
  const factor = 0.88 + (seed % 24) / 100
  return {
    forwardRevenueGrowth: Math.round(CONTEXT_FUNDAMENTALS_MOCK_TEMPLATE.forwardRevenueGrowth * factor),
    revenueGrowth: scaleFundamentalSequence(CONTEXT_FUNDAMENTALS_MOCK_TEMPLATE.revenueGrowth, factor),
    grossMargin: scaleFundamentalSequence(CONTEXT_FUNDAMENTALS_MOCK_TEMPLATE.grossMargin, 0.96 + (seed % 8) / 100),
    netMargin: scaleFundamentalSequence(CONTEXT_FUNDAMENTALS_MOCK_TEMPLATE.netMargin, factor),
    fcfMargin: scaleFundamentalSequence(CONTEXT_FUNDAMENTALS_MOCK_TEMPLATE.fcfMargin, factor),
    netIncomeGrowth: scaleFundamentalSequence(CONTEXT_FUNDAMENTALS_MOCK_TEMPLATE.netIncomeGrowth, factor),
    fcfGrowth: scaleFundamentalSequence(CONTEXT_FUNDAMENTALS_MOCK_TEMPLATE.fcfGrowth, factor),
    netCash: scaleFundamentalSequence(CONTEXT_FUNDAMENTALS_MOCK_TEMPLATE.netCash, factor, { round: false }),
    sharesOutstanding: CONTEXT_FUNDAMENTALS_MOCK_TEMPLATE.sharesOutstanding.map((v, i) =>
      Math.round(v * (1 - (seed % 7) / 200) * (1 - i * 0.02)),
    ),
  }
}

function formatContextFundamentalUsdCompact(n) {
  const x = Number(n)
  if (!Number.isFinite(x) || x <= 0) return '—'
  const trim = (s) => s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
  if (x >= 1e9) {
    const v = x / 1e9
    const body = v >= 100 ? String(Math.round(v)) : v >= 10 ? trim(v.toFixed(1)) : trim(v.toFixed(2))
    return `$${body}B`
  }
  if (x >= 1e6) {
    const v = x / 1e6
    const body = v >= 100 ? String(Math.round(v)) : v >= 10 ? String(Math.round(v)) : trim(v.toFixed(1))
    return `$${body}M`
  }
  if (x >= 1e3) {
    const v = x / 1e3
    const body = v >= 10 ? String(Math.round(v)) : trim(v.toFixed(1))
    return `$${body}K`
  }
  return `$${Math.round(x)}`
}

function formatContextFundamentalSharesCompact(n) {
  const x = Math.abs(Number(n))
  if (!Number.isFinite(x) || x <= 0) return '—'
  if (x >= 1e9) return `${(x / 1e9).toFixed(2)}B`
  if (x >= 1e6) return `${Math.round(x / 1e6)}M`
  if (x >= 1e3) return `${Math.round(x / 1e3)}K`
  return String(Math.round(x))
}

function formatContextFundamentalPctValue(n, { signed = false } = {}) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  const abs = Math.abs(v)
  let body
  if (abs < 1) body = abs.toFixed(1)
  else if (Number.isInteger(abs)) body = String(abs)
  else body = abs.toFixed(1)
  if (!signed) return `${body}%`
  if (v > 0) return `+${body}%`
  if (v < 0) return `−${body}%`
  return `${body}%`
}

function formatContextFundamentalSequenceCells(values, format, { signed = false } = {}) {
  if (!Array.isArray(values) || !values.length) return ['—']
  return values.map((v) => {
    if (format === 'usd') return formatContextFundamentalUsdCompact(v)
    if (format === 'shares') return formatContextFundamentalSharesCompact(v)
    return formatContextFundamentalPctValue(v, { signed })
  })
}

function formatContextFundamentalDisplay(fundamentals, row) {
  const raw = fundamentals?.[row.key]
  if (raw == null) return '—'
  if (row.kind === 'sequence' || Array.isArray(raw)) {
    return formatContextFundamentalSequenceCells(raw, row.format, { signed: row.signed }).join(' → ')
  }
  if (row.format === 'usd') return formatContextFundamentalUsdCompact(raw)
  if (row.format === 'shares') return formatContextFundamentalSharesCompact(raw)
  return formatContextFundamentalPctValue(raw, { signed: row.signed })
}

function contextMockForTicker(ticker, priceSeries) {
  const t = String(ticker ?? 'ASML').toUpperCase()
  const semis = MOCK_SEMIS.find((c) => c.ticker === t)
  const base = CONTEXT_MOCK_PROFILES[t] ?? {
    ...CONTEXT_MOCK_PROFILE_DEFAULT,
    sector: semis?.sector ?? CONTEXT_MOCK_PROFILE_DEFAULT.sector,
    country: semisContextCountry(t),
    mcap: semis?.mcap ?? CONTEXT_MOCK_PROFILE_DEFAULT.mcap,
    earningsDaysAhead: 12 + (seedFromTicker(t) % 20),
    fundamentals: semisContextFundamentalsForTicker(t),
  }
  const weekFlows = buildMockWeekContextFlows(t)
  const dateDaysAgo = (daysAgo, hour = 10, minute = 20) => {
    const d = new Date()
    d.setDate(d.getDate() - daysAgo)
    d.setHours(hour, minute, 0, 0)
    return d
  }
  const offlinePrice = mockDatasetForTicker(t).price
  const price =
    Array.isArray(priceSeries) && priceSeries.length
      ? Number(priceSeries[priceSeries.length - 1])
      : Array.isArray(offlinePrice) && offlinePrice.length
        ? Number(offlinePrice[offlinePrice.length - 1])
        : 0

  const earningsDay = new Date()
  earningsDay.setDate(earningsDay.getDate() + (base.earningsDaysAhead ?? 30))
  earningsDay.setHours(0, 0, 0, 0)

  return {
    ticker: t,
    price: Number.isFinite(price) ? price : 0,
    sector: semis?.sector ?? base.sector,
    domicile: contextCountryLabel(base.country ?? (t === 'ASML' ? 'NL' : t === 'TSM' ? 'TW' : 'US')),
    mcap: semis?.mcap ?? base.mcap,
    earnings: contextEarningsFromDate(earningsDay),
    leadDrug: base.leadDrug ?? null,
    programs: Array.isArray(base.programs) ? base.programs : [],
    insiders: weekFlows.insiders.map((row, i) => ({
      key: row.key,
      person: row.person ?? null,
      date: contextMockFlowDate(row, dateDaysAgo, i * 3 + 1),
      amount: row.amount,
      transactionCode: row.transactionCode ?? null,
    })),
    politicians: weekFlows.politicians.map((row, i) => ({
      name: row.name,
      chamber: row.chamber ?? 'house',
      date: contextMockFlowDate(row, dateDaysAgo, i * 5 + 2),
      amount: row.amount,
      transactionType: row.transactionType ?? null,
    })),
    filings13f: weekFlows.filings13f.map((row, i) => ({
      filer: row.filer,
      activity: row.activity ?? null,
      date: contextMockFlowDate(row, dateDaysAgo, i * 7 + 4),
      amount: row.amount,
    })),
    fundamentals: contextMockFundamentalsForTicker(t, base.fundamentals),
    ownership: contextMockOwnershipForTicker(t, base.ownership),
  }
}

const CONTEXT_FLOW_MONTH_DAYS = 30

/** Matches backend `Horizon` in outcomes.ts — trading days after event, not calendar weeks. */
const OUTCOME_HORIZON_DAYS = [21, 63, 252]
const OUTCOME_HORIZON_LABELS = ['21d', '63d', '252d']
/** Chart axis labels (21 / 63 / 252 trading days ≈ 1M / 3M / 1Y). */
const OUTCOME_HORIZON_CHART_LABELS = ['1M', '3M', '1Y']

/** Baseline avg forward returns (fractions) from global insider outcomes mock / API shape. */
const OUTCOME_BASE_INSIDER_RETURNS = [0.0042, 0.0108, 0.0234]
const OUTCOME_BASE_POLITICIAN_RETURNS = [0.0018, 0.0052, 0.0112]
const OUTCOME_BASE_INSTITUTION_RETURNS = [0.0022, 0.0064, 0.0138]

const CONTEXT_OUTCOME_LINE_COLORS = [
  'rgba(255, 255, 255, 0.9)',
  'rgba(168, 196, 255, 0.82)',
  'rgba(255, 212, 92, 0.78)',
  'rgba(120, 220, 160, 0.76)',
  'rgba(255, 160, 200, 0.74)',
  'rgba(200, 180, 255, 0.72)',
]

function mockOutcomeReturnsForKey(key, baseReturns, ticker) {
  const seed = seedFromTicker(`${ticker}-${key}`)
  return baseReturns.map((b, i) => {
    const jitter = (seededJitter(seed + i * 13, 7) - 3.5) * 0.0008
    return b + jitter
  })
}

function buildMockInsiderOutcomeLines(pastMonthRows, ticker) {
  const roles = [...new Set((pastMonthRows ?? []).map((r) => String(r.roleKey ?? r.id.split('|')[0] ?? '').trim()).filter(Boolean))]
  return roles.map((roleKey, i) => ({
    id: roleKey,
    label: roleKey,
    returns: mockOutcomeReturnsForKey(roleKey, OUTCOME_BASE_INSIDER_RETURNS, ticker),
    color: CONTEXT_OUTCOME_LINE_COLORS[i % CONTEXT_OUTCOME_LINE_COLORS.length],
  }))
}

function buildMockPoliticianOutcomeLines(pastMonthRows, ticker) {
  return (pastMonthRows ?? []).map((row, i) => {
    const shortName = String(row.label ?? '').includes(',')
      ? String(row.label).split(',').slice(1).join(',').trim()
      : row.label
    return {
      id: row.id,
      label: shortName || row.label,
      returns: mockOutcomeReturnsForKey(row.id, OUTCOME_BASE_POLITICIAN_RETURNS, ticker),
      color: CONTEXT_OUTCOME_LINE_COLORS[i % CONTEXT_OUTCOME_LINE_COLORS.length],
    }
  })
}

function parseTxnAmountUsd(amount) {
  const s = String(amount ?? '').trim().replace(/,/g, '')
  const m = s.match(/[€$]?\s*([\d.]+)\s*([KMB])?/i)
  if (!m) return 0
  let n = Number(m[1])
  if (!Number.isFinite(n)) return 0
  const u = String(m[2] ?? '').toUpperCase()
  if (u === 'K') n *= 1e3
  else if (u === 'M') n *= 1e6
  else if (u === 'B') n *= 1e9
  return n
}

function formatTxnAmountUsd(n) {
  const x = Number(n)
  if (!Number.isFinite(x) || x === 0) return EMPTY
  const sign = x < 0 ? '-' : ''
  const abs = Math.abs(x)
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${sign}$${Math.round(abs / 1e3)}K`
  return `${sign}$${Math.round(abs)}`
}

function isWithinPastDays(date, days = CONTEXT_FLOW_MONTH_DAYS) {
  const t = date instanceof Date ? date.getTime() : new Date(date).getTime()
  if (!Number.isFinite(t)) return false
  return t >= Date.now() - days * 86400000
}

function flowRowDateMs(date) {
  const t = date instanceof Date ? date.getTime() : new Date(date ?? 0).getTime()
  return Number.isFinite(t) ? t : 0
}

function insiderFlowSign(row) {
  const c = String(row?.transactionCode ?? row?.code ?? '').trim().toUpperCase()
  if (c === 'S' || c === 'D') return -1
  if (c === 'P' || c === 'A' || c === 'M' || c === 'G' || c === 'W') return 1
  return 0
}

function politicianFlowSign(row) {
  const t = String(row?.transactionType ?? row?.type ?? '').trim().toUpperCase()
  if (t === 'S' || t.startsWith('SALE') || t.includes('SELL')) return -1
  if (t === 'P' || t.startsWith('PURCHASE') || t.includes('BUY')) return 1
  return 0
}

function institutionFlowSign(row) {
  const a = String(row?.activity ?? '').trim().toLowerCase()
  if (/reduc|decreas|sold|exit|closed|trimmed/.test(a)) return -1
  if (/increas|new|added|initiated|opened|raised/.test(a)) return 1
  return 0
}

function signedFlowUsd(row, signFn) {
  const sign = signFn(row)
  if (!sign) return 0
  const usd = parseTxnAmountUsd(row?.amount)
  if (usd <= 0) return 0
  return sign * usd
}

function formatTrackedInvestorDate(atMs) {
  if (!atMs) return '—'
  return formatProgramTimelineDate(new Date(atMs))
}

function aggregateContextInsiders(rows, days = null) {
  const map = new Map()
  for (const row of rows ?? []) {
    if (days != null && !isWithinPastDays(row.date, days)) continue
    const id = `${row.key}|${row.person ?? ''}`
    const usd = signedFlowUsd(row, insiderFlowSign)
    if (usd === 0) continue
    const at = flowRowDateMs(row.date)
    const code = String(row.transactionCode ?? row.code ?? 'P').trim().toUpperCase() || 'P'
    const prev = map.get(id) ?? {
      key: row.key,
      person: row.person,
      totalUsd: 0,
      latestAt: 0,
      latestCode: code,
      latestAd: row.acquiredDisposed ?? null,
    }
    prev.totalUsd += usd
    if (at >= prev.latestAt) {
      prev.latestAt = at
      prev.latestCode = code
      prev.latestAd = row.acquiredDisposed ?? prev.latestAd
    }
    map.set(id, prev)
  }
  return [...map.values()]
    .map((x) => {
      const role = String(x.key ?? '').trim().toUpperCase() || '—'
      const personName = String(x.person ?? '').trim() || role
      return {
        id: `${x.key}|${x.person ?? ''}`,
        roleKey: x.key,
        label: paperInsiderTxnLabel(x.key, x.person),
        personName,
        personDetail: role,
        nameStyle: 'insider',
        total: formatTxnAmountUsd(x.totalUsd),
        totalUsd: x.totalUsd,
        latestAt: x.latestAt,
        latestCode: x.latestCode,
        latestAd: x.latestAd,
      }
    })
    .sort((a, b) => Math.abs(b.totalUsd) - Math.abs(a.totalUsd))
}

function aggregateContextPoliticians(rows, days = null) {
  const map = new Map()
  for (const row of rows ?? []) {
    if (days != null && !isWithinPastDays(row.date, days)) continue
    const id = String(row.name ?? '')
    const usd = signedFlowUsd(row, politicianFlowSign)
    if (usd === 0) continue
    const at = flowRowDateMs(row.date)
    const code = politicianTxnCodeFromRaw(row.transactionType ?? row.transactionCode)
    const prev = map.get(id) ?? {
      name: row.name,
      chamber: row.chamber,
      totalUsd: 0,
      latestAt: 0,
      latestCode: code,
    }
    prev.totalUsd += usd
    if (at >= prev.latestAt) {
      prev.latestAt = at
      prev.latestCode = code
    }
    map.set(id, prev)
  }
  return [...map.values()]
    .map((x) => ({
      id: `politician|${x.name}`,
      name: String(x.name ?? '').trim() || '—',
      type: 'Politician',
      typeKey: 'politician',
      amount: formatTxnAmountUsd(x.totalUsd),
      totalUsd: x.totalUsd,
      latestAt: x.latestAt,
      latestCode: x.latestCode,
    }))
    .sort((a, b) => Math.abs(b.totalUsd) - Math.abs(a.totalUsd))
}

function aggregateContextInstitutions(rows, days = null) {
  const map = new Map()
  for (const row of rows ?? []) {
    if (days != null && !isWithinPastDays(row.date, days)) continue
    const id = String(row.filer ?? 'Institution')
    const usd = signedFlowUsd(row, institutionFlowSign)
    if (usd === 0) continue
    const at = flowRowDateMs(row.date)
    const prev = map.get(id) ?? {
      filer: row.filer,
      totalUsd: 0,
      latestAt: 0,
      latestActivity: row.activity ?? null,
    }
    prev.totalUsd += usd
    if (at >= prev.latestAt) {
      prev.latestAt = at
      prev.latestActivity = row.activity ?? prev.latestActivity
    }
    map.set(id, prev)
  }
  return [...map.values()]
    .map((x) => ({
      id: `institution|${x.filer}`,
      name: String(x.filer ?? '').trim() || '—',
      type: 'Institution',
      typeKey: 'institution',
      amount: formatTxnAmountUsd(x.totalUsd),
      totalUsd: x.totalUsd,
      latestAt: x.latestAt,
      latestActivity: x.latestActivity,
    }))
    .sort((a, b) => Math.abs(b.totalUsd) - Math.abs(a.totalUsd))
}

function mapTrackedInvestorsFromApi(rows) {
  if (!Array.isArray(rows)) return null
  return rows
    .map((r) => {
      const latestAt = r.latestAt ?? r.latest_at
      const dateAt = latestAt ? new Date(latestAt).getTime() : 0
      const typeKey = r.type ?? r.typeKey ?? 'insider'
      const normalizedKey =
        typeKey === 'politician' ? 'politician' : typeKey === 'institution' ? 'institution' : 'insider'
      const name = String(r.name ?? '').trim()
      if (!name || /^(institution|insider|politician|unknown|n\/?a|—|-)$/i.test(name)) return null
      const totalUsd = Number(r.amountUsd ?? r.amount_usd ?? 0)
      if (Number.isFinite(totalUsd) && Math.abs(totalUsd) > 100_000_000_000) return null

      // Prefer explicit codes, then reconcile against net signed USD so we never show BUY on −$14M.
      let code = String(
        r.transactionCode ??
          r.transaction_code ??
          r.code ??
          (normalizedKey === 'institution'
            ? institutionTxnFromActivity(r.activity ?? r.latest_activity).code
            : ''),
      )
        .trim()
        .toUpperCase()
      let codeTone =
        r.codeTone ??
        r.code_tone ??
        (normalizedKey === 'institution'
          ? institutionTxnFromActivity(r.activity ?? r.latest_activity).tone
          : code
            ? insiderTxnCodeTone(code, r.acquiredDisposed ?? r.acquired_disposed)
            : null)

      if (Number.isFinite(totalUsd) && totalUsd < 0) {
        if (normalizedKey === 'institution') {
          code = 'RED'
          codeTone = 'sell'
        } else {
          code = 'S'
          codeTone = 'sell'
        }
      } else if (Number.isFinite(totalUsd) && totalUsd > 0) {
        if (normalizedKey === 'institution') {
          if (!code || code === 'RED' || code === 'S') {
            const txn = institutionTxnFromActivity(r.activity ?? r.latest_activity ?? 'Increased stake')
            code = txn.code
            codeTone = txn.tone
          }
        } else if (!code || code === 'S' || code === 'F' || code === 'RED') {
          code = 'P'
          codeTone = 'buy'
        } else if (!codeTone) {
          codeTone = insiderTxnCodeTone(code, r.acquiredDisposed ?? r.acquired_disposed)
        }
      } else if (!code) {
        code = '—'
        codeTone = 'neutral'
      }

      return {
        id: r.id ?? `${typeKey}|${name}`,
        name,
        type: r.typeLabel ?? r.type_label ?? (normalizedKey === 'institution' ? 'Institution' : typeKey),
        typeKey: normalizedKey,
        source:
          r.source ??
          (normalizedKey === 'politician' ? 'PTR' : normalizedKey === 'institution' ? '13F' : 'F4'),
        code,
        codeTone: codeTone ?? 'neutral',
        amount: r.amount ?? formatTxnAmountUsd(totalUsd),
        totalUsd: Number.isFinite(totalUsd) ? totalUsd : 0,
        dateAt,
        date: formatTrackedInvestorDate(dateAt),
      }
    })
    .filter(Boolean)
}

/** All tracked flows we have for this ticker (insider, politician, 13F). */
function buildContextTrackedInvestors({ insiders = [], politicians = [], filings13f = [], days = null, apiRows = null }) {
  const fromApi = mapTrackedInvestorsFromApi(apiRows)
  if (fromApi?.length) {
    return fromApi.sort((a, b) => (b.dateAt ?? 0) - (a.dateAt ?? 0))
  }
  const insiderRows = aggregateContextInsiders(insiders, days).map((x) => {
    const net = Number(x.totalUsd)
    const code = Number.isFinite(net) && net < 0 ? 'S' : x.latestCode ?? 'P'
    return {
      id: `insider|${x.id}`,
      name: x.personName ?? x.label,
      type: 'Insider',
      typeKey: 'insider',
      source: 'F4',
      code,
      codeTone: Number.isFinite(net) && net < 0 ? 'sell' : insiderTxnCodeTone(code, x.latestAd),
      amount: x.total,
      totalUsd: x.totalUsd,
      dateAt: x.latestAt,
      date: formatTrackedInvestorDate(x.latestAt),
    }
  })
  const politicianRows = aggregateContextPoliticians(politicians, days).map((x) => {
    const net = Number(x.totalUsd)
    const code = Number.isFinite(net) && net < 0 ? 'S' : x.latestCode ?? '—'
    return {
      ...x,
      source: 'PTR',
      code,
      codeTone: Number.isFinite(net) && net < 0 ? 'sell' : insiderTxnCodeTone(code),
      dateAt: x.latestAt,
      date: formatTrackedInvestorDate(x.latestAt),
    }
  })
  const institutionRows = aggregateContextInstitutions(filings13f, days).map((x) => {
    const net = Number(x.totalUsd)
    const txn =
      Number.isFinite(net) && net < 0
        ? { code: 'RED', tone: 'sell' }
        : Number.isFinite(net) && net > 0
          ? { code: 'INC', tone: 'buy' }
          : institutionTxnFromActivity(x.latestActivity)
    return {
      ...x,
      source: '13F',
      code: txn.code,
      codeTone: txn.tone,
      dateAt: x.latestAt,
      date: formatTrackedInvestorDate(x.latestAt),
    }
  })
  return [...insiderRows, ...politicianRows, ...institutionRows].sort(
    (a, b) => (b.dateAt ?? 0) - (a.dateAt ?? 0),
  )
}

function ContextTrackedInvestorsCard({
  rows = [],
  emptyLabel = 'No tracked investor activity yet.',
  loading = false,
}) {
  return (
    <div className="contextCatalystCard contextRecentInvestorsCard" aria-label="Tracked investors">
      <div
        className={[
          'contextRecentInvestorsTable',
          !loading && !rows.length ? 'contextRecentInvestorsTable--empty' : '',
          loading ? 'contextRecentInvestorsTable--loading' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        role="list"
      >
        <div className="contextRecentInvestorsGrid contextRecentInvestorsGrid--head mono">
          <span className="contextFlowChartLabel mono dim">Tracked investors</span>
          <span className="contextRecentInvestorsHead">Type</span>
          <span className="contextRecentInvestorsHead">Amount</span>
          <span className="contextRecentInvestorsHead">Date</span>
        </div>
        {loading ? (
          <PanelStatusMessage label="Loading tracked investors…" className="contextFlowEmpty contextRecentInvestorsEmpty" />
        ) : !rows.length ? (
          <PanelStatusMessage label={emptyLabel} className="contextFlowEmpty contextRecentInvestorsEmpty" />
        ) : (
          rows.map((row) => (
            <div key={row.id} className="contextRecentInvestorsGrid" role="listitem" aria-label={row.name}>
              <span className="contextRecentInvestorsName" title={row.name}>
                {row.name}
              </span>
              <span
                className={[
                  'contextRecentInvestorsType',
                  'mono',
                  row.typeKey === 'insider' ? 'contextRecentInvestorsType--insider' : '',
                  row.typeKey === 'politician' ? 'contextRecentInvestorsType--politician' : '',
                  row.typeKey === 'institution' ? 'contextRecentInvestorsType--institution' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {row.type}
              </span>
              <span className="contextRecentInvestorsAmt mono">{row.amount}</span>
              <span className="contextRecentInvestorsDate mono dim">{row.date ?? '—'}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}


function mapFundamentalsFromApi(fundamentals) {
  if (!fundamentals || typeof fundamentals !== 'object') return null
  const pickArray = (key) => {
    const v = fundamentals[key]
    if (!Array.isArray(v)) return null
    return v.map((x) => (x != null && Number.isFinite(Number(x)) ? Number(x) : null))
  }
  const periodLabels =
    Array.isArray(fundamentals.periodLabels) && fundamentals.periodLabels.length
      ? fundamentals.periodLabels.map((l) => String(l))
      : null
  const mapped = {
    periodLabels,
    forwardRevenueGrowth:
      fundamentals.forwardRevenueGrowth != null && Number.isFinite(Number(fundamentals.forwardRevenueGrowth))
        ? Number(fundamentals.forwardRevenueGrowth)
        : null,
    revenueGrowth: pickArray('revenueGrowth'),
    grossMargin: pickArray('grossMargin'),
    netMargin: pickArray('netMargin'),
    fcfMargin: pickArray('fcfMargin'),
    netIncomeGrowth: pickArray('netIncomeGrowth'),
    fcfGrowth: pickArray('fcfGrowth'),
    netCash: pickArray('netCash'),
    sharesOutstanding: pickArray('sharesOutstanding'),
  }
  const hasHistorical = [
    mapped.revenueGrowth,
    mapped.grossMargin,
    mapped.netMargin,
    mapped.fcfMargin,
    mapped.netIncomeGrowth,
    mapped.fcfGrowth,
    mapped.netCash,
    mapped.sharesOutstanding,
  ].some((arr) => arr?.some((v) => v != null))
  if (!hasHistorical && mapped.forwardRevenueGrowth == null) return null
  return mapped
}

function findAnalyseModelRow(model, label) {
  const want = String(label ?? '')
    .trim()
    .toLowerCase()
  if (!want) return null
  return (model?.historicalModel ?? []).find((row) => String(row?.label ?? '').trim().toLowerCase() === want) ?? null
}

function parseAnalyseModelNumber(raw) {
  if (raw == null || raw === '—' || raw === '') return null
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  const s = String(raw).trim().replace(/,/g, '').replace(/%/g, '')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Derive key-metrics snapshot from the Analyse P&L when company fundamentals are missing. */
function mapFundamentalsFromAnalyseModel(model) {
  if (!model?.historicalModel?.length) return null
  const estFrom = Number(model.estimateFromIndex)
  const histEnd = Number.isFinite(estFrom) && estFrom > 0 ? estFrom : (model.quarters?.length ?? 0)
  if (histEnd < 1) return null
  const take = Math.min(2, histEnd)
  const start = histEnd - take
  const periodLabels = (Array.isArray(model.quarters) ? model.quarters : [])
    .slice(start, histEnd)
    .map((l) => String(l))

  const sliceNums = (row) => {
    if (!row?.values) return null
    const out = row.values.slice(start, histEnd).map(parseAnalyseModelNumber)
    return out.some((v) => v != null) ? out : null
  }

  const revenue = sliceNums(findAnalyseModelRow(model, 'Revenue'))
  const grossProfit = sliceNums(findAnalyseModelRow(model, 'Gross profit'))
  const netIncome = sliceNums(findAnalyseModelRow(model, 'Net income'))
  const fcf = sliceNums(findAnalyseModelRow(model, 'Free cash flow'))
  const cash = sliceNums(findAnalyseModelRow(model, 'Cash & equivalents'))
  const debt = sliceNums(findAnalyseModelRow(model, 'Total debt'))
  let grossMargin = sliceNums(findAnalyseModelRow(model, 'Gross margin'))
  let revenueGrowth = sliceNums(findAnalyseModelRow(model, 'Revenue growth (YoY)'))

  if (!grossMargin && revenue && grossProfit) {
    grossMargin = revenue.map((rev, i) => {
      const gp = grossProfit[i]
      if (rev == null || gp == null || rev === 0) return null
      return Math.round((gp / rev) * 1000) / 10
    })
  }

  const netMargin =
    revenue && netIncome
      ? revenue.map((rev, i) => {
          const ni = netIncome[i]
          if (rev == null || ni == null || rev === 0) return null
          return Math.round((ni / rev) * 1000) / 10
        })
      : null

  const fcfMargin =
    revenue && fcf
      ? revenue.map((rev, i) => {
          const v = fcf[i]
          if (rev == null || v == null || rev === 0) return null
          return Math.round((v / rev) * 1000) / 10
        })
      : null

  // Model cash/debt are in USD millions — expose dollars for the compact formatter.
  const netCash =
    cash || debt
      ? Array.from({ length: take }, (_, i) => {
          const c = cash?.[i]
          const d = debt?.[i]
          if (c == null && d == null) return null
          const netM = (c ?? 0) - Math.abs(d ?? 0)
          return netM * 1e6
        })
      : null

  const mapped = {
    periodLabels: periodLabels.length ? periodLabels : null,
    forwardRevenueGrowth: null,
    revenueGrowth,
    grossMargin,
    netMargin,
    fcfMargin,
    netIncomeGrowth: null,
    fcfGrowth: null,
    netCash,
    sharesOutstanding: null,
  }
  const hasHistorical = [
    mapped.revenueGrowth,
    mapped.grossMargin,
    mapped.netMargin,
    mapped.fcfMargin,
    mapped.netCash,
  ].some((arr) => arr?.some((v) => v != null))
  return hasHistorical ? mapped : null
}

function mapOwnershipFromApi(ownership) {
  if (!ownership || typeof ownership !== 'object') return null
  const pickArray = (key) => {
    const v = ownership[key]
    if (!Array.isArray(v)) return null
    return v.map((x) => (x != null && Number.isFinite(Number(x)) ? Number(x) : null))
  }
  const mapped = {
    insiders: pickArray('insiders'),
    institutions: pickArray('institutions'),
    politicians: pickArray('politicians'),
  }
  const hasAny = [mapped.insiders, mapped.institutions, mapped.politicians].some((arr) =>
    arr?.some((v) => v != null),
  )
  return hasAny ? mapped : null
}

function contextCatalystCountdown(at) {
  if (at == null || String(at).trim() === '') return 'Active'
  const d = new Date(`${String(at ?? '').trim()}T12:00:00`)
  if (Number.isNaN(d.getTime())) return EMPTY
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000)
  if (days < 0) return 'Past'
  if (days === 0) return 'Today'
  if (days <= 90) return `${days}d`
  return formatProgramTimelineDate(at)
}

function ContextSection({ title, ariaLabel, children }) {
  const sectionLabel = ariaLabel ?? title
  return (
    <div
      className={['contextSection', title ? '' : 'contextSection--headless'].filter(Boolean).join(' ')}
      aria-label={sectionLabel}
    >
      {title ? (
        <div className="contextSectionHeader">
          <div className="contextSectionTitle">{title}</div>
        </div>
      ) : null}
      {children}
    </div>
  )
}

const CONTEXT_FUNDAMENTAL_PERIOD_COUNT = 2

const CONTEXT_FUNDAMENTAL_PERIOD_LABELS = () => analyseTrailingQuarterLabels(CONTEXT_FUNDAMENTAL_PERIOD_COUNT)

const CONTEXT_FUNDAMENTAL_ROWS = [
  { key: 'forwardRevenueGrowth', label: 'Forward rev growth', kind: 'single', format: 'pct', signed: false },
  { key: 'revenueGrowth', label: 'Revenue growth', kind: 'sequence', format: 'pct', signed: false },
  { key: 'grossMargin', label: 'Gross margin', kind: 'sequence', format: 'pct', signed: false },
  { key: 'netMargin', label: 'Net margin', kind: 'sequence', format: 'pct', signed: false },
  { key: 'fcfMargin', label: 'FCF margin', kind: 'sequence', format: 'pct', signed: false },
  { key: 'netIncomeGrowth', label: 'Net income growth', kind: 'sequence', format: 'pct', signed: false },
  { key: 'fcfGrowth', label: 'FCF growth', kind: 'sequence', format: 'pct', signed: false },
  { key: 'netCash', label: 'Net cash', kind: 'sequence', format: 'usd', signed: false },
  { key: 'sharesOutstanding', label: 'Shares outstanding', kind: 'sequence', format: 'shares', signed: false },
]

const CONTEXT_OWNERSHIP_ROWS = [
  { key: 'insiders', label: 'Insiders', kind: 'sequence', format: 'pct', signed: false },
  { key: 'institutions', label: 'Institutions', kind: 'sequence', format: 'pct', signed: false },
  { key: 'politicians', label: 'Politicians', kind: 'sequence', format: 'pct', signed: false },
]

const CONTEXT_OWNERSHIP_DONUT_COLORS = {
  insiders: 'rgba(140, 255, 195, 0.9)',
  institutions: 'rgba(120, 180, 255, 0.9)',
  politicians: 'rgba(255, 200, 120, 0.9)',
  retail: 'rgba(255, 255, 255, 0.3)',
}

/** Latest quarter column only — retail is the remainder to 100%. */
function contextOwnershipLatestBreakdown(ownership) {
  const pickLatest = (arr) => {
    if (!Array.isArray(arr) || !arr.length) return 0
    const v = arr[arr.length - 1]
    const n = Number(v)
    return v != null && Number.isFinite(n) ? Math.max(0, n) : 0
  }

  const insiders = pickLatest(ownership?.insiders)
  const institutions = pickLatest(ownership?.institutions)
  const politicians = pickLatest(ownership?.politicians)
  const known = insiders + institutions + politicians
  const retail = Math.max(0, 100 - known)

  return [
    { key: 'insiders', label: 'Insiders', pct: insiders, color: CONTEXT_OWNERSHIP_DONUT_COLORS.insiders },
    {
      key: 'institutions',
      label: 'Institutions',
      pct: institutions,
      color: CONTEXT_OWNERSHIP_DONUT_COLORS.institutions,
    },
    {
      key: 'politicians',
      label: 'Politicians',
      pct: politicians,
      color: CONTEXT_OWNERSHIP_DONUT_COLORS.politicians,
    },
    { key: 'retail', label: 'Retail', pct: retail, color: CONTEXT_OWNERSHIP_DONUT_COLORS.retail },
  ]
}

function ContextOwnershipDonut({ segments, size = 160, stroke = 25, gapDeg = 1.2 }) {
  const radius = (size - stroke) / 2
  const center = size / 2
  const circumference = 2 * Math.PI * radius
  const gapLen = (gapDeg / 360) * circumference
  let offset = 0

  const visible = segments.filter((s) => s.pct > 0)

  return (
    <svg
      className="contextOwnershipDonutSvg"
      viewBox={`0 0 ${size} ${size}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="rgba(255, 255, 255, 0.07)"
        strokeWidth={stroke}
      />
      {visible.map((seg) => {
        const rawLen = (seg.pct / 100) * circumference
        const dash = Math.max(0, rawLen - gapLen)
        const el = (
          <circle
            key={seg.key}
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={seg.color}
            strokeWidth={stroke}
            strokeLinecap="butt"
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${center} ${center})`}
          />
        )
        offset += rawLen
        return el
      })}
    </svg>
  )
}

function ContextOwnershipChart({ ownership, periodLabel }) {
  const segments = useMemo(() => contextOwnershipLatestBreakdown(ownership), [ownership])
  const summary = segments.map((s) => `${s.label} ${formatContextFundamentalPctValue(s.pct)}`).join(', ')

  return (
    <div className="contextOwnershipChart" aria-label={`Ownership breakdown for ${periodLabel}: ${summary}`}>
      <div className="contextOwnershipDonutWrap">
        <ContextOwnershipDonut segments={segments} />
        <div className="contextOwnershipDonutCenter mono" aria-hidden="true">
          {periodLabel}
        </div>
      </div>
      <ul className="contextOwnershipLegend" aria-hidden="true">
        {segments.map((seg) => (
          <li key={seg.key} className="contextOwnershipLegendRow">
            <span className="contextOwnershipLegendSwatch" style={{ background: seg.color }} />
            <span className="contextOwnershipLegendLabel dim">{seg.label}</span>
            <span className="contextOwnershipLegendValue mono">
              {formatContextFundamentalPctValue(seg.pct)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function contextMetricsRowCells(data, row, periodCount) {
  const raw = data?.[row.key]
  if (row.kind === 'single') {
    const cells = Array.from({ length: periodCount }, () => '—')
    if (raw != null) {
      cells[periodCount - 1] = formatContextFundamentalPctValue(raw, { signed: row.signed })
    }
    return cells
  }
  const cells = formatContextFundamentalSequenceCells(raw, row.format, { signed: row.signed })
  if (cells.length >= periodCount) return cells.slice(-periodCount)
  return [...Array.from({ length: periodCount - cells.length }, () => '—'), ...cells]
}

function contextFundamentalsGridPeriodClass(periodCount) {
  if (periodCount === 2) return 'contextFundamentalsGrid--periods2'
  if (periodCount === 4) return 'contextFundamentalsGrid--periods4'
  return ''
}

function ContextMetricsTableRow({ row, data, periodLabels, periodCount, gridPeriodClass = '' }) {
  const cells = contextMetricsRowCells(data, row, periodCount)
  const latestIndex = periodCount - 1

  return (
    <div
      className={['contextFundamentalsGrid', gridPeriodClass].filter(Boolean).join(' ')}
      role="listitem"
      aria-label={row.label}
    >
      <span className="contextFundamentalsSeqLabel dim">{row.label}</span>
      {cells.map((cell, i) => (
        <span
          key={`${row.key}-${i}`}
          className={[
            'contextFundamentalsSeqCell',
            'mono',
            cell === '—' ? 'contextFundamentalsSeqCell--empty' : '',
            i === latestIndex ? 'contextFundamentalsSeqCell--latest' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          title={periodLabels[i] ? `${periodLabels[i]}: ${cell}` : cell}
        >
          {cell}
        </span>
      ))}
    </div>
  )
}

function ContextMetricsCard({
  title,
  ariaLabel,
  periodLabels,
  rows,
  data,
  loading = false,
  loadingLabel = 'Loading…',
  emptyLabel = 'No data yet.',
}) {
  const periodCount = periodLabels.length
  const gridPeriodClass = contextFundamentalsGridPeriodClass(periodCount)
  const hasData = contextMetricsHasData(data, rows)

  return (
    <div className="contextCatalystCard contextFundamentalsCard" aria-label={ariaLabel ?? title}>
      <div
        className={[
          'contextFundamentalsTable',
          !loading && !hasData ? 'contextFundamentalsTable--empty' : '',
          loading ? 'contextFundamentalsTable--loading' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        role="list"
        style={{ '--context-metric-rows': String(Math.max(1, rows.length)) }}
      >
        <div
          className={['contextFundamentalsGrid', 'contextFundamentalsGrid--head', 'mono', gridPeriodClass]
            .filter(Boolean)
            .join(' ')}
        >
          <span className="contextFlowChartLabel mono dim">{title}</span>
          {periodLabels.map((label) => (
            <span key={label} className="contextFundamentalsSeqHead">
              {label}
            </span>
          ))}
        </div>
        {loading ? (
          <PanelStatusMessage label={loadingLabel} className="contextCatalystCardEmpty" />
        ) : !hasData ? (
          <PanelStatusMessage label={emptyLabel} className="contextCatalystCardEmpty" />
        ) : (
          rows.map((row) => (
            <ContextMetricsTableRow
              key={row.key}
              row={row}
              data={data}
              periodLabels={periodLabels}
              periodCount={periodCount}
              gridPeriodClass={gridPeriodClass}
            />
          ))
        )}
      </div>
    </div>
  )
}

function ContextFundamentalsCard({ fundamentals, loading = false }) {
  const periodLabels = useMemo(() => {
    if (Array.isArray(fundamentals?.periodLabels) && fundamentals.periodLabels.length) {
      return fundamentals.periodLabels.slice(-CONTEXT_FUNDAMENTAL_PERIOD_COUNT)
    }
    return CONTEXT_FUNDAMENTAL_PERIOD_LABELS()
  }, [fundamentals?.periodLabels])

  return (
    <ContextMetricsCard
      title="Fundamentals"
      ariaLabel="Fundamentals"
      periodLabels={periodLabels}
      rows={CONTEXT_FUNDAMENTAL_ROWS}
      data={fundamentals}
      loading={loading}
      loadingLabel="Loading fundamentals…"
      emptyLabel="No fundamentals data yet."
    />
  )
}

function ContextOwnershipCard({ ownership, loading = false }) {
  const periodLabels = useMemo(() => contextOwnershipTrailingQuarterLabels(4), [])
  const latestPeriodLabel = periodLabels[periodLabels.length - 1] ?? '—'
  const periodCount = periodLabels.length
  const gridPeriodClass = contextFundamentalsGridPeriodClass(periodCount)

  return (
    <div className="contextCatalystCard contextFundamentalsCard contextOwnershipCard" aria-label="Ownership">
      <ContextOwnershipChart ownership={ownership} periodLabel={latestPeriodLabel} />
      <div className="contextFundamentalsTable" role="list">
        <div
          className={['contextFundamentalsGrid', 'contextFundamentalsGrid--head', 'mono', gridPeriodClass]
            .filter(Boolean)
            .join(' ')}
        >
          <span className="contextFlowChartLabel mono dim">Ownership</span>
          {periodLabels.map((label) => (
            <span key={label} className="contextFundamentalsSeqHead">
              {label}
            </span>
          ))}
        </div>
        {loading ? (
          <PanelStatusMessage label="Loading ownership…" className="contextCatalystCardEmpty" />
        ) : (
          CONTEXT_OWNERSHIP_ROWS.map((row) => (
            <ContextMetricsTableRow
              key={row.key}
              row={row}
              data={ownership}
              periodLabels={periodLabels}
              periodCount={periodCount}
              gridPeriodClass={gridPeriodClass}
            />
          ))
        )}
      </div>
    </div>
  )
}


function ContextFlowChartHeader({ title, sample = null }) {
  return (
    <div className="contextFlowChartHeader">
      <div className="contextFlowChartLabel mono dim">{title}</div>
      {sample != null && String(sample).trim() ? (
        <span className="contextFlowChartSample mono dim">{sample}</span>
      ) : null}
    </div>
  )
}

function ContextFlowOutcomeChart({
  lines = [],
  ariaLabel = 'Historical outcome returns',
  xLabels = OUTCOME_HORIZON_LABELS,
}) {
  const wrapRef = useRef(null)
  const [size, setSize] = useState({ w: 280, h: 112 })

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    function measure() {
      const rect = wrap.getBoundingClientRect()
      const w = Math.max(160, rect.width)
      const h = Math.max(112, rect.height)
      setSize((prev) => (prev.w !== w || prev.h !== h ? { w, h } : prev))
    }
    const ro = new ResizeObserver(() => requestAnimationFrame(measure))
    ro.observe(wrap)
    window.addEventListener('resize', measure)
    measure()
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  const w = size.w
  const h = size.h
  const n = Math.max(1, xLabels.length)
  const marginSides = { r: 14, t: 10, b: 26 }

  const allVals = lines.flatMap((l) => (Array.isArray(l.returns) ? l.returns : []))
  const rawMin = allVals.length ? Math.min(...allVals, 0) : 0
  const rawMax = allVals.length ? Math.max(...allVals, 0) : 0.01
  let loP = Math.floor(rawMin * 100)
  let hiP = Math.ceil(rawMax * 100)
  if (hiP <= loP) hiP = loP + 1
  const min = loP / 100
  const max = hiP / 100
  const span = max - min || 1

  const yTicks = useMemo(() => returnTicks(min, max, 3), [min, max])
  const yTickGap = 5
  const yTickTexts = useMemo(() => yTicks.map((v) => formatReturnTick(v)), [yTicks])
  const marginL = useMemo(
    () => chartYAxisMargin(yTickTexts, { gap: yTickGap, min: 22, max: 40 }),
    [yTickTexts],
  )
  const margin = { l: marginL, ...marginSides }
  const innerW = Math.max(1, w - margin.l - margin.r)
  const plotTop = margin.t
  const axisY = h - margin.b
  const innerH = Math.max(1, axisY - plotTop)
  const yTickLabelX = margin.l - yTickGap

  function xAt(i) {
    return margin.l + (i / Math.max(1, n - 1)) * innerW
  }
  function yAt(v) {
    return plotTop + (1 - (v - min) / span) * innerH
  }

  const paths = useMemo(() => {
    return lines.map((line) => {
      const vals = Array.isArray(line.returns) ? line.returns : []
      if (vals.length < 2) return { id: line.id, d: '', color: line.color }
      let d = ''
      for (let i = 0; i < Math.min(n, vals.length); i++) {
        const x = xAt(i)
        const y = yAt(vals[i])
        d += `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)} `
      }
      return { id: line.id, d: d.trim(), color: line.color }
    })
  }, [lines, w, h, min, max, marginL])

  const zeroY =
    min < 0 && max > 0 ? yAt(0) : null

  if (!lines.length) return null

  return (
    <div className="contextFlowOutcomeChart" ref={wrapRef} role="img" aria-label={ariaLabel}>
      <svg
        className="contextFlowOutcomeSvg"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
      >
        <path
          className="graphAxis"
          style={GRAPH_SVG_AXIS}
          d={`M ${margin.l} ${plotTop} L ${margin.l} ${axisY} L ${w - margin.r} ${axisY}`}
        />
        {zeroY != null ? (
          <path
            className="graphTickLine"
            style={GRAPH_SVG_TICK_LINE}
            d={`M ${margin.l} ${zeroY.toFixed(2)} L ${w - margin.r} ${zeroY.toFixed(2)}`}
          />
        ) : null}
        {yTicks.map((v, i) => (
          <g key={`oy-${i}`}>
            <text
              className="graphTick graphTick--y"
              style={GRAPH_SVG_TICK}
              textAnchor="end"
              dominantBaseline="middle"
              x={yTickLabelX}
              y={yAt(v)}
            >
              {formatReturnTick(v)}
            </text>
          </g>
        ))}
        {xLabels.map((lab, i) => {
          const isLast = i === xLabels.length - 1
          const isFirst = i === 0
          const xPos = isLast ? w - margin.r : isFirst ? margin.l : xAt(i)
          return (
            <text
              key={`ox-${lab}`}
              className="graphTick graphTick--x"
              style={GRAPH_SVG_TICK}
              textAnchor={isLast ? 'end' : isFirst ? 'start' : 'middle'}
              x={xPos}
              y={h - 6}
            >
              {lab}
            </text>
          )
        })}
        {paths.map((p) =>
          p.d ? (
            <path
              key={p.id}
              className="contextFlowOutcomePath"
              d={p.d}
              stroke={p.color}
              vectorEffect="non-scaling-stroke"
            />
          ) : null,
        )}
      </svg>
    </div>
  )
}

function attachOutcomeLineColors(rows, outcomeLines, lineIdForRow) {
  const colorById = new Map((outcomeLines ?? []).map((l) => [l.id, l.color]))
  return (rows ?? []).map((row) => ({
    ...row,
    lineColor: colorById.get(lineIdForRow(row)) ?? null,
  }))
}

function ContextFlowTotalsList({
  rows = [],
  outcomeLines = [],
  emptyLabel = 'None in the past 30 days.',
  chartTitle = 'Historical outcomes',
  rowsLabel = 'Past 30 days',
}) {
  if (!rows.length && !outcomeLines.length) {
    return (
      <div className="contextFlowList contextFlowList--empty">
        <p className="contextFlowEmpty mono dim">{emptyLabel}</p>
      </div>
    )
  }
  return (
    <div className="contextFlowList contextFlowList--marketFlows" role="list">
      {outcomeLines.length ? (
        <>
          <ContextFlowChartHeader title={chartTitle} />
          <ContextFlowOutcomeChart
            lines={outcomeLines}
            xLabels={OUTCOME_HORIZON_CHART_LABELS}
            ariaLabel="Average forward returns by horizon (1 month, 3 months, 1 year)"
          />
        </>
      ) : null}
      {rows.length && rowsLabel ? (
        <div className="contextFlowRowsLabel mono dim">{rowsLabel}</div>
      ) : null}
      {rows.map((row) => (
        <div
          key={row.id}
          className="contextCompanyEarnings historicalOutcomesPerson contextFlowPersonStrip"
          role="listitem"
        >
          <div className="contextFlowRowKeyWrap">
            {row.lineColor ? (
              <span
                className="contextFlowRowLine"
                style={{ background: row.lineColor }}
                aria-hidden="true"
              />
            ) : null}
            <span
              className={[
                'contextCompanyEarningsK',
                'historicalOutcomesPersonName',
                row.nameStyle === 'politician' ? 'contextFlowRowKey--name' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {row.personName ?? row.label}
            </span>
          </div>
          {row.personDetail ? (
            <span className="contextCompanyEarningsV historicalOutcomesPersonDetail">{row.personDetail}</span>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function contextOutcomesSampleLabel(sampleSize) {
  const s = String(sampleSize ?? '').trim()
  if (!s || s === EMPTY) return '—'
  const count = s.replace(/^N\s*=\s*/i, '').trim()
  if (!count) return s
  const n = Number(count)
  return Number.isFinite(n) ? formatCountLabel(n, 'event') : `${count} events`
}

function contextOutcomesEventsRow(sampleSize) {
  const s = String(sampleSize ?? '').trim()
  if (!s || s === EMPTY) return null
  const count = s.replace(/^N\s*=\s*/i, '').trim()
  if (!count) return null
  return { id: 'events', k: 'Events', v: count }
}

function formatOutcomeHorizonCell(valueAsFraction) {
  if (valueAsFraction == null || !Number.isFinite(Number(valueAsFraction))) return '—'
  const pct = Number(valueAsFraction) * 100
  const sign = pct > 0 ? '+' : ''
  const abs = Math.abs(pct)
  const digits = abs >= 10 ? 1 : 2
  return `${sign}${pct.toFixed(digits)}%`
}

function outcomeKvValueClass(valueAsFraction) {
  if (valueAsFraction == null || !Number.isFinite(Number(valueAsFraction))) return ''
  const pct = Number(valueAsFraction) * 100
  if (pct > 0) return 'contextCardOutcomeV--pos'
  if (pct < 0) return 'contextCardOutcomeV--neg'
  return ''
}

function buildOutcomeKvRowsFromLines(outcomeLines) {
  const rows = []
  const lines = outcomeLines ?? []
  const multi = lines.length > 1
  for (const line of lines) {
    OUTCOME_HORIZON_CHART_LABELS.forEach((h, i) => {
      const frac = line.returns?.[i]
      rows.push({
        id: multi ? `${line.id}-${h}` : `avg-return-${h}`,
        k: multi ? `${line.label} ${h}` : `Avg return ${h}`,
        v: formatOutcomeHorizonCell(frac),
        valueClass: outcomeKvValueClass(frac),
      })
    })
  }
  return rows
}

function buildMarketOutcomeStatRows(ins) {
  const norm = historicalOutcomeNorm
  const rows = []
  const winRate = norm(ins?.winRate)
  if (winRate && winRate !== EMPTY) rows.push({ k: 'Win rate', v: winRate })
  const median = norm(ins?.medianReturn)
  if (median && median !== EMPTY) rows.push({ k: 'Median return', v: median })
  return rows
}

function buildClinicalOutcomeStatRows(stats) {
  const norm = historicalOutcomeNorm
  const rows = []
  const drops = norm(stats?.pctLargeDropsOver30)
  if (drops && drops !== EMPTY) rows.push({ k: 'Large drops (>30%)', v: drops })
  const median = norm(stats?.medianReturn)
  if (median && median !== EMPTY) rows.push({ k: 'Median return', v: median })
  return rows
}

function buildMarketOutcomeKvRows(ins, outcomeLines) {
  const rows = []
  const eventsRow = contextOutcomesEventsRow(ins?.sampleSize)
  if (eventsRow) rows.push(eventsRow)
  rows.push(...buildOutcomeKvRowsFromLines(outcomeLines))
  for (const row of buildMarketOutcomeStatRows(ins)) {
    rows.push({
      id: row.k,
      k: row.k,
      v: row.v,
      valueClass: contextOutcomeValueClass(row.k, row.v),
    })
  }
  return rows
}

function buildClinicalOutcomeKvRows(outcomeLines, stats, sampleSize) {
  const rows = []
  const eventsRow = contextOutcomesEventsRow(sampleSize)
  if (eventsRow) rows.push(eventsRow)
  rows.push(...buildOutcomeKvRowsFromLines(outcomeLines))
  for (const row of buildClinicalOutcomeStatRows(stats)) {
    rows.push({
      id: row.k,
      k: row.k,
      v: row.v,
      valueClass: contextOutcomeValueClass(row.k, row.v),
    })
  }
  return rows
}

function ContextOutcomeKvRow({ label, value, valueClass = '' }) {
  return (
    <div className="contextCardOutcomeRow contextOutcomesKvRow" role="listitem">
      <span className="contextCardOutcomeK">{label}</span>
      <span className={['contextCardOutcomeV', 'mono', valueClass].filter(Boolean).join(' ')}>{value}</span>
    </div>
  )
}

function ContextOutcomesKvPanel({
  title,
  titleVariant = 'default',
  rows = [],
  loading = false,
  loadingLabel = 'Loading historical outcomes…',
  emptyLabel = 'No historical outcome data yet.',
}) {
  const hasContent = rows.length > 0

  return (
    <div
      className={[
        'contextCatalystCard',
        'contextOutcomesKvCard',
        !hasContent && !loading ? 'contextCatalystCard--empty' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={title}
    >
      <div className="contextCatalystCardHeader">
        <div
          className={[
            'contextCatalystCardTitle',
            'mono',
            titleVariant === 'person' ? 'contextCatalystCardTitle--person' : 'dim',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {title}
        </div>
      </div>
      {loading ? (
        <PanelStatusMessage label={loadingLabel} className="contextCatalystCardEmpty" />
      ) : !hasContent ? (
        <PanelStatusMessage label={emptyLabel} className="contextCatalystCardEmpty" />
      ) : (
        <div className="contextOutcomesKvStack" role="list">
          {rows.map((row, i) => (
            <ContextOutcomeKvRow
              key={row.id ?? `${row.k}-${i}`}
              label={row.k}
              value={row.v}
              valueClass={row.valueClass ?? ''}
            />
          ))}
        </div>
      )}
    </div>
  )
}











function impactScore(impact) {
  const x = String(impact ?? '').toLowerCase()
  if (x === 'high') return 3
  if (x === 'medium') return 2
  return 1
}

function sentimentColor(sentiment) {
  const s = String(sentiment ?? '').toLowerCase()
  if (s === 'bullish') return 'rgba(80, 255, 190, 0.92)'
  if (s === 'bearish') return 'rgba(255, 88, 108, 0.95)'
  return 'rgba(216, 255, 235, 0.35)'
}

function parseDay(yyyyMmDd) {
  const d = new Date(`${yyyyMmDd}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

function _formatTimelineDay(yyyyMmDd) {
  const d = parseDay(yyyyMmDd)
  if (!d) return '—'
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${mm}-${dd}`
}

/** Deterministic pseudo-random in [0, max) */
function seededJitter(seed, max) {
  const x = Math.sin(seed * 12.9898 + max * 78.233) * 43758.5453
  return Math.abs(x - Math.floor(x)) * max
}

function formatUsdCompact(n) {
  const x = Number(n)
  if (!Number.isFinite(x) || x <= 0) return ''
  if (x >= 1e9) return `$${(x / 1e9).toFixed(2)}B`
  if (x >= 1e6) return `$${(x / 1e6).toFixed(2)}M`
  if (x >= 1e3) return `$${(x / 1e3).toFixed(1)}K`
  return `$${Math.round(x)}`
}

/** Band endpoints for PTR-style ranges — round units, no trailing .0 */
function formatUsdBandEndpoint(n) {
  const x = Number(n)
  if (!Number.isFinite(x) || x <= 0) return ''
  if (x >= 1e9) return `$${Math.round(x / 1e9)}B`
  if (x >= 1e6) return `$${Math.round(x / 1e6)}M`
  if (x >= 1e3) return `$${Math.round(x / 1e3)}K`
  return `$${Math.round(x)}`
}

/** `$100,001 - $250,000` → `$100K–$250K` so trade-log columns stay readable. */
function compactUsdRangeLabel(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  const m = s.match(/^\$?\s*([\d,]+(?:\.\d+)?)\s*[-–—]\s*\$?\s*([\d,]+(?:\.\d+)?)\s*$/)
  if (!m) return s
  const a = Number(String(m[1]).replace(/,/g, ''))
  const b = Number(String(m[2]).replace(/,/g, ''))
  if (!Number.isFinite(a) || !Number.isFinite(b)) return s
  const fa = formatUsdBandEndpoint(a)
  const fb = formatUsdBandEndpoint(b)
  if (!fa || !fb) return s
  return `${fa} - ${fb}`
}

function formatSharesCompact(n) {
  const x = Math.abs(Number(n))
  if (!Number.isFinite(x) || x <= 0) return ''
  if (x >= 1e6) return `${(x / 1e6).toFixed(1)}M sh`
  if (x >= 1e3) return `${(x / 1e3).toFixed(1)}K sh`
  if (x >= 100) return `${x.toFixed(1)} sh`
  return `${Math.round(x)} sh`
}

function isBogusInsiderWorksheetKey(key) {
  const k = String(key ?? '').trim()
  if (!k || k === 'Insider' || k === '—') return true
  if (/^P-?\d+$/i.test(k)) return true
  if (/^purchase\s+\d+$/i.test(k)) return true
  return false
}

function insiderFallbackNameFromFeed(fallback) {
  for (const raw of fallback?.insiders ?? []) {
    const name = String(raw ?? '').trim()
    if (!name || isBogusInsiderWorksheetKey(name)) continue
    if (/^(CEO|CFO|CTO|CMO|COO|DIR|OFF|TRUST)\b/i.test(name)) continue
    return name
  }
  return null
}

function insiderRoleFromKey(key) {
  if (isBogusInsiderWorksheetKey(key)) return 'OFF'
  const k = String(key ?? '').trim()
  const m = k.match(/^(CEO|Director|CFO|Officer|DIR|OFF|TRUST)\b/i)
  if (m) {
    const r = m[1].toUpperCase()
    if (r === 'DIRECTOR') return 'DIR'
    if (r === 'OFFICER') return 'OFF'
    return r
  }
  const first = k.split(/\s+/)[0]
  return first ? first.toUpperCase().slice(0, 5) : '—'
}

function mockInsiderPerson(seedA, seedB) {
  return MOCK_INSIDER_PEOPLE[(seedA * 7 + seedB * 3) % MOCK_INSIDER_PEOPLE.length]
}

function mockInsiderSurname(seedA, seedB) {
  return lastName(mockInsiderPerson(seedA, seedB).fullName)
}

/** Last name from worksheet `key` when backend embeds a person name. */
function insiderSurnameFromKey(key) {
  const full = insiderReportingOwnerName({ key })
  return full ? lastName(full) : ''
}

/** Reporting owner display name (no role / txn code from worksheet `key`). */
function insiderReportingOwnerName(r) {
  const direct = String(r?.insider_name ?? r?.person ?? '').trim()
  if (direct) return direct

  const key = String(r?.key ?? '').trim()
  if (key && key !== 'Insider' && key !== '—' && !isBogusInsiderWorksheetKey(key)) {
    let name = key
      .replace(/\bCode\s+[A-Z]{1,2}\b.*$/i, '')
      .replace(/\(.*\)/g, '')
      .replace(/·.*$/, '')
      .trim()
    const afterRole = name.match(
      /^(?:CEO|CFO|CTO|CMO|COO|Director|DIR|OFF|TRUST|Officer)\s+(.+)$/i,
    )
    if (afterRole) name = afterRole[1].trim()
    if (name && !/^(CEO|CFO|CTO|CMO|COO|Director|Officer|DIR|OFF|TRUST)$/i.test(name)) return name
  }

  const surname = String(r?.surname ?? '').trim()
  return surname || ''
}

function insiderTxnCodeTone(code, ad) {
  const c = String(code ?? '').toUpperCase()
  const side = String(ad ?? '').toUpperCase()
  if (c === 'S' || c === 'F' || (c === 'D' && side === 'D') || c === 'E' || c === 'K' || c === 'U' || c === 'Z')
    return 'sell'
  if (c === 'P' || c === 'A' || c === 'M' || c === 'V' || (c === 'I' && side === 'A')) return 'buy'
  return 'neutral'
}

/** Option C value column: `+$1.2M`, `−$890K`, `12.4K sh`, `—`. */
function formatInsiderTxnValue(row) {
  if (row?.amountUsd != null && Number.isFinite(Number(row.amountUsd))) {
    const x = Number(row.amountUsd)
    if (x === 0) return String(row.acquiredDisposed ?? '').toUpperCase() === 'D' ? '−$0' : '—'
    const compact = formatUsdCompact(Math.abs(x))
    if (!compact) return '—'
    const sign = String(row.acquiredDisposed ?? '').toUpperCase() === 'D' ? '−' : '+'
    return `${sign}${compact}`
  }
  const sh = formatSharesCompact(row?.shares)
  return sh || '—'
}

function insiderCaseRowFromSpec(spec, tsIso, seedI = 0, seedK = 0) {
  const role = String(spec?.role ?? 'OFF').toUpperCase()
  const code = String(spec?.code ?? 'P').toUpperCase()
  const person = String(spec?.person ?? mockInsiderPerson(seedI, seedK).fullName).trim()
  const surname = lastName(person)
  return {
    key: person,
    role,
    surname,
    person,
    insider_name: person,
    transactionCode: code,
    acquiredDisposed: String(spec?.ad ?? 'A').toUpperCase() === 'D' ? 'D' : 'A',
    amountUsd: spec?.amountUsd != null ? Number(spec.amountUsd) : null,
    shares: spec?.shares != null ? Number(spec.shares) : null,
    isDerivative: Boolean(spec?.isDerivative),
    ts: tsIso,
  }
}

function mockTxnSpecForCluster(i, k, personOverride = null) {
  const code = FORM4_TXN_CODES_CYCLE[(i * 5 + k * 3) % FORM4_TXN_CODES_CYCLE.length]
  const role = INSIDER_TXN_ROLES[(i + k) % INSIDER_TXN_ROLES.length]
  const person = personOverride ?? mockInsiderPerson(i, k).fullName
  const seed = i * 131 + k * 37
  const isDeriv = code === 'D' || (code === 'P' && k % 7 === 0) || (code === 'S' && k % 9 === 0)
  const ad =
    code === 'S' || code === 'F' || code === 'E' || code === 'K' || code === 'U' || code === 'Z' || (code === 'D' && !isDeriv)
      ? 'D'
      : 'A'

  if (code === 'A' && k % 4 === 0) return { role, person, code, amountUsd: 0, ad }
  if (code === 'A' && k % 4 === 1) return { role, person, code, ad }
  if (code === 'A') return { role, person, code, shares: Math.round(2_000 + seededJitter(seed, 80_000)), ad }

  if (code === 'F' || code === 'H' || code === 'O' || code === 'X') {
    if (k % 3 === 0) return { role, person, code, ad }
    if (k % 3 === 1) return { role, person, code, shares: Math.round(500 + seededJitter(seed, 4_000)), ad }
    return { role, person, code, amountUsd: 0, ad }
  }

  if (code === 'M' && k % 2 === 0) {
    return { role, person, code, shares: Math.round(1_000 + seededJitter(seed, 40_000)), ad }
  }

  if (code === 'G' || code === 'C' || code === 'J' || code === 'W') {
    return { role, person, code, shares: Math.round(200 + seededJitter(seed, 12_000)), ad }
  }

  if (code === 'D' || isDeriv) {
    if (k % 3 === 0)
      return { role, person, code, amountUsd: Math.round(50_000 + seededJitter(seed, 2_500_000)), ad, isDerivative: true }
    if (k % 3 === 1) return { role, person, code, ad, isDerivative: true }
    return { role, person, code, shares: Math.round(500 + seededJitter(seed, 15_000)), ad, isDerivative: true }
  }

  const amountUsd = Math.round(5_000 + seededJitter(seed, code === 'S' ? 3_000_000 : 2_400_000))
  return { role, person, code, amountUsd, ad, isDerivative: isDeriv && code !== 'D' }
}

const CASE_RANGE_FLOOR_ID = '__case_range_floor__'

/**
 * Case txn timeline rows + separators (newest first).
 * With a chart range, appends a virtual floor at the range start so a trailing separator
 * (e.g. THIS MONTH) can appear at the bottom when older rows were clipped.
 */
function buildCaseTxnDisplayRows(items, { sepMode = 'today+years', priceRange } = {}) {
  const rows = Array.isArray(items) ? [...items] : []
  if (!rows.length) return []

  const rangeKey = PRICE_RANGE_OPTS.includes(priceRange) ? priceRange : null
  const rangeStart = rangeKey ? priceRangeWindowStart(rangeKey) : null
  if (rangeStart) {
    const oldest = rows[rows.length - 1]
    const oldestAt = oldest?.at != null ? new Date(oldest.at) : null
    if (oldestAt && !Number.isNaN(oldestAt.getTime()) && oldestAt.getTime() > rangeStart.getTime()) {
      rows.push({ id: CASE_RANGE_FLOOR_ID, at: rangeStart })
    }
  }

  const display = []
  let lastSepLabel = null
  for (const entry of buildFeedDisplayRows(rows, { sepMode, exclusiveSeps: true })) {
    if (entry.type === 'sep') {
      if (entry.label === lastSepLabel) continue
      lastSepLabel = entry.label
      display.push({ type: 'sep', key: entry.key, label: entry.label })
      continue
    }
    const row = entry.row
    if (!row || row.id === CASE_RANGE_FLOOR_ID) continue
    lastSepLabel = null
    display.push(row)
  }
  return display
}

/** Insert TODAY / year separators between case txn rows (newest first). */
function appendCaseTxnTimeline(out, trades, sepMode = 'today+years', opts = {}) {
  if (!trades.length) return out
  const sorted = [...trades].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
  const items = sorted.map((row, idx) => ({
    ...row,
    at: row.ts,
    id: row.id ?? `txn-${row.who}-${row.code}-${idx}`,
  }))
  for (const entry of buildCaseTxnDisplayRows(items, { sepMode, priceRange: opts?.priceRange })) {
    if (entry.type === 'sep') out.push({ type: 'sep', key: entry.key, label: entry.label })
    else out.push(entry)
  }
  return out
}

const PTR_TXN_CODES_CYCLE = ['P', 'S', 'E']
const PTR_AMOUNT_RANGES_MOCK = [
  '$1,001 - $15,000',
  '$15,001 - $50,000',
  '$50,001 - $100,000',
  '$100,001 - $250,000',
]

function politicianTxnCodeFromRaw(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return '—'
  const u = s.toUpperCase()
  if (u.length === 1) return u
  if (u.startsWith('PURCH')) return 'P'
  if (u.startsWith('SAL')) return 'S'
  if (u.startsWith('EXCH')) return 'E'
  return u.charAt(0)
}

function politicianCaseRowHasTxn(r) {
  const range = String(r?.amountRange ?? '').trim()
  if (range) return true
  const amt = Number(r?.amountUsd ?? 0)
  return Number.isFinite(amt) && amt > 0
}

function institutionCaseRowHasTxn(r) {
  const activity = String(r?.activity ?? '').trim()
  if (activity) return true
  const amt = Number(r?.amountUsd ?? 0)
  return Number.isFinite(amt) && amt > 0
}

function institutionActivityCode(activity) {
  return institutionTxnFromActivity(activity).code
}

function investigateCaseRowTxnCode(r, mode) {
  if (mode === 'institutions') {
    if (!institutionCaseRowHasTxn(r)) return null
    return String(r?.activity ?? '').trim() || null
  }
  if (mode === 'politicians') {
    if (!politicianCaseRowHasTxn(r)) return null
    const code = politicianTxnCodeFromRaw(r?.transactionType ?? r?.transactionCode)
    return code === '—' ? null : code
  }
  const code = String(r?.transactionCode ?? '').trim().toUpperCase()
  const usd = Number(r?.amountUsd ?? 0)
  if (!code && !(Number.isFinite(usd) && usd > 0)) return null
  return code || null
}

function investigateCaseRowPassesTxnFilter(r, enabledCodes, mode) {
  if (!enabledCodes?.size) return true
  const code = investigateCaseRowTxnCode(r, mode)
  if (!code) return false
  return enabledCodes.has(code)
}

function filterInvestigateCaseSheetRows(caseSheet, enabledCodes, mode) {
  if (!caseSheet || !enabledCodes?.size) return caseSheet
  const rows = (caseSheet.rows ?? []).filter((r) => investigateCaseRowPassesTxnFilter(r, enabledCodes, mode))
  return { ...caseSheet, rows }
}

/** Drop companies with no matching worksheet rows; recompute feed `at` + today counts. */
function applyInvestigateFeedTxnFilter(rows, enabledCodes, mode) {
  if (!enabledCodes?.size) return rows ?? []
  const out = []
  for (const row of rows ?? []) {
    const cs = row?.caseSheet
    if (!Array.isArray(cs?.rows) || !cs.rows.length) {
      out.push(row)
      continue
    }
    const filtered = filterInvestigateCaseSheetRows(cs, enabledCodes, mode)
    if (!filtered.rows.length) continue
    out.push(normalizeFeedRowActivity({ ...row, caseSheet: filtered }))
  }
  return out
}

function applyInvestigateTxnFilterToFeedRow(row, enabledCodes, mode) {
  if (!row) return row
  const cs = row?.caseSheet
  if (!Array.isArray(cs?.rows) || !cs.rows.length) return row
  const filtered = filterInvestigateCaseSheetRows(cs, enabledCodes, mode)
  if (!filtered.rows.length) return { ...row, caseSheet: filtered }
  return normalizeFeedRowActivity({ ...row, caseSheet: filtered })
}

function formatPoliticianTxnValue(r) {
  const range = String(r?.amountRange ?? '').trim()
  if (range) return compactUsdRangeLabel(range)
  const amt = Number(r?.amountUsd ?? 0)
  if (!(Number.isFinite(amt) && amt > 0)) return '—'
  const code = politicianTxnCodeFromRaw(r?.transactionType ?? r?.transactionCode)
  const compact = formatUsdCompact(amt)
  if (!compact) return '—'
  const sign = code === 'S' ? '−' : code === 'P' ? '+' : ''
  return `${sign}${compact}`
}

function formatInstitutionTxnValue(r) {
  const amt = Number(r?.amountUsd ?? 0)
  if (!(Number.isFinite(amt) && amt > 0)) return '—'
  const compact = formatUsdCompact(amt)
  if (!compact) return '—'
  const activity = String(r?.activity ?? '').trim()
  const sign =
    activity === 'Reduced stake' ? '−' : activity === 'Increased stake' || activity === 'New position' ? '+' : ''
  return `${sign}${compact}`
}

function institutionDisplayShortName(fullName) {
  const raw = String(fullName ?? '').trim()
  if (!raw) return ''
  const stripped = raw.replace(/\b(group|inc|llc|l\.?p\.?|corp|corporation|advisors|management|capital)\b/gi, '').trim()
  const parts = stripped.split(/\s+/).filter(Boolean)
  if (!parts.length) return raw
  if (parts.length === 1) return parts[0]
  return parts[0]
}

/**
 * Profile chip for 13F filers — from the filing only (no external taxonomy).
 * Uses legal-entity suffix on the manager name as filed (LLC, LP, …), else SEC form capacity.
 */
function institutionFilerLabelFromFilingName(fullName) {
  const raw = String(fullName ?? '').trim()
  if (!raw) return 'Investment manager'
  const u = raw.toUpperCase()
  if (/\bL\.?\s*P\.?\b/.test(u) || /\bLP\b/.test(u)) return 'Limited partnership'
  if (/\bLLC\b/.test(u)) return 'LLC'
  if (/\b(TRUST|TR\.)\b/.test(u)) return 'Trust'
  if (/\b(CORP|CORPORATION)\b/.test(u)) return 'Corporation'
  if (/\bINC\b/.test(u) || /\bINCORPORATED\b/.test(u)) return 'Corporation'
  if (/\bGROUP\b/.test(u)) return 'Group'
  if (/\b(BANK|BANCORP|BANKING)\b/.test(u)) return 'Bank'
  if (/\b(ADVISORS|ADVISERS|ADVISORY|MANAGEMENT|CAPITAL)\b/.test(u)) return 'Adviser'
  return 'Investment manager'
}

function caseSheetRowToInstitutionTxnFeedRow(r, { showMoney }) {
  if (!showMoney || !institutionCaseRowHasTxn(r)) return null
  const whoRole = '13F'
  const whoFullName = String(r?.institution_name ?? r?.key ?? '').trim()
  const whoName = institutionDisplayShortName(whoFullName).toUpperCase() || whoFullName
  const matchNames = [...new Set([whoName, whoFullName, institutionDisplayShortName(whoFullName)].filter(Boolean))]
  const txn = institutionTxnFromActivity(r?.activity)
  const when = r?.ts ? formatFeedDate(r.ts) : ''
  return {
    type: 'trade',
    layout: 'txnPolitician',
    who: whoName ? `${whoRole} ${whoName}` : whoRole,
    whoRole,
    whoName,
    whoFullName,
    whoDetail: institutionFilerLabelFromFilingName(whoFullName),
    matchNames,
    code: txn.code,
    codeTitle: txn.label,
    value: formatInstitutionTxnValue(r),
    when,
    codeTone: txn.tone,
    ts: r?.ts ?? null,
  }
}

function caseSheetRowToPoliticianTxnFeedRow(r, { showMoney }) {
  if (!showMoney || !politicianCaseRowHasTxn(r)) return null
  const whoRole = politicianChamberCode(r?.chamber)
  const whoFullName = String(r?.politician_name ?? r?.person ?? r?.key ?? '').trim()
  const whoName = whoFullName ? lastName(whoFullName).toUpperCase() : ''
  const matchNames = [...new Set([whoName, whoFullName, lastName(whoFullName)].filter(Boolean))]
  const code = politicianTxnCodeFromRaw(r?.transactionType ?? r?.transactionCode)
  const when = r?.ts ? formatFeedDate(r.ts) : ''
  return {
    type: 'trade',
    layout: 'txnPolitician',
    who: whoName ? `${whoRole} ${whoName}` : whoRole,
    whoRole,
    whoName,
    whoFullName,
    whoDetail: politicianWhoDetail(whoFullName, whoRole),
    whoCommittee: politicianWhoCommittee(r),
    matchNames,
    code,
    value: formatPoliticianTxnValue(r),
    when,
    codeTone: insiderTxnCodeTone(code, code === 'S' ? 'D' : 'A'),
    ts: r?.ts ?? null,
  }
}

function caseSheetRowToTxnFeedRow(r, { showMoney }) {
  if (!showMoney) return null
  const whoRole = r?.role ? String(r.role).toUpperCase() : insiderRoleFromKey(r?.key)
  const whoName = String(r?.surname ?? insiderSurnameFromKey(r?.key) ?? '')
    .trim()
    .toUpperCase()
  const whoFullName = insiderReportingOwnerName(r) || whoName
  const matchNames = [
    ...new Set([whoName, whoFullName, lastName(whoFullName)].filter(Boolean)),
  ]
  const code = String(r?.transactionCode ?? '').trim().toUpperCase() || '—'
  const when = r?.ts ? formatFeedDate(r.ts) : ''
  return {
    type: 'trade',
    layout: 'txn',
    who: whoName ? `${whoRole} ${whoName}` : whoRole,
    whoRole,
    whoName,
    whoFullName,
    whoDetail: whoRole,
    matchNames,
    code,
    value: formatInsiderTxnValue(r),
    when,
    isDerivative: Boolean(r?.isDerivative),
    codeTone: insiderTxnCodeTone(code, r?.acquiredDisposed),
    ts: r?.ts ?? null,
  }
}

/** Insider worksheet: `18 Apr` (same rhythm as feed date stamps, without year). */
function insiderTxnDateShort(iso) {
  const d = parseDayOnly(iso)
  if (Number.isNaN(d.getTime())) return EMPTY
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
}

/** Calendar day from `YYYY-MM-DD` or Date without UTC drift. */
function parseDayOnly(iso) {
  if (iso instanceof Date) return iso
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return new Date(iso)
}

/** CONTEXT snapshot: next earnings label + optional countdown. */
function contextEarningsFromDate(iso) {
  const d = parseDayOnly(iso)
  if (Number.isNaN(d.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  const daysUntil = Math.round((d.getTime() - today.getTime()) / 86_400_000)
  let countdown = null
  if (daysUntil === 0) countdown = 'today'
  else if (daysUntil === 1) countdown = 'tomorrow'
  else if (daysUntil > 1) countdown = `${daysUntil}d`
  return {
    label: insiderTxnDateShort(d),
    daysUntil,
    countdown,
    soon: daysUntil >= 0 && daysUntil <= 21,
  }
}

function formatCompanySnapshotMcap(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return '—'
  if (/MCAP/i.test(s)) return s
  return `${s} MCAP`
}

function isBlankCompanyMeta(value) {
  const s = String(value ?? '').trim()
  return !s || s === '—' || s === '-' || s === '–' || s === '--'
}

function mergeCompanyPayload(prev, payload) {
  if (!payload || typeof payload !== 'object') return prev
  if (!prev || typeof prev !== 'object') return payload
  const merged = { ...prev, ...payload }
  // Never let a later null/empty profile field wipe a known sector or domicile.
  for (const key of ['industry', 'country', 'name', 'mcap', 'earnings_date']) {
    if (isBlankCompanyMeta(payload[key]) && !isBlankCompanyMeta(prev[key])) {
      merged[key] = prev[key]
    }
  }
  if (payload.fundamentals == null && prev.fundamentals != null) {
    merged.fundamentals = prev.fundamentals
  }
  return merged
}

function resolveCompanySnapshot({ ticker, company, backendUp, price = null }) {
  const t = String(ticker ?? '').trim().toUpperCase() || '—'

  if (backendUp) {
    const c = company && typeof company === 'object' ? company : null
    let resolvedPrice = Number(price)
    if (!(Number.isFinite(resolvedPrice) && resolvedPrice > 0)) {
      const fromApi = Number(c?.latest_close)
      resolvedPrice = Number.isFinite(fromApi) && fromApi > 0 ? fromApi : null
    }
    return {
      ticker: t,
      price: resolvedPrice,
      sector: String(c?.industry ?? '').trim() || '—',
      domicile: contextCountryLabel(c?.country) ?? '—',
      mcap: formatCompanySnapshotMcap(c?.mcap ?? ''),
      earnings: c?.earnings_date ? contextEarningsFromDate(c.earnings_date) : null,
    }
  }

  const mock = contextMockForTicker(t, [])
  const c = company && typeof company === 'object' ? company : null

  const sector = String(c?.industry ?? mock.sector ?? MOCK_COMPANY.industry ?? '').trim() || '—'
  const domicile = contextCountryLabel(c?.country) ?? mock.domicile ?? contextCountryLabel(MOCK_COMPANY.country)
  const mcap = formatCompanySnapshotMcap(c?.mcap ?? mock.mcap ?? MOCK_COMPANY.mcap)

  let resolvedPrice = Number(price)
  if (!(Number.isFinite(resolvedPrice) && resolvedPrice > 0)) {
    const fromApi = Number(c?.latest_close)
    if (Number.isFinite(fromApi) && fromApi > 0) resolvedPrice = fromApi
    else if (Number.isFinite(Number(mock.price)) && mock.price > 0) resolvedPrice = Number(mock.price)
    else resolvedPrice = null
  }

  let earnings = mock.earnings ?? null
  if (c?.earnings_date) {
    earnings = contextEarningsFromDate(c.earnings_date) ?? earnings
  } else if (MOCK_COMPANY.earnings) {
    const d = new Date()
    d.setDate(d.getDate() + 30)
    earnings = contextEarningsFromDate(d)
  }

  return {
    ticker: t,
    price: resolvedPrice,
    sector,
    domicile,
    mcap,
    earnings,
  }
}

/** Research CONTEXT + Insider/Politicians company tile (optional price + chart slot). */
const CompanySnapshotCard = forwardRef(function CompanySnapshotCard(
  {
    ticker,
    price = null,
    sector,
    domicile = null,
    mcap,
    earnings = null,
    lead = null,
    children = null,
  },
  ref,
) {
  const showPrice = price != null && Number.isFinite(Number(price))
  const sectorLabel = String(sector ?? '').trim() || '—'
  const domicileLabel = String(domicile ?? '').trim() || '—'
  const mcapLabel = String(mcap ?? '').trim() || '—'
  return (
    <div ref={ref} className="contextCompanyCard" aria-label="Company snapshot">
      <div className="contextCompanyTopRow">
        <div className="contextCompanyTicker">{ticker}</div>
        <div className={['contextCompanyPrice', showPrice ? '' : 'contextCompanyPrice--empty'].filter(Boolean).join(' ')}>
          {showPrice ? `$${Number(price).toFixed(2)}` : '—'}
        </div>
      </div>
      <div className="contextCompanyMeta">{sectorLabel}</div>
      <div className="contextCompanyMeta contextCompanyMeta--domicile">{domicileLabel}</div>
      <div className="contextCompanyMeta">{mcapLabel}</div>
      {children}
      <div className={['contextCompanyEarnings', lead ? '' : 'contextCompanyEarnings--empty'].filter(Boolean).join(' ')}>
        <span className="contextCompanyEarningsK">LEAD</span>
        <span className="contextCompanyEarningsV">{lead ? lead.label ?? lead.name ?? EMPTY : '—'}</span>
      </div>
      <div
        className={[
          'contextCompanyEarnings',
          earnings?.soon ? 'contextCompanyEarnings--soon' : '',
          earnings ? '' : 'contextCompanyEarnings--empty',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <span className="contextCompanyEarningsK">EARNINGS</span>
        <span className="contextCompanyEarningsV">{earnings ? earnings.label : '—'}</span>
      </div>
    </div>
  )
})

function historicalOutcomeNorm(v) {
  if (v == null) return EMPTY
  let s = String(v).replace(/—/g, '-').trim()
  if (!s || s === '0' || s === '0.0' || s === '0%' || s === '0.00%') return EMPTY
  return s
}

function historicalOutcomeHasDataset(ins) {
  if (!ins) return false
  const raw = ins.sampleSize
  const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n > 0 : Boolean(ins.sampleSize)
}

/** Avg return 1M + win rate from HISTORICAL OUTCOMES (context insider / politician cards). */
function historicalOutcomeHoverRows(ins) {
  if (!historicalOutcomeHasDataset(ins)) return []
  const norm = historicalOutcomeNorm
  const parts = String(norm(ins?.avgReturn21d63d252d) ?? '')
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)
  return [
    { k: 'Avg return 1M', v: parts[0] ?? EMPTY },
    { k: 'Win rate', v: norm(ins?.winRate) },
  ]
}

function parseAvgReturnHorizonPercents(raw) {
  const norm = historicalOutcomeNorm(raw)
  if (norm === EMPTY) return OUTCOME_HORIZON_LABELS.map(() => null)
  const parts = String(norm)
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)
  return OUTCOME_HORIZON_LABELS.map((_, i) => parseOutcomePercent(parts[i]))
}

function historicalOutcomeHasAvgReturns(ins) {
  return parseAvgReturnHorizonPercents(ins?.avgReturn21d63d252d).some((p) => p != null)
}

function parseOutcomesSampleSize(ins) {
  if (!ins) return null
  const raw = ins.sampleSize
  const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

function historicalOutcomesHasDataset(ins) {
  const sampleSizeNum = parseOutcomesSampleSize(ins)
  if (sampleSizeNum != null) return sampleSizeNum > 0
  return Boolean(ins && ins.sampleSize)
}


function historicalOutcomeLinesFromIns(ins, mode) {
  const percents = parseAvgReturnHorizonPercents(ins?.avgReturn21d63d252d)
  const returns = percents.map((p) => (p != null ? p / 100 : null))
  if (!returns.some((r) => Number.isFinite(r))) return []
  const label =
    mode === 'politicians' ? 'Politician' : mode === 'institutions' ? 'Institution' : 'Insider'
  return [
    {
      id: 'aggregate',
      label,
      returns,
      color: CONTEXT_OUTCOME_LINE_COLORS[0],
    },
  ]
}

function formatCasePersonDisplayName(name) {
  const s = String(name ?? '').trim()
  if (!s) return ''
  if (s !== s.toUpperCase()) return s
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function CasePersonHeader({ person, mode = 'insider' }) {
  const rawName = String(person?.fullName ?? '').trim()
  const name = formatCasePersonDisplayName(rawName) || '—'
  const detailPrimary = String(person?.detail ?? '').trim()
  const detailSecondary = String(person?.detailSecondary ?? '').trim()
  const detailLabels = [detailPrimary, detailSecondary].filter((d) => d && d !== EMPTY)
  const modeLabel =
    mode === 'politicians' ? 'politician' : mode === 'institutions' ? 'institution' : 'insider'

  return (
    <div className="casePersonHeader" aria-label={`Selected ${modeLabel}: ${name}`}>
      <div className="casePersonHeaderText">
        <div className="casePersonHeaderDetails">
          {detailLabels.length ? (
            detailLabels.map((label) => (
              <div key={label} className="casePersonHeaderDetail mono">
                {label}
              </div>
            ))
          ) : (
            <div className="casePersonHeaderDetail casePersonHeaderDetail--empty mono">—</div>
          )}
        </div>
        <div className="casePersonHeaderName">{name}</div>
      </div>
    </div>
  )
}

function caseFeedSelectedPersonDisplay(rows, selectedRowIndex, personQuery, mode) {
  const pick = (r) => {
    if (r?.type !== 'trade') return null
    const fullName =
      mode === 'politicians'
        ? String(r.whoFullName ?? politicianDisplayNameFromRow(r) ?? r.whoName ?? '').trim()
        : String(r.whoFullName ?? r.whoName ?? '').trim()
    if (!fullName) return null
    const detail =
      mode === 'politicians'
        ? String(r.whoDetail ?? politicianWhoDetail(r.whoFullName ?? r.whoName, r.whoRole)).trim()
        : mode === 'institutions'
          ? String(r.whoDetail ?? institutionFilerLabelFromFilingName(r.whoFullName ?? r.whoName)).trim()
          : String(r.whoDetail ?? r.whoRole ?? '').trim()
    const detailSecondary =
      mode === 'politicians'
        ? String(r.whoCommittee ?? politicianWhoCommittee(r) ?? '').trim()
        : ''
    return {
      fullName,
      detail: detail || EMPTY,
      detailSecondary: detailSecondary || '',
    }
  }

  const row = selectedRowIndex >= 0 ? rows[selectedRowIndex] : null
  const fromRow = row ? pick(row) : null
  if (fromRow) return fromRow

  const q = String(personQuery ?? '').trim()
  if (q) {
    for (const r of rows) {
      if (r?.type === 'trade' && caseTxnPersonNameMatchesQuery(r, q)) {
        const d = pick(r)
        if (d) return d
      }
    }
  }

  for (const r of rows) {
    const d = pick(r)
    if (d) return d
  }
  return null
}

function HistoricalMarketOutcomesView({ ins, mode, personDisplay = null, loading = false }) {
  const outcomeLines = useMemo(() => historicalOutcomeLinesFromIns(ins, mode), [ins, mode])
  const kvRows = useMemo(() => buildMarketOutcomeKvRows(ins, outcomeLines), [ins, outcomeLines])
  const personLabel = String(personDisplay?.fullName ?? '').trim()
  const fallbackTitle =
    mode === 'politicians'
      ? 'Politician outcomes'
      : mode === 'institutions'
        ? 'Institution outcomes'
        : 'Insider outcomes'
  const title = personLabel ? formatCasePersonDisplayName(personLabel) : fallbackTitle

  return (
    <div className="contextOutcomesPanelWrap">
      <ContextOutcomesKvPanel
        title={title}
        titleVariant={personLabel ? 'person' : 'default'}
        rows={kvRows}
        loading={loading}
      />
    </div>
  )
}

function parseOutcomePercent(v) {
  const s = String(v ?? '').trim()
  if (!s || s === EMPTY || s === '—' || s === '-') return null
  const n = Number(s.replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

function contextOutcomeValueClass(label, value) {
  const n = parseOutcomePercent(value)
  if (n == null) return ''
  const k = String(label ?? '').toLowerCase()
  if (k.includes('win rate')) {
    return n > 50 ? 'contextCardOutcomeV--pos' : 'contextCardOutcomeV--neg'
  }
  if (k.includes('return')) {
    if (n > 0) return 'contextCardOutcomeV--pos'
    if (n < 0) return 'contextCardOutcomeV--neg'
  }
  return ''
}

function ContextFlowCard({ className, outcomeRows, children }) {
  return (
    <div className={['contextFlowCard', className].filter(Boolean).join(' ')} role="listitem">
      <div className="contextFlowCardFace contextFlowCardFace--primary">{children}</div>
      <div className="contextFlowCardFace contextFlowCardFace--outcomes">
        {outcomeRows.length ? (
          outcomeRows.map((row) => (
            <div key={row.k} className="contextCardOutcomeRow">
              <span className="contextCardOutcomeK dim">{row.k}</span>
              <span
                className={['contextCardOutcomeV', 'mono', contextOutcomeValueClass(row.k, row.v)]
                  .filter(Boolean)
                  .join(' ')}
              >
                {row.v}
              </span>
            </div>
          ))
        ) : (
          <div className="contextCardOutcomeRow">
            <span className="contextCardOutcomeK dim">Outcomes</span>
            <span className="contextCardOutcomeV mono dim">{EMPTY}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function buildInsiderDailySeries(seed, len = 20) {
  let v = 48 + (seed % 31)
  const out = []
  for (let j = 0; j < len; j++) {
    const step = Math.round((seededJitter(seed + j * 17, 7) - 3) * 1.4)
    v = clamp(v + step, 22, 158)
    out.push(v)
  }
  return out
}

/**
 * Per-feed-row insider filing + worksheet payload. Values are filled only when formType === 'Form 4'.
 */
function insiderCaseForRowIndex(i) {
  // Mix in some double-digit clusters to stress the count/ticker layout.
  const n = i % 11 === 0 ? 12 : i % 13 === 0 ? 18 : (i % 5) + 1
  const count = n
  const co = MOCK_FEED_UNIVERSE[i] ?? MOCK_FEED_UNIVERSE[i % MOCK_FEED_UNIVERSE.length]
  const ticker = co.ticker
  const at = mockInvestigateFeedAtForIndex(i)
  const primaryInsider = mockInvestigateActorNameForRow(i, 'insider')

  const formType = FORM_TYPES_INSIDER[i % FORM_TYPES_INSIDER.length]
  const isForm4 = formType === 'Form 4'
  const issuer = co.name
  const filingId = `${ticker}-${String(220000 + (i * 7919) % 879000)}`

  const showcaseAllCodes = i === 0 && isForm4
  const rowCount = showcaseAllCodes ? FORM4_TXN_MOCK_SAMPLES.length : count
  const rows = []
  for (let k = 0; k < rowCount; k++) {
    const ts = new Date(at)
    const dayJitter = k === 0 ? 0 : Math.floor(seededJitter(i * 97 + k * 19, 28))
    ts.setDate(ts.getDate() - dayJitter)
    ts.setHours(9 + ((i + k) % 8), ((i * k * 13) % 55) + 5, 0, 0)
    const rowIso = ts.toISOString()
    if (!isForm4) {
      rows.push({ key: '—', amountUsd: null, ts: rowIso })
      continue
    }
    const rawSpec = showcaseAllCodes ? FORM4_TXN_MOCK_SAMPLES[k] : mockTxnSpecForCluster(i, k, primaryInsider)
    const spec = showcaseAllCodes
      ? { ...rawSpec, person: rawSpec.person ?? primaryInsider }
      : rawSpec
    rows.push(insiderCaseRowFromSpec(spec, rowIso, i, k))
  }

  const totalUsd = isForm4
    ? rows.reduce((a, r) => {
        const code = String(r?.transactionCode ?? '').toUpperCase()
        const usd = Number(r?.amountUsd)
        if (code === 'P' && r?.acquiredDisposed === 'A' && Number.isFinite(usd) && usd > 0) return a + usd
        return a
      }, 0)
    : 0
  const label = totalUsd > 0 ? formatUsdCompact(totalUsd) : '—'
  const insiders = [
    ...new Set(
      rows
        .map((r) => String(r?.insider_name ?? r?.person ?? insiderReportingOwnerName(r) ?? '').trim())
        .filter(Boolean),
    ),
  ]

  let lastEventAt = at
  let bestT = -Infinity
  for (const r of rows) {
    const t = new Date(r.ts).getTime()
    if (Number.isFinite(t) && t > bestT) {
      bestT = t
      lastEventAt = r.ts
    }
  }

  const item = {
    id: `ins-${i}`,
    label,
    company: issuer,
    ticker,
    at: lastEventAt,
    insiders,
    daily: buildInsiderDailySeries(i + 31),
    mockTodayCount: mockFeedTodayEventCount(i),
    ...mockIdeaFields(i, 'insider'),
    caseSheet: {
      filingId,
      formType,
      issuer,
      ticker,
      isForm4,
      filedAt: lastEventAt,
      rows,
    },
  }
  return item
}

const INSIDER_FEED_ROWS = sortFeedRowsByAtDesc(
  Array.from({ length: MOCK_INVESTIGATE_FEED_ROWS }, (_, i) =>
    normalizeFeedRowActivity(insiderCaseForRowIndex(i)),
  ),
)

function lastName(name) {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  return (parts.at(-1) ?? '').replace(/[^A-Za-z]/g, '') || String(name ?? '').trim() || '—'
}

function politicianCaseForRowIndex(i) {
  const base = insiderCaseForRowIndex(i)
  const primaryPolitician = mockInvestigateActorNameForRow(i, 'politicians')
  const nPeople = 1
  const people = [primaryPolitician]
  const chamber = i % 5 === 0 ? 'senate' : i % 7 === 0 ? 'executive' : 'house'
  const showcasePelosi = primaryPolitician === 'Nancy Pelosi'
  const sourceRows = showcasePelosi
    ? Array.from({ length: 18 }, (_, k) => {
        const ts = new Date()
        // Keep denser activity inside ~1Y so capture charts / metrics look populated.
        ts.setDate(ts.getDate() - (4 + k * 18 + ((i * 3 + k) % 5)))
        ts.setHours(10 + (k % 6), (k * 7) % 50, 0, 0)
        return {
          ...(base?.caseSheet?.rows?.[k % Math.max(1, base?.caseSheet?.rows?.length ?? 1)] ?? {}),
          amountUsd: Math.round(95_000 + seededJitter(i * 41 + k * 17, 480_000)),
          ts: ts.toISOString(),
        }
      })
    : (base?.caseSheet?.rows ?? [])
  const rows = sourceRows.map((r, idx) => {
    const who = people[idx % people.length]
    const surname = lastName(who)
    // Alternate buy/sell so track-record charts realize multiple round trips.
    const transactionType = showcasePelosi
      ? (idx % 2 === 1 ? 'S' : 'P')
      : PTR_TXN_CODES_CYCLE[(i + idx) % PTR_TXN_CODES_CYCLE.length]
    const amountRange = PTR_AMOUNT_RANGES_MOCK[(i + idx * 2) % PTR_AMOUNT_RANGES_MOCK.length]
    const amountUsd = Number(r?.amountUsd ?? 0)
    const tickers = ['NVDA', 'NVDA', 'NVDA', 'AAPL', 'MSFT', 'NVDA']
    const showcaseTicker = tickers[idx % tickers.length]
    const showcaseName =
      showcaseTicker === 'AAPL'
        ? 'Apple Inc.'
        : showcaseTicker === 'MSFT'
          ? 'Microsoft Corporation'
          : 'NVIDIA Corporation'
    return {
      ...r,
      key: who,
      politician_name: who,
      surname,
      chamber: showcasePelosi ? 'house' : chamber,
      transactionType,
      assetTicker: showcasePelosi ? showcaseTicker : base.ticker,
      assetName: showcasePelosi ? showcaseName : (base.company ?? base.caseSheet?.issuer),
      amountRange: amountUsd > 0 ? amountRange : null,
      acquiredDisposed: transactionType === 'S' ? 'D' : 'A',
    }
  })
  return {
    ...base,
    id: `pol-${i}`,
    company: showcasePelosi ? 'NVIDIA Corporation' : (base.company ?? base.caseSheet?.issuer),
    ticker: showcasePelosi ? 'NVDA' : base.ticker,
    chamber: showcasePelosi ? 'house' : chamber,
    politicians: people,
    ...mockIdeaFields(i, 'politician'),
    caseSheet: {
      ...(base.caseSheet ?? {}),
      formType: 'PTR',
      isForm4: true,
      issuer: showcasePelosi ? 'NVIDIA Corporation' : (base.company ?? base.caseSheet?.issuer),
      rows,
    },
  }
}

const POLITICIAN_FEED_ROWS = sortFeedRowsByAtDesc(
  Array.from({ length: MOCK_INVESTIGATE_FEED_ROWS }, (_, i) =>
    normalizeFeedRowActivity(politicianCaseForRowIndex(i)),
  ),
)

function institutionCaseForRowIndex(i) {
  const base = insiderCaseForRowIndex(i)
  const primaryFiler = mockInvestigateActorNameForRow(i, 'institutions')
  const nFilers = 1
  const filers = [primaryFiler]
  const rows = (base?.caseSheet?.rows ?? []).map((r, idx) => {
    const filer = filers[idx % filers.length]
    const activity = INSTITUTION_ACTIVITY_CYCLE[(i + idx) % INSTITUTION_ACTIVITY_CYCLE.length]
    const seed = i * 97 + idx * 41
    const amountUsd =
      Number(r?.amountUsd) > 0
        ? Number(r.amountUsd)
        : Math.round(500_000 + seededJitter(seed, 90_000_000))
    return {
      key: filer,
      institution_name: filer,
      surname: filer,
      activity,
      amountUsd,
      ts: r.ts,
    }
  })
  const totalUsd = rows.reduce((a, r) => {
    const usd = Number(r?.amountUsd ?? 0)
    return Number.isFinite(usd) && usd > 0 ? a + usd : a
  }, 0)
  const label = totalUsd > 0 ? formatUsdCompact(totalUsd) : '—'
  return {
    ...base,
    id: `inst-${i}`,
    label,
    institutions: filers,
    ...mockIdeaFields(i, 'institution'),
    caseSheet: {
      ...(base.caseSheet ?? {}),
      formType: '13F',
      isForm4: true,
      issuer: base.company ?? base.caseSheet?.issuer,
      rows,
    },
  }
}

const INSTITUTION_FEED_ROWS = sortFeedRowsByAtDesc(
  Array.from({ length: MOCK_INVESTIGATE_FEED_ROWS }, (_, i) =>
    normalizeFeedRowActivity(institutionCaseForRowIndex(i)),
  ),
)

function ContextAlertToggle({ ticker, className = '' }) {
  const { loading, user } = useAuth()
  const sym = String(ticker ?? '').trim().toUpperCase()
  const signedIn = Boolean(user)
  const { tickers, maxTickers, combinedCount, atLimit, canAdd, loaded, busyTicker, toggle } = useAlertWatchlist({
    enabled: signedIn,
  })
  const active = sym && tickers.includes(sym)
  const busy = busyTicker === sym
  const limitBlocked = Boolean(sym && !active && atLimit && !canAdd(sym))
  const disabled = !sym || busy || loading || !signedIn || limitBlocked

  return (
    <button
      type="button"
      className={['contextAlertToggle', active ? 'isActive' : '', className].filter(Boolean).join(' ')}
      aria-pressed={active || undefined}
      aria-label={
        !signedIn
          ? 'Sign in to enable ticker email alerts'
          : limitBlocked
            ? `Watchlist full - ${maxTickers} alerts maximum`
            : active
              ? `Email alerts on for ${sym}`
              : `Enable email alerts for ${sym}`
      }
      title={
        !signedIn
          ? 'Sign in to enable alerts'
          : limitBlocked
            ? `Watchlist full (${combinedCount}/${maxTickers}). Remove an alert in Settings.`
            : active
              ? 'Alerts on - email when new documents arrive'
              : 'Alert me when new documents arrive'
      }
      disabled={disabled}
      onClick={() => {
        if (!sym || busy) return
        if (!signedIn) return
        void toggle(sym)
      }}
    >
      <svg className="contextAlertToggleIcon" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"
        />
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M13.73 21a2 2 0 01-3.46 0"
        />
      </svg>
      {loaded && active ? <span className="contextAlertToggleDot" aria-hidden="true" /> : null}
    </button>
  )
}

function ContextActorAlertToggle({ actorKey, displayName, mode = 'insider', className = '' }) {
  const { loading, user } = useAuth()
  const key = String(actorKey ?? '').trim().toLowerCase()
  const signedIn = Boolean(user)
  const { maxActors, combinedCount, atLimit, canAdd, loaded, busyKey, isSubscribed, toggle } = useActorAlertWatchlist({
    enabled: signedIn,
  })
  const active = key && isSubscribed(key)
  const busy = busyKey === key
  const limitBlocked = Boolean(key && !active && atLimit && !canAdd(key))
  const disabled = !key || busy || loading || !signedIn || limitBlocked
  const name = String(displayName ?? '').trim() || 'this actor'

  return (
    <button
      type="button"
      className={['contextAlertToggle', active ? 'isActive' : '', className].filter(Boolean).join(' ')}
      aria-pressed={active || undefined}
      aria-label={
        !signedIn
          ? 'Sign in to enable actor email alerts'
          : limitBlocked
            ? `Watchlist full - ${maxActors} alerts maximum`
            : active
              ? `Email alerts on for ${name}`
              : `Enable email alerts for ${name}`
      }
      title={
        !signedIn
          ? 'Sign in to enable alerts'
          : limitBlocked
            ? `Watchlist full (${combinedCount}/${maxActors}). Remove an alert in Settings.`
            : active
              ? 'Alerts on - email when new transactions arrive'
              : 'Alert me when this actor has new transactions'
      }
      disabled={disabled}
      onClick={() => {
        if (!key || busy) return
        if (!signedIn) return
        void toggle(key, { display_name: displayName, mode })
      }}
    >
      <svg className="contextAlertToggleIcon" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"
        />
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M13.73 21a2 2 0 01-3.46 0"
        />
      </svg>
      {loaded && active ? <span className="contextAlertToggleDot" aria-hidden="true" /> : null}
    </button>
  )
}

function MainContextPanel({
  ticker,
  price,
  sector,
  domicile = null,
  mcap,
  priceSeries = [],
  insiderPriceMarkers = [],
  politicianPriceMarkers = [],
  earnings = null,
  insiders = [],
  politicians = [],
  filings13f = [],
  trackedInvestorsApi = null,
  fundamentals = null,
  backendUp = false,
  panelClassName = '',
  companyContextLoading = false,
  exploreContextLoading = false,
}) {
  const t = String(ticker ?? '').toUpperCase()
  const [priceRange, setPriceRange] = useState('6M')
  const [snapshotBusy, setSnapshotBusy] = useState(false)
  const snapshotRef = useRef(null)
  const trackedInvestors = useMemo(
    () =>
      buildContextTrackedInvestors({
        insiders,
        politicians,
        filings13f,
        apiRows: trackedInvestorsApi,
      }),
    [insiders, politicians, filings13f, trackedInvestorsApi],
  )
  const trackedInvestorsLoading = backendUp && exploreContextLoading && !trackedInvestors.length
  const fundamentalsLoading = backendUp && companyContextLoading && !fundamentals

  useEffect(() => {
    void preloadContextEarningsBgImage()
  }, [])

  const copySnapshot = useCallback(async () => {
    if (snapshotBusy) return
    const el = snapshotRef.current
    if (!el) return
    setSnapshotBusy(true)
    try {
      await copyElementSnapshotToClipboard(el)
    } finally {
      setSnapshotBusy(false)
    }
  }, [snapshotBusy])

  return (
    <section
      className={[
        'panel',
        'feed',
        'feedCompact',
        'mainContextPanel',
        'mainContextPanel--market',
        panelClassName,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Context"
    >
      <header className="feedCompactHeader researchContextHeader">
        <div className="panelTitle feedCompactTitle">CONTEXT</div>
        <div className="feedCompactHeaderEnd">
          <button
            type="button"
            className="contextScreenshotIcon"
            aria-label="Copy company snapshot"
            title="Copy company snapshot"
            disabled={snapshotBusy}
            onClick={() => void copySnapshot()}
          >
            <PanelScreenshotIcon />
          </button>
          <ContextAlertToggle ticker={t} />
        </div>
      </header>
      <div className="mainContextPanelBody scrollThin">
        <CompanySnapshotCard
          ref={snapshotRef}
          ticker={ticker}
          price={price}
          sector={sector}
          domicile={domicile}
          mcap={mcap}
          earnings={earnings}
        >
          <div className="contextCompanyChart" aria-label="Price chart">
            <MiniPriceChart
              series={priceSeries}
              label={t || 'PRICE'}
              showMeta={false}
              showRangeSelector
              chartAlign="context"
              chartRange={priceRange}
              onChartRangeChange={setPriceRange}
              trimLeadingPlateau
              insiderMarkers={insiderPriceMarkers}
              politicianMarkers={politicianPriceMarkers}
            />
          </div>
        </CompanySnapshotCard>
        <>
          <ContextSection ariaLabel="Fundamentals">
            <ContextFundamentalsCard fundamentals={fundamentals} loading={fundamentalsLoading} />
          </ContextSection>
          <ContextSection ariaLabel="Tracked investors">
            <ContextTrackedInvestorsCard rows={trackedInvestors} loading={trackedInvestorsLoading} />
          </ContextSection>
        </>
      </div>
    </section>
  )
}

function ResearchFeedTickerList({
  selectedTicker,
  onSelectTicker,
  q,
  onQuery,
  filtered,
  loading = false,
  loadingMore = false,
  hasMore = false,
  onLoadMore,
  emptyLabel = 'No feed items yet.',
  showDocumentCount = true,
}) {
  const listRef = useRef(null)
  const [renderLimit, setRenderLimit] = useState(FEED_INITIAL_PAGE_SIZE)
  const feedItems = useMemo(() => {
    const items = (filtered ?? []).map((it) => ({
      ...it,
      id: it.id ?? it.rowKey ?? String(it.ticker ?? ''),
      at: it.at ?? it.feed_at ?? null,
      company: researchFeedRowLabel(it),
    }))
    const dated = items.filter((it) => {
      const t = new Date(it.at).getTime()
      return it.at && Number.isFinite(t)
    })
    const undated = items.filter((it) => {
      const t = new Date(it.at).getTime()
      return !it.at || !Number.isFinite(t)
    })
    return sortFeedRowsTodayEventsFirst([...sortFeedRowsByAtDesc(dated), ...undated])
  }, [filtered])

  const displayRows = useMemo(
    () =>
      buildFeedDisplayRows(feedItems, {
        sepMode: 'today+years',
        exclusiveSeps: true,
        isTodayRow: feedRowHasTodayEvents,
      }),
    [feedItems],
  )

  const feedWhenLabel = (row) =>
    formatFeedDateForRow(row?.at, {
      belowTodayBand: !feedRowHasTodayEvents(row),
    })

  useEffect(() => {
    setRenderLimit(FEED_PAGE_SIZE)
  }, [filtered?.length, q])

  function onScrollLoadMore() {
    const list = listRef.current
    if (!list) return
    const nearBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 60
    if (!nearBottom) return
    setRenderLimit((prev) => Math.min(displayRows.length, prev + FEED_PAGE_SIZE))
    if (hasMore && !loadingMore) onLoadMore?.()
  }

  const visibleDisplayRows = displayRows.slice(
    0,
    Math.min(displayRows.length, Math.max(FEED_PAGE_SIZE, renderLimit)),
  )

  return (
    <>
      <label className="researchFeedSearch">
        <input
          className="researchFeedSearchInput"
          value={q ?? ''}
          placeholder="Search by company"
          onChange={(e) => onQuery?.(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onQuery?.('')
          }}
          aria-label="Search by company or ticker"
          spellCheck={false}
        />
        <svg className="researchFeedSearchIcon" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.75" />
          <path d="M16 16 L20 20" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      </label>
      <div
        ref={listRef}
        className="feedCompactList feedCompactList--scroll scrollThin"
        role="list"
        onScroll={onScrollLoadMore}
      >
        {loading ? (
          <PanelStatusMessage label="Loading feed…" className="feedPanelStatus" />
        ) : !displayRows.length ? (
          <PanelStatusMessage label={emptyLabel} className="feedPanelStatus" />
        ) : (
          visibleDisplayRows.map((entry, i) => {
          if (entry.type === 'sep') {
            return (
              <div
                key={`research-sep-${entry.key}-${i}`}
                className="feedRowTodaySep"
                role="presentation"
              >
                {entry.label}
              </div>
            )
          }
          const it = entry.row
          return (
            <button
              key={it.id ?? it.rowKey ?? it.ticker}
              type="button"
              role="listitem"
              className={[
                'feedRowCompact',
                'feedRowCompact--company',
                String(it.ticker ?? '').toUpperCase() === String(selectedTicker ?? '').toUpperCase()
                  ? 'isActive'
                  : '',
                ideaHighlightClass(it.idea_best),
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onSelectTicker(it.ticker)}
            >
              <span className="feedCell feedCellSymbol mono kvFeedDim">
                {String(it.ticker ?? '').trim().toUpperCase() || '—'}
              </span>
              <span className="feedCell feedCellCompany kvFeedMain">{it.company ?? '—'}</span>
              <span className="feedCell feedCellCount mono kvFeedDim">
                {showDocumentCount && feedCountVisible(it.count) ? (
                  <span className="feedCountTag">{it.count}</span>
                ) : (
                  <span className="feedCountTag feedCountTag--empty" aria-hidden="true">
                    {'\u00a0'}
                  </span>
                )}
              </span>
              <span className="feedCell feedCellWhen mono kvFeedDim">{feedWhenLabel(it)}</span>
            </button>
          )
        })
        )}
        {loadingMore ? <PanelStatusMessage label="Loading more…" className="feedPanelStatus" /> : null}
      </div>
    </>
  )
}


function ResearchTickerPanel({
  selectedTicker,
  onSelectTicker,
  q,
  onQuery,
  filtered,
  showFeedFilter = false,
  feedFilterActive = false,
  feedFilterOpen = false,
  onFeedFilterClick,
  feedFilterPicker = null,
  panelClassName = '',
  feedLoading = false,
  feedLoadingMore = false,
  feedHasMore = false,
  onFeedLoadMore,
  feedEmptyLabel = 'No feed items yet.',
  showDocumentCount = true,
}) {
  const feedFilterBtn = showFeedFilter ? (
    <button
      type="button"
      className={['feedCompactFilterBtn', feedFilterActive ? 'isActive' : ''].filter(Boolean).join(' ')}
      aria-label="Filter feed and timeline"
      title="Filter"
      aria-pressed={feedFilterActive || undefined}
      onClick={() => onFeedFilterClick?.()}
    >
      <FeedFilterIcon />
    </button>
  ) : null

  const tickerList = (
    <ResearchFeedTickerList
      selectedTicker={selectedTicker}
      onSelectTicker={onSelectTicker}
      q={q}
      onQuery={onQuery}
      filtered={filtered}
      loading={feedLoading}
      loadingMore={feedLoadingMore}
      hasMore={feedHasMore}
      onLoadMore={onFeedLoadMore}
      emptyLabel={feedEmptyLabel}
      showDocumentCount={showDocumentCount}
    />
  )

  return (
    <section
      className={[
        'panel',
        'feed',
        'feedCompact',
        'feed--left',
        'researchTicker',
        'researchFeedPanel',        panelClassName,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Ticker selector"
    >
        <>
          <header className="feedCompactHeader">
            <div className="panelTitle feedCompactTitle">FEED</div>
            <div className="feedCompactHeaderEnd">{feedFilterBtn}</div>
          </header>
          <ResearchFeedPaneShell filterOpen={feedFilterOpen} filterPicker={feedFilterPicker}>
            {tickerList}
          </ResearchFeedPaneShell>
        </>
    </section>
  )
}

function CausalGraphFigure({ entities, events, edges }) {
  const wrapRef = useRef(null)
  const [size, setSize] = useState({ w: 640, h: 320 })

  const eventsById = useMemo(() => Object.fromEntries((events ?? []).map((e) => [e.id, e])), [events])

  const visibleEdges = useMemo(() => {
    const cleaned = (edges ?? [])
      .filter((e) => RESEARCH_ALLOWED_EDGE_TYPES.has(String(e?.type ?? '')))
      .map((e) => ({ from: String(e.from), to: String(e.to), type: String(e.type) }))
    return cleaned.filter((e) => e.type !== 'timing_link')
  }, [edges])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    function measure() {
      const rect = wrap.getBoundingClientRect()
      const w = Math.max(320, rect.width)
      const h = Math.max(160, rect.height)
      setSize((prev) => (prev.w !== w || prev.h !== h ? { w, h } : prev))
    }
    const ro = new ResizeObserver(() => requestAnimationFrame(measure))
    ro.observe(wrap)
    measure()
    return () => ro.disconnect()
  }, [])

  const layout = useMemo(() => {
    const w = size.w
    const h = size.h
    const ds = (events ?? [])
      .map((e) => ({ id: e.id, d: parseDay(e.date) }))
      .filter((x) => x.d)
      .sort((a, b) => a.d - b.d)
    const min = ds[0]?.d?.getTime?.() ?? 0
    const max = ds.at(-1)?.d?.getTime?.() ?? Math.max(1, min + 1)
    const span = Math.max(1, max - min)
    const x0 = w * 0.06
    const x1 = w * 0.94

    function xForEvent(eid) {
      const d = parseDay(eventsById?.[eid]?.date)
      if (!d) return w * 0.5
      const t = (d.getTime() - min) / span
      return x0 + (x1 - x0) * clamp(t, 0, 1)
    }

    const evY = h * 0.34
    const entY0 = h * 0.70
    const entY1 = h * 0.88
    const ents = (entities ?? []).slice()
    const m = new Map()
    for (let i = 0; i < (events ?? []).length; i++) {
      const e = events[i]
      m.set(e.id, { kind: 'event', ...e, x: xForEvent(e.id), y: evY })
    }
    for (let i = 0; i < ents.length; i++) {
      const en = ents[i]
      const y = entY0 + ((entY1 - entY0) * (i + 0.5)) / Math.max(1, ents.length)
      // place entities under the mean x of their events (fallback center)
      const hs = (events ?? []).filter((ev) => Array.isArray(ev.entities) && ev.entities.includes(en.id))
      const xs = hs.map((ev) => xForEvent(ev.id))
      const x = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : w * 0.5
      m.set(en.id, { kind: 'entity', ...en, x, y })
    }
    return m
  }, [entities, events, eventsById, size.h, size.w])

  return (
    <div className="researchGraphFigure" aria-label="Causal graph figure">
      <div
        ref={wrapRef}
        className="researchGraphFigureWrap"
        role="img"
        aria-label="Causal graph"
      >
        <svg className="researchGraphSvg" width="100%" height="100%">
          {visibleEdges.map((e) => {
            const a = layout.get(e.from)
            const b = layout.get(e.to)
            if (!a || !b) return null
            const k = `${e.from}->${e.to}:${e.type}`
            return (
              <g key={k}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  className="researchEdge"
                  opacity={0.22}
                />
              </g>
            )
          })}

          {Array.from(layout.values()).map((n) => {
            const isEv = n.kind === 'event'
            const fill = isEv ? sentimentColor(n.sentiment) : undefined
            const r = isEv ? 9 + 3 * impactScore(n.impact) : 9
            return isEv ? (
              <g key={n.id} opacity={1}>
                <rect x={n.x - r} y={n.y - r} width={r * 2} height={r * 2} rx="2" fill={fill} stroke="rgba(255, 255, 255, 0.18)" strokeWidth="1" />
              </g>
            ) : (
              <g key={n.id} className="researchGraphEntity" opacity={1}>
                <circle cx={n.x} cy={n.y} r={r} />
              </g>
            )
          })}
        </svg>
      </div>
      <div className="researchFigureCaption mono dim">
        Evidence graph: squares are events (impact-sized), circles are entities.
      </div>
    </div>
  )
}

const PRICE_RANGE_OPTS = ['1M', '3M', '6M', '1Y', 'YTD']
const PRICE_RANGE_DAYS = { '1M': 30, '3M': 90, '6M': 180, '1Y': 365, YTD: null }
const OVERLAY_QUARTERS_BY_RANGE = { '1M': 1, '3M': 1, '6M': 2, '1Y': 4, YTD: 4 }

function priceRangeDayCount(range, ref = new Date()) {
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

function slicePriceSeriesByRange(series, range) {
  const arr = Array.isArray(series) ? series : []
  const days = priceRangeDayCount(range)
  if (!days || arr.length <= days) return arr
  return arr.slice(-days)
}

function slicePriceDataByRange(series, dates, range) {
  const s = Array.isArray(series) ? series : []
  const d = Array.isArray(dates) ? dates : []
  const n = s.length
  if (!n) return { series: [], dates: [] }
  const days = priceRangeDayCount(range)
  const take = typeof days === 'number' && n > days ? days : n
  const sliced = s.slice(-take)
  if (d.length >= n) return { series: sliced, dates: d.slice(-take) }
  if (d.length === sliced.length) return { series: sliced, dates: d }
  return { series: sliced, dates: buildEvenlySpacedDates(sliced.length) }
}

/** Start of calendar window for chart range (local midnight, inclusive). */
function priceRangeWindowStart(range, ref = new Date()) {
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

function filterMarkersForPriceRange(markers, range) {
  const start = priceRangeWindowStart(range)
  if (!start) return Array.isArray(markers) ? markers : []
  const out = []
  for (const m of markers ?? []) {
    const d = m instanceof Date ? m : new Date(m)
    if (Number.isNaN(d.getTime())) continue
    if (d.getTime() >= start.getTime()) out.push(d)
  }
  return out
}

/** Case txn rows (with `ts`) visible for the same window as chart markers. */
function filterCaseTradesForPriceRange(trades, range) {
  if (!Array.isArray(trades) || !trades.length) return []
  const start = priceRangeWindowStart(range)
  if (!start) return trades
  return trades.filter((t) => {
    if (t?.ts == null) return true
    return markerWithinPriceRange(t.ts, range)
  })
}

function markerWithinPriceRange(marker, range) {
  if (!marker) return false
  const start = priceRangeWindowStart(range)
  if (!start) return true
  const d = marker instanceof Date ? marker : new Date(marker)
  if (Number.isNaN(d.getTime())) return false
  return d.getTime() >= start.getTime()
}

function _signalForEvent(ev) {
  const t = String(ev?.type ?? '').toUpperCase()
  const s = String(ev?.sentiment ?? '').toLowerCase()
  const imp = String(ev?.impact ?? '').toLowerCase()
  if (t.includes('TRIAL') || t.includes('READOUT') || t.includes('FDA') || t.includes('MEETING'))
    return imp === 'high' ? 'Catalyst risk is high; price can gap on headline.' : 'Catalyst risk exists; watch headline timing.'
  if (t.includes('INSIDER'))
    return s === 'bullish'
      ? 'Insider buys can indicate confidence when clustered and near a known window.'
      : 'Insider activity adds signal; interpret against upcoming catalysts.'
  if (t.includes('POLITICIAN'))
    return 'Political PTR disclosures are delayed; treat as exposure confirmation, not necessarily timing alpha.'
  return 'Event contributes evidence; weight depends on proximity to catalysts.'
}

function _whatWhyForEvent(ev) {
  const t = String(ev?.type ?? '').toLowerCase()
  const title = String(ev?.title ?? '')
  if (t === 'fda_meeting')
    return {
      what: title,
      why:
        'Regulatory discussions reshape the probability of approval and can change timelines, endpoints, or labeling expectations.',
    }
  if (t === 'trial_result_rumor')
    return {
      what: title,
      why: 'Pre-readout information leakage often pulls forward price moves and increases volatility into the formal update.',
    }
  if (t === 'insider_buy')
    return {
      what: title,
      why: 'Purchases clustered near known windows can signal belief that risk/reward is skewed, even if timing is imperfect.',
    }
  if (t === 'politician_trade')
    return {
      what: title,
      why: 'PTR trades can validate exposure narratives; treat timing cautiously because disclosures lag the trade date.',
    }
  return { what: title, why: 'It changes the information set and can alter the implied probability of the next catalyst outcome.' }
}

function _structuralInterpretation(events) {
  const es = Array.isArray(events) ? events : []
  const hi = es.filter((e) => String(e?.impact ?? '').toLowerCase() === 'high').length
  const bull = es.filter((e) => String(e?.sentiment ?? '').toLowerCase() === 'bullish').length
  const bear = es.filter((e) => String(e?.sentiment ?? '').toLowerCase() === 'bearish').length
  if (hi >= 2 && bull > bear) return 'Structure resembles “positive leak → positioning → catalyst window” with elevated gap risk.'
  if (hi >= 1 && bear >= bull) return 'Structure resembles “regulatory overhang → narrative counter-signal → repricing window.”'
  return 'Structure looks like mixed evidence with moderate timing risk; prioritize the next dated catalyst.'
}

function seedFromTicker(ticker) {
  const t = String(ticker ?? '').toUpperCase()
  let s = 7
  for (let i = 0; i < t.length; i++) s = (s * 31 + t.charCodeAt(i)) % 10_000
  return s
}

function isEtfTicker(ticker) {
  const t = String(ticker ?? '').toUpperCase()
  return ['XBI', 'IBB', 'ARKG', 'LABU'].includes(t)
}

function mockSignalBits(ticker) {
  const seed = seedFromTicker(ticker)
  const a = Math.floor(seededJitter(seed + 11, 9))
  const b = Math.floor(seededJitter(seed + 29, 9))
  const c = Math.floor(seededJitter(seed + 47, 9))
  const funding = [
    'WFE order acceleration',
    'HBM capacity ramp signal',
    'hyperscaler capex pull-forward',
    'EUV backlog extension',
    'packaging constraint easing',
    'data-center GPU mix shift',
    'custom ASIC attach',
    'memory pricing firming',
    'foundry utilization step-up',
  ][a]
  const hiring = [
    'packaging engineering hiring',
    'fab operations expansion',
    'supply-chain scaling hires',
    'CoWoS capacity build-out',
    'field service EUV hiring',
    'advanced node yield team',
    'datacenter solutions hiring',
    'silicon photonics build-out',
    'systems integration hiring',
  ][b]
  const partnership = [
    'hyperscaler supply agreement',
    'foundry co-development',
    'HBM supply contract',
    'equipment install milestone',
    'defense packaging award',
    'rack-scale platform win',
    'OSAT capacity reservation',
    'design-win disclosure',
    'strategic materials JV',
  ][c]
  return { funding, hiring, partnership }
}

function todayDateStamp() {
  const d = new Date()
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

function formatPaperDateLabel(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return todayDateStamp()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T12:00:00`)
    if (!Number.isNaN(d.getTime())) {
      return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
    }
  }
  return s
}

/** Paper hero subtitle: "Issuer · TICKER · May 28, 2026" */
function paperSubtitle(companyName, ticker, paperDate) {
  const name = String(companyName ?? '').trim()
  const t = String(ticker ?? '').toUpperCase()
  const date = formatPaperDateLabel(paperDate)
  const parts = [name, t].filter(Boolean)
  if (!parts.length) return date
  return `${parts.join(' · ')} · ${date}`
}

function CausalDiagram({ ticker, diagramSpec }) {
  const wrapRef = useRef(null)
  const [size, setSize] = useState({ w: 720, h: 150 })
  const tUpper = String(ticker ?? '').toUpperCase()
  const isForkMergeDiagram = diagramSpec?.layout === 'fork_merge' || tUpper === 'ASML'

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    function sync() {
      const r = el.getBoundingClientRect()
      const w = Math.max(360, Math.floor(r.width))
      const h = Math.max(isForkMergeDiagram ? 250 : 130, Math.floor(r.height))
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }))
    }
    const ro = new ResizeObserver(() => requestAnimationFrame(sync))
    ro.observe(el)
    sync()
    return () => ro.disconnect()
  }, [isForkMergeDiagram])

  const w = size.w
  const h = size.h

  const nodes = useMemo(() => {
    const t = String(ticker ?? '').toUpperCase()
    const ds = diagramSpec

    function forkMergePositionsFromPack(pack) {
      const pad = 8
      const rh = 34
      const rg = 30
      const innerW = Math.max(0, w - pad * 2)
      const topW = Math.min(240, innerW)
      const xTop = pad + (innerW - topW) / 2
      const y0 = pad
      const pairGap = Math.min(24, Math.max(10, Math.floor(innerW * 0.04)))
      const midW = Math.max(100, Math.floor((innerW - pairGap) / 2))
      const midTotal = midW * 2 + pairGap
      const xMidL = pad + (innerW - midTotal) / 2
      const xMidR = xMidL + midW + pairGap
      const y1 = y0 + rh + rg
      const mergeW = Math.min(216, innerW)
      const xMerge = pad + (innerW - mergeW) / 2
      const y2 = y1 + rh + rg
      const botW = Math.min(160, innerW)
      const xBot = pad + (innerW - botW) / 2
      const y3 = y2 + rh + rg
      return [
        { id: pack[0][0], label: pack[0][1], x: xTop, y: y0, w: topW, h: rh },
        { id: pack[1][0], label: pack[1][1], x: xMidL, y: y1, w: midW, h: rh },
        { id: pack[2][0], label: pack[2][1], x: xMidR, y: y1, w: midW, h: rh },
        { id: pack[3][0], label: pack[3][1], x: xMerge, y: y2, w: mergeW, h: rh },
        { id: pack[4][0], label: pack[4][1], x: xBot, y: y3, w: botW, h: rh },
      ]
    }

    if (ds?.layout === 'fork_merge' && Array.isArray(ds.nodes) && ds.nodes.length === 5) {
      const pack = ds.nodes.map((n) => [n.id, n.label])
      return forkMergePositionsFromPack(pack)
    }

    if (ds?.layout === 'causal_loop' && Array.isArray(ds.nodes) && ds.nodes.length === 6) {
      const byLabel = Object.fromEntries(ds.nodes.map((n) => [n.id, n.label]))
      const padX = 1
      const padY = 10
      const colGap = 26
      const rowGap = 26
      const boxW = Math.max(170, Math.floor((w - padX * 2 - colGap * 2) / 3))
      const boxH = 42
      const x0 = padX
      const y0 = padY
      const y1 = y0 + boxH + rowGap
      const xs = [x0, x0 + boxW + colGap, x0 + (boxW + colGap) * 2]
      const topIds = ['t0', 't1', 't2']
      const botIds = ['b0', 'b1', 'b2']
      const top = topIds.map((id, i) => ({
        id,
        label: byLabel[id] || id,
        x: xs[i],
        y: y0,
        w: boxW,
        h: boxH,
      }))
      const bot = botIds.map((id, i) => ({
        id,
        label: byLabel[id] || id,
        x: xs[2 - i],
        y: y1,
        w: boxW,
        h: boxH,
      }))
      return [...top, ...bot]
    }

    if (t === 'ASML') {
      const pad = 8
      const rh = 34
      /* Wide row gap so fork/merge elbows have room; thin gaps make arrows look stacked and messy. */
      const rg = 30
      const innerW = Math.max(0, w - pad * 2)

      const topW = Math.min(240, innerW)
      const xTop = pad + (innerW - topW) / 2
      const y0 = pad

      const pairGap = Math.min(24, Math.max(10, Math.floor(innerW * 0.04)))
      const midW = Math.max(100, Math.floor((innerW - pairGap) / 2))
      const midTotal = midW * 2 + pairGap
      const xMidL = pad + (innerW - midTotal) / 2
      const xMidR = xMidL + midW + pairGap
      const y1 = y0 + rh + rg

      const mergeW = Math.min(216, innerW)
      const xMerge = pad + (innerW - mergeW) / 2
      const y2 = y1 + rh + rg

      const botW = Math.min(160, innerW)
      const xBot = pad + (innerW - botW) / 2
      const y3 = y2 + rh + rg

      const pack =
        t === 'ASML'
          ? [
              ['a0', 'Hyperscaler AI demand'],
              ['a1', 'GPU demand'],
              ['a2', 'Leading-edge fab ramp'],
              ['a3', 'EUV slot / allocation'],
              ['a4', 'ASML EUV supply'],
            ]
          : []

      return [
        { id: pack[0][0], label: pack[0][1], x: xTop, y: y0, w: topW, h: rh },
        { id: pack[1][0], label: pack[1][1], x: xMidL, y: y1, w: midW, h: rh },
        { id: pack[2][0], label: pack[2][1], x: xMidR, y: y1, w: midW, h: rh },
        { id: pack[3][0], label: pack[3][1], x: xMerge, y: y2, w: mergeW, h: rh },
        { id: pack[4][0], label: pack[4][1], x: xBot, y: y3, w: botW, h: rh },
      ]
    }

    const a = isEtfTicker(t)
      ? ['Signal leak / schedule', 'Vol bid rises', 'Constituents gap']
      : ['Process signal', 'Positioning shifts', 'Dated catalyst']
    const b = isEtfTicker(t)
      ? ['Flow chase', 'ETF reprices', 'Distribution resets']
      : ['Headline confirms', 'Flows re-rate', 'Repricing']

    const padX = 1
    const padY = 10
    const colGap = 26
    const rowGap = 26
    const boxW = Math.max(170, Math.floor((w - padX * 2 - colGap * 2) / 3))
    const boxH = 42
    const x0 = padX
    const y0 = padY
    const y1 = y0 + boxH + rowGap
    const xs = [x0, x0 + boxW + colGap, x0 + (boxW + colGap) * 2]

    const top = a.map((label, i) => ({ id: `t${i}`, label, x: xs[i], y: y0, w: boxW, h: boxH }))
    const bot = b.map((label, i) => ({ id: `b${i}`, label, x: xs[2 - i], y: y1, w: boxW, h: boxH }))
    return [...top, ...bot]
  }, [ticker, w, diagramSpec])

  const byId = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes])

  const forkMergeVbH = useMemo(() => {
    const t = String(ticker ?? '').toUpperCase()
    if (diagramSpec?.layout !== 'fork_merge' && t !== 'ASML') return h
    if (!nodes.length) return h
    const pad = 10
    const bottom = Math.max(...nodes.map((n) => n.y + n.h))
    return Math.ceil(bottom + pad)
  }, [ticker, nodes, h, diagramSpec])

  const vbH = isForkMergeDiagram ? forkMergeVbH : h

  const edges = useMemo(() => {
    const t = String(ticker ?? '').toUpperCase()
    const ds = diagramSpec
    if (ds?.edges?.length) {
      return ds.edges
        .map(({ from, to }) => ({ from, to, a: byId[from], b: byId[to], kind: 'main' }))
        .filter((x) => x.a && x.b)
    }
    if (t === 'ASML') {
      return [
        ['a0', 'a1'],
        ['a0', 'a2'],
        ['a1', 'a3'],
        ['a2', 'a3'],
        ['a3', 'a4'],
      ]
        .map(([from, to]) => ({ from, to, a: byId[from], b: byId[to], kind: 'main' }))
        .filter((x) => x.a && x.b)
    }
    const e = [
      ['t0', 't1'],
      ['t1', 't2'],
      ['t2', 'b0'],
      ['b0', 'b1'],
      ['b1', 'b2'],
      ['b2', 't1'], // feedback loop (generic)
    ]
    return e
      .map(([from, to]) => ({ from, to, a: byId[from], b: byId[to], kind: from === 'b2' && to === 't1' ? 'loop' : 'main' }))
      .filter((x) => x.a && x.b)
  }, [byId, ticker, diagramSpec])

  function routedPath(a, b) {
    const axR = a.x + a.w
    const axL = a.x
    const ayC = a.y + a.h / 2
    const ayB = a.y + a.h
    const ayT = a.y

    const bxL = b.x
    const bxR = b.x + b.w
    const byC = b.y + b.h / 2
    const byT = b.y
    const byB = b.y + b.h

    const scx = axL + a.w / 2
    const ecx = bxL + b.w / 2

    // Down: target sits below source (tree branches, merges, stacks)
    if (byT >= ayB - 2) {
      const sy = ayB
      const ey = byT
      const span = Math.max(0, ey - sy)
      /* Center the horizontal bus in the gap so vertical legs are equal and elbows read clearly. */
      const midY = sy + span / 2
      return `M ${scx.toFixed(1)} ${sy.toFixed(1)} L ${scx.toFixed(1)} ${midY.toFixed(1)} L ${ecx.toFixed(1)} ${midY.toFixed(
        1,
      )} L ${ecx.toFixed(1)} ${ey.toFixed(1)}`
    }

    // Up: feedback / loop (source below target on screen)
    if (ayT >= byB - 2) {
      const sy = ayT
      const ey = byB
      const span = Math.max(0, sy - ey)
      const midY = sy - span / 2
      return `M ${scx.toFixed(1)} ${sy.toFixed(1)} L ${scx.toFixed(1)} ${midY.toFixed(1)} L ${ecx.toFixed(1)} ${midY.toFixed(
        1,
      )} L ${ecx.toFixed(1)} ${ey.toFixed(1)}`
    }

    const dx = (bxL + b.w / 2) - (axL + a.w / 2)
    const dy = (byT + b.h / 2) - (ayT + a.h / 2)

    // Mostly vertical transition (top row → bottom row same column-ish)
    if (Math.abs(dx) < 48 && dy > 0) {
      const x = axL + a.w / 2
      const y0 = ayB
      const y1 = byT
      return `M ${x.toFixed(1)} ${y0.toFixed(1)} L ${x.toFixed(1)} ${(y0 + (y1 - y0) * 0.55).toFixed(1)} L ${x.toFixed(
        1,
      )} ${y1.toFixed(1)}`
    }

    // Horizontal/zig transitions: elbow route in whitespace
    const startOnRight = dx >= 0
    const sx = startOnRight ? axR : axL
    const ex = startOnRight ? bxL : bxR
    const sy = ayC
    const ey = byC
    const out = startOnRight ? 16 : -16
    const inw = startOnRight ? -16 : 16
    const midY = (sy + ey) / 2
    return `M ${sx.toFixed(1)} ${sy.toFixed(1)}
      L ${(sx + out).toFixed(1)} ${sy.toFixed(1)}
      L ${(sx + out).toFixed(1)} ${midY.toFixed(1)}
      L ${(ex + inw).toFixed(1)} ${midY.toFixed(1)}
      L ${(ex + inw).toFixed(1)} ${ey.toFixed(1)}
      L ${ex.toFixed(1)} ${ey.toFixed(1)}`.replace(/\s+/g, ' ')
  }

  const forkAria =
    diagramSpec?.layout === 'fork_merge'
      ? 'Evidence chain diagram'
      : tUpper === 'ASML'
        ? 'Supply chain diagram'
        : 'Causal chain diagram'

  const arrowMarkerId = useMemo(() => {
    const s = `research-arrow-${String(ticker ?? 'tk')}-${String(diagramSpec?.layout ?? 'x')}`
    let h0 = 2166136261
    for (let i = 0; i < s.length; i++) h0 = Math.imul(h0 ^ s.charCodeAt(i), 16777619)
    return `researchArrow-${(h0 >>> 0).toString(16)}`
  }, [ticker, diagramSpec?.layout])

  const nodeWashIds = useMemo(() => {
    const s = `research-node-wash-${String(ticker ?? 'tk')}-${String(diagramSpec?.layout ?? 'x')}`
    let h0 = 2166136261
    for (let i = 0; i < s.length; i++) h0 = Math.imul(h0 ^ s.charCodeAt(i), 16777619)
    const hex = (h0 >>> 0).toString(16)
    return { a: `researchNodeWashA-${hex}`, b: `researchNodeWashB-${hex}` }
  }, [ticker, diagramSpec?.layout])

  return (
    <div
      ref={wrapRef}
      className={['researchCausalWrap', isForkMergeDiagram ? 'researchCausalWrap--supply' : ''].filter(Boolean).join(' ')}
      aria-label={forkAria}
      role="img"
    >
      <svg className="researchCausalSvg" viewBox={`0 0 ${w} ${vbH}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          <radialGradient id={nodeWashIds.a} gradientUnits="objectBoundingBox" cx="0" cy="0" r="1.75">
            <stop offset="0%" stopColor={DIAGRAM_NODE_WASH_A} />
            <stop offset="58%" stopColor="rgba(255, 255, 255, 0)" />
          </radialGradient>
          <radialGradient id={nodeWashIds.b} gradientUnits="objectBoundingBox" cx="1" cy="1" r="1.55">
            <stop offset="0%" stopColor={DIAGRAM_NODE_WASH_B} />
            <stop offset="54%" stopColor="rgba(255, 255, 255, 0)" />
          </radialGradient>
          <marker
            id={arrowMarkerId}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={DIAGRAM_ARROW_FILL} />
          </marker>
        </defs>

        {edges.map((e, i) => {
          const d = routedPath(e.a, e.b)
          const loop = e.kind === 'loop'
          return (
            <path
              key={`e-${i}`}
              d={d}
              fill="none"
              stroke={loop ? DIAGRAM_EDGE_LOOP_STROKE : DIAGRAM_EDGE_STROKE}
              strokeWidth="1.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={loop ? '4 4' : undefined}
              markerEnd={`url(#${arrowMarkerId})`}
            />
          )
        })}

        {nodes.map((n) => {
          const edgeNode = n.id === 't1' || n.id === 'a4' || n.id === 'p4'
          const nx = n.x + 0.5
          const ny = n.y + 0.5
          const nw = n.w - 1
          const nh = n.h - 1
          return (
            <g key={n.id}>
              <rect x={nx} y={ny} width={nw} height={nh} rx="6" fill={DIAGRAM_NODE_SURFACE} />
              <rect x={nx} y={ny} width={nw} height={nh} rx="6" fill={`url(#${nodeWashIds.a})`} />
              <rect x={nx} y={ny} width={nw} height={nh} rx="6" fill={`url(#${nodeWashIds.b})`} />
              <rect
                className="researchCausalNodeRim"
                x={nx - 0.5}
                y={ny - 0.5}
                width={nw + 1}
                height={nh + 1}
                rx="6.5"
                fill="none"
                stroke={DIAGRAM_NODE_RIM}
                strokeWidth="1"
                opacity="0.42"
              />
              <rect
                className={['researchCausalNode', edgeNode ? 'researchCausalNode--edge' : ''].filter(Boolean).join(' ')}
                x={nx}
                y={ny}
                width={nw}
                height={nh}
                rx="6"
                fill="none"
                strokeWidth="1.25"
              />
              <text
                className="researchCausalText"
                x={n.x + n.w / 2}
                y={n.y + n.h / 2 + 4}
                textAnchor="middle"
              >
                {n.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function fmtDay(d) {
  const x = parseDay(d)
  if (!x) return '—'
  return `${MONTHS_SHORT[x.getMonth()]} ${String(x.getDate()).padStart(2, '0')}`
}

function volPct(series, n) {
  const xs = Array.isArray(series) ? series : []
  if (xs.length < Math.max(4, n + 2)) return null
  const slice = xs.slice(-n)
  const rets = []
  for (let i = 1; i < slice.length; i++) {
    const a = slice[i - 1]
    const b = slice[i]
    if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0) continue
    rets.push(Math.log(b / a))
  }
  if (rets.length < 3) return null
  const m = rets.reduce((p, q) => p + q, 0) / rets.length
  const v = rets.reduce((p, q) => p + (q - m) * (q - m), 0) / Math.max(1, rets.length - 1)
  const sd = Math.sqrt(Math.max(0, v))
  // simple annualization proxy; we only need a believable datapoint
  const ann = sd * Math.sqrt(252)
  return ann * 100
}

function buildThesisMemo({ ticker, companyName, events, priceSeries, constituents = [] }) {
  const t = String(ticker ?? '').toUpperCase()
  const name = String(companyName ?? '').trim() || t
  const es = (events ?? []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))
  const top = es[0] ?? null
  const hi = es.find((e) => String(e?.impact ?? '').toLowerCase() === 'high') ?? top
  const bits = mockSignalBits(t)

  const rv14 = volPct(priceSeries, 14)
  const rv60 = volPct(priceSeries, 60)
  const rvPhrase =
    rv14 != null && rv60 != null
      ? `Realized vol is ~${rv14.toFixed(0)}% annualized vs ~${rv60.toFixed(0)}% on the last ~3 months, which is the market paying up for timing before it pays up for price.`
      : `Vol is firming before price, which is what you see when timing compresses before confirmation hits the tape.`

  const cNames = (constituents ?? []).filter(Boolean).slice(0, 4)
  const cPhrase = cNames.length ? `${cNames.join(', ')}` : 'mid-cap constituents'

  const chartX = isEtfTicker(t)
    ? 'lagging despite a tightening catalyst window'
    : 'muted versus downstream AI hardware despite tightening supply signals'

  const title = isEtfTicker(t)
    ? `${t}: Biotech catalyst risk is compressing, but price is still treating it as noise`
    : `${t}: Capacity and capex signals are tightening faster than the equity tape admits`

  const openingA = isEtfTicker(t)
    ? `${name} is seeing a clean regime shift: the “date risk” in the underlying ecosystem is compressing into a narrower window, while positioning signals are showing up ahead of the headline. The edge is not “biotech will go up”; the edge is that timing is tightening while the tape still prices it as background noise.`
    : `${name} is entering a positioning regime where upstream bottlenecks—EUV tools, advanced packaging, HBM, and foundry allocation—are binding harder than the headline AI demand narrative implies. The market still prices much of the complex as a simple downstream beta trade, but filings and management language are shifting toward capacity, lead times, and mix rather than unit optimism.`

  const openingB = isEtfTicker(t)
    ? `This matters because dispersion is what drives ETF repricing: the highest-beta names move first, the basket follows, and the lag creates a window where vol is bid but spot is not. If you're early, you get paid twice-first when the market admits the window exists, then when confirmation forces flows.`
    : `This matters because once allocation pressure shows up in order books or guidance, liquidity shifts from passive holders to fast money and repricing happens in weeks, not quarters. The tradeable gap is between “AI demand is strong” (already priced) and “this name owns the choke point” (not fully priced).`

  const priceRef = `Price is still behaving like ${chartX}; that mismatch is the setup, not the conclusion.`

  const core = (() => {
    const dHi = hi?.date ? fmtDay(hi.date) : '—'
    const dTop = top?.date ? fmtDay(top.date) : '—'
    const evA = hi?.title ? `The trigger is already on file: ${dHi} — "${hi.title},"` : 'The trigger is already on file,'
    const evB = top?.title && top?.id !== hi?.id ? ` reinforced by ${dTop} — "${top.title}."` : '.'
    const mech = isEtfTicker(t)
      ? ` What makes this actionable now is that the "soft" signals are not soft anymore: ${rvPhrase} On the fundamental side, you can point to concrete behavior-${cPhrase} are the kind of names that lead early when windows tighten, and we already have process-like signals showing up as ${bits.hiring} plus ${bits.funding} rather than post-hoc narratives.`
      : ` What makes this actionable now is that the signals have become concrete: ${rvPhrase} When you see ${bits.hiring} alongside ${bits.partnership} and ${bits.funding}, it implies internal confidence that the next capacity milestone matters for revenue mix, not just shipment timing.`
    const chain = isEtfTicker(t)
      ? ` The second-order edge is dispersion: leaders gap first, laggards follow, and the ETF reprices last. If you want the tradeable asymmetry, you’re not “long biotech,” you’re long the window: signal leakage tightens timing → vol bid rises → leaders gap → flows chase → ETF reprices.`
      : ` The causal chain is: bottleneck signals tighten → hyperscaler / foundry allocation shifts → order books and lead times move → guidance language changes → counterparties commit → revenue mix and multiples follow.`
    return `${evA}${evB}${mech}${chain}`
  })()

  const causalChain = isEtfTicker(t)
    ? `Process signal → positioning shifts → dated catalyst → confirmation headline → flows re-rate → repricing`
    : `Capacity signal → allocation shift → order book move → guidance language → counterparties commit → repricing`

  const final = isEtfTicker(t)
    ? `Best expression is to be long the window, not the story: long ${t} vol into the next 4-8 weeks while selectively leaning into leaders (${cPhrase}) versus the basket if dispersion picks up. Confirmation is concrete: scheduling language tightens again, realized vol stays elevated while spot lags, and the first gaps appear in the high-beta names before the ETF follows. Invalidation is also concrete: the window pushes out, vol mean-reverts, and moves revert to pure beta with no micro-driven gaps.`
    : `Next, watch for concrete confirmation that the market’s bottleneck view is too low: 8-K or earnings language that moves from “monitoring supply” to “extending lead times,” a hyperscaler or foundry allocation shift, or a gov / defense packaging award that pulls timelines forward. The thesis is confirmed when guidance or order commentary forces revenue expectations higher; it fails if the next dated update softens demand or capacity commentary without replacement signals.`

  const created = todayDateStamp()
  return { created, title, openingA, openingB, priceRef, chartX, core, causalChain, final }
}

function mockPaperFiledAtToday() {
  return mockAtDaysAgo(0, new Date().getHours(), Math.max(1, new Date().getMinutes() - 5))
}

/** Shared offline research document pool — one week × 12 filings per day, reused per ticker. */
const MOCK_RESEARCH_DOC_SPECS = buildMockWeekResearchDocSpecs()

function mockResearchDocumentsForTicker(ticker) {
  const t = String(ticker ?? 'ASML').trim().toUpperCase()
  const showcase = t === 'ASML'
  const name =
    RESEARCH_FEED_ROWS.find((row) => String(row.ticker ?? '').toUpperCase() === t)?.name ?? t
  const narratives = discoverPastForTicker(t)
  const secUrl = `https://www.sec.gov/edgar/search/#/q=${encodeURIComponent(t)}`
  const samUrl = `https://sam.gov/search/?index=opp&page=1&sort=-relevance&keywords=${encodeURIComponent(t)}`

  return MOCK_RESEARCH_DOC_SPECS.map((spec, i) => {
    const narrative = narratives[i % Math.max(1, narratives.length)]
    const headline = narrative?.title ?? String(spec.headline ?? 'filing').trim()
    const sourceLabel = String(spec.source ?? narrative?.source ?? 'Filing')
    const analysisRaw =
      narrative?.summary && String(narrative.summary).trim()
        ? narrative.summary
        : String(spec.analysis ?? '').trim() || String(spec.genericAnalysis ?? '')
    const text = String(analysisRaw)
      .replace(/\{NAME\}/g, name)
      .replace(/\{TICKER\}/g, t)
      .replace(/\{SOURCE\}/g, sourceLabel)
      .replace(/\{HEADLINE\}/g, headline)
    const source = sourceLabel
    const url = source.toLowerCase().includes('gov')
      ? samUrl
      : source.toLowerCase().includes('investor') && t === 'ASML'
        ? 'https://www.asml.com/en/investors'
        : secUrl
    const idea_best = mockIdeaBestForRowIndex(i)
    const idea_score = idea_best ? 82 + (i % 11) : 58 + (i % 14)
    return {
      id: `${t.toLowerCase()}-doc-${spec.slug}`,
      source,
      filedAt: mockAtDaysAgo(spec.daysAgo, spec.hour, spec.minute),
      url,
      ...(showcase && (narrative?.briefKey ?? spec.briefKey) ? { briefKey: narrative?.briefKey ?? spec.briefKey } : {}),
      idea_score,
      idea_best,
      idea_reasons: mockIdeaFields(i, 'research').idea_reasons,
      analysis: text,
    }
  })
}

/** Per-filing AI summaries shown under the paper price chart (newest first). */
const MOCK_PAPER_DOCUMENTS_ASML = mockResearchDocumentsForTicker('ASML')

function paperDocumentOpenUrl(doc, ticker) {
  const source = String(doc?.source ?? '').toLowerCase()
  const t = String(ticker ?? '').trim().toUpperCase()
  const direct = String(doc?.url ?? '').trim()
  if (source.includes('investor') && t === 'ASML' && !direct) {
    return 'https://www.asml.com/en/investors'
  }
  if (source.includes('gov contract') || String(doc?.id ?? '').includes('gov') || source.includes('sam.gov')) {
    if (direct) return resolveDocumentOpenUrl({ url: direct, ticker: t, kind: 'document', source })
    const q = t || 'federal contract award'
    return `https://sam.gov/search/?index=opp&page=1&sort=-relevance&keywords=${encodeURIComponent(q)}`
  }
  return resolveDocumentOpenUrl({
    url: direct || null,
    ticker: t,
    kind: 'document',
    source,
  })
}

function paperTxnOpenUrl({ kind, url, ticker, source, chamber = null }) {
  return resolveDocumentOpenUrl({
    url,
    ticker,
    kind,
    source,
    chamber,
  })
}

function PanelScreenshotIcon() {
  return (
    <svg className="panelScreenshotIconSvg" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="4" width="12" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  )
}

async function copyElementSnapshotToClipboard(sourceEl) {
  if (!sourceEl) return false
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    window.alert(
      'Copying as an image is not supported in this browser. Try Chrome or Edge, or take a screenshot.',
    )
    return false
  }

  const mount = document.createElement('div')
  mount.className = 'panelSnapshotCaptureMount'
  mount.setAttribute('aria-hidden', 'true')
  document.body.appendChild(mount)

  const pngPromise = (async () => {
    try {
      const [earningsBgImage] = await Promise.all([
        resolveContextEarningsBgImage(),
        whenDocumentFontsReady(),
      ])
      const exportNode = buildContextSnapshotExportNode(sourceEl, earningsBgImage)
      mount.appendChild(exportNode)
      await waitForCaptureImages(exportNode)
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const card = exportNode.querySelector('.contextCompanyCard')
      if (!card) throw new Error('Snapshot card missing')
      const blob = await rasterizeElementToPngBlob(card)
      if (!blob) throw new Error('Snapshot rasterize failed')
      return blob
    } finally {
      mount.remove()
    }
  })()

  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngPromise })])
    return true
  } catch (e) {
    console.error(e)
    window.alert('Could not copy the snapshot. Wait until the chart has loaded, then try again.')
    return false
  }
}

async function whenDocumentFontsReady() {
  try {
    const f = document.fonts
    if (f?.ready) await f.ready
  } catch {
    /* ignore */
  }
}

const PAPER_EXPORT_BG = '#0a0b0d'
const CONTEXT_EARNINGS_CAPTURE_IMAGE = '/mercerline_background_2.png'

let contextEarningsBgDataUrlCache = null
let contextEarningsBgImageCache = null
let contextEarningsBgImagePromise = null

function preloadContextEarningsBgImage() {
  if (contextEarningsBgImageCache) return Promise.resolve(contextEarningsBgImageCache)
  if (!contextEarningsBgImagePromise) {
    contextEarningsBgImagePromise = (async () => {
      const dataUrl = await imageUrlToDataUrl(CONTEXT_EARNINGS_CAPTURE_IMAGE)
      contextEarningsBgDataUrlCache = dataUrl
      contextEarningsBgImageCache = dataUrl
        ? `url("${dataUrl}")`
        : `url("${absoluteAssetUrl(CONTEXT_EARNINGS_CAPTURE_IMAGE) ?? CONTEXT_EARNINGS_CAPTURE_IMAGE}")`
      return contextEarningsBgImageCache
    })()
  }
  return contextEarningsBgImagePromise
}

async function resolveContextEarningsBgImage() {
  if (contextEarningsBgImageCache) return contextEarningsBgImageCache
  return preloadContextEarningsBgImage()
}

const SNAPSHOT_SYNC_PROPS = [
  'font-size',
  'font-weight',
  'letter-spacing',
  'line-height',
  'color',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'width',
  'height',
  'min-width',
  'min-height',
  'max-height',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'border-radius',
  'background-color',
  'gap',
  'row-gap',
  'column-gap',
  'display',
  'align-items',
  'justify-content',
  'grid-template-columns',
  'flex-direction',
  'text-align',
  'opacity',
]

function syncContextSnapshotComputedStyles(sourceEl, cloneEl) {
  if (!sourceEl || !cloneEl) return
  const cs = getComputedStyle(sourceEl)
  for (const prop of SNAPSHOT_SYNC_PROPS) {
    const val = cs.getPropertyValue(prop)
    if (val) cloneEl.style.setProperty(prop, val, 'important')
  }
  const sourceKids = [...sourceEl.children].filter((n) => n.nodeType === Node.ELEMENT_NODE)
  const cloneKids = [...cloneEl.children].filter((n) => n.nodeType === Node.ELEMENT_NODE)
  for (let i = 0; i < sourceKids.length; i++) {
    if (cloneKids[i]) syncContextSnapshotComputedStyles(sourceKids[i], cloneKids[i])
  }
}

function buildContextSnapshotExportNode(sourceEl, earningsBgImage) {
  const width = Math.max(1, Math.ceil(sourceEl.getBoundingClientRect().width))
  const root = document.createElement('div')
  root.className = 'terminal--main contextSnapshotCaptureShell'
  root.style.width = `${width}px`

  const panel = document.createElement('div')
  panel.className = 'mainContextPanel mainContextPanel--market'

  const clone = sourceEl.cloneNode(true)
  panel.appendChild(clone)
  root.appendChild(panel)

  syncContextSnapshotComputedStyles(sourceEl, clone)
  primeContextEarningsCaptureLayers(clone, earningsBgImage)
  return root
}

function primeContextEarningsCaptureLayers(root, earningsBgImage) {
  if (!root || !earningsBgImage) return
  for (const el of root.querySelectorAll('.contextCompanyEarnings')) {
    const imageLayer = document.createElement('div')
    imageLayer.className = 'contextCompanyEarningsCaptureBg contextCompanyEarningsCaptureBg--image'
    imageLayer.style.backgroundImage = earningsBgImage
    imageLayer.setAttribute('aria-hidden', 'true')

    const washLayer = document.createElement('div')
    washLayer.className = 'contextCompanyEarningsCaptureBg contextCompanyEarningsCaptureBg--wash'
    washLayer.setAttribute('aria-hidden', 'true')

    el.prepend(imageLayer, washLayer)
    el.classList.add('contextCompanyEarnings--capturePrimed')
  }
}

async function rasterizeElementToPngBlob(el, { pixelRatio: prIn = 2 } = {}) {
  const w = Math.max(1, Math.ceil(Math.max(el.scrollWidth, el.offsetWidth)))
  const h = Math.max(1, Math.ceil(Math.max(el.scrollHeight, el.offsetHeight)))
  const pr = h > 5600 ? 1 : h > 3600 ? 1.25 : prIn
  const computed = getComputedStyle(el).backgroundColor
  const bg = computed && computed !== 'rgba(0, 0, 0, 0)' ? computed : PAPER_EXPORT_BG
  return toBlob(el, {
    width: w,
    height: h,
    pixelRatio: pr,
    cacheBust: false,
    useCORS: true,
    backgroundColor: bg,
    style: {
      backgroundColor: bg,
      printColorAdjust: 'exact',
    },
    filter: (node) => {
      if (node.nodeType !== Node.ELEMENT_NODE) return true
      return node.tagName !== 'SCRIPT'
    },
  })
}

async function waitForCaptureImages(root) {
  const imgs = [...(root?.querySelectorAll('img') ?? [])]
  if (!imgs.length) return
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve()
            return
          }
          const done = () => resolve()
          img.addEventListener('load', done, { once: true })
          img.addEventListener('error', done, { once: true })
        }),
    ),
  )
}

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(blob)
  })
}

function absoluteAssetUrl(url) {
  const raw = String(url ?? '').trim()
  if (!raw) return null
  if (/^https?:\/\//i.test(raw)) return raw
  try {
    return new URL(raw, window.location.origin).href
  } catch {
    return raw
  }
}

/** Load a remote image as a canvas-safe data URL (fetch first — works with congress CDN redirects). */
async function imageUrlToDataUrl(url) {
  const absolute = absoluteAssetUrl(url)
  if (!absolute) return null
  if (absolute.startsWith('data:') || absolute.startsWith('blob:')) return absolute

  try {
    const res = await fetch(absolute, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' })
    if (res.ok) {
      const blob = await res.blob()
      if (blob.size > 0 && (blob.type.startsWith('image/') || blob.type === '')) {
        const dataUrl = await blobToDataUrl(blob)
        if (dataUrl) return dataUrl
      }
    }
  } catch {
    /* fall through to canvas probe */
  }

  return new Promise((resolve) => {
    const probe = new Image()
    probe.crossOrigin = 'anonymous'
    probe.referrerPolicy = 'no-referrer'
    probe.decoding = 'async'
    const finish = (result) => {
      probe.onload = null
      probe.onerror = null
      resolve(result)
    }
    probe.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = probe.naturalWidth
        canvas.height = probe.naturalHeight
        const ctx = canvas.getContext('2d')
        if (!ctx || canvas.width < 1 || canvas.height < 1) {
          finish(null)
          return
        }
        ctx.drawImage(probe, 0, 0)
        finish(canvas.toDataURL('image/jpeg', 0.92))
      } catch {
        finish(null)
      }
    }
    probe.onerror = () => finish(null)
    probe.src = absolute
  })
}

function ResearchPaperFilingCard({ doc, ticker }) {
  const source = doc?.source ?? 'Filing'
  const openUrl = paperDocumentOpenUrl(doc, ticker)
  const handleOpen = openUrl
    ? () => window.open(openUrl, '_blank', 'noopener,noreferrer')
    : undefined
  const Tag = handleOpen ? 'button' : 'article'

  return (
    <Tag
      type={handleOpen ? 'button' : undefined}
      className={[
        'researchPaperFiling',
        handleOpen ? 'researchPaperFiling--clickable' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={handleOpen}
      aria-label={handleOpen ? `Open ${source}` : undefined}
      title={handleOpen ? `Open ${source}` : undefined}
    >
      <div className="researchPaperFilingHead">
        <div className="researchPaperFilingHeadMain">
          <span className="researchPaperFilingSource mono">{source}</span>
        </div>
        <time className="researchPaperFilingDate mono dim" dateTime={doc?.filedAt ?? undefined}>
          {doc?.filedAt ? formatFeedDate(doc.filedAt) : '—'}
        </time>
      </div>
      <EventBriefAnalysis text={doc?.analysis ?? doc?.title} />
    </Tag>
  )
}

function ResearchPaperTimelineGap({ label }) {
  const text = String(label ?? '').trim()
  if (!text) return null
  return <div className="researchPaperFilingSep mono">{text}</div>
}

function mockAsmlPresentation() {
  const intro =
    'Extreme ultraviolet lithography is the binding step for adding leading-edge wafer supply, and ASML is the systems supplier the industry depends on for that step. Output at the most advanced nodes therefore scales with EUV delivery and installation, not with the near-term pace of demand headlines. Market attention and flows still concentrate on accelerators and hyperscale operators because those markets are liquid, well covered, and map cleanly to a simple growth narrative, while lithography capacity is technical and slow to adjust. The result is often a lag between how downstream AI semiconductors reprice and how the upstream tool chain is valued, even when both sit in the same end-use story. The view here is that this lag can persist until allocation pressure in EUV is reflected more fully in ASML’s relative performance.'
  const priceCaption =
    'ASML only. Use it with a broad GPU or AI-semiconductor complex in mind: wide relative strength there versus little movement here implies demand is being discounted ahead of lithography constraint.'
  const middle =
    'Constraint should show up first in order books, delivery timing, and pricing for EUV tools, then propagate into how foundries allocate leading-edge capacity, and only later into the equity prices of the most visible downstream names. That sequencing is what produces the pattern this note targets: downstream beta can extend on expectations while the tool layer is still clearing physical limits. When downstream multiples compress or stabilize while EUV timing stays tight, or when ASML begins to outperform while GPU-heavy semiconductors stall, the original dispersion has largely normalized and the setup described above has largely played through.'
  const diagramCaption =
    'Hyperscaler AI demand branches into GPU-led spending and fab ramps; both bind on finite EUV allocation before reaching ASML-supplied EUV capacity.'
  const action =
    'The obvious side is buy ASML when GPU-heavy semis have ripped and ASML still looks flat against them. You are paying for the lithography choke point while the crowd pays for the louder downstream story, and that mismatch is what this note is about. When ASML later jumps ahead while those names stall, take profits instead of chasing more. Sell only if people start acting like EUV tools are easy to get again or fabs seriously pull back on cutting-edge builds, because then the scarcity story falls apart.'
  return {
    title: 'Leading-edge capacity remains EUV-gated; equity attention still clusters on downstream AI hardware',
    subtitle: paperSubtitle('ASML Holding N.V.', 'ASML'),
    paperDate: todayDateStamp(),
    blocks: [
      { type: 'heading', text: 'Company focus' },
      { type: 'paragraph', text: intro },
      { type: 'heading', text: 'Price' },
      { type: 'price', caption: priceCaption },
      { type: 'heading', text: 'Structural signals' },
      { type: 'paragraph', text: middle },
      { type: 'heading', text: 'Entity map' },
      { type: 'diagram', caption: diagramCaption },
      { type: 'heading', text: 'Implementation angle' },
      { type: 'paragraph', text: action },
    ],
    diagram: undefined,
    documents: MOCK_PAPER_DOCUMENTS_ASML,
    sources: [
      { label: 'ASML - Investor relations', url: 'https://www.asml.com/en/investors' },
      { label: 'SAM.gov - contract awards (mock)', url: 'https://sam.gov/' },
      { label: 'SEC EDGAR search', url: 'https://www.sec.gov/edgar/search/' },
      { label: 'EU regulation - company filings (mock)', url: 'https://www.sec.gov/edgar/search/' },
    ],
  }
}


function mockOfflinePresentation(memo, titleText, ticker) {
  const t = String(ticker ?? '').toUpperCase()
  const priceCaption = `${memo.priceRef} Chart regime: ${memo.chartX}.`
  const diagramCaption = `Causal sketch: ${memo.causalChain}`
  return {
    title: memo.title,
    subtitle: paperSubtitle(String(titleText ?? '').trim() || t, t, memo.created),
    paperDate: memo.created,
    blocks: [
      { type: 'heading', text: 'Company focus' },
      { type: 'paragraph', text: memo.openingA },
      { type: 'paragraph', text: memo.openingB },
      { type: 'heading', text: 'Price' },
      { type: 'price', caption: priceCaption },
      { type: 'heading', text: 'Structural signals' },
      { type: 'paragraph', text: memo.core },
      { type: 'heading', text: 'Entity map' },
      { type: 'diagram', caption: diagramCaption },
      { type: 'heading', text: 'Implementation angle' },
      { type: 'paragraph', text: memo.final },
    ],
    diagram: undefined,
    documents: mockResearchDocumentsForTicker(t),
    sources: [
      { label: 'SEC EDGAR search', url: 'https://www.sec.gov/edgar/search/' },
      { label: 'Company investor materials (mock)', url: 'https://www.sec.gov/edgar/search/' },
    ],
  }
}


function paperDocumentsFromPresentation(presentation) {
  const rows = Array.isArray(presentation?.documents) ? presentation.documents : []
  return [...rows].sort((a, b) => {
    const ta = new Date(a?.filedAt ?? 0).getTime()
    const tb = new Date(b?.filedAt ?? 0).getTime()
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0)
  })
}

function paperTimelineAtMs(at) {
  const t = new Date(at ?? 0).getTime()
  return Number.isFinite(t) ? t : 0
}

function paperTimelineItemAt(item) {
  if (!item) return null
  const raw = item.kind === 'document' ? item.document?.filedAt ?? item.at : item.at
  if (!raw) return null
  const d = raw instanceof Date ? raw : new Date(raw)
  return Number.isFinite(d.getTime()) ? d : null
}

/** Paper timeline rows + separators (same rules as research FEED: `buildFeedDisplayRows`). */
function buildPaperDisplayRows(timelineRows) {
  const items = (timelineRows ?? []).map((item) => {
    const at = paperTimelineItemAt(item)
    return { id: item.id, at: at ?? item.at ?? null, item }
  })
  const dated = items.filter((it) => {
    const t = new Date(it.at).getTime()
    return it.at != null && Number.isFinite(t)
  })
  const undated = items.filter((it) => {
    const t = new Date(it.at).getTime()
    return it.at == null || !Number.isFinite(t)
  })
  const sorted = [...sortFeedRowsByAtDesc(dated), ...undated]
  if (!sorted.length) return []
  return buildFeedDisplayRows(sorted, { sepMode: 'today+years', exclusiveSeps: true })
}

/** Filings + insider / politician / 13F trades for the paper timeline (newest first). */
function buildPaperTimelineItems({ documents = [], insiders = [], politicians = [], filings13f = [] }) {
  const items = []
  for (const doc of paperDocumentsFromPresentation({ documents })) {
    if (!doc?.id) continue
    items.push({ kind: 'document', id: String(doc.id), at: doc.filedAt, document: doc })
  }
  for (let i = 0; i < insiders.length; i++) {
    const row = insiders[i]
    const role = String(row?.key ?? '').trim()
    const person = insiderReportingOwnerName(row) || String(row?.person ?? '').trim()
    const label = paperInsiderTxnLabel(role, person)
    if (label === '—') continue
    items.push({
      kind: 'insider',
      id: `insider-${role}-${person}-${paperTimelineAtMs(row?.date)}-${String(row?.transactionCode ?? '').trim()}-${i}`,
      at: row?.date,
      source: paperTxnSourceLabel('Form 4', row?.transactionCode, 'insider'),
      name: label,
      amount: row?.amount,
      transactionCode: String(row?.transactionCode ?? '').trim().toUpperCase() || null,
      url: row?.url ?? null,
    })
  }
  for (let i = 0; i < politicians.length; i++) {
    const row = politicians[i]
    const member = String(row?.name ?? '').trim()
    const label = paperPoliticianTxnLabel(row?.chamber, member)
    if (label === paperPoliticianChamberLabel(row?.chamber) && !member) continue
    if (!member) continue
    items.push({
      kind: 'politician',
      id: `politician-${member}-${paperTimelineAtMs(row?.date)}-${String(row?.transactionType ?? '').trim()}-${String(row?.amount ?? '').trim()}-${i}`,
      at: row?.date,
      source: paperTxnSourceLabel('PTR', row?.transactionType, 'politician'),
      name: label,
      amount: row?.amount,
      transactionType: row?.transactionType ?? null,
      chamber: row?.chamber ?? null,
      url: row?.url ?? null,
    })
  }
  for (let i = 0; i < filings13f.length; i++) {
    const row = filings13f[i]
    const filer = String(row?.filer ?? '').trim()
    const label = paper13fTxnLabel(filer)
    if (label === '—') continue
    items.push({
      kind: '13f',
      id: `13f-${filer}-${paperTimelineAtMs(row?.date)}-${String(row?.activity ?? '').trim()}-${i}`,
      at: row?.date,
      source: paperTxnSourceLabel('13F', row?.activity, '13f'),
      name: label,
      amount: row?.amount,
      activity: String(row?.activity ?? '').trim() || null,
      url: row?.url ?? null,
    })
  }
  return items.sort((a, b) => paperTimelineAtMs(b?.at) - paperTimelineAtMs(a?.at))
}

function resolveResearchPresentation({ ticker, titleText, backendUp, livePresentation, memo }) {
  const u = String(ticker ?? '').toUpperCase()
  if (backendUp) {
    if (!livePresentation || typeof livePresentation !== 'object') return null
    // Prefer live explore payload whenever it exists (docs may arrive without a title).
    if (livePresentation.title || Array.isArray(livePresentation.documents)) return livePresentation
    return null
  }
  if (u === 'ASML') return mockAsmlPresentation()
  return mockOfflinePresentation(memo, titleText, ticker)
}

/** Transaction / activity sub-filters for expandable source groups in the Research feed picker. */
const RESEARCH_SOURCE_SUBTYPE_GROUPS = {
  'Form 4': INVESTIGATE_INSIDER_TXN_TYPES,
  PTR: INVESTIGATE_POLITICIAN_TXN_TYPES,
  '13F': [
    { id: 'Increased stake', label: 'Increased stake', code: 'INC' },
    { id: 'New position', label: 'New position', code: 'NEW' },
    { id: 'Reduced stake', label: 'Reduced stake', code: 'RED' },
  ],
}

/** Flat insider form keys toggled together with the Form 4 transaction group. */
const RESEARCH_INSIDER_GROUP_FLAT_KEYS = ['Form 3', 'Form 5']

function researchSourceHasSubtypes(sourceId) {
  return Boolean(RESEARCH_SOURCE_SUBTYPE_GROUPS[sourceId]?.length)
}

function researchSourceSubtypeKey(sourceId, subtypeId) {
  return `${sourceId}::${String(subtypeId ?? '').trim()}`
}

function researchSourceFilterKeys() {
  const keys = new Set()
  for (const t of researchPaperSourceTypes()) {
    const subs = RESEARCH_SOURCE_SUBTYPE_GROUPS[t.id]
    if (subs?.length) {
      for (const sub of subs) keys.add(researchSourceSubtypeKey(t.id, sub.id))
    } else {
      keys.add(t.id)
    }
  }
  return keys
}

function researchSourceSubtypeKeysForSource(sourceId) {
  const subs = RESEARCH_SOURCE_SUBTYPE_GROUPS[sourceId]
  if (!subs?.length) return []
  return subs.map((sub) => researchSourceSubtypeKey(sourceId, sub.id))
}

function researchInsiderGroupFilterKeys() {
  return [...RESEARCH_INSIDER_GROUP_FLAT_KEYS, ...researchSourceSubtypeKeysForSource('Form 4')]
}

function enabledHasInvestigateFlowFilters(enabledSources) {
  if (researchInsiderGroupFilterKeys().some((k) => enabledSources.has(k))) return true
  if (researchSourceSubtypeKeysForSource('PTR').some((k) => enabledSources.has(k))) return true
  if (researchSourceSubtypeKeysForSource('13F').some((k) => enabledSources.has(k))) return true
  return false
}

function enabledHasDocumentFilters(enabledSources) {
  for (const t of researchPaperSourceTypes()) {
    if (RESEARCH_SOURCE_SUBTYPE_GROUPS[t.id]?.length) continue
    if (['Form 3', 'Form 4', 'Form 5', 'PTR', '13F'].includes(t.id)) continue
    if (enabledSources.has(t.id)) return true
  }
  return false
}

function paperTimelineItemSubtypeKey(item) {
  if (item?.kind === 'insider') {
    const code = String(item.transactionCode ?? '').trim().toUpperCase()
    if (!code) return null
    const parent = insiderFormSourceFromTxnCode(code)
    if (parent !== 'Form 4') return null
    return researchSourceSubtypeKey('Form 4', code)
  }
  if (item?.kind === 'politician') {
    const code = politicianTxnCodeFromRaw(item.transactionType)
    return code && code !== '—' ? researchSourceSubtypeKey('PTR', code) : null
  }
  if (item?.kind === '13f') {
    const activity = String(item.activity ?? '').trim()
    return activity ? researchSourceSubtypeKey('13F', activity) : null
  }
  return null
}

function insiderFormSourceFromTxnCode(code) {
  const c = String(code ?? '').trim().toUpperCase()
  if (c === 'A' || c === 'M') return 'Form 3'
  if (c === 'F' || c === 'G') return 'Form 5'
  return 'Form 4'
}

function paperTimelineItemSourceKey(item) {
  if (!item) return null
  if (item.kind === 'document') return normalizeResearchPaperSourceKey(item.document?.source)
  if (item.kind === 'insider') return insiderFormSourceFromTxnCode(item.transactionCode)
  if (item.kind === 'politician') return 'PTR'
  if (item.kind === '13f') return '13F'
  return null
}

function researchFeedRowPassesSourceFilter(row, enabledSources) {
  if (isOfflineCuratedResearchFeedRow(row)) return true
  if (!enabledSources?.size) return true
  const fk = String(row?.feed_kind ?? '').toLowerCase()
  const rowId = String(row?.id ?? row?.rowKey ?? '')
  if (!fk) {
    if (rowId.startsWith('inj:')) return true
    return false
  }
  if (fk === 'insider') {
    if (!enabledHasInvestigateFlowFilters(enabledSources)) return false
    const key = normalizeResearchPaperSourceKey(row?.source_key ?? 'Form 4')
    if (key === 'Form 3' || key === 'Form 5') return enabledSources.has(key)
    if (key === 'Form 4') {
      return researchSourceSubtypeKeysForSource('Form 4').some((k) => enabledSources.has(k))
    }
    if (enabledSources.has(key)) return true
    if (researchSourceHasSubtypes(key)) {
      return researchSourceSubtypeKeysForSource(key).some((k) => enabledSources.has(k))
    }
    return false
  }
  if (fk === 'politicians') {
    if (!enabledHasInvestigateFlowFilters(enabledSources)) return false
    return researchSourceSubtypeKeysForSource('PTR').some((k) => enabledSources.has(k))
  }
  if (fk === 'institutions') {
    if (!enabledHasInvestigateFlowFilters(enabledSources)) return false
    return researchSourceSubtypeKeysForSource('13F').some((k) => enabledSources.has(k))
  }
  if (fk === 'research') {
    if (Number(row?.paper_doc_count) === 0) return false
  }
  const docKey = normalizeResearchPaperSourceKey(row?.source_key ?? 'Other')
  if (!docKey || docKey === 'Other') return enabledSources.has('Other')
  if (enabledSources.has(docKey)) return true
  if (researchSourceHasSubtypes(docKey)) {
    return researchSourceSubtypeKeysForSource(docKey).some((k) => enabledSources.has(k))
  }
  return false
}

function paperTimelineItemPassesSourceFilter(item, enabledSources) {
  if (!enabledSources?.size) return true
  if (item?.kind === 'document') {
    return paperDocumentPassesSourceFilter(item.document, enabledSources)
  }
  if (item?.kind === 'insider') {
    const sourceKey = paperTimelineItemSourceKey(item)
    if (sourceKey === 'Form 3' || sourceKey === 'Form 5') {
      return enabledSources.has(sourceKey)
    }
  }
  const subtypeKey = paperTimelineItemSubtypeKey(item)
  if (subtypeKey) return enabledSources.has(subtypeKey)
  const sourceKey = paperTimelineItemSourceKey(item)
  if (sourceKey && researchSourceHasSubtypes(sourceKey)) {
    return researchSourceSubtypeKeysForSource(sourceKey).some((k) => enabledSources.has(k))
  }
  return sourceKey ? enabledSources.has(sourceKey) : false
}

function filterPaperTimelineBySources(items, enabledSources) {
  if (!enabledSources?.size) return Array.isArray(items) ? items : []
  return (items ?? []).filter((item) => paperTimelineItemPassesSourceFilter(item, enabledSources))
}

function paperDocumentPassesSourceFilter(doc, enabledSources) {
  if (!enabledSources?.size) return true
  const key = normalizeResearchPaperSourceKey(doc?.source)
  if (!key) return false
  if (enabledSources.has(key)) return true
  if (researchSourceHasSubtypes(key)) {
    return researchSourceSubtypeKeysForSource(key).some((k) => enabledSources.has(k))
  }
  return false
}

function filterPaperDocumentsBySources(documents, enabledSources) {
  if (!enabledSources?.size) return Array.isArray(documents) ? documents : []
  return (documents ?? []).filter((doc) => paperDocumentPassesSourceFilter(doc, enabledSources))
}

function effectiveResearchPaperSourceFilters(enabledSources) {
  if (!enabledSources?.size) return new Set(researchSourceFilterKeys())
  return enabledSources
}

function researchFeedNameForTicker(ticker) {
  const u = String(ticker ?? '').toUpperCase()
  const row = RESEARCH_FEED_ROWS.find((x) => String(x.ticker).toUpperCase() === u)
  return row?.name ?? u
}

function researchOfflinePresentationForTicker({ ticker, memo }) {
  const u = String(ticker ?? '').toUpperCase()
  const titleText = researchFeedNameForTicker(u)
  if (u === 'ASML') return mockAsmlPresentation()
  return mockOfflinePresentation(memo, titleText, ticker)
}

function buildResearchPaperTimelineForTicker({
  ticker,
  livePresentation = null,
  selectedTicker = null,
  backendUp = false,
  liveFlows = null,
}) {
  const t = String(ticker ?? '').toUpperCase()
  const sel = String(selectedTicker ?? '').toUpperCase()
  const showFlows = true

  if (backendUp) {
    if (!livePresentation?.title || t !== sel) return []
    const docs = paperDocumentsFromPresentation(livePresentation)
    const flows =
      liveFlows && typeof liveFlows === 'object'
        ? liveFlows
        : { insiders: [], politicians: [], filings13f: [] }
    return buildPaperTimelineItems({
      documents: docs,
      insiders: showFlows ? (Array.isArray(flows.insiders) ? flows.insiders : []) : [],
      politicians: showFlows ? (Array.isArray(flows.politicians) ? flows.politicians : []) : [],
      filings13f: showFlows ? (Array.isArray(flows.filings13f) ? flows.filings13f : []) : [],
    })
  }

  const memo = buildThesisMemo({
    ticker: t,
    companyName: researchFeedNameForTicker(t),
    events: mockDatasetForTicker(t).events,
    priceSeries: mockDatasetForTicker(t).price,
    constituents: isEtfTicker(t) ? mockDatasetForTicker(t)?.constituents ?? [] : [],
  })
  const pres = researchOfflinePresentationForTicker({ ticker: t, memo })
  if (!pres?.title) return []
  const docs = paperDocumentsFromPresentation(pres)
  const mock = contextMockForTicker(t, [])
  return buildPaperTimelineItems({
    documents: docs,
    insiders: showFlows ? mock.insiders : [],
    politicians: showFlows ? mock.politicians : [],
    filings13f: showFlows ? mock.filings13f : [],
  })
}

function researchFeedAtFromTimeline(items) {
  let best = null
  let bestT = -Infinity
  for (const item of items ?? []) {
    const d = paperTimelineItemAt(item)
    if (!d) continue
    const t = d.getTime()
    if (Number.isFinite(t) && t > bestT) {
      bestT = t
      best = d.toISOString()
    }
  }
  return best
}

function countResearchFeedEventsToday(timelineItems) {
  let n = 0
  for (const item of timelineItems ?? []) {
    const d = paperTimelineItemAt(item)
    if (d && isAtLocalToday(d)) n += 1
  }
  return n
}

function normalizeResearchFeedRow(row, timelineItems) {
  const timelineAt = researchFeedAtFromTimeline(timelineItems)
  const at = row?.at ?? timelineAt ?? null
  const timelineCount = countResearchFeedEventsToday(timelineItems)
  const explicit = Number(row?.paper_doc_count)
  const todayCount =
    Number.isFinite(explicit) && explicit > 0 ? explicit : timelineCount
  const ticker = String(row?.ticker ?? '').trim().toUpperCase()
  return {
    ...row,
    id: row?.rowKey ?? ticker,
    company: researchFeedRowLabel(row),
    at,
    count: todayCount > 0 ? todayCount : null,
  }
}

function ResearchFeedFilterGroupHead({ sourceId, label, code, subtypeKeys, enabled, onToggleGroup }) {
  const inputRef = useRef(null)
  const enabledCount = subtypeKeys.filter((k) => enabled?.has(k)).length
  const allOn = subtypeKeys.length > 0 && enabledCount === subtypeKeys.length
  const someOn = enabledCount > 0 && !allOn

  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = someOn
  }, [someOn])

  return (
    <label className="feedFilterTypeRow feedFilterTypeRow--groupHead">
      <input
        ref={inputRef}
        type="checkbox"
        checked={allOn}
        onChange={() => onToggleGroup?.(sourceId, !allOn)}
      />
      <span className="feedFilterTypeLabel">{label}</span>
      <span className="feedFilterTypeCode mono" title={sourceId}>
        {code ?? sourceId}
      </span>
    </label>
  )
}

function ResearchFeedFilterPicker({ sourceTypes, enabled, onToggle, onToggleGroup }) {
  const [expanded, setExpanded] = useState(() => new Set())

  const orderedSourceTypes = useMemo(() => {
    const flat = []
    const grouped = []
    for (const t of sourceTypes ?? []) {
      if (RESEARCH_SOURCE_SUBTYPE_GROUPS[t.id]?.length) grouped.push(t)
      else if (!RESEARCH_INSIDER_GROUP_FLAT_KEYS.includes(t.id)) flat.push(t)
    }
    return [...flat, ...grouped]
  }, [sourceTypes])

  const toggleExpanded = (sourceId) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(sourceId)) next.delete(sourceId)
      else next.add(sourceId)
      return next
    })
  }

  return (
    <div className="feedCompactFilterPicker scrollThin researchFeedFilterPicker" role="group" aria-label="Research filters">
      {orderedSourceTypes.map(({ id, label, code }) => {
        const subtypes = RESEARCH_SOURCE_SUBTYPE_GROUPS[id]
        if (subtypes?.length) {
          const subtypeKeys =
            id === 'Form 4' ? researchInsiderGroupFilterKeys() : researchSourceSubtypeKeysForSource(id)
          const isOpen = expanded.has(id)
          return (
            <div key={id} className="feedFilterGroup">
              <div className="feedFilterGroupHead">
                <button
                  type="button"
                  className={['feedFilterGroupExpand', isOpen ? 'isOpen' : ''].filter(Boolean).join(' ')}
                  aria-expanded={isOpen}
                  aria-label={isOpen ? `Collapse ${label}` : `Expand ${label}`}
                  onClick={() => toggleExpanded(id)}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M9 6l6 6-6 6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <ResearchFeedFilterGroupHead
                  sourceId={id}
                  label={label}
                  code={code}
                  subtypeKeys={subtypeKeys}
                  enabled={enabled}
                  onToggleGroup={onToggleGroup}
                />
              </div>
              {isOpen ? (
                <div className="feedFilterGroupBody">
                  {subtypes.map((sub) => {
                    const key = researchSourceSubtypeKey(id, sub.id)
                    return (
                      <label key={key} className="feedFilterTypeRow feedFilterTypeRow--nested">
                        <input
                          type="checkbox"
                          checked={enabled?.has(key) ?? false}
                          onChange={() => onToggle?.(key)}
                        />
                        <span className="feedFilterTypeLabel">{sub.label}</span>
                        <span className="feedFilterTypeCode mono" title={sub.id}>
                          {sub.code ?? sub.id}
                        </span>
                      </label>
                    )
                  })}
                </div>
              ) : null}
            </div>
          )
        }
        return (
          <label key={id} className="feedFilterTypeRow">
            <input
              type="checkbox"
              checked={enabled?.has(id) ?? false}
              onChange={() => onToggle?.(id)}
            />
            <span className="feedFilterTypeLabel">{label}</span>
            <span className="feedFilterTypeCode mono" title={id}>
              {code ?? id}
            </span>
          </label>
        )
      })}
    </div>
  )
}

function ResearchFeedPaneShell({ filterOpen, filterPicker, children, split = false }) {
  return (
    <div
      className={[
        'feedCompactBody',
        'researchFeedBody',
        split ? 'researchFeedBody--split' : '',
        filterOpen ? 'feedCompactBody--filterOpen researchFeedBody--filterOpen' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="feedCompactMain" aria-hidden={filterOpen || undefined}>
        {children}
      </div>
      {filterOpen ? filterPicker : null}
    </div>
  )
}

function ResearchPaperTxnCard({
  source,
  filedAt,
  name,
  amount,
  openUrl = null,
  openLabel = 'Open filing',
}) {
  const label = String(name ?? '').trim()
  const amt = String(amount ?? '').trim()
  const handleOpen = openUrl
    ? () => window.open(openUrl, '_blank', 'noopener,noreferrer')
    : undefined
  const Tag = handleOpen ? 'button' : 'article'
  if (!label && !amt) return null
  return (
    <Tag
      type={handleOpen ? 'button' : undefined}
      className={[
        'researchPaperRailCard',
        'researchPaperTxnCard',
        handleOpen ? 'eventBriefDocCard--clickable' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={handleOpen}
      aria-label={handleOpen ? openLabel : undefined}
      title={handleOpen ? openLabel : undefined}
    >
      <div className="researchPaperRailCardMain">
        <div className="researchPaperRailCardGrid">
          <div className="researchPaperRailCardCol">
            <span className="researchPaperDocCardSource mono dim">{source ?? 'Filing'}</span>
          </div>
          <div className="researchPaperRailCardCol researchPaperRailCardCol--end">
            <time className="researchPaperDocCardDate mono dim" dateTime={filedAt ?? undefined}>
              {filedAt ? formatFeedDate(filedAt) : '—'}
            </time>
          </div>
        </div>
        <div className="researchPaperTxnCardRow">
          <span className="researchPaperTxnCardName">{label || '—'}</span>
          <span className="researchPaperTxnCardAmt mono">{amt || '—'}</span>
        </div>
      </div>
    </Tag>
  )
}

function ResearchPaperStructuredView({
  documents = [],
  insiders = [],
  politicians = [],
  filings13f = [],
  ticker = '',
  paperSourceFilters = null,
}) {
  const t = String(ticker ?? '').toUpperCase()
  const timelineRows = useMemo(() => {
    const raw = buildPaperTimelineItems({ documents, insiders: [], politicians: [], filings13f: [] })
    if (!paperSourceFilters) return raw
    return filterPaperTimelineBySources(raw, paperSourceFilters)
  }, [documents, paperSourceFilters])
  const displayRows = useMemo(() => buildPaperDisplayRows(timelineRows), [timelineRows])
  return (
    <div className="researchPaperTimeline researchPaperTimeline--documentsOnly">
      {displayRows.length ? (
        <div className="researchPaperDocuments" aria-label="Filings">
          {displayRows.map((entry) => {
            if (entry.type === 'sep') {
              return <ResearchPaperTimelineGap key={entry.key} label={entry.label} />
            }
            const item = entry.row.item
            return (
              <Fragment key={item.id}>
                {item.kind === 'document' ? (
                  <ResearchPaperFilingCard doc={item.document} ticker={t} />
                ) : (
                  <ResearchPaperTxnCard
                    source={item.source}
                    filedAt={item.at}
                    name={item.name}
                    amount={item.amount}
                    openUrl={paperTxnOpenUrl({
                      kind: item.kind,
                      url: item.url,
                      ticker: t,
                      source: item.source,
                      chamber: item.chamber,
                    })}
                    openLabel={`Open ${item.source ?? 'filing'}`}
                  />
                )}
              </Fragment>
            )
          })}
        </div>
      ) : (
        <p className="researchPaperEmpty mono dim" role="status">
          No filings or activity match the current filters.
        </p>
      )}
    </div>
  )
}

function ResearchPaperPanel({
  ticker,
  companyName,
  entities: _entities,
  events,
  edges: _edges,
  presentation,
  backendUp,
  dataTicker = null,
  insiders = [],
  politicians = [],
  filings13f = [],
  paperSourceFilters = null,
  panelClassName = '',
  embedded = false,
}) {
  const fullName = String(companyName ?? '').trim() || String(ticker ?? '—').toUpperCase()
  const t = String(ticker ?? '').toUpperCase()
  const dataTick = String(dataTicker ?? '').trim().toUpperCase()
  const presentationReady =
    !backendUp ||
    (Boolean(dataTick) &&
      dataTick === t &&
      (Boolean(presentation?.title) || Boolean(fullName && fullName.toUpperCase() !== '—')))
  const safePresentation = presentationReady ? presentation : null
  const paperBodyRef = useRef(null)

  useLayoutEffect(() => {
    const el = paperBodyRef.current
    if (el) el.scrollTop = 0
  }, [t, presentationReady])

  const paperDocuments = useMemo(() => {
    const docs = paperDocumentsFromPresentation(safePresentation)
    let rows = docs
    if (paperSourceFilters) rows = filterPaperDocumentsBySources(rows, paperSourceFilters)
    return rows
  }, [safePresentation, paperSourceFilters])

  const flowInsiders = presentationReady ? insiders : []
  const flowPoliticians = presentationReady ? politicians : []
  const flowFilings13f = presentationReady ? filings13f : []

  const paperBody = (
    <div
      ref={paperBodyRef}
      className={[
        'researchPaperBody',
        embedded ? 'researchPaperBody--embedded' : 'scrollThin',
        !presentationReady && backendUp ? 'researchPaperBody--pending' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="researchPaperDoc" key={t}>
        {!presentationReady && backendUp ? (
          <div className="researchPaperLoading mono dim" role="status">
            Loading company research…
          </div>
        ) : safePresentation?.title ? (
          <ResearchPaperStructuredView
            key={`${t}-${paperDocuments.map((d) => d.id).join('|')}`}
            ticker={ticker}
            documents={paperDocuments}
            insiders={flowInsiders}
            politicians={flowPoliticians}
            filings13f={flowFilings13f}
            paperSourceFilters={paperSourceFilters}
          />
        ) : backendUp ? (
          <div className="researchThesisBody researchThesisBody--live">
            <p className="researchThesisP researchThesisP--live mono dim">
              Research explore data is not available yet for this view (API error or empty response). Check that the
              backend is running and the database has been ingested.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )

  if (embedded) {
    return (
      <div className={['researchPaperEmbed', panelClassName].filter(Boolean).join(' ')} aria-label={fullName}>
        {paperBody}
      </div>
    )
  }

  return (
    <section
      className={['panel', 'researchPaper', 'researchPaperPanel', panelClassName].filter(Boolean).join(' ')}
      aria-label={fullName}
    >
      <header className="feedCompactHeader">
        <div className="panelTitle feedCompactTitle researchPaperPanelName" key={t}>
          {fullName}
        </div>
      </header>
      {paperBody}
    </section>
  )
}

/** Historical Outcomes tile (blankTile--a): mock aggregates + conditioning facets */
const MOCK_HISTORICAL_INSIDER = {
  avgReturn21d63d252d: '+0.42% / +1.08% / +2.34%',
  medianReturn: '+0.61%',
  winRate: '54%',
  sampleSize: '28,640',
  conditioningRole: 'CEO | director',
  conditioningPolitician: 'Pelosi | Tuberville',
  conditioningTxn: 'Buy | sell',
  conditioningSizePct: 'P40-P90',
}

const MOCK_HISTORICAL_TRIALS = {
  avgAfterPh3Failure: '−18.2%',
  avgAfterPh2Miss: '−11.4%',
  medianReturn: '−14.0%',
  pctLargeDropsOver30: '23%',
  sampleSize: '3,940',
  conditioningIndication: `Alzheimer's | oncology`,
  conditioningCoSize: 'Mid-cap | large-cap',
}

/** Company tile (bottom-right): issuer profile */
const MOCK_COMPANY = {
  industry: 'Semiconductors',
  country: 'US',
  mcap: '$2.8T USD',
  earnings: '28 Aug',
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

/** Y-axis ticks for forward-return charts: linearly spaced on [minFr, maxFr] (even pixel gaps on a linear scale). */
function returnTicks(minFr, maxFr, n = 4) {
  if (!Number.isFinite(minFr) || !Number.isFinite(maxFr)) return []
  if (minFr === maxFr) return [minFr]
  if (n <= 1) return [minFr]
  const span = maxFr - minFr
  const out = []
  for (let i = 0; i < n; i++) {
    out.push(minFr + (i / (n - 1)) * span)
  }
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

/** Width of the widest Y tick label (11px mono graph ticks). */
function estimateChartTickLabelWidth(labels, fontSize = 11) {
  const texts = (Array.isArray(labels) ? labels : []).map((s) => String(s ?? ''))
  if (!texts.length) return 0
  if (typeof document !== 'undefined') {
    try {
      const ctx = document.createElement('canvas').getContext('2d')
      if (ctx) {
        ctx.font = `${fontSize}px ${GRAPH_SVG_FONT}`
        let max = 0
        for (const t of texts) max = Math.max(max, ctx.measureText(t).width)
        if (max > 0) return Math.ceil(max + 3)
      }
    } catch {
      /* use heuristic below */
    }
  }
  const maxLen = texts.reduce((m, s) => Math.max(m, s.length), 1)
  return Math.ceil(maxLen * fontSize * 0.62 + Math.max(0, maxLen - 1) * fontSize * 0.05)
}

/** Left margin so end-anchored Y labels sit flush against the axis (no viewBox gutter). */
function chartYAxisMargin(labels, { gap = 5, fontSize = 11, min = 24, max = 48 } = {}) {
  const textW = estimateChartTickLabelWidth(labels, fontSize)
  return Math.min(max, Math.max(min, textW + gap))
}

/** Forward return fraction → Y-axis label (integer %, compact; no grouping commas). */
function formatReturnTick(v) {
  const x = Number(v)
  if (!Number.isFinite(x)) return EMPTY
  const p = Math.round(x * 100)
  if (p === 0) return '0%'
  if (p > 0) return `+${p}%`
  return `${p}%`
}

function buildMockDailySeries(seed = 42, len = 160) {
  let v = 42 + (seed % 29)
  const out = []
  for (let i = 0; i < len; i++) {
    const step = Math.round((seededJitter(seed + i * 13, 9) - 4) * 1.15)
    v = clamp(v + step, 8, 220)
    out.push(v)
  }
  return out
}

function buildEvenlySpacedDates(count) {
  const n = Math.max(0, Number(count) || 0)
  if (n <= 0) return []
  const now = new Date()
  const out = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    out.push(d)
  }
  return out
}

/** Mock “opportunity board” sourced from research-style papers; size = opportunity score (0–100). */
const MAIN_OPPORTUNITY_MOCK = [
  { sector: 'Pharma', ticker: 'LLY', score: 92, note: 'Catalyst window tightening; flows lagging the setup.' },
  { sector: 'Pharma', ticker: 'VRTX', score: 74, note: 'Program readouts compressing; sentiment still stale.' },
  { sector: 'Pharma', ticker: 'REGN', score: 63, note: 'Quiet accumulation ahead of timeline inflection.' },
  { sector: 'Pharma', ticker: 'MRK', score: 71, note: 'Readout density rising; positioning stale.' },
  { sector: 'Pharma', ticker: 'PFE', score: 55, note: 'Narrative crowded; asymmetric dates nearby.' },
  { sector: 'Biotech', ticker: 'MRNA', score: 68, note: 'Pipeline milestones clustering; vol mispriced.' },
  { sector: 'Biotech', ticker: 'BNTX', score: 59, note: 'Partner headlines lagging underlying signal.' },
  { sector: 'Biotech', ticker: 'SGEN', score: 48, note: 'Quiet tape; catalyst window widening.' },
  { sector: 'MedTech', ticker: 'ISRG', score: 66, note: 'Procedure volumes vs headline fear mismatch.' },
  { sector: 'MedTech', ticker: 'SYK', score: 57, note: 'Stable cashflow; event risk under-modeled.' },
  { sector: 'Energy', ticker: 'XOM', score: 81, note: 'Refining margins + supply narrative mismatch.' },
  { sector: 'Energy', ticker: 'OXY', score: 69, note: 'Positioning skew; asymmetric reaction profile.' },
  { sector: 'Energy', ticker: 'SLB', score: 58, note: 'Capex cycle underpriced vs forward bookings.' },
  { sector: 'Energy', ticker: 'CVX', score: 73, note: 'Macro repricing lag; flows concentrated.' },
  { sector: 'Energy', ticker: 'COP', score: 62, note: 'Balance sheet strength vs sentiment gap.' },
  { sector: 'Renewables', ticker: 'NEE', score: 54, note: 'Rate sensitivity; policy dates stack.' },
  { sector: 'Renewables', ticker: 'ENPH', score: 61, note: 'Inventory cycle noise; demand signal intact.' },
  { sector: 'Materials', ticker: 'FCX', score: 64, note: 'China impulse vs USD regime mismatch.' },
  { sector: 'Materials', ticker: 'NEM', score: 52, note: 'Real yields vs gold beta divergence.' },
  { sector: 'Industrials', ticker: 'CAT', score: 70, note: 'Backlog strength vs cyclical fear.' },
  { sector: 'Industrials', ticker: 'DE', score: 58, note: 'Ag cycle lag; dealer positioning one-sided.' },
  { sector: 'Transports', ticker: 'UNP', score: 56, note: 'Volume inflection; margin narrative stale.' },
  { sector: 'Transports', ticker: 'FDX', score: 63, note: 'Network effects vs headline misses.' },
  { sector: 'Banks', ticker: 'JPM', score: 72, note: 'NII path vs credit fear asymmetry.' },
  { sector: 'Banks', ticker: 'BAC', score: 60, note: 'Deposit beta lag; catalyst calendar dense.' },
  { sector: 'Banks', ticker: 'GS', score: 67, note: 'Vol surface vs positioning mismatch.' },
  { sector: 'Real Estate', ticker: 'PLD', score: 49, note: 'Cap rates vs rent growth cross-currents.' },
  { sector: 'Real Estate', ticker: 'EQIX', score: 58, note: 'AI demand tail; rate sensitivity elevated.' },
  { sector: 'Staples', ticker: 'KO', score: 51, note: 'Defensive bid; micro-catalysts ignored.' },
  { sector: 'Staples', ticker: 'PG', score: 47, note: 'Slow tape; dispersion rising.' },
  { sector: 'Discretionary', ticker: 'AMZN', score: 78, note: 'Retail vs AWS narrative split widening.' },
  { sector: 'Discretionary', ticker: 'TSLA', score: 66, note: 'Event vol vs fundamentals drift.' },
  { sector: 'Discretionary', ticker: 'HD', score: 55, note: 'Housing beta; sentiment overshoot.' },
  { sector: 'Semis', ticker: 'NVDA', score: 88, note: 'Downstream repriced first; upstream still catching.' },
  { sector: 'Semis', ticker: 'AVGO', score: 77, note: 'Causal chain intact; market attention elsewhere.' },
  { sector: 'Semis', ticker: 'AMD', score: 61, note: 'Muted reaction; signal density rising.' },
  { sector: 'Semis', ticker: 'INTC', score: 53, note: 'Turnaround narrative vs timing risk.' },
  { sector: 'Semis', ticker: 'QCOM', score: 59, note: 'Handset cycle vs auto edge mix.' },
  { sector: 'Software', ticker: 'META', score: 72, note: 'Narrative drift; catalysts stack quietly.' },
  { sector: 'Software', ticker: 'MSFT', score: 67, note: 'Latency between product signal and repricing.' },
  { sector: 'Software', ticker: 'CRM', score: 54, note: 'Coverage crowded; contrarian setup forming.' },
  { sector: 'Software', ticker: 'NOW', score: 69, note: 'Enterprise spend signal vs multiple compression.' },
  { sector: 'Software', ticker: 'SNOW', score: 57, note: 'Consumption model vs headline growth.' },
  { sector: 'Comms', ticker: 'GOOGL', score: 75, note: 'Search + AI capex story splitting flows.' },
  { sector: 'Comms', ticker: 'NFLX', score: 62, note: 'Engagement vs pricing power debate.' },
  { sector: 'Comms', ticker: 'DIS', score: 50, note: 'Parks vs streaming mix noise.' },
  { sector: 'Rates/Macro', ticker: 'TLT', score: 76, note: 'Macro driver dominant; reactions lag signal.' },
  { sector: 'Rates/Macro', ticker: 'DXY', score: 52, note: 'Cross-asset mismatch; watch catalyst dates.' },
  { sector: 'Rates/Macro', ticker: 'HYG', score: 58, note: 'Credit impulse vs equity complacency.' },
  { sector: 'FX', ticker: 'EURUSD', score: 45, note: 'Policy divergence; vol cheap vs risks.' },
  { sector: 'FX', ticker: 'USDJPY', score: 56, note: 'Intervention tail; positioning stretched.' },
  { sector: 'Crypto', ticker: 'COIN', score: 83, note: 'Flow regime shift; still under-modeled.' },
  { sector: 'Crypto', ticker: 'MSTR', score: 64, note: 'Volatility premium mispriced vs chain.' },
  { sector: 'Crypto', ticker: 'MARA', score: 49, note: 'Hashprice vs equity beta mismatch.' },
]

function stringHash01(s, salt = 0) {
  const str = String(s ?? '')
  let h = 2166136261 ^ salt
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  // [0,1)
  return ((h >>> 0) % 1000000) / 1000000
}

function oppSignedPct(ticker, score) {
  const s = Math.max(0, Math.min(100, Number(score) || 0))
  const dir = stringHash01(ticker, 17) < 0.76 ? 1 : -1
  const mag = 1.5 + (s / 100) * 18
  const jitter = (stringHash01(ticker, 91) - 0.5) * 3.5
  const pct = dir * (mag + jitter)
  return Math.round(pct * 10) / 10
}

function treemapBinary(items, x, y, w, h) {
  // items: [{ key, area }] — returns rects filling the container with boxy splits (no stripes).
  const xs = items.filter((it) => (Number(it?.area) || 0) > 0)
  const rects = []
  const eps = 0.00001

  function sumArea(list) {
    let s = 0
    for (const it of list) s += Number(it?.area) || 0
    return s
  }

  function split(list) {
    // Deterministic split: keep larger items earlier so the first region (top/left) stays “heavier”.
    const total = sumArea(list) || 1
    const target = total / 2
    const a = []
    const b = []
    let sa = 0
    for (const it of list) {
      if (a.length === 0 || sa + it.area <= target) {
        a.push(it)
        sa += it.area
      } else {
        b.push(it)
      }
    }
    // Ensure both sides are non-empty.
    if (!b.length && a.length > 1) b.push(a.pop())
    if (!a.length && b.length > 1) a.push(b.shift())
    return [a, b]
  }

  function rec(list, rx, ry, rw, rh) {
    if (!list.length || rw <= eps || rh <= eps) return
    if (list.length === 1) {
      rects.push({ key: list[0].key, x: rx, y: ry, w: rw, h: rh })
      return
    }
    const total = sumArea(list) || 1
    const [a, b] = split(list)
    const sa = sumArea(a)
    const ratio = Math.max(0.05, Math.min(0.95, sa / total))

    if (rw >= rh) {
      const wA = rw * ratio
      rec(a, rx, ry, wA, rh)
      rec(b, rx + wA, ry, rw - wA, rh)
    } else {
      const hA = rh * ratio
      rec(a, rx, ry, rw, hA)
      rec(b, rx, ry + hA, rw, rh - hA)
    }
  }

  rec(xs, x, y, w, h)
  return rects
}

const MainOpportunityBoard = memo(function MainOpportunityBoard({ items = MAIN_OPPORTUNITY_MOCK }) {
  const wrapRef = useRef(null)
  const [size, setSize] = useState({ w: 800, h: 360 })

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    function sync() {
      const r = el.getBoundingClientRect()
      const w = Math.max(260, Math.round(r.width))
      const h = Math.max(160, Math.round(r.height))
      setSize((s) => {
        if (Math.abs(s.w - w) <= 1 && Math.abs(s.h - h) <= 1) return s
        return { w, h }
      })
    }
    const ro = new ResizeObserver(() => requestAnimationFrame(sync))
    ro.observe(el)
    sync()
    return () => ro.disconnect()
  }, [])

  const bySector = useMemo(() => {
    const m = new Map()
    for (const it of items ?? []) {
      const sector = String(it?.sector ?? 'Other')
      if (!m.has(sector)) m.set(sector, [])
      m.get(sector).push(it)
    }
    return Array.from(m.entries()).map(([sector, list]) => ({ sector, list }))
  }, [items])

  const layout = useMemo(() => {
    const W = Math.max(1, size.w)
    const H = Math.max(1, size.h)
    // Keep sector title strips slim; CSS padding is tight so reserve less vertical space.
    const headerH = Math.max(14, Math.min(18, Math.round(H * 0.035)))

    const sectorRaw = bySector
      .map(({ sector, list }) => {
        const xs = Array.isArray(list) ? list : []
        let sumW = 0
        for (const it of xs) {
          const s = Math.max(0, Math.min(100, Number(it?.score) || 0))
          sumW += Math.pow(s / 100, 1.25) + 0.02
        }
        return { sector, list: xs, weight: sumW || 0.01 }
      })
      .filter((x) => x.list.length)

    // Order affects binary splits; put biggest sectors toward top-left.
    sectorRaw.sort(
      (a, b) =>
        b.weight - a.weight ||
        a.sector.localeCompare(b.sector),
    )

    const secSum = sectorRaw.reduce((a, b) => a + b.weight, 0) || 1
    const secAreas = sectorRaw.map((s) => ({ key: s.sector, area: (s.weight / secSum) * W * H }))
    const secRects = treemapBinary(secAreas, 0, 0, W, H)
    const secRectBy = new Map(secRects.map((r) => [r.key, r]))

    const out = []
    for (const sec of sectorRaw) {
      const r = secRectBy.get(sec.sector)
      if (!r) continue
      const innerH = Math.max(1, r.h - headerH)
      const inner = { x: r.x, y: r.y + headerH, w: r.w, h: innerH }

      // Per-sector stable “random-ish” ordering, still weighted by score.
      const raw = sec.list
        .map((it) => {
          const ticker = String(it?.ticker ?? '—')
          const score = Math.max(0, Math.min(100, Number(it?.score) || 0))
          const weight = Math.pow(score / 100, 1.25) + 0.02
          return { key: `${sec.sector}:${ticker}`, ticker, score, weight }
        })
        .filter((x) => x.ticker && Number.isFinite(x.weight))

      // Put biggest tickers toward top-left within the sector.
      raw.sort((a, b) => b.weight - a.weight || a.ticker.localeCompare(b.ticker))

      const sum = raw.reduce((a, b) => a + b.weight, 0) || 1
      const itemsWithArea = raw.map((it) => ({ ...it, area: (it.weight / sum) * inner.w * inner.h }))
      const rects = treemapBinary(itemsWithArea, inner.x, inner.y, inner.w, inner.h)
      const byKey = new Map(rects.map((rr) => [rr.key, rr]))

      out.push({ type: 'sector', sector: sec.sector, rect: r, headerH })
      for (const it of raw) {
        const rr = byKey.get(it.key)
        if (!rr) continue
        const pct = oppSignedPct(it.ticker, it.score)
        out.push({ type: 'tile', sector: sec.sector, ticker: it.ticker, score: it.score, pct, rect: rr })
      }
    }
    return out
  }, [bySector, size.w, size.h])

  return (
    <div ref={wrapRef} className="oppGrid oppGrid--main" aria-label="Opportunity board" role="list">
      {layout.map((it) => {
        const r = it.rect
        const left = (r.x / size.w) * 100
        const top = (r.y / size.h) * 100
        const width = (r.w / size.w) * 100
        const height = (r.h / size.h) * 100

        if (it.type === 'sector') {
          return (
            <div
              key={`sec-${it.sector}`}
              className="oppSectorBox"
              style={{
                left: `${left.toFixed(3)}%`,
                top: `${top.toFixed(3)}%`,
                width: `${width.toFixed(3)}%`,
                height: `${height.toFixed(3)}%`,
              }}
              aria-label={`${it.sector} sector`}
            >
              <div className="oppSectorHeader">
                <div className="panelTitle feedCompactTitle">{String(it.sector).toUpperCase()}</div>
              </div>
            </div>
          )
        }

        const pos = it.pct >= 0
        return (
          <div
            key={`${it.sector}:${it.ticker}`}
            className={pos ? 'oppTile oppTile--pos' : 'oppTile oppTile--neg'}
            style={{
              left: `${left.toFixed(3)}%`,
              top: `${top.toFixed(3)}%`,
              width: `${width.toFixed(3)}%`,
              height: `${height.toFixed(3)}%`,
            }}
            role="listitem"
          >
            <div className="oppTileTop">
              <div className="oppTicker mono">{it.ticker}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
})

function pctAxisTicks(yMin, yMax, n = 4) {
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) return []
  if (yMin === yMax) return [yMin]
  const out = []
  for (let i = 0; i < n; i++) out.push(yMin + (i / (n - 1)) * (yMax - yMin))
  return out.map((v) => Math.round(v * 10) / 10)
}

function formatPctAxis(v) {
  const x = Number(v)
  if (!Number.isFinite(x)) return EMPTY
  const s = x.toFixed(1)
  return `${s}%`
}

const MainTopPicksBarChart = memo(function MainTopPicksBarChart({ bars = [] }) {
  const wrapRef = useRef(null)
  const [size, setSize] = useState({ w: 320, h: 160 })

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    function sync() {
      const r = el.getBoundingClientRect()
      const w = Math.max(220, Math.round(r.width))
      const h = Math.max(100, Math.round(r.height))
      setSize((s) => {
        if (Math.abs(s.w - w) <= 1 && Math.abs(s.h - h) <= 1) return s
        return { w, h }
      })
    }
    const ro = new ResizeObserver(() => requestAnimationFrame(sync))
    ro.observe(el)
    sync()
    return () => ro.disconnect()
  }, [])

  const w = size.w
  const h = size.h
  const margin = { l: 38, r: 8, t: 8, b: 30 }
  const innerW = Math.max(1, w - margin.l - margin.r)
  const innerH = Math.max(1, h - margin.t - margin.b)
  const list = Array.isArray(bars) && bars.length ? bars : []
  const pcts = list.length ? list.map((b) => b.pct) : [0]
  const rawMin = list.length ? Math.min(0, ...pcts) : 0
  const rawMax = list.length ? Math.max(0, ...pcts) : 0
  const span0 = rawMax - rawMin || 1
  const pad = Math.max(span0 * 0.1, 0.5)
  let yMin = rawMin - pad
  let yMax = rawMax + pad
  if (list.length && yMax - yMin < 3) {
    const mid = (yMin + yMax) / 2
    yMin = mid - 1.5
    yMax = mid + 1.5
  }
  const ySpan = yMax - yMin || 1

  function yAt(v) {
    return margin.t + (1 - (v - yMin) / ySpan) * innerH
  }

  const y0 = yAt(0)
  const yTicks = useMemo(() => (list.length ? pctAxisTicks(yMin, yMax, 4) : []), [list.length, yMin, yMax])
  const n = list.length
  const slot = innerW / Math.max(1, n)
  const barW = Math.max(4, slot * 0.46)

  return (
    <div ref={wrapRef} className="graphWrap" aria-label="Top picks ticker performance">
      {!list.length ? (
        <div className="graphEmpty mono dim">No top picks data from the API yet.</div>
      ) : (
        <svg className="graphSvg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" role="img">
        <path
          className="graphAxis"
          d={`M ${margin.l} ${margin.t} L ${margin.l} ${h - margin.b} L ${w - margin.r} ${h - margin.b}`}
        />
        {yTicks.map((v, i) => {
          const y = yAt(v)
          return (
            <g key={`yt-${i}`}>
              <text className="graphTick graphTick--y" textAnchor="end" x={margin.l - 8} y={y + 4}>
                {formatPctAxis(v)}
              </text>
              <path className="graphTickLine" d={`M ${margin.l} ${y} L ${margin.l + 6} ${y}`} />
            </g>
          )
        })}
        {yMin < 0 && yMax > 0 ? (
          <path
            className="barChartZeroLine"
            d={`M ${margin.l} ${y0} L ${w - margin.r} ${y0}`}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {list.map((b, i) => {
          const cx = margin.l + (i + 0.5) * slot
          const x = cx - barW / 2
          const yPct = yAt(b.pct)
          const top = Math.min(y0, yPct)
          const barH = Math.max(1, Math.abs(yPct - y0))
          const neg = b.pct < 0
          return (
            <g key={b.ticker}>
              <rect
                className={neg ? 'barChartBar barChartBar--neg' : 'barChartBar'}
                x={x}
                y={top}
                width={barW}
                height={barH}
                rx="1"
                vectorEffect="non-scaling-stroke"
              />
              <text className="graphTick graphTick--x barChartTicker" x={cx} y={h - margin.b + 14}>
                {b.ticker}
              </text>
            </g>
          )
        })}
      </svg>
      )}
    </div>
  )
})

function GraphPanel({
  title,
  series,
  dates,
  markers = [],
  selectedMarker = null,
  panelClassName = '',
  metaMode = 'range',
  yTickFormat = 'price',
  showRangeSelector = true,
  chartRange: chartRangeProp,
  onChartRangeChange,
}) {
  const wrapRef = useRef(null)
  const [size, setSize] = useState({ w: 900, h: 220 })
  const [internalRange, setInternalRange] = useState('6M')
  const priceRange = chartRangeProp ?? internalRange
  const setPriceRange = onChartRangeChange ?? setInternalRange

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    function sync() {
      const r = el.getBoundingClientRect()
      const w = Math.max(280, Math.floor(r.width))
      const h = Math.max(140, Math.floor(r.height))
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }))
    }
    const ro = new ResizeObserver(() => requestAnimationFrame(sync))
    ro.observe(el)
    window.addEventListener('resize', sync)
    sync()
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', sync)
    }
  }, [])

  const w = size.w
  const h = size.h

  const rangeKey = PRICE_RANGE_OPTS.includes(priceRange) ? priceRange : '6M'
  const markersForRange = useMemo(() => {
    if (!showRangeSelector || metaMode !== 'range') return markers ?? []
    return filterMarkersForPriceRange(markers, rangeKey)
  }, [markers, rangeKey, showRangeSelector, metaMode])

  const isRet = yTickFormat === 'return'
  const marginSides = { r: 6, t: isRet ? 10 : 8, b: isRet ? 22 : 20 }

  const { series: vals, dates: ds } = useMemo(() => {
    if (!showRangeSelector || metaMode !== 'range') {
      return {
        series: Array.isArray(series) ? series : [],
        dates: Array.isArray(dates) ? dates : [],
      }
    }
    return slicePriceDataByRange(series, dates, rangeKey)
  }, [series, dates, showRangeSelector, metaMode, rangeKey])

  const rawMin = vals.length ? Math.min(...vals) : 0
  const rawMax = vals.length ? Math.max(...vals) : 1
  /* Forward-return charts: Y scale must match `returnTicks` (integer % bounds). Otherwise a tick
   * like −5% can sit below the x-axis while the scale floor is the raw min (e.g. −4.8%). */
  let min = rawMin
  let max = rawMax
  if (isRet && vals.length) {
    let loP = Math.floor(rawMin * 100)
    let hiP = Math.ceil(rawMax * 100)
    if (hiP <= loP) hiP = loP + 1
    min = loP / 100
    max = hiP / 100
  }
  const span = max - min || 1

  const perfMeta = useMemo(() => {
    if (metaMode !== 'perf') return null
    if (!vals.length) return { wr: null, ytd: null, ytdPp: null }
    let wins = 0
    let moves = 0
    for (let i = 1; i < vals.length; i++) {
      const a = Number(vals[i - 1])
      const b = Number(vals[i])
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue
      const d = b - a
      if (d === 0) continue
      moves += 1
      if (d > 0) wins += 1
    }
    const wr = moves ? Math.round((wins / moves) * 100) : null
    const first = Number(vals[0])
    const last = Number(vals[vals.length - 1])
    /* Forward-return series: YTD = start→end change of the plotted metric (same units as axis). */
    const ytd =
      Number.isFinite(first) && Number.isFinite(last) && first !== 0 ? ((last - first) / first) * 100 : null
    const ytdPp = Number.isFinite(first) && Number.isFinite(last) ? (last - first) * 100 : null
    return { wr, ytd, ytdPp }
  }, [metaMode, vals])

  const yTicks = useMemo(() => {
    if (yTickFormat === 'return') return returnTicks(min, max, 4)
    return priceTicks(min, max, 4)
  }, [min, max, yTickFormat])
  const yTickGap = 5
  const yTickTexts = useMemo(
    () => yTicks.map((v) => (yTickFormat === 'return' ? formatReturnTick(v) : formatPriceTick(v))),
    [yTicks, yTickFormat],
  )
  const marginL = useMemo(
    () => chartYAxisMargin(yTickTexts, { gap: yTickGap, min: isRet ? 28 : 24, max: 48 }),
    [yTickTexts, isRet],
  )
  const margin = { l: marginL, ...marginSides }
  const plotTop = margin.t
  const axisY = h - margin.b
  const innerW = Math.max(1, w - margin.l - margin.r)

  function xAt(i) {
    return margin.l + (i / Math.max(1, vals.length - 1)) * innerW
  }
  function yAt(v) {
    const band = Math.max(1, axisY - plotTop)
    return plotTop + (1 - (v - min) / span) * band
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
  }, [vals, w, h, marginL, margin.t, margin.b, plotTop, axisY, min, max, span])

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
  }, [vals, w, h, marginL, margin.t, margin.b, plotTop, axisY, min, max, span])

  const gradId = useMemo(() => {
    const s = String(title ?? 'graph')
    let h0 = 2166136261
    for (let i = 0; i < s.length; i++) h0 = Math.imul(h0 ^ s.charCodeAt(i), 16777619)
    return `graphFill-${(h0 >>> 0).toString(16)}`
  }, [title])

  const xTickIdx = useMemo(() => {
    const n = Math.max(0, ds.length)
    if (n <= 1) return []
    return [0.08, 0.32, 0.56, 0.8].map((p) => Math.round(clamp01(p) * (n - 1)))
  }, [ds.length])

  const markerX = useMemo(() => {
    const n = ds.length
    if (n <= 1) return []
    const seen = new Set()
    const xs = []
    for (const m of markersForRange) {
      const key = graphCalendarDayKey(m)
      if (!key || seen.has(key)) continue
      seen.add(key)
      xs.push(xAt(graphIndexForTradeDate(ds, m)))
    }
    return xs
  }, [markersForRange, ds, vals.length, w, h, margin.l, innerW, rangeKey])

  const selectedMarkerX = useMemo(() => {
    if (!selectedMarker || ds.length <= 1) return null
    if (showRangeSelector && metaMode === 'range' && !markerWithinPriceRange(selectedMarker, rangeKey)) {
      return null
    }
    const d = selectedMarker instanceof Date ? selectedMarker : new Date(selectedMarker)
    if (Number.isNaN(d.getTime())) return null
    return xAt(graphIndexForTradeDate(ds, d))
  }, [selectedMarker, ds, vals.length, w, h, margin.l, innerW, rangeKey, showRangeSelector, metaMode])

  return (
    <section
      className={['panel', 'graph', panelClassName].filter(Boolean).join(' ')}
      aria-label={yTickFormat === 'return' ? 'Forward return trend' : 'Daily graph'}
    >
      <header
        className={['panelHeader', showRangeSelector && metaMode === 'range' ? 'graphPanelHeader--range' : '']
          .filter(Boolean)
          .join(' ')}
      >
        <div className="graphPanelTitleWrap">
          <div className="panelTitle">{title}</div>
        </div>
        {showRangeSelector && metaMode === 'range' ? (
          <div className="researchPriceRange graphPriceRange" role="group" aria-label="Chart range">
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
        ) : (
          <div className="panelMeta">
            {metaMode === 'perf' ? (
              <>
                WR {perfMeta?.wr != null ? `${perfMeta.wr}%` : '—'} | YTD{' '}
                {yTickFormat === 'return'
                  ? perfMeta?.ytdPp != null && Number.isFinite(perfMeta.ytdPp)
                    ? (() => {
                        const r = Math.round(perfMeta.ytdPp)
                        if (r === 0) return '0%'
                        return r > 0 ? `+${r}%` : `${r}%`
                      })()
                    : '—'
                  : perfMeta?.ytd != null && Number.isFinite(perfMeta.ytd)
                    ? `${perfMeta.ytd >= 0 ? '+' : ''}${Math.round(perfMeta.ytd)}%`
                    : '—'}
              </>
            ) : (
              <>
                L {vals.length ? vals[vals.length - 1] : 0} | R {min}-{max}
              </>
            )}
          </div>
        )}
      </header>
      <div
        ref={wrapRef}
        className="graphWrap"
        aria-label={yTickFormat === 'return' ? 'Forward return trend' : 'Daily price graph'}
      >
        {!vals.length ? (
          <div className="graphEmpty mono dim" role="status">
            No chart data.
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
              const tyAdj = onCeil ? plotTop + 1 : ty
              return (
                <g key={`yt-${i}`}>
                  <text
                    className="graphTick graphTick--y"
                    style={GRAPH_SVG_TICK}
                    textAnchor="end"
                    dominantBaseline={baseline}
                    x={margin.l - yTickGap}
                    y={tyAdj}
                  >
                    {yTickTexts[i]}
                  </text>
                  <path className="graphTickLine" style={GRAPH_SVG_TICK_LINE} d={`M ${margin.l} ${y} L ${margin.l + 6} ${y}`} />
                </g>
              )
            })}

            {xTickIdx.map((idx, i) => {
              const x = xAt(idx)
              const d = ds[idx]
              const label = d ? MONTHS_SHORT[d.getMonth()] : EMPTY
              return (
                <g key={`xt-${i}`}>
                  <text className="graphTick graphTick--x" style={GRAPH_SVG_TICK} x={x} y={axisY + 10} dominantBaseline="hanging">
                    {label}
                  </text>
                </g>
              )
            })}

            <path className="graphPath" style={GRAPH_SVG_PATH} d={path} vectorEffect="non-scaling-stroke" />

            {markerX.map((x, i) => (
              <path
                key={`m-${i}`}
                className="graphMarker"
                style={GRAPH_SVG_MARKER}
                d={`M ${x.toFixed(2)} ${plotTop} L ${x.toFixed(2)} ${axisY.toFixed(2)}`}
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {selectedMarkerX != null ? (
              <path
                className="graphMarker graphMarker--selected"
                style={GRAPH_SVG_MARKER_SEL}
                d={`M ${selectedMarkerX.toFixed(2)} ${plotTop} L ${selectedMarkerX.toFixed(2)} ${axisY.toFixed(2)}`}
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
          </svg>
        )}
      </div>
    </section>
  )
}

/**
 * Each visual row snaps to N “feed row” slots: one slot ≈ line-height + inter-line gap
 * matching stacked `.feedRowCompact` rows (padding + border counted once per `.kvLine`).
 */
function KvLine({ className = '', children, ...rest }) {
  const ref = useRef(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    function sync() {
      el.style.minHeight = ''
      void el.offsetHeight

      const cs = getComputedStyle(el)
      const pt = parseFloat(cs.paddingTop) || 0
      const pb = parseFloat(cs.paddingBottom) || 0
      const bb = parseFloat(cs.borderBottomWidth) || 1
      const fs = parseFloat(cs.fontSize)
      let lh = parseFloat(cs.lineHeight)
      if (!Number.isFinite(lh) || lh <= 0 || cs.lineHeight === 'normal') {
        lh = fs * 1.28
      }
      const gapPx = 0.24 * fs

      const natural = el.scrollHeight
      const innerNatural = Math.max(0, natural - pt - pb - bb)

      let lines = Math.max(1, Math.ceil((innerNatural + gapPx) / (lh + gapPx) - 1e-6))
      lines = Math.min(lines, 48)

      const innerTarget = lines * lh + (lines - 1) * gapPx
      const totalH = pt + pb + bb + innerTarget

      el.style.minHeight = `${Math.max(totalH, natural)}px`
    }

    const ro = new ResizeObserver(() => {
      requestAnimationFrame(sync)
    })
    ro.observe(el)
    sync()
    return () => {
      ro.disconnect()
      if (ref.current) ref.current.style.minHeight = ''
    }
  }, [children])

  return (
    <div
      ref={ref}
      className={className.trim() ? `kvLine ${className}` : 'kvLine'}
      {...rest}
    >
      {children}
    </div>
  )
}

function HistoricalOutcomesPanel({ mode, backendUp, personDisplay = null, panelClassName = '' }) {
  const [live, setLive] = useState(null)
  const [outcomesLoaded, setOutcomesLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    setOutcomesLoaded(false)
    async function run() {
      try {
        const m =
          mode === 'politicians' ? 'politicians' : mode === 'institutions' ? 'institutions' : 'insider'
        const r = await fetchJsonSafe(`/api/outcomes?mode=${encodeURIComponent(m)}`, { timeoutMs: 2500 })
        const json = r.data
        const data = json?.data ?? null
        if (!alive) return
        setLive(data && typeof data === 'object' ? data : null)
      } catch {
        if (!alive) return
        setLive(null)
      } finally {
        if (alive) setOutcomesLoaded(true)
      }
    }
    run()
    const t = setInterval(run, 30_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [mode])

  const ins = backendUp ? live : MOCK_HISTORICAL_INSIDER

  const outcomesLoading = backendUp && !outcomesLoaded

  return (
    <section
      className={[
        'panel',
        'historicalOutcomes',
        'blankTile--a',
        'historicalOutcomes--market',
        panelClassName,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Historical outcomes"
    >
      <div className="worksheetBody historicalOutcomesBody scrollThin">
        <HistoricalMarketOutcomesView
          ins={ins}
          mode={mode}
          personDisplay={personDisplay}
          loading={outcomesLoading}
        />
      </div>
    </section>
  )
}

function CompanyPanel({ company, ticker, backendUp, price = null }) {
  const snapshot = useMemo(
    () => resolveCompanySnapshot({ ticker, company, backendUp, price }),
    [ticker, company, backendUp, price],
  )

  return (
    <section className="panel companyTile" aria-label="Company">
      <CompanySnapshotCard {...snapshot} />
    </section>
  )
}

function FeedFilterIcon() {
  return (
    <svg className="feedCompactFilterIcon" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 6h16l-6 7v5l-4 2v-7L4 6z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CompactFeed({
  placement,
  title,
  items,
  selectedIndex,
  onSelectIndex,
  panelClassName = '',
  /** Header right: page indicator | invisible ghost (layout) | pagination-only rail styling. */
  headerMetaMode = 'full',
  /** Investigate FEED: borderless filter control beside the title row. */
  showFeedFilter = false,
  onFeedFilterClick,
  feedFilterActive = false,
  feedFilterOpen = false,
  feedFilterTypes = [],
  feedFilterEnabled = null,
  onFeedFilterToggle,
  /** When set, replaces the flat `feedFilterTypes` list (e.g. ALL mode grouped filters). */
  feedFilterPicker = null,
  /** Drug / indication / phase stacked; row height uses triple `--feed-row-slot`. */
  programsStackedRows = false,
  /** PROGRAMS rail: show grouped timeline rows (separators per program). */
  programsTimeline = false,
  /** Feed separators: today | this month | year (`today+years` = all three) */
  sepMode = 'today',
  /** TODAY band = rows with today event count; sort those above the separator. */
  todayGroupByEvents = false,
  /** Replace pagination with scroll-to-load. */
  scrollMode = false,
  /** `ticker`: main label is ticker; `company`: main label is company name; `actor`: investigate actor feed. */
  rowPrimary = 'label',
  /** Optional ticker search (research-style) above the list. */
  showFeedSearch = false,
  feedQuery = '',
  feedSearchPlaceholder = 'Search',
  feedSearchAriaLabel = 'Search tickers',
  onFeedQuery,
  loading = false,
  loadingLabel = 'Loading feed…',
  emptyLabel = 'No feed items yet.',
  hasMore = false,
  loadingMore = false,
  onLoadMore,
}) {
  const listRef = useRef(null)
  const [rowsPerPage, setRowsPerPage] = useState(16)
  const [renderLimit, setRenderLimit] = useState(FEED_INITIAL_PAGE_SIZE)

  const feedItems = useMemo(() => {
    if (programsTimeline || !todayGroupByEvents) return items
    return sortFeedRowsTodayEventsFirst(items)
  }, [items, programsTimeline, todayGroupByEvents])

  const displayRows = useMemo(() => {
    if (programsTimeline) return buildProgramGroupedDisplayRows(items)
    return buildFeedDisplayRows(feedItems, {
      sepMode,
      exclusiveSeps: todayGroupByEvents,
      isTodayRow: todayGroupByEvents ? feedRowHasTodayEvents : undefined,
    })
  }, [feedItems, programsTimeline, sepMode, todayGroupByEvents])

  const feedWhenLabel = (row) =>
    programsTimeline
      ? formatProgramTimelineDate(row.at)
      : formatFeedDateForRow(row.at, {
          belowTodayBand: todayGroupByEvents && !feedRowHasTodayEvents(row),
        })

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return

    function measure() {
      const avail = list.clientHeight
      if (avail <= 0) return
      const btn = list.querySelector('.feedRowCompact')
      const rowH = btn?.getBoundingClientRect().height ?? 17
      const n = Math.max(1, Math.floor(avail / Math.max(rowH, 10)))
      setRowsPerPage((prev) => (prev !== n ? n : prev))
    }

    const ro = new ResizeObserver(() => {
      requestAnimationFrame(measure)
    })
    ro.observe(list)
    measure()
    return () => ro.disconnect()
  }, [items.length, displayRows.length, placement, rowsPerPage])

  const pageSize = Math.max(1, rowsPerPage)
  const total = items.length
  const displayLen = displayRows.length
  const selectedDisplayIdx = useMemo(() => {
    const di = displayRows.findIndex((e) => e.type === 'item' && e.idx === selectedIndex)
    return di >= 0 ? di : 0
  }, [displayRows, selectedIndex])

  useEffect(() => {
    if (!scrollMode) return
    setRenderLimit((prev) => Math.max(prev, selectedDisplayIdx + pageSize * 2))
  }, [scrollMode, selectedDisplayIdx, pageSize])

  useLayoutEffect(() => {
    if (!scrollMode) return
    const list = listRef.current
    if (!list) return
    const el = list.querySelector(`[data-item-idx="${selectedIndex}"]`)
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' })
  }, [scrollMode, selectedIndex])

  const totalPages = Math.max(1, Math.ceil(Math.max(1, displayLen || total) / pageSize))
  const page =
    displayLen && total
      ? clamp(Math.floor(selectedDisplayIdx / pageSize), 0, totalPages - 1)
      : 0
  const pageStart = page * pageSize
  const pageSlice =
    displayLen && total ? displayRows.slice(pageStart, pageStart + pageSize) : []

  const visibleRows = scrollMode
    ? displayRows.slice(0, Math.min(displayLen, Math.max(pageSize, renderLimit)))
    : pageSlice

  function onScrollLoadMore() {
    if (!scrollMode) return
    const list = listRef.current
    if (!list) return
    const nearBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 60
    if (!nearBottom) return
    setRenderLimit((prev) => Math.min(displayLen, prev + pageSize * 2))
    if (hasMore && !loadingMore) onLoadMore?.()
  }

  function renderVisibleFeedRows(getGlobalIdx) {
    if (loading) {
      return <PanelStatusMessage label={loadingLabel} className="feedPanelStatus" />
    }
    if (!displayLen) {
      return <PanelStatusMessage label={emptyLabel} className="feedPanelStatus" />
    }
    return visibleRows.map((entry, i) => {
      const globalIdx = getGlobalIdx(i)
      if (entry.type === 'sep') {
        return (
          <div
            key={`${placement}-${entry.key}-${globalIdx}`}
            className="feedRowTodaySep"
            role="presentation"
          >
            {programsTimeline ? entry.label : entry.label ?? 'TODAY'}
          </div>
        )
      }
      const { row, idx } = entry
      const active = idx === selectedIndex
      return (
        <button
          key={row.id}
          type="button"
          role="listitem"
          className={[
            'feedRowCompact',
            active ? 'isActive' : '',
            ideaHighlightClass(row.idea_best),
            programsStackedRows ? 'feedRowCompact--programs' : '',
            programsTimeline ? 'feedRowCompact--timeline' : '',
            rowPrimary === 'company' ? 'feedRowCompact--company' : '',
            rowPrimary === 'actor' ? 'feedRowCompact--actor' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={() => onSelectIndex(idx)}
          data-item-idx={idx}
        >
          {programsStackedRows ? (
            <>
              <span className="feedProgramsLine feedProgramsLine--drug kvFeedMain">{row.label}</span>
              <span className="feedProgramsLine kvFeedDim">{row.indication ?? '—'}</span>
              <span className="feedProgramsLine mono kvFeedDim">{row.phase ?? '—'}</span>
            </>
          ) : rowPrimary === 'ticker' ? (
            <>
              <span className="feedCell feedCellLabel kvFeedMain mono">{row.ticker}</span>
              {!programsTimeline ? (
                <span className="feedCell feedCellTicker mono kvFeedDim">
                  {feedCountVisible(row.count) ? (
                    <span className="feedCountTag">{row.count}</span>
                  ) : (
                    <span className="feedCountTag feedCountTag--empty" aria-hidden="true">
                      {'\u00a0'}
                    </span>
                  )}
                </span>
              ) : null}
              <span className="feedCell feedCellWhen mono kvFeedDim">
                {feedWhenLabel(row)}
              </span>
            </>
          ) : rowPrimary === 'company' ? (
            <>
              <span className="feedCell feedCellSymbol mono kvFeedDim">
                {String(row.ticker ?? '').trim().toUpperCase() || '—'}
              </span>
              <span className="feedCell feedCellCompany kvFeedMain">
                {String(row.company ?? row.issuer ?? '').trim() || '—'}
              </span>
              {!programsTimeline ? (
                <span className="feedCell feedCellCount mono kvFeedDim">
                  {feedCountVisible(row.count) ? (
                    <span className="feedCountTag">{row.count}</span>
                  ) : (
                    <span className="feedCountTag feedCountTag--empty" aria-hidden="true">
                      {'\u00a0'}
                    </span>
                  )}
                </span>
              ) : null}
              <span className="feedCell feedCellWhen mono kvFeedDim">
                {feedWhenLabel(row)}
              </span>
            </>
          ) : rowPrimary === 'actor' ? (
            <>
              <span className="feedCell feedCellRole mono kvFeedDim">{row.actorRole ?? '—'}</span>
              <span className="feedCell feedCellActor kvFeedMain">
                {String(row.actorName ?? '').trim() || '—'}
              </span>
              {!programsTimeline ? (
                <span className="feedCell feedCellCount mono kvFeedDim">
                  {feedCountVisible(row.count) ? (
                    <span className="feedCountTag">{row.count}</span>
                  ) : (
                    <span className="feedCountTag feedCountTag--empty" aria-hidden="true">
                      {'\u00a0'}
                    </span>
                  )}
                </span>
              ) : null}
              <span className="feedCell feedCellWhen mono kvFeedDim">
                {feedWhenLabel(row)}
              </span>
            </>
          ) : (
            <>
              <span className="feedCell feedCellLabel kvFeedMain">{row.label}</span>
              {!programsTimeline ? (
                <span className="feedCell feedCellTicker mono kvFeedDim">
                  {placement === 'left' ? (
                    <>
                      {row.ticker}
                      {feedCountVisible(row.count) ? (
                        <span className="feedCountTag">{row.count}</span>
                      ) : null}
                    </>
                  ) : (
                    row.ticker
                  )}
                </span>
              ) : null}
              <span className="feedCell feedCellWhen mono kvFeedDim">
                {feedWhenLabel(row)}
              </span>
            </>
          )}
        </button>
      )
    })
  }

  return (
    <section
      className={['panel', 'feed', 'feedCompact', `feed--${placement}`, panelClassName]
        .filter(Boolean)
        .join(' ')}
      aria-label={title}
    >
      <header className="feedCompactHeader">
        <div className="panelTitle feedCompactTitle">{title}</div>
        <div className="feedCompactHeaderEnd">
          {showFeedFilter ? (
            <button
              type="button"
              className={['feedCompactFilterBtn', feedFilterActive ? 'isActive' : ''].filter(Boolean).join(' ')}
              aria-label="Filter feed"
              title="Filter"
              aria-pressed={feedFilterActive || undefined}
              onClick={() => onFeedFilterClick?.()}
            >
              <FeedFilterIcon />
            </button>
          ) : null}
          {!scrollMode && headerMetaMode === 'full' ? (
            <div className="feedCompactMeta feedCompactMeta--paginationOnly">
              <span className="feedPageInd">
                {total ? `${page + 1}/${totalPages}` : '0/0'}
              </span>
            </div>
          ) : null}
          {!scrollMode && headerMetaMode === 'ghost' ? (
            <div className="feedCompactMeta feedCompactMeta--ghost" aria-hidden="true">
              <span className="feedPageInd">
                {total ? `${page + 1}/${totalPages}` : '0/0'}
              </span>
            </div>
          ) : null}
          {!scrollMode && headerMetaMode === 'paginationOnly' ? (
            <div className="feedCompactMeta feedCompactMeta--paginationOnly">
              <span className="feedPageInd">{total ? `${page + 1}/${totalPages}` : '0/0'}</span>
            </div>
          ) : null}
        </div>
      </header>
      {showFeedSearch ? (
        <div
          className={['feedCompactBody', feedFilterOpen ? 'feedCompactBody--filterOpen' : '']
            .filter(Boolean)
            .join(' ')}
        >
          <div className="feedCompactMain" aria-hidden={feedFilterOpen || undefined}>
            <label className="researchFeedSearch">
              <input
                className="researchFeedSearchInput"
                value={feedQuery ?? ''}
                placeholder={feedSearchPlaceholder}
                onChange={(e) => onFeedQuery?.(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') onFeedQuery?.('')
                }}
                aria-label={feedSearchAriaLabel}
                spellCheck={false}
              />
              <svg className="researchFeedSearchIcon" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.75" />
                <path d="M16 16 L20 20" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
            </label>
            <div
              ref={listRef}
              className={['feedCompactList', 'scrollThin', scrollMode ? 'feedCompactList--scroll' : '']
                .filter(Boolean)
                .join(' ')}
              role="list"
              onScroll={scrollMode ? onScrollLoadMore : undefined}
            >
              {renderVisibleFeedRows((i) => (scrollMode ? i : pageStart + i))}
              {scrollMode && loadingMore ? (
                <PanelStatusMessage label="Loading more…" className="feedPanelStatus" />
              ) : null}
            </div>
          </div>
          {feedFilterOpen
            ? feedFilterPicker ??
              (feedFilterTypes.length ? (
                <div
                  className="feedCompactFilterPicker scrollThin"
                  role="group"
                  aria-label="Filter transaction types"
                >
                  {feedFilterTypes.map(({ id, label, code }) => (
                    <label key={id} className="feedFilterTypeRow">
                      <input
                        type="checkbox"
                        checked={feedFilterEnabled?.has(id) ?? false}
                        onChange={() => onFeedFilterToggle?.(id)}
                      />
                      <span className="feedFilterTypeLabel">{label}</span>
                      <span className="feedFilterTypeCode mono" title={id}>
                        {code ?? id}
                      </span>
                    </label>
                  ))}
                </div>
              ) : null)
            : null}
        </div>
      ) : (
        <div
          ref={listRef}
          className={['feedCompactList', scrollMode ? 'feedCompactList--scroll' : ''].filter(Boolean).join(' ')}
          role="list"
          onScroll={scrollMode ? onScrollLoadMore : undefined}
        >
          {renderVisibleFeedRows((i) => (scrollMode ? i : pageStart + i))}
        </div>
      )}
    </section>
  )
}

function CaseKvFeed({
  title,
  rows,
  placement = 'right',
  selectedTradeRowIndex = -1,
  onSelectTradeRowIndex,
  scrollMode = false,
  /** When set, matching company cells in CASE use main (white) text. */
  highlightCompanyQuery = '',
  personDisplay = null,
  personMode = 'insider',
  actorAlert = null,
  panelClassName = '',
}) {
  const listRef = useRef(null)
  const [rowsPerPage, setRowsPerPage] = useState(16)
  const [renderLimit, setRenderLimit] = useState(80)

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return

    function measure() {
      const avail = list.clientHeight
      if (avail <= 0) return
      const btn = list.querySelector('.feedRowCompact')
      const rowH = btn?.getBoundingClientRect().height ?? 17
      const minRowH = scrollMode ? 18 : 10
      const n = Math.max(1, Math.floor(avail / Math.max(rowH, minRowH)))
      setRowsPerPage((prev) => (prev !== n ? n : prev))
    }

    const ro = new ResizeObserver(() => {
      requestAnimationFrame(measure)
    })
    ro.observe(list)
    measure()
    return () => ro.disconnect()
  }, [rows.length, placement, scrollMode, personDisplay?.fullName])

  const pageSize = Math.max(1, rowsPerPage)
  const total = rows.length
  const totalPages = Math.max(1, Math.ceil(Math.max(1, total) / pageSize))
  const page = total ? clamp(Math.floor(Math.max(0, selectedTradeRowIndex) / pageSize), 0, totalPages - 1) : 0
  const pageStart = page * pageSize
  const pageSlice = total ? rows.slice(pageStart, pageStart + pageSize) : []
  const visibleRows = scrollMode
    ? rows.slice(0, Math.min(total, Math.max(pageSize, renderLimit)))
    : pageSlice

  useEffect(() => {
    if (!scrollMode) return
    setRenderLimit(total)
  }, [scrollMode, total])

  useLayoutEffect(() => {
    if (!scrollMode) return
    const list = listRef.current
    if (!list) return
    const el = list.querySelector(`[data-row-idx="${selectedTradeRowIndex}"]`)
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' })
  }, [scrollMode, selectedTradeRowIndex])

  const caseTableList = placement === 'right'

  function renderCaseRow(r, i) {
    if (r?.type === 'sep') {
      return (
        <div key={`${r.key ?? 'sep'}-${i}`} className="feedRowTodaySep" role="presentation">
          {r.label ?? 'TODAY'}
        </div>
      )
    }
    if (r?.layout === 'two') {
      const isMeta = r?.type === 'meta'
      return (
        <div
          key={`${r.k}-${i}`}
          className={['feedRowCompact', 'feedRowCompact--two', isMeta ? 'feedRowCompact--meta' : '']
            .filter(Boolean)
            .join(' ')}
          role="listitem"
          data-row-idx={i}
        >
          <span className="feedCell feedCellLabel kvFeedMain dim">{r.k}</span>
          <span className={['feedCell', 'feedCellTicker', 'mono', isMeta ? 'kvFeedMain' : 'kvFeedDim']
            .filter(Boolean)
            .join(' ')}
          >
            {r.v}
          </span>
        </div>
      )
    }
    if (r?.layout === 'txn' || r?.layout === 'txnPolitician' || r?.layout === 'txnCompany') {
      const isTrade = r?.type === 'trade'
      const isPoliticianTxn = r?.layout === 'txnPolitician'
      const isCompanyTxn = r?.layout === 'txnCompany'
      const companyQ = String(highlightCompanyQuery ?? '').trim().toUpperCase()
      const highlightCompany =
        isCompanyTxn &&
        Boolean(companyQ) &&
        ((r?.ticker && String(r.ticker).toUpperCase().includes(companyQ)) ||
          (r?.companyName && String(r.companyName).toUpperCase().includes(companyQ)))
      const highlightPerson =
        !isCompanyTxn &&
        Boolean(String(highlightCompanyQuery ?? '').trim()) &&
        caseTxnPersonNameMatchesQuery(r, highlightCompanyQuery)
      return (
        <div
          key={
            isCompanyTxn
              ? `txn-co-${r.ticker ?? 'x'}-${r.code ?? 'x'}-${i}`
              : `txn-${r.whoRole ?? r.who}-${r.whoName ?? ''}-${r.code ?? 'x'}-${i}`
          }
          className={[
            'feedRowCompact',
            isCompanyTxn ? 'feedRowCompact--txnCompany' : 'feedRowCompact--txn',
            isPoliticianTxn ? 'feedRowCompact--txnPolitician' : '',
            isTrade && i === selectedTradeRowIndex ? 'isActive' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          role="listitem"
          onClick={isTrade ? () => onSelectTradeRowIndex?.(i) : undefined}
          data-row-idx={i}
        >
          {isCompanyTxn ? (
            <>
              <span
                className={[
                  'feedCell',
                  'feedCellSymbol',
                  'mono',
                  highlightCompany ? 'kvFeedMain feedCellSymbol--match' : 'kvFeedDim',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {r.ticker ?? '—'}
              </span>
              <span
                className={[
                  'feedCell',
                  'feedCellCompany',
                  highlightCompany ? 'kvFeedMain feedCellCompany--match' : 'kvFeedDim',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {r.companyName ?? '—'}
              </span>
            </>
          ) : (
            <>
              <span className="feedCell feedCellRole mono kvFeedMain">{r.whoRole ?? r.who ?? '—'}</span>
              <span
                className={[
                  'feedCell',
                  'feedCellSurname',
                  'mono',
                  highlightPerson ? 'kvFeedMain feedCellSurname--match' : 'kvFeedDim',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {r.whoName ?? ''}
              </span>
            </>
          )}
          <span
            className={[
              'feedCell',
              'feedCellCode',
              'mono',
              'feedTxnCode',
              r?.codeTone ? `feedTxnCode--${r.codeTone}` : '',
            ]
              .filter(Boolean)
              .join(' ')}
            title={r?.codeTitle ?? undefined}
          >
            {r.code ?? '—'}
            {!isPoliticianTxn && !isCompanyTxn && r.isDerivative ? (
              <span className="feedTxnDeriv">D</span>
            ) : null}
          </span>
          <span
            className={[
              'feedCell',
              'feedCellValue',
              'mono',
              'kvFeedDim',
              r?.value?.startsWith('+') ? 'feedTxnVal--pos' : '',
              r?.value?.startsWith('−') ? 'feedTxnVal--neg' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {r.value ?? '—'}
          </span>
          <span className="feedCell feedCellWhen mono kvFeedDim">{r.when ?? ''}</span>
        </div>
      )
    }
    return (
      <div
        key={`${r.k}-${i}`}
        className={['feedRowCompact', r?.type === 'trade' && i === selectedTradeRowIndex ? 'isActive' : '']
          .filter(Boolean)
          .join(' ')}
        role="listitem"
        onClick={r?.type === 'trade' ? () => onSelectTradeRowIndex?.(i) : undefined}
        data-row-idx={i}
      >
        <span className="feedCell feedCellLabel kvFeedMain dim">{r.k}</span>
        <span className="feedCell feedCellTicker mono kvFeedDim">{r.v}</span>
        <span className="feedCell feedCellWhen mono kvFeedDim">{r.when ?? ''}</span>
      </div>
    )
  }

  return (
    <section
      className={['panel', 'feed', 'feedCompact', `feed--${placement}`, panelClassName]
        .filter(Boolean)
        .join(' ')}
      aria-label={title}
    >
      <header className="feedCompactHeader">
        <div className="panelTitle feedCompactTitle">{title}</div>
        <div className="feedCompactHeaderEnd">
          {actorAlert?.key ? (
            <ContextActorAlertToggle
              actorKey={actorAlert.key}
              displayName={actorAlert.displayName}
              mode={actorAlert.mode}
              className="casePanelAlertToggle"
            />
          ) : null}
          {!scrollMode ? (
            <div className="feedCompactMeta feedCompactMeta--paginationOnly">
              <span className="feedPageInd">{total ? `${page + 1}/${totalPages}` : '0/0'}</span>
            </div>
          ) : null}
        </div>
      </header>
      {scrollMode ? (
        <div className="feedCompactBody feedCompactBody--case">
          {personDisplay?.fullName ? (
            <CasePersonHeader person={personDisplay} mode={personMode} />
          ) : null}
          <div
            ref={listRef}
            className={[
              'feedCompactList',
              'feedCompactList--scroll',
              'scrollThin',
              caseTableList ? 'feedCompactList--caseTable' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            role="list"
          >
            {visibleRows.map((r, j) => {
              const i = j
              return renderCaseRow(r, i)
            })}
          </div>
        </div>
      ) : (
        <div
          ref={listRef}
          className={['feedCompactList', caseTableList ? 'feedCompactList--caseTable' : ''].filter(Boolean).join(' ')}
          role="list"
        >
          {visibleRows.map((r, j) => {
            const i = pageStart + j
            return renderCaseRow(r, i)
          })}
        </div>
      )}
    </section>
  )
}


function investigateCaseSheetFromApiItem(it, mode) {
  const fallback = {
    id: it.id,
    ticker: it.ticker,
    company: it.company_name ?? it.company,
    at: it.feed_at ?? it.at,
    chamber: it.chamber,
    url: it.url ?? it.document_url ?? null,
  }
  const ws = Array.isArray(it.worksheet_rows) ? it.worksheet_rows : []
  if (ws.length) {
    const pseudo = {
      cluster: { worksheet_rows: ws },
      issuer: { ticker: it.ticker, name: it.company_name ?? it.company, cik: it.cik ?? null },
      filing: {
        filed_at: it.feed_at ?? it.at,
        form_type: mode === 'insider' ? 'Form 4' : mode === 'politicians' ? 'PTR' : '13F',
        accession_no: it.accession_no ?? it.id,
        pdf_url: it.pdf_url ?? null,
        index_url: it.index_url ?? null,
        url: it.url ?? null,
      },
      url: it.url ?? null,
    }
    if (mode === 'politicians') return politiciansCaseSheetFromClusterLive(pseudo, fallback)
    if (mode === 'institutions') return institutionCaseSheetFromClusterLive(pseudo, fallback)
    return insiderCaseSheetFromClusterLive(pseudo, fallback)
  }
  const at = String(it.feed_at ?? it.at ?? '')
  if (mode === 'politicians') {
    const names = Array.isArray(it.politicians) ? it.politicians : []
    if (!names.length) return null
    return {
      filingId: it.id,
      formType: 'PTR',
      issuer: fallback.company ?? fallback.ticker ?? '—',
      ticker: it.ticker,
      isForm4: true,
      filedAt: at || null,
      rows: names.map((name) => ({
        key: String(name),
        politician_name: String(name),
        surname: lastName(String(name)),
        chamber: String(it.chamber ?? 'house').trim().toLowerCase() || 'house',
        transactionType: 'Purchase',
        amountUsd: 1,
        acquiredDisposed: 'A',
        ts: at || null,
      })),
    }
  }
  if (mode === 'institutions') {
    const names = Array.isArray(it.institutions) ? it.institutions : []
    if (!names.length) return null
    return {
      filingId: it.id,
      formType: '13F',
      issuer: fallback.company ?? fallback.ticker ?? '—',
      ticker: it.ticker,
      isForm4: true,
      filedAt: at || null,
      rows: names.map((name) => ({
        key: String(name),
        institution_name: String(name),
        surname: String(name),
        activity: 'Increased stake',
        amountUsd: 1,
        ts: at || null,
      })),
    }
  }
  const insiders = Array.isArray(it.insiders) ? it.insiders : []
  if (!insiders.length) return null
  return {
    filingId: it.id,
    formType: 'Form 4',
    issuer: fallback.company ?? fallback.ticker ?? '—',
    ticker: it.ticker,
    isForm4: true,
    filedAt: at || null,
    rows: insiders.map((name) => ({
      key: String(name),
      insider_name: String(name),
      surname: lastName(String(name)),
      transactionCode: 'P',
      acquiredDisposed: 'A',
      amountUsd: 1,
      ts: at || null,
    })),
  }
}

function mapInsiderCompanyFeedItem(it) {
  const ticker = String(it.ticker ?? '').trim().toUpperCase()
  const at = String(it.feed_at ?? '')
  const id = String(it.id ?? '')
  const raw = String(it.feed_label ?? '')
  const m = raw.match(/^\s*([^()]+?)\s*\(\s*(\d+)\s*\)\s*$/)
  const label = (m ? m[1] : raw).trim() || '—'
  const countFromLabel = m ? Number(m[2]) : null
  const todayCount = Number(it.today_count)
  const count = Number.isFinite(todayCount) ? todayCount : countFromLabel
  const company = researchFeedRowLabel({ ticker, company_name: it.company_name, company: it.company })
  const insiders = Array.isArray(it.insiders) ? it.insiders.map((x) => String(x)) : []
  return {
    id,
    label,
    count,
    company,
    ticker,
    at,
    insiders,
    daily: [],
    caseSheet: investigateCaseSheetFromApiItem(it, 'insider'),
    idea_score: it.idea_score,
    idea_best: it.idea_best,
    idea_reasons: it.idea_reasons,
    __backend_id: id,
  }
}

function mapPoliticianFeedItem(it) {
  const ticker = String(it.ticker ?? '').trim().toUpperCase()
  const at = String(it.feed_at ?? '')
  const id = String(it.id ?? '')
  const raw = String(it.feed_label ?? '')
  const m = raw.match(/^\s*([^()]+?)\s*\(\s*(\d+)\s*\)\s*$/)
  const label = (m ? m[1] : raw).trim() || '—'
  const countFromLabel = m ? Number(m[2]) : null
  const todayCount = Number(it.today_count)
  const count = Number.isFinite(todayCount) ? todayCount : countFromLabel
  const politicians = Array.isArray(it.politicians) ? it.politicians.map((x) => String(x)) : []
  const company = researchFeedRowLabel({ ticker, company_name: it.company_name, company: it.company })
  return {
    id,
    label,
    count,
    company,
    ticker,
    at,
    politicians,
    chamber: String(it.chamber ?? 'house').trim().toLowerCase() || 'house',
    daily: [],
    caseSheet: investigateCaseSheetFromApiItem(it, 'politicians'),
    idea_score: it.idea_score,
    idea_best: it.idea_best,
    idea_reasons: it.idea_reasons,
    __backend_id: id,
  }
}

function mapInstitutionFeedItem(it) {
  const ticker = String(it.ticker ?? '').trim().toUpperCase()
  const at = String(it.feed_at ?? '')
  const id = String(it.id ?? '')
  const raw = String(it.feed_label ?? '')
  const m = raw.match(/^\s*([^()]+?)\s*\(\s*(\d+)\s*\)\s*$/)
  const label = (m ? m[1] : raw).trim() || '—'
  const countFromLabel = m ? Number(m[2]) : null
  const todayCount = Number(it.today_count)
  const count = Number.isFinite(todayCount) ? todayCount : countFromLabel
  const institutions = Array.isArray(it.institutions) ? it.institutions.map((x) => String(x)) : []
  const company = researchFeedRowLabel({ ticker, company_name: it.company_name, company: it.company })
  return {
    id,
    label,
    count,
    company,
    ticker,
    at,
    institutions,
    daily: [],
    caseSheet: investigateCaseSheetFromApiItem(it, 'institutions'),
    idea_score: it.idea_score,
    idea_best: it.idea_best,
    idea_reasons: it.idea_reasons,
    __backend_id: id,
  }
}

function KensiglineTerminal() {
  const { user } = useAuth()
  const isPhone = usePhoneViewport()
  const terminalRoute = useTerminalRoute()
  const shell = terminalRoute.shell ?? 'explore'
  const exploreSubview = shell === 'explore' ? (terminalRoute.view ?? 'home') : 'home'
  const macroActive = shell === 'macro'
  const settingsActive = shell === 'settings'
  const [researchPhonePane, setResearchPhonePane] = useState('paper')
  const [analysePhonePane, setAnalysePhonePane] = useState('analyse')
  const [investigatePhonePane, setInvestigatePhonePane] = useState('feed')
  const [deepResearchMode, setDeepResearchMode] = useState('company')
  const [investigateMode, setInvestigateMode] = useState(() => readInvestigateMode()) // insider | politicians | institutions
  const [investigateFeedFilterOpen, setInvestigateFeedFilterOpen] = useState(false)
  const [investigateInsiderTxnFilters, setInvestigateInsiderTxnFilters] = useState(() =>
    readFilterSet(UI_PREF_KEYS.investigateTxnFilters('insider'), FORM4_TXN_CODES_CYCLE),
  )
  const [investigatePoliticianTxnFilters, setInvestigatePoliticianTxnFilters] = useState(() =>
    readFilterSet(UI_PREF_KEYS.investigateTxnFilters('politicians'), PTR_TXN_CODES_CYCLE),
  )
  const [investigateInstitutionTxnFilters, setInvestigateInstitutionTxnFilters] = useState(() =>
    readFilterSet(UI_PREF_KEYS.investigateTxnFilters('institutions'), INSTITUTION_ACTIVITY_CYCLE),
  )
  const [investigateInsiderTxnFiltersDraft, setInvestigateInsiderTxnFiltersDraft] = useState(null)
  const [investigatePoliticianTxnFiltersDraft, setInvestigatePoliticianTxnFiltersDraft] = useState(null)
  const [investigateInstitutionTxnFiltersDraft, setInvestigateInstitutionTxnFiltersDraft] = useState(null)
  const researchTickerPinnedRef = useRef(null)
  const terminalMainRef = useRef(null)

  // Re-sync charts when crossing the phone breakpoint.
  useEffect(() => {
    const mqPhone = window.matchMedia(PHONE_VIEWPORT_MQ)
    let raf = 0
    function onViewportChange() {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'))
      })
    }
    mqPhone.addEventListener('change', onViewportChange)
    return () => {
      cancelAnimationFrame(raf)
      mqPhone.removeEventListener('change', onViewportChange)
    }
  }, [])

  const [insiderIdx, setInsiderIdx] = useState(0)
  const [insiderFeedQuery, setInsiderFeedQuery] = useState('')
  const [insiderCaseTradeIdx, setInsiderCaseTradeIdx] = useState(0)
  const [insiderChartRange, setInsiderChartRange] = useState(() =>
    readChartRange('insider', PRICE_RANGE_OPTS, '6M'),
  )
  const [politiciansIdx, setPoliticiansIdx] = useState(0)
  const [politiciansFeedQuery, setPoliticiansFeedQuery] = useState('')
  const [politiciansCaseTradeIdx, setPoliticiansCaseTradeIdx] = useState(0)
  const [politiciansChartRange, setPoliticiansChartRange] = useState(() =>
    readChartRange('politicians', PRICE_RANGE_OPTS, '6M'),
  )
  const [institutionsIdx, setInstitutionsIdx] = useState(0)
  const [institutionsFeedQuery, setInstitutionsFeedQuery] = useState('')
  const [institutionsCaseTradeIdx, setInstitutionsCaseTradeIdx] = useState(0)
  const [institutionsChartRange, setInstitutionsChartRange] = useState(() =>
    readChartRange('institutions', PRICE_RANGE_OPTS, '6M'),
  )
  /** URL/click-bound investor identity for deep pages (avoids silent idx-0 fallback). */
  const [exploreInvestorFocus, setExploreInvestorFocus] = useState(null)
  const [researchFeedLive, setResearchFeedLive] = useState(null)
  const [researchFeedHasMore, setResearchFeedHasMore] = useState(false)
  const [researchFeedLoadingMore, setResearchFeedLoadingMore] = useState(false)
  const researchFeedOffsetRef = useRef(0)
  const researchFeedCursorRef = useRef(null)
  const [researchFeedInjected, setResearchFeedInjected] = useState([])
  const [researchFeedRefresh, setResearchFeedRefresh] = useState(0)
  const [researchExploreLive, setResearchExploreLive] = useState(null)
  const [researchExploreTicker, setResearchExploreTicker] = useState(null)
  const [researchCompanyLive, setResearchCompanyLive] = useState(null)
  const [researchCompanyTicker, setResearchCompanyTicker] = useState(null)

  const [researchTicker, setResearchTicker] = useState(RESEARCH_TICKER_MARKET)
  const [researchQuery, setResearchQuery] = useState('')
  const [analysePriceRange, setAnalysePriceRange] = useState('6M')
  const [analyseLivePayload, setAnalyseLivePayload] = useState(null)
  const [analyseModelLoading, setAnalyseModelLoading] = useState(false)
  const [researchFeedFilterOpen, setResearchFeedFilterOpen] = useState(false)
  const [researchPaperSourceFilters, setResearchPaperSourceFilters] = useState(() =>
    readFilterSet(UI_PREF_KEYS.researchFilters, researchSourceFilterKeys()),
  )
  const [researchPaperSourceFiltersDraft, setResearchPaperSourceFiltersDraft] = useState(null)
  const researchPaperSourceFiltersEffective = useMemo(
    () => effectiveResearchPaperSourceFilters(researchPaperSourceFilters),
    [researchPaperSourceFilters],
  )

  const [researchCompanyContextLoading, setResearchCompanyContextLoading] = useState(false)
  const [backendUp, setBackendUp] = useState(false)
  const [backendLastOkAt, setBackendLastOkAt] = useState(0)
  const [backendStats, setBackendStats] = useState(null)
  const [insiderFeedLive, setInsiderFeedLive] = useState(null)
  const [insiderFeedHasMore, setInsiderFeedHasMore] = useState(false)
  const [insiderFeedLoadingMore, setInsiderFeedLoadingMore] = useState(false)
  const insiderFeedOffsetRef = useRef(0)
  const insiderFeedCursorRef = useRef(null)
  const [insiderClusterLive, setInsiderClusterLive] = useState(null)
  const [barsLive, setBarsLive] = useState(null)
  const [barsLiveTicker, setBarsLiveTicker] = useState(null)
  const barsCacheRef = useRef(new Map())
  const researchCompanyCacheRef = useRef(new Map())
  const researchExploreCacheRef = useRef(new Map())
  const analyseCacheRef = useRef(new Map())
  const analyseFetchGenRef = useRef(0)
  const barsFetchGenRef = useRef(0)
  const researchBarsFetchGenRef = useRef(0)
  const researchCompanyFetchGenRef = useRef(0)
  const researchExploreFetchGenRef = useRef(0)
  const [researchBarsSeries, setResearchBarsSeries] = useState(null)
  const [researchBarsDays, setResearchBarsDays] = useState(null)
  const [researchBarsTicker, setResearchBarsTicker] = useState(null)
  const [companyLive, setCompanyLive] = useState(null)
  const [companyLiveTicker, setCompanyLiveTicker] = useState(null)
  const companyFetchGenRef = useRef(0)
  const [politiciansFeedLive, setPoliticiansFeedLive] = useState(null)
  const [politiciansFeedHasMore, setPoliticiansFeedHasMore] = useState(false)
  const [politiciansFeedLoadingMore, setPoliticiansFeedLoadingMore] = useState(false)
  const politiciansFeedOffsetRef = useRef(0)
  const politiciansFeedCursorRef = useRef(null)
  const [politiciansClusterLive, setPoliticiansClusterLive] = useState(null)
  const [institutionsFeedLive, setInstitutionsFeedLive] = useState(null)
  const [institutionsFeedHasMore, setInstitutionsFeedHasMore] = useState(false)
  const [institutionsFeedLoadingMore, setInstitutionsFeedLoadingMore] = useState(false)
  const institutionsFeedOffsetRef = useRef(0)
  const institutionsFeedCursorRef = useRef(null)
  const [institutionsClusterLive, setInstitutionsClusterLive] = useState(null)
  const researchDataset = useMemo(
    () => (backendUp ? null : mockDatasetForTicker(researchTicker)),
    [backendUp, researchTicker],
  )
  const researchFeedItems = useMemo(() => {
    if (!backendUp) return offlineResearchFeed()
    const liveRows =
      Array.isArray(researchFeedLive) ? researchFeedLive : []
    const injected = Array.isArray(researchFeedInjected) ? researchFeedInjected : []
    const seen = new Set(liveRows.map((x) => String(x.ticker ?? '').toUpperCase()))
    const merged = [...liveRows]
    for (const row of injected) {
      const ticker = String(row?.ticker ?? '').toUpperCase()
      if (!ticker || seen.has(ticker)) continue
      seen.add(ticker)
      merged.push(row)
    }
    // Backend up but empty DB — keep directories / company list screenshot-ready.
    if (!merged.length) return researchFeedLive !== null ? offlineResearchFeed() : []
    return sortFeedRowsByAtDesc(
      merged.map((x) => {
        const ticker = String(x.ticker ?? '').toUpperCase()
        const label = researchFeedRowLabel(x)
        return {
          rowKey: x.id ? String(x.id) : `doc-${ticker}`,
          ticker,
          name: label,
          company: label,
          at: x.feed_at ? String(x.feed_at) : null,
          feed_kind: x.feed_kind ? String(x.feed_kind) : null,
          source_key: x.source_key ? String(x.source_key) : null,
          paper_doc_count: Number(x.paper_doc_count) || 0,
          idea_score: x.idea_score,
          idea_best: x.idea_best,
          idea_reasons: x.idea_reasons,
        }
      }),
    )
  }, [backendUp, researchFeedLive, researchFeedInjected])

  useEffect(() => {
    if (!backendUp) return
    if (!Array.isArray(researchFeedLive) || !researchFeedInjected.length) return
    const liveTickers = new Set(researchFeedLive.map((x) => String(x.ticker ?? '').toUpperCase()))
    setResearchFeedInjected((prev) => prev.filter((row) => !liveTickers.has(String(row.ticker ?? '').toUpperCase())))
  }, [backendUp, researchFeedLive, researchFeedInjected.length])

  useEffect(() => {
    const pinned = String(researchTickerPinnedRef.current ?? '').trim().toUpperCase()
    if (!pinned) return
    if (researchFeedItems.some((x) => String(x.ticker ?? '').toUpperCase() === pinned)) {
      researchTickerPinnedRef.current = null
    }
  }, [researchFeedItems])

  const researchTick = useMemo(
    () => String(researchTicker ?? '').trim().toUpperCase(),
    [researchTicker],
  )
  useLayoutEffect(() => {
    const main = terminalMainRef.current
    if (!main) return
    const panels = [...main.querySelectorAll(':scope > .researchPaperPanel')]
    if (panels.length <= 1) return
    for (let i = 0; i < panels.length - 1; i++) panels[i].remove()
  }, [researchTick])

  const researchExploreResolved = useMemo(() => {
    if (!backendUp || !researchTick) return null
    if (researchExploreTicker !== researchTick || !researchExploreLive) return null
    return researchExploreLive
  }, [backendUp, researchTick, researchExploreTicker, researchExploreLive])

  const researchCompanyResolved = useMemo(() => {
    if (!backendUp || !researchTick) return null
    if (researchCompanyTicker !== researchTick || !researchCompanyLive) return null
    return researchCompanyLive
  }, [backendUp, researchTick, researchCompanyTicker, researchCompanyLive])

  const researchCompanyName = useMemo(() => {
    const fromExplore = String(researchExploreResolved?.company_name ?? '').trim()
    if (fromExplore && isPlausibleFeedCompanyName(fromExplore, researchTick)) {
      return formatCompanyDisplayName(fromExplore)
    }
    const fromFeed = researchFeedItems.find((x) => String(x.ticker ?? '').toUpperCase() === researchTick)?.name
    if (fromFeed && isPlausibleFeedCompanyName(fromFeed, researchTick)) return fromFeed
    if (backendUp) return researchTick || '—'
    const companyEnt = researchDataset?.entities?.find((e) => String(e?.type ?? '').toLowerCase() === 'company')
    const mockName = companyEnt?.name ?? researchTick
    return isPlausibleFeedCompanyName(mockName, researchTick) ? formatCompanyDisplayName(mockName) : researchTick
  }, [researchFeedItems, researchDataset?.entities, researchTick, researchExploreResolved?.company_name, backendUp])

  const researchPriceSeries = useMemo(() => {
    if (backendUp) {
      if (researchBarsTicker === researchTick && Array.isArray(researchBarsSeries) && researchBarsSeries.length) {
        return researchBarsSeries
      }
      return []
    }
    return researchDataset?.price ?? []
  }, [researchBarsSeries, researchBarsTicker, researchTick, researchDataset?.price, backendUp])

  const researchPriceDays = useMemo(() => {
    if (backendUp && researchBarsTicker === researchTick && Array.isArray(researchBarsDays)) {
      return researchBarsDays
    }
    return null
  }, [backendUp, researchBarsDays, researchBarsTicker, researchTick])

  const contextMock = useMemo(() => {
    if (backendUp) return null
    return contextMockForTicker(researchTicker, researchPriceSeries)
  }, [backendUp, researchTicker, researchPriceSeries])

  const contextLivePrice = useMemo(() => {
    if (Array.isArray(researchPriceSeries) && researchPriceSeries.length) {
      const n = Number(researchPriceSeries[researchPriceSeries.length - 1])
      if (Number.isFinite(n) && n > 0) return n
    }
    return null
  }, [researchPriceSeries])

  const contextCompanySnapshot = useMemo(
    () =>
      resolveCompanySnapshot({
        ticker: researchTicker,
        company: researchCompanyResolved,
        backendUp,
        price: contextLivePrice,
      }),
    [researchTicker, researchCompanyResolved, backendUp, contextLivePrice],
  )

  const contextFundamentals = useMemo(() => {
    if (backendUp) {
      const fromCompany = researchCompanyResolved?.fundamentals
        ? mapFundamentalsFromApi(researchCompanyResolved.fundamentals)
        : null
      if (fromCompany) return fromCompany
      return mapFundamentalsFromAnalyseModel(analyseLivePayload?.model)
    }
    return contextMock?.fundamentals ?? null
  }, [
    backendUp,
    researchCompanyResolved?.fundamentals,
    analyseLivePayload?.model,
    contextMock?.fundamentals,
  ])

  const analyseQuarterlyRevenue = useMemo(
    () => {
      if (backendUp && analyseLivePayload?.revenueOverlay) return analyseLivePayload.revenueOverlay
      if (backendUp) return null
      return analyseMockQuarterlyRevenueOverlay(researchTicker)
    },
    [backendUp, researchTicker, analyseLivePayload],
  )

  const analysePriceChange = useMemo(() => {
    return priceChangeForRange(researchPriceSeries, analysePriceRange, researchPriceDays)
  }, [researchPriceSeries, analysePriceRange, researchPriceDays])

  const contextEarnings = useMemo(() => {
    if (backendUp) {
      return researchCompanyResolved?.earnings_date
        ? contextEarningsFromDate(researchCompanyResolved.earnings_date)
        : null
    }
    return contextMock?.earnings ?? null
  }, [backendUp, researchCompanyResolved?.earnings_date, contextMock?.earnings])

  const researchPaperMemo = useMemo(() => {
    if (backendUp) return null
    return buildThesisMemo({
      ticker: researchTicker,
      companyName: researchCompanyName,
      events: researchDataset?.events ?? [],
      priceSeries: researchPriceSeries,
      constituents: isEtfTicker(researchTicker) ? mockDatasetForTicker(researchTicker)?.constituents ?? [] : [],
    })
  }, [backendUp, researchTicker, researchCompanyName, researchDataset?.events, researchPriceSeries])

  const researchPresentation = useMemo(
    () =>
      resolveResearchPresentation({
        ticker: researchTicker,
        titleText: researchCompanyName,
        backendUp,
        livePresentation: researchExploreResolved?.presentation,
        memo: researchPaperMemo,
      }),
    [researchTicker, researchCompanyName, backendUp, researchExploreResolved?.presentation, researchPaperMemo],
  )

  useEffect(() => {
    if (!isTerminalAppPath()) navigateExploreHome({ replace: true })
  }, [])

  useEffect(() => {
    writeInvestigateMode(investigateMode)
  }, [investigateMode])

  useEffect(() => {
    writeFilterSet(UI_PREF_KEYS.investigateTxnFilters('insider'), investigateInsiderTxnFilters)
  }, [investigateInsiderTxnFilters])

  useEffect(() => {
    writeFilterSet(UI_PREF_KEYS.investigateTxnFilters('politicians'), investigatePoliticianTxnFilters)
  }, [investigatePoliticianTxnFilters])

  useEffect(() => {
    writeFilterSet(UI_PREF_KEYS.investigateTxnFilters('institutions'), investigateInstitutionTxnFilters)
  }, [investigateInstitutionTxnFilters])

  useEffect(() => {
    writeChartRange('insider', insiderChartRange)
  }, [insiderChartRange])

  useEffect(() => {
    writeChartRange('politicians', politiciansChartRange)
  }, [politiciansChartRange])

  useEffect(() => {
    writeChartRange('institutions', institutionsChartRange)
  }, [institutionsChartRange])

  const contextFlowRows = useMemo(() => {
    const parseFlowDate = (raw) => {
      if (raw instanceof Date) return raw
      const d = new Date(raw ?? 0)
      return Number.isFinite(d.getTime()) ? d : new Date()
    }
    if (backendUp) {
      const live = researchExploreResolved?.flows
      if (!live || typeof live !== 'object') {
        return { insiders: [], politicians: [], filings13f: [] }
      }
      return {
        insiders: (Array.isArray(live.insiders) ? live.insiders : []).map((row) => ({
          ...row,
          date: parseFlowDate(row?.date),
        })),
        politicians: (Array.isArray(live.politicians) ? live.politicians : []).map((row) => ({
          ...row,
          date: parseFlowDate(row?.date),
        })),
        filings13f: (Array.isArray(live.filings13f) ? live.filings13f : []).map((row) => ({
          ...row,
          date: parseFlowDate(row?.date),
        })),
      }
    }
    return {
      insiders: contextMock?.insiders ?? [],
      politicians: contextMock?.politicians ?? [],
      filings13f: contextMock?.filings13f ?? [],
    }
  }, [backendUp, researchExploreResolved?.flows, contextMock])

  const deepExploreReady =
    !backendUp ||
    (Boolean(researchTick) && researchExploreTicker === researchTick)

  const deepPaperTimelineEntries = useMemo(() => {
    const livePres =
      deepExploreReady && researchExploreResolved?.presentation
        ? researchExploreResolved.presentation
        : null
    const presentation = deepExploreReady ? researchPresentation ?? livePres : null
    const docs = paperDocumentsFromPresentation(presentation).filter((doc) =>
      isCompanyDeepDocumentSource(doc?.source),
    )
    const raw = buildPaperTimelineItems({
      documents: docs,
      insiders: [],
      politicians: [],
      filings13f: [],
    })
    return buildPaperDisplayRows(raw)
  }, [deepExploreReady, researchPresentation, researchExploreResolved?.presentation])

  const deepTrackedInvestors = useMemo(
    () =>
      buildContextTrackedInvestors({
        insiders: contextFlowRows.insiders,
        politicians: contextFlowRows.politicians,
        filings13f: contextFlowRows.filings13f,
        apiRows: researchExploreResolved?.tracked_investors ?? null,
      }),
    [contextFlowRows, researchExploreResolved?.tracked_investors],
  )

  const insiderPriceMarkers = useMemo(
    () => contextFlowRows.insiders.map((x) => x.date),
    [contextFlowRows],
  )
  const politicianPriceMarkers = useMemo(
    () => contextFlowRows.politicians.map((x) => x.date),
    [contextFlowRows],
  )

  const researchFilteredFeed = useMemo(() => {
    const s = String(researchQuery ?? '').trim().toUpperCase()
    if (!s) return researchFeedItems
    return researchFeedItems.filter((it) => {
      const t = String(it?.ticker ?? '').toUpperCase()
      const n = String(it?.name ?? '').toUpperCase()
      return t.includes(s) || n.includes(s)
    })
  }, [researchFeedItems, researchQuery])

  const researchPaperSourceTypeDefs = useMemo(
    () => researchPaperSourceTypes(),
    [],
  )

  const researchFeedAfterSourceFilter = useMemo(() => {
    const enabled = effectiveResearchPaperSourceFilters(researchPaperSourceFilters)
    if (backendUp) {
      return researchFilteredFeed
        .filter((row) => researchFeedRowPassesSourceFilter(row, enabled))
        .map((row) => normalizeResearchFeedRow(row, []))
        .filter(Boolean)
    }
    const selected = String(researchTicker ?? '').toUpperCase()
    return researchFilteredFeed
      .map((row) => {
        const ticker = String(row?.ticker ?? '').toUpperCase()
        if (!ticker) return null
        const timeline = buildResearchPaperTimelineForTicker({
          ticker,
          livePresentation: researchPresentation,
          selectedTicker: researchTicker,
          backendUp,
          liveFlows: contextFlowRows,
        })
        let visible = filterPaperTimelineBySources(timeline, enabled)
        if (!visible.length && isOfflineShowcaseResearchTicker(ticker) && timeline.length) {
          visible = timeline
        }
        if (!visible.length) return null
        return normalizeResearchFeedRow(row, visible)
      })
      .filter(Boolean)
  }, [
    researchFilteredFeed,
    researchPaperSourceFilters,
    researchPresentation,
    researchTicker,
    backendUp,
    contextFlowRows,
  ])

  const researchFeedLoading = backendUp && researchFeedLive === null
  const researchFeedEmptyLabel = useMemo(() => {
    if (String(researchQuery ?? '').trim()) return 'No matching companies.'
    const enabled = effectiveResearchPaperSourceFilters(researchPaperSourceFilters)
    const allowed = researchSourceFilterKeys()
    if (enabled.size < allowed.length) return 'No companies match filters.'
    return 'No feed items yet.'
  }, [researchQuery, researchPaperSourceFilters])

  const investigateFeedLoading =
    backendUp &&
    (investigateMode === 'insider'
      ? insiderFeedLive === null
      : investigateMode === 'politicians'
        ? politiciansFeedLive === null
        : institutionsFeedLive === null)

  const researchPaperSourceFiltersPicker = researchFeedFilterOpen
    ? researchPaperSourceFiltersDraft
    : null

  const openResearchFeedFilter = useCallback(() => {
    setResearchPaperSourceFiltersDraft(new Set(researchPaperSourceFilters))
    setResearchFeedFilterOpen(true)
  }, [researchPaperSourceFilters])

  const closeResearchFeedFilter = useCallback(() => {
    if (researchPaperSourceFiltersDraft) {
      const allowed = researchSourceFilterKeys()
      const next =
        researchPaperSourceFiltersDraft.size > 0
          ? new Set(researchPaperSourceFiltersDraft)
          : new Set(allowed)
      setResearchPaperSourceFilters(next)
    }
    setResearchPaperSourceFiltersDraft(null)
    setResearchFeedFilterOpen(false)
  }, [researchPaperSourceFiltersDraft])

  const onResearchFeedFilterClick = useCallback(() => {
    if (researchFeedFilterOpen) closeResearchFeedFilter()
    else openResearchFeedFilter()
  }, [researchFeedFilterOpen, closeResearchFeedFilter, openResearchFeedFilter])

  const patchResearchSourceFilters = useCallback((patch) => {
    if (researchFeedFilterOpen) {
      setResearchPaperSourceFiltersDraft(patch)
      return
    }
    setResearchPaperSourceFilters(patch)
  }, [researchFeedFilterOpen])

  const toggleResearchSourceFilter = useCallback(
    (filterKey) => {
      const key = String(filterKey ?? '').includes('::')
        ? String(filterKey)
        : normalizeResearchPaperSourceKey(filterKey)
      if (!key) return
      patchResearchSourceFilters((prev) => {
        const base = prev ?? new Set()
        const next = new Set(base)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      })
    },
    [patchResearchSourceFilters],
  )

  const toggleResearchSourceFilterGroup = useCallback(
    (sourceId, enableAll) => {
      const keys =
        sourceId === 'Form 4'
          ? researchInsiderGroupFilterKeys()
          : researchSourceSubtypeKeysForSource(sourceId)
      if (!keys.length) return
      patchResearchSourceFilters((prev) => {
        const next = new Set(prev ?? [])
        for (const key of keys) {
          if (enableAll) next.add(key)
          else next.delete(key)
        }
        return next
      })
    },
    [patchResearchSourceFilters],
  )

  const researchFeedFilterPickerEl = (
    <ResearchFeedFilterPicker
      sourceTypes={researchPaperSourceTypeDefs}
      enabled={researchPaperSourceFiltersPicker ?? researchPaperSourceFilters}
      onToggle={toggleResearchSourceFilter}
      onToggleGroup={toggleResearchSourceFilterGroup}
    />
  )

  useEffect(() => {
    // If the current selection falls out of the source filter, snap to the first match.
    return
    const current = String(researchTicker ?? '').trim().toUpperCase()
    const pinned = String(researchTickerPinnedRef.current ?? '').trim().toUpperCase()
    if (pinned && pinned === current) return

    const enabled = effectiveResearchPaperSourceFilters(researchPaperSourceFilters)
    const rows = researchFeedAfterSourceFilter
    if (!rows.length) return
    const ok = rows.some((x) => String(x.ticker ?? '').toUpperCase() === current)
    if (!ok) setResearchTicker(String(rows[0]?.ticker ?? '').trim().toUpperCase())
  }, [researchPaperSourceFilters, researchFeedAfterSourceFilter, researchTicker])

  useEffect(() => {
    // Marketing / screenshot capture always uses rich offline mocks — never empty live feeds.
    if (isCaptureMode()) {
      setBackendUp(false)
      setBackendLastOkAt(null)
      return
    }

    let alive = true
    async function ping() {
      const r = await fetchJsonSafe('/health', { timeoutMs: 3500 })
      if (!alive) return
      if (r.ok && r.data?.ok) {
        const now = Date.now()
        setBackendLastOkAt(now)
        setBackendUp(true)
      }
    }
    ping()
    const t = setInterval(ping, 4000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  // Hysteresis: only drop to MOCK if backend hasn't responded in a while.
  useEffect(() => {
    if (isCaptureMode()) return
    if (!backendLastOkAt) return
    const t = setInterval(() => {
      const staleMs = Date.now() - backendLastOkAt
      if (staleMs > 15_000) setBackendUp(false)
    }, 1000)
    return () => clearInterval(t)
  }, [backendLastOkAt])

  useEffect(() => {
    if (!backendUp) return
    prefetchMacroCalendar()
  }, [backendUp])

  useEffect(() => {
    let alive = true
    async function run() {
      if (!backendUp) return
      const r = await fetchJsonSafe('/api/stats', { timeoutMs: 3500 })
      if (!alive) return
      if (r.ok && r.data?.ok) setBackendStats(r.data)
    }
    run()
    const t = setInterval(run, 30_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [backendUp])

  useEffect(() => {
    if (backendUp) return
    setResearchFeedLive(null)
    setResearchExploreLive(null)
    setResearchExploreTicker(null)
    setResearchCompanyLive(null)
    setResearchCompanyTicker(null)
    setResearchBarsSeries(null)
    setResearchBarsDays(null)
    setResearchBarsTicker(null)
    setBarsLive(null)
    setBarsLiveTicker(null)
    setInsiderClusterLive(null)
    setPoliticiansClusterLive(null)
    setInstitutionsClusterLive(null)
  }, [backendUp])

  useEffect(() => {
    if (!backendUp) return
    let cancelled = false
    const cacheKey = 'research:market'
    const hadCache = applyFeedCache(cacheKey, (hit) => {
      setResearchFeedLive(hit.items)
      setResearchFeedHasMore(Boolean(hit.hasMore))
      researchFeedOffsetRef.current = Number(hit.nextOffset) || hit.items.length
      researchFeedCursorRef.current = hit.nextCursor ?? null
    })

    async function run({ append = false, offset = 0, limit = FEED_INITIAL_PAGE_SIZE } = {}) {
      const page = await fetchFeedPage('/api/research/feed', {
        limit,
        offset,
        extra: { mode: 'market' },
      })
      if (cancelled) return
      if (!page.ok) {
        if (!append) {
          setResearchFeedLive((prev) => (Array.isArray(prev) ? prev : []))
          setResearchFeedHasMore(false)
        }
        return
      }
      setResearchFeedLive((prev) =>
        append ? mergeFeedPages(prev, page.items, { append: true }) : page.items,
      )
      setResearchFeedHasMore(page.hasMore)
      researchFeedOffsetRef.current = page.nextOffset
      researchFeedCursorRef.current = page.nextCursor
      if (!append) {
        persistFeedCache(cacheKey, {
          items: page.items,
          hasMore: page.hasMore,
          nextOffset: page.nextOffset,
          nextCursor: page.nextCursor,
        })
      }
    }

    if (!hadCache) {
      researchFeedOffsetRef.current = 0
      researchFeedCursorRef.current = null
      setResearchFeedHasMore(false)
    }
    void run({ append: false, offset: 0 })

    const t = setInterval(() => run({ append: false, offset: 0 }), FEED_BACKGROUND_REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [backendUp, researchFeedRefresh])

  const loadMoreResearchFeed = useCallback(async () => {
    if (!backendUp || researchFeedLoadingMore || !researchFeedHasMore) return
    setResearchFeedLoadingMore(true)
    const page = await fetchFeedPage('/api/research/feed', {
      limit: FEED_PAGE_SIZE,
      offset: researchFeedCursorRef.current ? 0 : researchFeedOffsetRef.current,
      cursor: researchFeedCursorRef.current,
      extra: { mode: 'market' },
    })
    if (page.ok) {
      setResearchFeedLive((prev) => mergeFeedPages(prev, page.items, { append: true }))
      setResearchFeedHasMore(page.hasMore)
      researchFeedOffsetRef.current = page.nextOffset
      researchFeedCursorRef.current = page.nextCursor
    }
    setResearchFeedLoadingMore(false)
  }, [backendUp, researchFeedHasMore, researchFeedLoadingMore])

  useEffect(() => {
    if (!backendUp) {
      setResearchFeedInjected([])
      return
    }
  }, [backendUp])

  useEffect(() => {
    if (!backendUp) return
    const tick = researchTick
    if (!tick) return
    let alive = true
    const gen = ++researchBarsFetchGenRef.current

    const cached = barsCacheRef.current.get(tick)
    if (cached?.closes?.length) {
      setResearchBarsSeries(cached.closes)
      setResearchBarsDays(cached.days ?? null)
      setResearchBarsTicker(tick)
    } else {
      setResearchBarsSeries(null)
      setResearchBarsDays(null)
      setResearchBarsTicker(tick)
    }

    async function run() {
      const r = await fetchJsonSafe(`/api/bars?ticker=${encodeURIComponent(tick)}&days=730`, {
        timeoutMs: 15_000,
      })
      if (!alive || researchBarsFetchGenRef.current !== gen) return
      const respTicker = String(r.data?.ticker ?? tick).trim().toUpperCase()
      if (respTicker !== tick) return
      const items = Array.isArray(r.data?.items) ? r.data.items : []
      const closes = []
      const days = []
      for (const row of items) {
        const n = Number(row?.close)
        if (!Number.isFinite(n)) continue
        closes.push(n)
        days.push(String(row?.day ?? '').slice(0, 10))
      }
      if (!alive || researchBarsFetchGenRef.current !== gen) return
      if (closes.length) {
        barsCacheRef.current.set(tick, { closes, days })
        setResearchBarsSeries(closes)
        setResearchBarsDays(days)
        setResearchBarsTicker(tick)
      } else if (r.ok) {
        barsCacheRef.current.delete(tick)
        setResearchBarsSeries(null)
        setResearchBarsDays(null)
        setResearchBarsTicker(tick)
      }
    }
    run()
    return () => {
      alive = false
    }
  }, [backendUp, researchTick])

  useEffect(() => {
    if (!backendUp) return
    const tick = researchTick
    if (!tick) return
    let alive = true
    const gen = ++researchCompanyFetchGenRef.current

    const cachedCompany = researchCompanyCacheRef.current.get(tick)
    if (cachedCompany) {
      setResearchCompanyLive(cachedCompany)
      setResearchCompanyTicker(tick)
      setResearchCompanyContextLoading(false)
    } else {
      setResearchCompanyLive(null)
      setResearchCompanyTicker(tick)
      setResearchCompanyContextLoading(true)
    }

    async function run() {
      const snap = await fetchJsonSafe(`/api/company?ticker=${encodeURIComponent(tick)}&snapshot=1`, {
        timeoutMs: 8_000,
      })
      if (!alive || researchCompanyFetchGenRef.current !== gen) return

      const applyCompany = (payload) => {
        if (!payload || typeof payload !== 'object') return
        const respTicker = String(payload.ticker ?? tick).trim().toUpperCase()
        if (respTicker !== tick) return
        setResearchCompanyLive((prev) => {
          const merged = mergeCompanyPayload(prev, payload)
          researchCompanyCacheRef.current.set(tick, merged)
          return merged
        })
        setResearchCompanyTicker(tick)
      }

      if (snap.ok && snap.data) applyCompany(snap.data)

      const full = await fetchJsonSafe(`/api/company?ticker=${encodeURIComponent(tick)}`, { timeoutMs: 20_000 })
      if (!alive || researchCompanyFetchGenRef.current !== gen) return
      if (full.ok && full.data) applyCompany(full.data)
      setResearchCompanyContextLoading(false)
    }
    run().catch(() => {
      if (alive && researchCompanyFetchGenRef.current === gen) setResearchCompanyContextLoading(false)
    })
    return () => {
      alive = false
    }
  }, [backendUp, researchTick])

  useEffect(() => {
    if (!backendUp || !researchTicker) {
      setAnalyseModelLoading(false)
      return
    }
    let alive = true
    const gen = ++analyseFetchGenRef.current
    const tick = researchTicker
    const cached = analyseCacheRef.current.get(tick)
    if (cached) {
      setAnalyseLivePayload(cached)
      setAnalyseModelLoading(false)
    } else {
      setAnalyseModelLoading(true)
    }
    void fetchAnalyseModel(tick).then((data) => {
      if (!alive || analyseFetchGenRef.current !== gen) return
      if (data) analyseCacheRef.current.set(tick, data)
      setAnalyseLivePayload(data)
      setAnalyseModelLoading(false)
    })
    return () => {
      alive = false
    }
  }, [backendUp, researchTicker])

  useEffect(() => {
    if (!backendUp) return
    const tick = researchTick
    if (!tick) return
    let alive = true
    const gen = ++researchExploreFetchGenRef.current

    const cachedExplore = researchExploreCacheRef.current.get(tick)
    if (cachedExplore) {
      setResearchExploreLive(cachedExplore)
      setResearchExploreTicker(tick)
    } else {
      setResearchExploreLive(null)
      setResearchExploreTicker(tick)
    }

    async function run() {
      const r = await fetchJsonSafe(`/api/research/explore?ticker=${encodeURIComponent(tick)}`, {
        timeoutMs: 25_000,
      })
      if (!alive || researchExploreFetchGenRef.current !== gen) return
      const respTicker = String(r.data?.ticker ?? tick).trim().toUpperCase()
      if (r.ok && r.data?.ok && respTicker === tick) {
        researchExploreCacheRef.current.set(tick, r.data)
        setResearchExploreLive(r.data)
        setResearchExploreTicker(tick)
        return
      }
      // Keep a prior good cache; never replace live dossier data with a fake empty stub.
      const prior = researchExploreCacheRef.current.get(tick)
      if (prior) {
        setResearchExploreLive(prior)
        setResearchExploreTicker(tick)
        return
      }
      setResearchExploreLive({
        ok: false,
        ticker: tick,
        company_name: tick,
        presentation: {
          title: `${tick}`,
          subtitle: tick,
          blocks: [],
          explainer: [],
          sources: [],
          documents: [],
        },
        flows: { insiders: [], politicians: [], filings13f: [] },
        tracked_investors: [],
      })
      setResearchExploreTicker(tick)
    }
    run().catch(() => {
      if (!alive || researchExploreFetchGenRef.current !== gen) return
      const prior = researchExploreCacheRef.current.get(tick)
      if (prior) {
        setResearchExploreLive(prior)
        setResearchExploreTicker(tick)
        return
      }
      setResearchExploreLive({
        ok: false,
        ticker: tick,
        company_name: tick,
        presentation: {
          title: `${tick}`,
          subtitle: tick,
          blocks: [],
          explainer: [],
          sources: [],
          documents: [],
        },
        flows: { insiders: [], politicians: [], filings13f: [] },
        tracked_investors: [],
      })
      setResearchExploreTicker(tick)
    })
    return () => {
      alive = false
    }
  }, [backendUp, researchTick])

  useEffect(() => {
    if (!backendUp) return
    let alive = true
    const cacheKey = 'investigate:insider:company:30'
    const hadCache = applyFeedCache(cacheKey, (hit) => {
      setInsiderFeedLive(hit.items)
      setInsiderFeedHasMore(Boolean(hit.hasMore))
      insiderFeedOffsetRef.current = Number(hit.nextOffset) || hit.items.length
      insiderFeedCursorRef.current = hit.nextCursor ?? null
    })

    async function run({ append = false, offset = 0, limit = FEED_INITIAL_PAGE_SIZE } = {}) {
      const page = await fetchFeedPage('/api/insider/feed', {
        limit,
        offset,
        extra: { mode: 'company', days: 30 },
      })
      if (!alive) return
      const mapped = page.items.map(mapInsiderCompanyFeedItem).filter((x) => x.id && x.ticker && x.at)
      if (!page.ok) {
        if (!append) setInsiderFeedLive((prev) => (Array.isArray(prev) ? prev : []))
        return
      }
      setInsiderFeedLive((prev) => (append ? mergeFeedPages(prev, mapped, { append: true }) : mapped))
      setInsiderFeedHasMore(page.hasMore)
      insiderFeedOffsetRef.current = page.nextOffset
      insiderFeedCursorRef.current = page.nextCursor
      if (!append) {
        persistFeedCache(cacheKey, { items: mapped, hasMore: page.hasMore, nextOffset: page.nextOffset, nextCursor: page.nextCursor })
      }
    }

    if (!hadCache) {
      insiderFeedOffsetRef.current = 0
      insiderFeedCursorRef.current = null
      setInsiderFeedHasMore(false)
    }
    void run({ append: false, offset: 0 })

    const t = setInterval(() => run({ append: false, offset: 0 }), FEED_BACKGROUND_REFRESH_MS)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [backendUp])

  const loadMoreInsiderFeed = useCallback(async () => {
    if (!backendUp || insiderFeedLoadingMore || !insiderFeedHasMore) return
    setInsiderFeedLoadingMore(true)
    const page = await fetchFeedPage('/api/insider/feed', {
      limit: FEED_PAGE_SIZE,
      offset: insiderFeedCursorRef.current ? 0 : insiderFeedOffsetRef.current,
      cursor: insiderFeedCursorRef.current,
      extra: { mode: 'company', days: 30 },
    })
    if (page.ok) {
      const mapped = page.items.map(mapInsiderCompanyFeedItem).filter((x) => x.id && x.ticker && x.at)
      setInsiderFeedLive((prev) => mergeFeedPages(prev, mapped, { append: true }))
      setInsiderFeedHasMore(page.hasMore)
      insiderFeedOffsetRef.current = page.nextOffset
      insiderFeedCursorRef.current = page.nextCursor
    }
    setInsiderFeedLoadingMore(false)
  }, [backendUp, insiderFeedHasMore, insiderFeedLoadingMore])

  useEffect(() => {
    if (!backendUp) return
    let alive = true
    const cacheKey = 'investigate:institutions:60'
    const hadCache = applyFeedCache(cacheKey, (hit) => {
      setInstitutionsFeedLive(hit.items)
      setInstitutionsFeedHasMore(Boolean(hit.hasMore))
      institutionsFeedOffsetRef.current = Number(hit.nextOffset) || hit.items.length
      institutionsFeedCursorRef.current = hit.nextCursor ?? null
    })

    async function run({ append = false, offset = 0, limit = FEED_INITIAL_PAGE_SIZE } = {}) {
      const page = await fetchFeedPage('/api/institutions/feed', {
        limit,
        offset,
        extra: { days: 60 },
      })
      if (!alive) return
      const mapped = page.items.map(mapInstitutionFeedItem).filter((x) => x.id && x.ticker && x.at)
      if (!page.ok) {
        if (!append) setInstitutionsFeedLive((prev) => (Array.isArray(prev) ? prev : []))
        return
      }
      setInstitutionsFeedLive((prev) => (append ? mergeFeedPages(prev, mapped, { append: true }) : mapped))
      setInstitutionsFeedHasMore(page.hasMore)
      institutionsFeedOffsetRef.current = page.nextOffset
      institutionsFeedCursorRef.current = page.nextCursor
      if (!append) {
        persistFeedCache(cacheKey, { items: mapped, hasMore: page.hasMore, nextOffset: page.nextOffset, nextCursor: page.nextCursor })
      }
    }

    if (!hadCache) {
      institutionsFeedOffsetRef.current = 0
      institutionsFeedCursorRef.current = null
      setInstitutionsFeedHasMore(false)
    }
    void run({ append: false, offset: 0 })

    const t = setInterval(() => run({ append: false, offset: 0 }), FEED_BACKGROUND_REFRESH_MS)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [backendUp])

  const loadMoreInstitutionsFeed = useCallback(async () => {
    if (!backendUp || institutionsFeedLoadingMore || !institutionsFeedHasMore) return
    setInstitutionsFeedLoadingMore(true)
    const page = await fetchFeedPage('/api/institutions/feed', {
      limit: FEED_PAGE_SIZE,
      offset: institutionsFeedCursorRef.current ? 0 : institutionsFeedOffsetRef.current,
      cursor: institutionsFeedCursorRef.current,
      extra: { days: 60 },
    })
    if (page.ok) {
      const mapped = page.items.map(mapInstitutionFeedItem).filter((x) => x.id && x.ticker && x.at)
      setInstitutionsFeedLive((prev) => mergeFeedPages(prev, mapped, { append: true }))
      setInstitutionsFeedHasMore(page.hasMore)
      institutionsFeedOffsetRef.current = page.nextOffset
      institutionsFeedCursorRef.current = page.nextCursor
    }
    setInstitutionsFeedLoadingMore(false)
  }, [backendUp, institutionsFeedHasMore, institutionsFeedLoadingMore])

  useEffect(() => {
    if (!backendUp) return
    let alive = true
    const cacheKey = 'investigate:politicians:30'
    const hadCache = applyFeedCache(cacheKey, (hit) => {
      setPoliticiansFeedLive(hit.items)
      setPoliticiansFeedHasMore(Boolean(hit.hasMore))
      politiciansFeedOffsetRef.current = Number(hit.nextOffset) || hit.items.length
      politiciansFeedCursorRef.current = hit.nextCursor ?? null
    })

    async function run({ append = false, offset = 0, limit = FEED_INITIAL_PAGE_SIZE } = {}) {
      const page = await fetchFeedPage('/api/politicians/feed', {
        limit,
        offset,
        extra: { days: 30 },
      })
      if (!alive) return
      const mapped = page.items.map(mapPoliticianFeedItem).filter((x) => x.id && x.ticker && x.at)
      if (!page.ok) {
        if (!append) setPoliticiansFeedLive((prev) => (Array.isArray(prev) ? prev : []))
        return
      }
      setPoliticiansFeedLive((prev) => (append ? mergeFeedPages(prev, mapped, { append: true }) : mapped))
      setPoliticiansFeedHasMore(page.hasMore)
      politiciansFeedOffsetRef.current = page.nextOffset
      politiciansFeedCursorRef.current = page.nextCursor
      if (!append) {
        persistFeedCache(cacheKey, { items: mapped, hasMore: page.hasMore, nextOffset: page.nextOffset, nextCursor: page.nextCursor })
      }
    }

    if (!hadCache) {
      politiciansFeedOffsetRef.current = 0
      politiciansFeedCursorRef.current = null
      setPoliticiansFeedHasMore(false)
    }
    void run({ append: false, offset: 0 })

    const t = setInterval(() => run({ append: false, offset: 0 }), FEED_BACKGROUND_REFRESH_MS)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [backendUp])

  const loadMorePoliticiansFeed = useCallback(async () => {
    if (!backendUp || politiciansFeedLoadingMore || !politiciansFeedHasMore) return
    setPoliticiansFeedLoadingMore(true)
    const page = await fetchFeedPage('/api/politicians/feed', {
      limit: FEED_PAGE_SIZE,
      offset: politiciansFeedCursorRef.current ? 0 : politiciansFeedOffsetRef.current,
      cursor: politiciansFeedCursorRef.current,
      extra: { days: 30 },
    })
    if (page.ok) {
      const mapped = page.items.map(mapPoliticianFeedItem).filter((x) => x.id && x.ticker && x.at)
      setPoliticiansFeedLive((prev) => mergeFeedPages(prev, mapped, { append: true }))
      setPoliticiansFeedHasMore(page.hasMore)
      politiciansFeedOffsetRef.current = page.nextOffset
      politiciansFeedCursorRef.current = page.nextCursor
    }
    setPoliticiansFeedLoadingMore(false)
  }, [backendUp, politiciansFeedHasMore, politiciansFeedLoadingMore])

  const investigateFeedLoadMore = useCallback(() => {
    if (investigateMode === 'insider') void loadMoreInsiderFeed()
    else if (investigateMode === 'politicians') void loadMorePoliticiansFeed()
    else void loadMoreInstitutionsFeed()
  }, [
    investigateMode,
    loadMoreInsiderFeed,
    loadMorePoliticiansFeed,
    loadMoreInstitutionsFeed,
  ])

  const investigateFeedHasMore =
    investigateMode === 'insider'
      ? insiderFeedHasMore
      : investigateMode === 'politicians'
        ? politiciansFeedHasMore
        : institutionsFeedHasMore

  const investigateFeedLoadingMore =
    investigateMode === 'insider'
      ? insiderFeedLoadingMore
      : investigateMode === 'politicians'
        ? politiciansFeedLoadingMore
        : institutionsFeedLoadingMore

  const insiderFeedRowsBase = useMemo(
    () =>
      applyFeedTodayEventCounts(
        !backendUp
          ? INSIDER_FEED_ROWS
          : Array.isArray(insiderFeedLive) && insiderFeedLive.length
            ? insiderFeedLive
            : insiderFeedLive === null
              ? []
              : INSIDER_FEED_ROWS,
      ),
    [backendUp, insiderFeedLive],
  )

  const insiderFeedRowsTxnFiltered = useMemo(
    () => applyInvestigateFeedTxnFilter(insiderFeedRowsBase, investigateInsiderTxnFilters, 'insider'),
    [insiderFeedRowsBase, investigateInsiderTxnFilters],
  )

  const insiderActorFeedBase = useMemo(() => {
    const actors = buildInvestigateActorFeed(insiderFeedRowsTxnFiltered, 'insider')
    const usingMock =
      !backendUp || (insiderFeedLive !== null && !(insiderFeedLive?.length > 0))
    if (usingMock) {
      return polishOfflineInvestigateActorFeed(actors).map(normalizeInvestigateActorFeedRow)
    }
    return actors
  }, [insiderFeedRowsTxnFiltered, backendUp, insiderFeedLive])

  const insiderFilteredFeed = useMemo(() => {
    const q = String(insiderFeedQuery ?? '').trim()
    let rows = insiderActorFeedBase
    if (q) {
      rows = rows.filter((r) => investigateActorFeedRowMatchesSearch(r, q))
    }
    return sortFeedRowsTodayEventsFirst(rows)
  }, [insiderActorFeedBase, insiderFeedQuery])

  useEffect(() => {
    return
    setInsiderIdx(0)
    setInsiderCaseTradeIdx(0)
  }, [insiderFeedQuery, investigateInsiderTxnFilters, investigateMode])

  const insiderSelected =
    insiderFilteredFeed.length > 0
      ? insiderFilteredFeed[clamp(insiderIdx, 0, Math.max(0, insiderFilteredFeed.length - 1))]
      : null

  const politiciansFeedRowsBase = useMemo(
    () =>
      applyFeedTodayEventCounts(
        !backendUp
          ? POLITICIAN_FEED_ROWS
          : Array.isArray(politiciansFeedLive) && politiciansFeedLive.length
            ? politiciansFeedLive
            : politiciansFeedLive === null
              ? []
              : POLITICIAN_FEED_ROWS,
      ),
    [backendUp, politiciansFeedLive],
  )

  const politiciansFeedRowsTxnFiltered = useMemo(
    () => applyInvestigateFeedTxnFilter(politiciansFeedRowsBase, investigatePoliticianTxnFilters, 'politicians'),
    [politiciansFeedRowsBase, investigatePoliticianTxnFilters],
  )

  const politiciansActorFeedBase = useMemo(() => {
    const actors = buildInvestigateActorFeed(politiciansFeedRowsTxnFiltered, 'politicians')
    const usingMock =
      !backendUp || (politiciansFeedLive !== null && !(politiciansFeedLive?.length > 0))
    if (usingMock) {
      return polishOfflineInvestigateActorFeed(actors).map(normalizeInvestigateActorFeedRow)
    }
    return actors
  }, [politiciansFeedRowsTxnFiltered, backendUp, politiciansFeedLive])

  const politiciansFilteredFeed = useMemo(() => {
    const q = String(politiciansFeedQuery ?? '').trim()
    let rows = politiciansActorFeedBase
    if (q) {
      rows = rows.filter((r) => investigateActorFeedRowMatchesSearch(r, q))
    }
    return sortFeedRowsTodayEventsFirst(rows)
  }, [politiciansActorFeedBase, politiciansFeedQuery])

  useEffect(() => {
    return
    setPoliticiansIdx(0)
    setPoliticiansCaseTradeIdx(0)
  }, [politiciansFeedQuery, investigatePoliticianTxnFilters, investigateMode])

  const politiciansSelected =
    politiciansFilteredFeed.length > 0
      ? politiciansFilteredFeed[clamp(politiciansIdx, 0, Math.max(0, politiciansFilteredFeed.length - 1))]
      : null

  const institutionsFeedRowsBase = useMemo(
    () =>
      applyFeedTodayEventCounts(
        !backendUp
          ? INSTITUTION_FEED_ROWS
          : Array.isArray(institutionsFeedLive) && institutionsFeedLive.length
            ? institutionsFeedLive
            : institutionsFeedLive === null
              ? []
              : INSTITUTION_FEED_ROWS,
      ),
    [backendUp, institutionsFeedLive],
  )

  const institutionsFeedRowsTxnFiltered = useMemo(
    () => applyInvestigateFeedTxnFilter(institutionsFeedRowsBase, investigateInstitutionTxnFilters, 'institutions'),
    [institutionsFeedRowsBase, investigateInstitutionTxnFilters],
  )

  const institutionsActorFeedBase = useMemo(() => {
    const actors = buildInvestigateActorFeed(institutionsFeedRowsTxnFiltered, 'institutions')
    const usingMock =
      !backendUp || (institutionsFeedLive !== null && !(institutionsFeedLive?.length > 0))
    if (usingMock) {
      return polishOfflineInvestigateActorFeed(actors).map(normalizeInvestigateActorFeedRow)
    }
    return actors
  }, [institutionsFeedRowsTxnFiltered, backendUp, institutionsFeedLive])

  const institutionsFilteredFeed = useMemo(() => {
    const q = String(institutionsFeedQuery ?? '').trim()
    let rows = institutionsActorFeedBase
    if (q) {
      rows = rows.filter((r) => investigateActorFeedRowMatchesSearch(r, q))
    }
    return sortFeedRowsTodayEventsFirst(rows)
  }, [institutionsActorFeedBase, institutionsFeedQuery])

  const exploreInvestorDirectoryRows = useMemo(() => buildExploreDirectoryFullList('investors'), [])

  const exploreActorFeeds = useMemo(
    () => ({
      insider: insiderFilteredFeed,
      politicians: politiciansFilteredFeed,
      institutions: institutionsFilteredFeed,
    }),
    [insiderFilteredFeed, politiciansFilteredFeed, institutionsFilteredFeed],
  )

  const exploreActorFeedHandlers = useMemo(
    () => ({
      setInvestigateMode,
      setInsiderIdx,
      setPoliticiansIdx,
      setInstitutionsIdx,
      setInsiderCaseTradeIdx,
      setPoliticiansCaseTradeIdx,
      setInstitutionsCaseTradeIdx,
    }),
    [],
  )

  const exploreInvestorDossier = useMemo(() => {
    if (terminalRoute.view !== 'investorDetail' || !terminalRoute.investorSlug) return null
    return resolveExploreInvestorDossier({
      investorSlug: terminalRoute.investorSlug,
      feeds: exploreActorFeeds,
      directoryRows: exploreInvestorDirectoryRows,
      focus: exploreInvestorFocus,
    })
  }, [
    terminalRoute.view,
    terminalRoute.investorSlug,
    exploreActorFeeds,
    exploreInvestorDirectoryRows,
    exploreInvestorFocus,
  ])

  useEffect(() => {
    if (shell !== 'explore') return
    if (terminalRoute.view === 'companyDetail' && terminalRoute.ticker) {
      setResearchTicker(terminalRoute.ticker)
      setDeepResearchMode('company')
      return
    }
    if (terminalRoute.view === 'investorDetail' && terminalRoute.investorSlug) {
      setDeepResearchMode('investor')
      const slug = terminalRoute.investorSlug
      const resolved = resolveExploreInvestorDossier({
        investorSlug: slug,
        feeds: exploreActorFeeds,
        directoryRows: exploreInvestorDirectoryRows,
        focus: exploreInvestorFocus,
      })
      if (!resolved) return
      if (resolved.fromFeed && resolved.index != null) {
        applyExploreInvestorFeedSelection(
          { mode: resolved.mode, index: resolved.index },
          exploreActorFeedHandlers,
        )
      } else {
        exploreActorFeedHandlers.setInvestigateMode(resolved.mode)
      }
      setExploreInvestorFocus((prev) => {
        if (
          prev?.slug === resolved.slug &&
          prev?.mode === resolved.mode &&
          prev?.actorRow?.actorName === resolved.actorRow?.actorName
        ) {
          return prev
        }
        return { slug: resolved.slug, mode: resolved.mode, actorRow: resolved.actorRow }
      })
    }
    // exploreInvestorFocus intentionally omitted: we seed from click, then sync URL→feeds without looping.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shell, terminalRoute, exploreActorFeeds, exploreActorFeedHandlers, exploreInvestorDirectoryRows])

  useEffect(() => {
    return
    setInstitutionsIdx(0)
    setInstitutionsCaseTradeIdx(0)
  }, [institutionsFeedQuery, investigateInstitutionTxnFilters, investigateMode])

  const institutionsSelected =
    institutionsFilteredFeed.length > 0
      ? institutionsFilteredFeed[clamp(institutionsIdx, 0, Math.max(0, institutionsFilteredFeed.length - 1))]
      : null

  const effectiveActorRow = useMemo(() => {
    if (exploreInvestorDossier?.actorRow) return exploreInvestorDossier.actorRow
    if (investigateMode === 'politicians') return politiciansSelected
    if (investigateMode === 'institutions') return institutionsSelected
    return insiderSelected
  }, [
    exploreInvestorDossier,
    investigateMode,
    politiciansSelected,
    institutionsSelected,
    insiderSelected,
  ])

  const investorDossierMode = exploreInvestorDossier?.mode ?? investigateMode

  // Bars (Daily Graph) + Company panel: use selected ticker in either mode.
  // Investigate tab chrome is retired; Explore deep dossiers still key off investigateMode.
  const investigateOpen = false
  const investigateIsInsider = investorDossierMode === 'insider'
  const investigateIsPoliticians = investorDossierMode === 'politicians'
  const investigateIsInstitutions = investorDossierMode === 'institutions'

  const investigateTxnFilterEnabled = investigateIsInsider
    ? investigateInsiderTxnFilters
    : investigateIsPoliticians
      ? investigatePoliticianTxnFilters
      : investigateInstitutionTxnFilters

  const investigateTxnFilterDraft = investigateIsInsider
    ? investigateInsiderTxnFiltersDraft
    : investigateIsPoliticians
      ? investigatePoliticianTxnFiltersDraft
      : investigateInstitutionTxnFiltersDraft

  const investigateTxnFilterPickerEnabled =
    investigateFeedFilterOpen && investigateTxnFilterDraft ? investigateTxnFilterDraft : investigateTxnFilterEnabled

  const openInvestigateFeedFilter = useCallback(() => {
    if (investigateIsInsider) {
      setInvestigateInsiderTxnFiltersDraft(new Set(investigateInsiderTxnFilters))
      setInvestigatePoliticianTxnFiltersDraft(null)
      setInvestigateInstitutionTxnFiltersDraft(null)
    } else if (investigateIsPoliticians) {
      setInvestigatePoliticianTxnFiltersDraft(new Set(investigatePoliticianTxnFilters))
      setInvestigateInsiderTxnFiltersDraft(null)
      setInvestigateInstitutionTxnFiltersDraft(null)
    } else {
      setInvestigateInstitutionTxnFiltersDraft(new Set(investigateInstitutionTxnFilters))
      setInvestigateInsiderTxnFiltersDraft(null)
      setInvestigatePoliticianTxnFiltersDraft(null)
    }
    setInvestigateFeedFilterOpen(true)
  }, [
    investigateIsInsider,
    investigateIsPoliticians,
    investigateInsiderTxnFilters,
    investigatePoliticianTxnFilters,
    investigateInstitutionTxnFilters,
  ])

  const closeInvestigateFeedFilter = useCallback(() => {
    if (investigateInsiderTxnFiltersDraft) {
      setInvestigateInsiderTxnFilters(new Set(investigateInsiderTxnFiltersDraft))
    }
    if (investigatePoliticianTxnFiltersDraft) {
      setInvestigatePoliticianTxnFilters(new Set(investigatePoliticianTxnFiltersDraft))
    }
    if (investigateInstitutionTxnFiltersDraft) {
      setInvestigateInstitutionTxnFilters(new Set(investigateInstitutionTxnFiltersDraft))
    }
    setInvestigateInsiderTxnFiltersDraft(null)
    setInvestigatePoliticianTxnFiltersDraft(null)
    setInvestigateInstitutionTxnFiltersDraft(null)
    setInvestigateFeedFilterOpen(false)
  }, [
    investigateInsiderTxnFiltersDraft,
    investigatePoliticianTxnFiltersDraft,
    investigateInstitutionTxnFiltersDraft,
  ])

  const onInvestigateFeedFilterClick = useCallback(() => {
    if (investigateFeedFilterOpen) closeInvestigateFeedFilter()
    else openInvestigateFeedFilter()
  }, [investigateFeedFilterOpen, closeInvestigateFeedFilter, openInvestigateFeedFilter])

  const toggleInvestigateTxnFilter = useCallback(
    (id) => {
      const code = investigateIsInstitutions
        ? String(id ?? '').trim()
        : String(id ?? '').trim().toUpperCase()
      if (!code) return
      const patch = (prev) => {
        const base = prev ?? new Set()
        const next = new Set(base)
        if (next.has(code)) next.delete(code)
        else next.add(code)
        return next
      }
      const applyDraft = (setter) => setter(patch)
      if (investigateFeedFilterOpen) {
        if (investigateIsInsider) applyDraft(setInvestigateInsiderTxnFiltersDraft)
        else if (investigateIsPoliticians) applyDraft(setInvestigatePoliticianTxnFiltersDraft)
        else applyDraft(setInvestigateInstitutionTxnFiltersDraft)
        return
      }
      if (investigateIsInsider) applyDraft(setInvestigateInsiderTxnFilters)
      else if (investigateIsPoliticians) applyDraft(setInvestigatePoliticianTxnFilters)
      else applyDraft(setInvestigateInstitutionTxnFilters)
    },
    [
      investigateFeedFilterOpen,
      investigateIsInsider,
      investigateIsPoliticians,
      investigateIsInstitutions,
    ],
  )

  const insiderCaseFeedRows = useMemo(() => {
    if (!insiderSelected) return []
    return buildActorCaseFeedRows(insiderSelected, investigateInsiderTxnFilters, insiderChartRange)
  }, [insiderSelected, insiderChartRange, investigateInsiderTxnFilters])

  const politiciansCaseFeedRows = useMemo(() => {
    if (!politiciansSelected) return []
    return buildActorCaseFeedRows(
      politiciansSelected,
      investigatePoliticianTxnFilters,
      politiciansChartRange,
    )
  }, [politiciansSelected, politiciansChartRange, investigatePoliticianTxnFilters])

  const institutionsCaseFeedRows = useMemo(() => {
    if (!institutionsSelected) return []
    return buildActorCaseFeedRows(
      institutionsSelected,
      investigateInstitutionTxnFilters,
      institutionsChartRange,
    )
  }, [institutionsSelected, institutionsChartRange, investigateInstitutionTxnFilters])

  const politiciansCaseTradeRowIndices = useMemo(() => {
    const idxs = []
    for (let i = 0; i < politiciansCaseFeedRows.length; i++) {
      if (politiciansCaseFeedRows[i]?.type === 'trade') idxs.push(i)
    }
    return idxs
  }, [politiciansCaseFeedRows])

  const politiciansCaseSelectedRowIndex =
    politiciansCaseTradeRowIndices.length > 0
      ? politiciansCaseTradeRowIndices[clamp(politiciansCaseTradeIdx, 0, politiciansCaseTradeRowIndices.length - 1)]
      : -1

  const institutionsCaseTradeRowIndices = useMemo(() => {
    const idxs = []
    for (let i = 0; i < institutionsCaseFeedRows.length; i++) {
      if (institutionsCaseFeedRows[i]?.type === 'trade') idxs.push(i)
    }
    return idxs
  }, [institutionsCaseFeedRows])

  const institutionsCaseSelectedRowIndex =
    institutionsCaseTradeRowIndices.length > 0
      ? institutionsCaseTradeRowIndices[
          clamp(institutionsCaseTradeIdx, 0, institutionsCaseTradeRowIndices.length - 1)
        ]
      : -1

  const insiderCaseTradeRowIndices = useMemo(() => {
    const idxs = []
    for (let i = 0; i < insiderCaseFeedRows.length; i++) {
      if (insiderCaseFeedRows[i]?.type === 'trade') idxs.push(i)
    }
    return idxs
  }, [insiderCaseFeedRows])

  const insiderCaseSelectedRowIndex =
    insiderCaseTradeRowIndices.length > 0
      ? insiderCaseTradeRowIndices[clamp(insiderCaseTradeIdx, 0, insiderCaseTradeRowIndices.length - 1)]
      : -1

  const investigateActiveCaseFeedRows = useMemo(() => {
    if (exploreInvestorDossier?.actorRow) {
      const filters = investigateIsPoliticians
        ? investigatePoliticianTxnFilters
        : investigateIsInstitutions
          ? investigateInstitutionTxnFilters
          : investigateInsiderTxnFilters
      const range = investigateIsPoliticians
        ? politiciansChartRange
        : investigateIsInstitutions
          ? institutionsChartRange
          : insiderChartRange
      return buildActorCaseFeedRows(exploreInvestorDossier.actorRow, filters, range)
    }
    if (investigateIsPoliticians) return politiciansCaseFeedRows
    if (investigateIsInstitutions) return institutionsCaseFeedRows
    return insiderCaseFeedRows
  }, [
    exploreInvestorDossier,
    investigateIsPoliticians,
    investigateIsInstitutions,
    investigatePoliticianTxnFilters,
    investigateInstitutionTxnFilters,
    investigateInsiderTxnFilters,
    politiciansChartRange,
    institutionsChartRange,
    insiderChartRange,
    politiciansCaseFeedRows,
    institutionsCaseFeedRows,
    insiderCaseFeedRows,
  ])

  const investigateCaseSelectedTrade = useMemo(() => {
    if (investigateIsPoliticians) {
      return politiciansCaseSelectedRowIndex >= 0
        ? politiciansCaseFeedRows[politiciansCaseSelectedRowIndex]
        : null
    }
    if (investigateIsInstitutions) {
      return institutionsCaseSelectedRowIndex >= 0
        ? institutionsCaseFeedRows[institutionsCaseSelectedRowIndex]
        : null
    }
    return insiderCaseSelectedRowIndex >= 0 ? insiderCaseFeedRows[insiderCaseSelectedRowIndex] : null
  }, [
    investigateIsPoliticians,
    investigateIsInstitutions,
    politiciansCaseSelectedRowIndex,
    politiciansCaseFeedRows,
    institutionsCaseSelectedRowIndex,
    institutionsCaseFeedRows,
    insiderCaseSelectedRowIndex,
    insiderCaseFeedRows,
  ])

  const investigateChartTicker = useMemo(() => {
    const fromSelected = investigateCaseSelectedTrade?.ticker
    if (fromSelected) return String(fromSelected).trim().toUpperCase()
    const first = investigateActiveCaseFeedRows.find((r) => r?.type === 'trade' && r?.ticker)
    return first?.ticker ? String(first.ticker).trim().toUpperCase() : null
  }, [investigateCaseSelectedTrade?.ticker, investigateActiveCaseFeedRows])

  const investigateChartClusterMode = useMemo(() => {
    const fromTrade = investigateCaseSelectedTrade?.__source
    if (fromTrade) return fromTrade
    return investigateMode
  }, [
    investigateCaseSelectedTrade?.__source,
    investigateMode,
  ])

  const investigateChartCompanyRow = useMemo(() => {
    const ticker = investigateChartTicker
    if (!ticker) return null
    const actor = effectiveActorRow
    const hit = actor?.transactions?.find((t) => String(t.ticker ?? '').trim().toUpperCase() === ticker)
    if (hit?.companyRow) return hit.companyRow
    const mode = investigateChartClusterMode
    const rows =
      mode === 'politicians'
        ? politiciansFeedRowsTxnFiltered
        : mode === 'institutions'
          ? institutionsFeedRowsTxnFiltered
          : insiderFeedRowsTxnFiltered
    return findCompanyFeedRowByTicker(rows, ticker)
  }, [
    investigateChartTicker,
    effectiveActorRow,
    investigateChartClusterMode,
    insiderFeedRowsTxnFiltered,
    politiciansFeedRowsTxnFiltered,
    institutionsFeedRowsTxnFiltered,
  ])

  // Insider cluster: case worksheet + context
  useEffect(() => {
    let alive = true
    if (!backendUp) {
      setInsiderClusterLive(null)
      return () => {
        alive = false
      }
    }
    const clusterMode = investigateMode
    if (clusterMode !== 'insider') {
      return () => {
        alive = false
      }
    }
    const ticker = investigateChartTicker
    const sourceRow = investigateChartCompanyRow
    const id = sourceRow?.__backend_id ?? null
    const useId = id || (ticker ? `company:${ticker}` : null)
    if (!useId || !ticker) {
      setInsiderClusterLive(null)
      return () => {
        alive = false
      }
    }
    async function run() {
      const r = await fetchJsonSafe(`/api/insider/cluster/${encodeURIComponent(useId)}?days=30`)
      if (!alive) return
      const data = r.ok ? r.data?.data ?? null : null
      if (!data || typeof data !== 'object') {
        setInsiderClusterLive(null)
        return
      }
      if (!investigateClusterMatchesTicker(data, ticker)) return
      setInsiderClusterLive(data)
    }
    run()
    return () => {
      alive = false
    }
  }, [
    backendUp,
    investigateMode,
    investigateChartClusterMode,
    investigateChartTicker,
    investigateChartCompanyRow?.__backend_id,
    investigateChartCompanyRow,
  ])

  // Politicians cluster: case worksheet + context
  useEffect(() => {
    let alive = true
    if (!backendUp) {
      setPoliticiansClusterLive(null)
      return () => {
        alive = false
      }
    }
    const clusterMode = investigateMode
    if (clusterMode !== 'politicians') {
      return () => {
        alive = false
      }
    }
    const ticker = investigateChartTicker
    const useId = ticker ? `ticker:${ticker}` : null
    if (!useId) {
      setPoliticiansClusterLive(null)
      return () => {
        alive = false
      }
    }
    async function run() {
      const r = await fetchJsonSafe(`/api/politicians/cluster/${encodeURIComponent(useId)}?days=120`, { timeoutMs: 7000 })
      if (!alive) return
      const data = r.ok ? r.data?.data ?? null : null
      if (!data || typeof data !== 'object') {
        setPoliticiansClusterLive(null)
        return
      }
      if (!investigateClusterMatchesTicker(data, ticker)) return
      setPoliticiansClusterLive(data)
    }
    run()
    return () => {
      alive = false
    }
  }, [backendUp, investigateMode, investigateChartClusterMode, investigateChartTicker])

  useEffect(() => {
    let alive = true
    if (!backendUp) {
      setInstitutionsClusterLive(null)
      return () => {
        alive = false
      }
    }
    const clusterMode = investigateMode
    if (clusterMode !== 'institutions') {
      return () => {
        alive = false
      }
    }
    const ticker = investigateChartTicker
    const useId = ticker ? `ticker:${ticker}` : null
    if (!useId) {
      setInstitutionsClusterLive(null)
      return () => {
        alive = false
      }
    }
    async function run() {
      const r = await fetchJsonSafe(`/api/institutions/cluster/${encodeURIComponent(useId)}?days=120`, {
        timeoutMs: 7000,
      })
      if (!alive) return
      const data = r.ok ? r.data?.data ?? null : null
      if (!data || typeof data !== 'object') {
        setInstitutionsClusterLive(null)
        return
      }
      if (!investigateClusterMatchesTicker(data, ticker)) return
      setInstitutionsClusterLive(data)
    }
    run()
    return () => {
      alive = false
    }
  }, [backendUp, investigateMode, investigateChartClusterMode, investigateChartTicker])

  const selectedTicker = useMemo(() => investigateChartTicker, [investigateChartTicker])

  const chartPanelTitle = useMemo(() => {
    const fromApi = backendUp && companyLive?.name ? String(companyLive.name).trim() : ''
    const companyRow = investigateChartCompanyRow
    const fromFeed = String(companyRow?.company ?? '').trim()
    const fromTrade = String(investigateCaseSelectedTrade?.companyName ?? '').trim()
    const ticker = String(selectedTicker ?? '').trim().toUpperCase()
    return fromApi || fromTrade || fromFeed || ticker || '—'
  }, [
    backendUp,
    companyLive?.name,
    investigateChartCompanyRow,
    investigateCaseSelectedTrade?.companyName,
    selectedTicker,
  ])

  const investigateFeedCompany = useMemo(() => {
    const ticker = selectedTicker
    if (!ticker) return null
    const fromTrade = String(investigateCaseSelectedTrade?.companyName ?? '').trim()
    const name = fromTrade || String(investigateChartCompanyRow?.company ?? '').trim()
    return { ticker, name: name || null }
  }, [selectedTicker, investigateCaseSelectedTrade?.companyName, investigateChartCompanyRow?.company])

  useEffect(() => {
    let alive = true
    const ticker = selectedTicker ? String(selectedTicker).toUpperCase() : null
    const gen = ++barsFetchGenRef.current

    if (!backendUp || !ticker) {
      setBarsLive(null)
      setBarsLiveTicker(null)
      return () => {
        alive = false
      }
    }

    const cached = barsCacheRef.current.get(ticker)
    if (cached?.closes?.length) {
      setBarsLive(cached.closes)
      setBarsLiveTicker(ticker)
    } else {
      setBarsLive(null)
      setBarsLiveTicker(ticker)
    }

    async function run() {
      const r = await fetchJsonSafe(`/api/bars?ticker=${encodeURIComponent(ticker)}&days=730`, {
        timeoutMs: 15_000,
      })
      if (!alive || barsFetchGenRef.current !== gen) return
      const respTicker = String(r.data?.ticker ?? ticker).trim().toUpperCase()
      if (respTicker !== ticker) return
      const items = Array.isArray(r.data?.items) ? r.data.items : []
      const closes = []
      const days = []
      for (const row of items) {
        const n = Number(row?.close)
        if (!Number.isFinite(n)) continue
        closes.push(n)
        days.push(String(row?.day ?? '').slice(0, 10))
      }
      if (!alive || barsFetchGenRef.current !== gen) return
      if (closes.length) {
        barsCacheRef.current.set(ticker, { closes, days })
        setBarsLive(closes)
        setBarsLiveTicker(ticker)
      } else if (r.ok) {
        barsCacheRef.current.delete(ticker)
        setBarsLive(null)
        setBarsLiveTicker(ticker)
      }
    }
    run()
    const t = setInterval(() => {
      if (barsFetchGenRef.current === gen) run()
    }, 60_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [backendUp, selectedTicker])

  const companyForInvestigatePanel = useMemo(() => {
    if (!selectedTicker) return null
    if (backendUp && companyLiveTicker === selectedTicker && companyLive) return companyLive
    const row = investigateChartCompanyRow
    const fromTrade = String(investigateCaseSelectedTrade?.companyName ?? '').trim()
    const fromFeed = String(row?.company ?? '').trim()
    const feedName =
      investigateFeedCompany?.ticker === selectedTicker ? investigateFeedCompany.name : null
    return {
      ticker: selectedTicker,
      name: fromTrade || feedName || fromFeed || selectedTicker,
      industry: row?.industry ?? null,
      country: row?.country ?? null,
      mcap: row?.mcap ?? null,
      earnings_date: row?.earnings_date ?? null,
      latest_close: row?.latest_close ?? null,
    }
  }, [
    selectedTicker,
    backendUp,
    companyLiveTicker,
    companyLive,
    investigateFeedCompany,
    investigateCaseSelectedTrade?.companyName,
    investigateChartCompanyRow,
  ])

  useEffect(() => {
    let alive = true
    const ticker = selectedTicker ? String(selectedTicker).toUpperCase() : null
    const gen = ++companyFetchGenRef.current

    if (!backendUp || !ticker) {
      setCompanyLive(null)
      setCompanyLiveTicker(null)
      return () => {
        alive = false
      }
    }

    setCompanyLive(null)
    setCompanyLiveTicker(ticker)

    async function run() {
      const r = await fetchJsonSafe(
        `/api/company?ticker=${encodeURIComponent(ticker)}&snapshot=1`,
        { timeoutMs: 15_000 },
      )
      if (!alive || companyFetchGenRef.current !== gen) return
      const respTicker = String(r.data?.ticker ?? ticker).trim().toUpperCase()
      if (respTicker !== ticker) return
      if (r.ok && r.data && typeof r.data === 'object') {
        setCompanyLive(r.data)
        setCompanyLiveTicker(ticker)
      }
    }
    run()
    return () => {
      alive = false
    }
  }, [backendUp, selectedTicker])

  const daily = useMemo(() => {
    if (backendUp) {
      return barsLiveTicker === selectedTicker ? barsLive ?? [] : []
    }
    return investigateChartCompanyRow?.daily ?? []
  }, [backendUp, barsLive, barsLiveTicker, selectedTicker, investigateChartCompanyRow?.daily])

  const dailySeries = useMemo(() => {
    if (Array.isArray(daily) && daily.length >= 40) return daily
    if (!backendUp) return buildMockDailySeries(71, 160)
    return []
  }, [daily, backendUp])

  const dailyDates = useMemo(() => buildEvenlySpacedDates(dailySeries.length), [dailySeries.length])

  const chartLastPrice = useMemo(() => {
    const fromApi = Number(companyLive?.latest_close)
    if (Number.isFinite(fromApi) && fromApi > 0) return fromApi
    if (!Array.isArray(dailySeries) || !dailySeries.length) return null
    const last = Number(dailySeries[dailySeries.length - 1])
    return Number.isFinite(last) ? last : null
  }, [companyLive?.latest_close, dailySeries])

  const insiderTradeMarkers = useMemo(() => {
    if (!investigateOpen || !selectedTicker) return []
    const want = String(selectedTicker).trim().toUpperCase()
    const out = []
    for (const r of investigateActiveCaseFeedRows) {
      if (r?.type !== 'trade') continue
      if (String(r.ticker ?? '').trim().toUpperCase() !== want) continue
      const d = new Date(r.ts)
      if (Number.isNaN(d.getTime())) continue
      out.push(d)
    }
    return out
  }, [investigateOpen, selectedTicker, investigateActiveCaseFeedRows])

  const selectedInsiderTradeMarker = useMemo(() => {
    if (!investigateOpen) return null
    const rowIndex = investigateIsPoliticians
      ? politiciansCaseSelectedRowIndex
      : investigateIsInstitutions
        ? institutionsCaseSelectedRowIndex
        : insiderCaseSelectedRowIndex
    const rows = investigateIsPoliticians
      ? politiciansCaseFeedRows
      : investigateIsInstitutions
        ? institutionsCaseFeedRows
        : insiderCaseFeedRows
    const row = rowIndex >= 0 ? rows[rowIndex] : null
    if (!row || row.type !== 'trade' || !row.ts) return null
    const d = new Date(row.ts)
    return Number.isNaN(d.getTime()) ? null : d
  }, [
    investigateOpen,
    investigateIsPoliticians,
    investigateIsInstitutions,
    insiderCaseSelectedRowIndex,
    insiderCaseFeedRows,
    politiciansCaseSelectedRowIndex,
    politiciansCaseFeedRows,
    institutionsCaseSelectedRowIndex,
    institutionsCaseFeedRows,
  ])

  const historicalOutcomesPerson = useMemo(
    () => actorPersonDisplayFromRow(effectiveActorRow),
    [effectiveActorRow],
  )

  const investigateCaseActorAlert = useMemo(() => {
    const displayName = String(effectiveActorRow?.actorName ?? historicalOutcomesPerson?.fullName ?? '').trim()
    if (!displayName) return null
    const mode =
      investigateMode === 'politicians'
        ? 'politicians'
        : investigateMode === 'institutions'
          ? 'institutions'
          : 'insider'
    const key = investigateActorCanonicalKey(displayName, mode)
    if (!key) return null
    return { key, displayName, mode }
  }, [effectiveActorRow?.actorName, historicalOutcomesPerson?.fullName, investigateMode])

  useEffect(() => {
    setInsiderCaseTradeIdx(0)
  }, [insiderSelected?.id, insiderChartRange])

  useEffect(() => {
    setPoliticiansCaseTradeIdx(0)
  }, [politiciansSelected?.id, politiciansChartRange])

  useEffect(() => {
    setInstitutionsCaseTradeIdx(0)
  }, [institutionsSelected?.id, institutionsChartRange])

  const onResearchSelectTicker = useCallback(
    (ticker) => {
      const t = String(ticker ?? '').trim().toUpperCase()
      if (!t) return
      researchTickerPinnedRef.current = null
      setResearchTicker(t)
      if (isPhone) setResearchPhonePane('paper')
    },
    [isPhone],
  )

  const onInvestigateFeedSelectIndex = useCallback(
    (idx) => {
      if (investigateMode === 'insider') {
        setInsiderIdx(idx)
        setInsiderCaseTradeIdx(0)
      } else if (investigateMode === 'politicians') {
        setPoliticiansIdx(idx)
        setPoliticiansCaseTradeIdx(0)
      } else {
        setInstitutionsIdx(idx)
        setInstitutionsCaseTradeIdx(0)
      }
      if (isPhone) setInvestigatePhonePane('case')
    },
    [investigateMode, isPhone],
  )

  const onMacroClick = useCallback(() => {
    if (shell === 'macro') navigateExploreHome()
    else navigateMacro()
  }, [shell])

  const onSettingsClick = useCallback(() => {
    if (shell === 'settings') navigateExploreHome()
    else navigateSettings()
  }, [shell])

  const onExploreDossierCloseClick = useCallback(() => {
    navigateExploreBack()
  }, [])

  const onExploreHomeClick = useCallback(() => {
    navigateExploreHome()
  }, [])

  const onExploreEventClick = useCallback((slide) => {
    if (slide?.id) navigateExploreEventDetail(slide.id)
  }, [])

  const onExploreCompanyClick = useCallback(
    (row) => {
      const ticker = String(row?.ticker ?? '').trim().toUpperCase()
      if (!ticker) return
      setResearchTicker(ticker)
      setDeepResearchMode('company')
      navigateExploreCompanyDetail(ticker)
    },
    [],
  )

  const onExploreInvestorClick = useCallback(
    (row) => {
      const name = String(row?.name ?? '').trim()
      if (!name) return
      const preferredMode = row?.docType
        ? exploreInvestorModeFromDocType(row.docType)
        : exploreInvestorModeFromTypeKey(row?.typeKey ?? row?.type)
      const slug = exploreInvestorSlug(name)
      const hit = findExploreInvestorInFeedsByName(name, preferredMode, exploreActorFeeds)
      const actorRow = hit?.row ?? stubActorRowFromExploreInvestor(row, preferredMode)
      setDeepResearchMode('investor')
      setExploreInvestorFocus({
        slug,
        mode: hit?.mode ?? preferredMode,
        actorRow,
      })
      if (hit) {
        applyExploreInvestorFeedSelection(hit, exploreActorFeedHandlers)
      } else {
        exploreActorFeedHandlers.setInvestigateMode(preferredMode)
      }
      navigateExploreInvestorDetail(name)
    },
    [exploreActorFeeds, exploreActorFeedHandlers],
  )

  useEffect(() => {
    function onKey(e) {
      const el = e.target
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
        return
      }
      if (e.key === 'Escape' && (shell === 'settings' || shell === 'macro')) {
        e.preventDefault()
        navigateExploreHome()
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [shell])

  const investigateTerminalSkin = investigateMode
  const deepPageMode = exploreSubview === 'investorDetail' ? 'investor' : 'company'

  const deepDossierPage = (
    <DeepResearchLayout>
      <DeepPage
        mode={deepPageMode}
        chrome={{
          backendUp,
          macroActive,
          onMacroClick,
          settingsActive,
          onSettingsClick,
          onBrandClick: onExploreHomeClick,
          onCloseClick: onExploreDossierCloseClick,
        }}
        company={{
          ticker: researchTicker,
          companyName: researchCompanyName,
          sector: contextCompanySnapshot.sector,
          domicile: contextCompanySnapshot.domicile,
          mcap: contextCompanySnapshot.mcap,
          price: contextCompanySnapshot.price,
          priceChange: analysePriceChange?.delta,
          priceChangePct: analysePriceChange?.pct,
          earnings: contextEarnings,
          timelineEntries: deepPaperTimelineEntries,
          timelineLoading:
            backendUp && researchTick && (!researchExploreResolved || researchExploreTicker !== researchTick),
          trackedInvestors: deepTrackedInvestors,
          trackedInvestorsLoading:
            backendUp && researchTick && (!researchExploreResolved || researchExploreTicker !== researchTick),
          fundamentals: contextFundamentals,
          model: analyseLivePayload?.model ?? null,
          modelLoading: analyseModelLoading,
          backendUp,
          chartRange: analysePriceRange,
          onChartRangeChange: setAnalysePriceRange,
          chartSlot: (
            <MiniPriceChart
              series={researchPriceSeries}
              seriesDays={researchPriceDays}
              label={researchTick || 'PRICE'}
              showMeta={false}
              chartRange={analysePriceRange}
              onChartRangeChange={setAnalysePriceRange}
              trimLeadingPlateau
              quarterlyRevenueOverlay={analyseQuarterlyRevenue}
              hideAxisLabels
              flushEdges
              showHoverTooltip
            />
          ),
          onInvestorClick: onExploreInvestorClick,
        }}
        investor={{
          actorRow: effectiveActorRow,
          personDisplay: historicalOutcomesPerson,
          mode: investorDossierMode,
          caseRows: investigateActiveCaseFeedRows,
          backendUp,
          compactPrice: null,
          compactPriceChange: null,
          compactPriceChangePct: null,
          onCompanyClick: onExploreCompanyClick,
        }}
      />
    </DeepResearchLayout>
  )

  return (
    <div
      className={[
        'terminalShell',
        isPhone ? 'terminalShell--phone' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="terminalWorkspace">
        <main
          ref={terminalMainRef}
          className={['terminal', `terminal--${shell}`].filter(Boolean).join(' ')}
          aria-label="MERCERLINE"
        >
          {shell === 'settings' ? (
            <SettingsPanel
              backendUp={backendUp}
              onSettingsClick={onSettingsClick}
              onBrandClick={onExploreHomeClick}
            />
          ) : null}
          {shell === 'macro' ? (
            <MacroCalendarPanel
              backendUp={backendUp}
              onMacroClick={onMacroClick}
              onBrandClick={onExploreHomeClick}
            />
          ) : null}
          {shell === 'explore' ? (
            exploreSubview === 'companyDetail' || exploreSubview === 'investorDetail' ? (
              deepDossierPage
            ) : exploreSubview === 'eventDetail' ? (
              <ExploreEventPage
                eventId={terminalRoute.eventId}
                backendUp={backendUp}
                macroActive={macroActive}
                onMacroClick={onMacroClick}
                settingsActive={settingsActive}
                onSettingsClick={onSettingsClick}
                onBrandClick={onExploreHomeClick}
                onCloseClick={onExploreDossierCloseClick}
                onCompanyClick={onExploreCompanyClick}
                onInvestorClick={onExploreInvestorClick}
              />
            ) : exploreSubview === 'companies' ? (
              <ExploreCompaniesPage
                backendUp={backendUp}
                macroActive={macroActive}
                onMacroClick={onMacroClick}
                settingsActive={settingsActive}
                onSettingsClick={onSettingsClick}
                onBrandClick={onExploreHomeClick}
                onCloseClick={onExploreDossierCloseClick}
                onCompanyRowClick={onExploreCompanyClick}
              />
            ) : exploreSubview === 'investors' ? (
              <ExploreInvestorsPage
                backendUp={backendUp}
                macroActive={macroActive}
                onMacroClick={onMacroClick}
                settingsActive={settingsActive}
                onSettingsClick={onSettingsClick}
                onBrandClick={onExploreHomeClick}
                onCloseClick={onExploreDossierCloseClick}
                onInvestorRowClick={onExploreInvestorClick}
              />
            ) : (
              <ExplorePage
                backendUp={backendUp}
                macroActive={macroActive}
                onMacroClick={onMacroClick}
                settingsActive={settingsActive}
                onSettingsClick={onSettingsClick}
                onBrandClick={onExploreHomeClick}
                onCompanyRowClick={onExploreCompanyClick}
                onInvestorRowClick={onExploreInvestorClick}
                onEventClick={onExploreEventClick}
              />
            )
          ) : null}
        </main>
      </div>
    </div>
  )

}

/** Terminal shell only - marketing and subscribe checkout live outside this bundle. */
export default function App() {
  useEffect(() => {
    markAppReady()
  }, [])

  return <KensiglineTerminal />
}
