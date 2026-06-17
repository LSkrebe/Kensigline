/** Discover tab — curated market + clinical calendar (mock until live ingest). */

import { eventMentionedSearchText, getEventMentioned } from './eventBriefs.js'
import {
  DISCOVER_MARKET_MOVE_FILTER_TYPES,
  DISCOVER_RESEARCH_DOCUMENT_FILTER_DEFAULT,
  DISCOVER_WATCHLIST_FILTER_DEFAULT,
  DISCOVER_WATCHLIST_FILTER_TYPES,
  normalizeResearchPaperSourceKey,
} from './researchPaperSources.js'

export {
  DISCOVER_MARKET_MOVE_FILTER_TYPES,
  DISCOVER_RESEARCH_DOCUMENT_FILTER_DEFAULT as DISCOVER_MARKET_MOVE_FILTER_DEFAULT,
  DISCOVER_WATCHLIST_FILTER_TYPES,
  DISCOVER_WATCHLIST_FILTER_DEFAULT,
}

const DISCOVER_COMPANIES = {
  ASML: { name: 'ASML Holding N.V.', intelMode: 'market' },
  NVDA: { name: 'NVIDIA Corporation', intelMode: 'market' },
  TSM: { name: 'Taiwan Semiconductor', intelMode: 'market' },
  LRCX: { name: 'Lam Research Corporation', intelMode: 'market' },
  ATYR: { name: 'aTyr Pharma, Inc.', intelMode: 'clinical' },
  MRNA: { name: 'Moderna, Inc.', intelMode: 'clinical' },
  SRPT: { name: 'Sarepta Therapeutics', intelMode: 'clinical' },
  BIIB: { name: 'Biogen Inc.', intelMode: 'clinical' },
  REGN: { name: 'Regeneron Pharmaceuticals', intelMode: 'clinical' },
  VRTX: { name: 'Vertex Pharmaceuticals', intelMode: 'clinical' },
}

/** @typedef {'market' | 'clinical'} DiscoverIntelMode */
/** @typedef {'catalyst' | 'filing' | 'earnings' | 'trial' | 'regulatory' | 'flow'} DiscoverEventKind */

/**
 * @typedef {Object} DiscoverEvent
 * @property {string} id
 * @property {string} ticker
 * @property {string} companyName
 * @property {DiscoverIntelMode} intelMode
 * @property {string} at ISO date or datetime
 * @property {string} title
 * @property {DiscoverEventKind} kind
 * @property {string} [source]
 * @property {string} [phase]
 * @property {string} [programKey]
 * @property {string} [summary] past events — paper-style analysis
 * @property {string} [briefKey] links mock mentioned-name sets in eventBriefs.js
 * @property {string} [url]
 * @property {'high' | 'medium' | 'low'} [impact]
 * @property {number} [idea_score]
 * @property {boolean} [idea_best]
 * @property {string[]} [idea_reasons]
 */

/** @type {DiscoverEvent[]} */
const DISCOVER_EVENTS = [
  // —— Upcoming ——
  {
    id: 'disc-atyr-topline',
    ticker: 'ATYR',
    companyName: DISCOVER_COMPANIES.ATYR.name,
    intelMode: 'clinical',
    at: '2026-07-18',
    title: 'Primary completion',
    kind: 'catalyst',
    source: 'ClinicalTrials.gov',
    phase: 'Phase 3',
    programKey: 'Efzofitimod',
    impact: 'high',
    briefKey: 'atyr-topline',
    url: 'https://clinicaltrials.gov/study/NCT05415137',
  },
  {
    id: 'disc-asml-earnings',
    ticker: 'ASML',
    companyName: DISCOVER_COMPANIES.ASML.name,
    intelMode: 'market',
    at: '2026-06-14',
    title: 'Earnings report',
    kind: 'earnings',
    source: '8-K',
    impact: 'high',
    briefKey: 'asml-earnings',
  },
  {
    id: 'disc-atyr-biomarker',
    ticker: 'ATYR',
    companyName: DISCOVER_COMPANIES.ATYR.name,
    intelMode: 'clinical',
    at: '2026-06-06',
    title: 'Study completion (est.)',
    kind: 'trial',
    source: 'ClinicalTrials.gov',
    phase: 'Phase 2',
    programKey: 'Efzofitimod',
    impact: 'medium',
    briefKey: 'atyr-biomarker',
  },
  {
    id: 'disc-atyr-2810',
    ticker: 'ATYR',
    companyName: DISCOVER_COMPANIES.ATYR.name,
    intelMode: 'clinical',
    at: '2026-05-22',
    title: 'Trial active',
    kind: 'trial',
    source: '8-K',
    phase: 'Phase 1',
    programKey: 'ATYR-2810',
    impact: 'medium',
  },
  {
    id: 'disc-mrna-rsv',
    ticker: 'MRNA',
    companyName: DISCOVER_COMPANIES.MRNA.name,
    intelMode: 'clinical',
    at: '2026-06-28',
    title: 'Primary completion (est.)',
    kind: 'catalyst',
    source: 'ClinicalTrials.gov',
    phase: 'Phase 3',
    programKey: 'mRNA-1345',
    impact: 'high',
    briefKey: 'mrna-rsv',
  },
  {
    id: 'disc-srpt-fda',
    ticker: 'SRPT',
    companyName: DISCOVER_COMPANIES.SRPT.name,
    intelMode: 'clinical',
    at: '2026-06-02',
    title: 'Regulatory milestone',
    kind: 'regulatory',
    source: '8-K',
    phase: 'Phase 3',
    programKey: 'SRP-9001',
    impact: 'high',
    briefKey: 'srpt-fda',
  },
  {
    id: 'disc-nvda-computex',
    ticker: 'NVDA',
    companyName: DISCOVER_COMPANIES.NVDA.name,
    intelMode: 'market',
    at: '2026-06-04',
    title: 'Company release',
    kind: 'catalyst',
    source: 'Press release',
    impact: 'high',
    briefKey: 'nvda-computex',
  },
  {
    id: 'disc-tsm-cmd',
    ticker: 'TSM',
    companyName: DISCOVER_COMPANIES.TSM.name,
    intelMode: 'market',
    at: '2026-06-10',
    title: 'Investor presentation',
    kind: 'earnings',
    source: 'Investor presentation',
    impact: 'medium',
    briefKey: 'tsm-cmd',
  },
  {
    id: 'disc-biib-adu',
    ticker: 'BIIB',
    companyName: DISCOVER_COMPANIES.BIIB.name,
    intelMode: 'clinical',
    at: '2026-05-30',
    title: 'PDUFA target',
    kind: 'regulatory',
    source: 'Press release',
    phase: 'Approved',
    programKey: 'Leqembi',
    impact: 'medium',
    briefKey: 'biib-adu',
  },
  {
    id: 'disc-lrcx-analyst',
    ticker: 'LRCX',
    companyName: DISCOVER_COMPANIES.LRCX.name,
    intelMode: 'market',
    at: '2026-06-18',
    title: 'Investor presentation',
    kind: 'catalyst',
    source: 'Investor presentation',
    impact: 'medium',
    briefKey: 'lrcx-analyst',
  },
  // —— Past (with paper-style summaries) ——
  {
    id: 'disc-atyr-8k-today',
    ticker: 'ATYR',
    companyName: DISCOVER_COMPANIES.ATYR.name,
    intelMode: 'clinical',
    at: '2026-05-28',
    title: 'Routine 8-K ahead of readout window',
    kind: 'filing',
    source: '8-K',
    programKey: 'Efzofitimod',
    impact: 'low',
    briefKey: 'atyr-8k-today',
    summary:
      'Routine same-day 8-K with no material clinical update ahead of the week-48 readout window.',
    url: 'https://www.sec.gov/edgar/search/#/q=ATYR',
    idea_best: false,
  },
  {
    id: 'disc-asml-gov',
    ticker: 'ASML',
    companyName: DISCOVER_COMPANIES.ASML.name,
    intelMode: 'market',
    at: '2026-05-20',
    title: 'DoD EUV sustainment award modification',
    kind: 'filing',
    source: 'Gov contract',
    impact: 'medium',
    briefKey: 'asml-gov-dod',
    summary:
      'DoD sustainment award ($18.4M) covers EUV field engineering at a domestic fab, supporting installed-base scarcity rather than a new platform buy.',
    url: 'https://sam.gov/',
    idea_best: false,
  },
  {
    id: 'disc-atyr-8k-cash',
    ticker: 'ATYR',
    companyName: DISCOVER_COMPANIES.ATYR.name,
    intelMode: 'clinical',
    at: '2026-05-08',
    title: 'Cash runway & enrollment reaffirmation',
    kind: 'filing',
    source: '8-K',
    programKey: 'Efzofitimod',
    impact: 'medium',
    briefKey: 'atyr-8k-cash',
    summary:
      'Cash runway update with EFZO-FIT fully enrolled and no change to the week-48 mean oral-steroid primary.',
    url: 'https://www.sec.gov/edgar/search/#/q=ATYR',
    idea_best: false,
  },
  {
    id: 'disc-atyr-safety',
    ticker: 'ATYR',
    companyName: DISCOVER_COMPANIES.ATYR.name,
    intelMode: 'clinical',
    at: '2026-04-09',
    title: 'Interim blinded safety update',
    kind: 'filing',
    source: '8-K',
    phase: 'Phase 3',
    programKey: 'Efzofitimod',
    impact: 'medium',
    briefKey: 'atyr-8k-safety',
    summary:
      'Interim blinded safety update with no unblinded efficacy; management sees no toxicity spiral ahead of topline.',
    url: 'https://www.sec.gov/edgar/search/#/q=ATYR',
    idea_best: false,
  },
  {
    id: 'disc-asml-q1',
    ticker: 'ASML',
    companyName: DISCOVER_COMPANIES.ASML.name,
    intelMode: 'market',
    at: '2026-04-18',
    title: 'Q1 backlog & EUV lead-time commentary',
    kind: 'filing',
    source: '8-K',
    impact: 'high',
    briefKey: 'asml-q1',
    summary:
      'Q1 commentary cites stable backlog and longer EUV lead times, framing demand as capacity-constrained at the leading edge.',
    url: 'https://www.sec.gov/edgar/search/#/q=ASML',
    idea_best: true,
  },
  {
    id: 'disc-atyr-10q',
    ticker: 'ATYR',
    companyName: DISCOVER_COMPANIES.ATYR.name,
    intelMode: 'clinical',
    at: '2026-03-18',
    title: '10-Q risk language on mean-OCS endpoint',
    kind: 'filing',
    source: '10-Q',
    phase: 'Phase 3',
    programKey: 'Efzofitimod',
    impact: 'medium',
    briefKey: 'atyr-10q-risk',
    summary:
      'Risk factors stress steroid-reduction success on a mean-dose endpoint with site variability; enrollment completion does not de-risk the binary readout.',
    url: 'https://www.sec.gov/edgar/search/#/q=ATYR',
    idea_best: false,
  },
  {
    id: 'disc-atyr-enroll',
    ticker: 'ATYR',
    companyName: DISCOVER_COMPANIES.ATYR.name,
    intelMode: 'clinical',
    at: '2026-02-11',
    title: 'EFZO-FIT enrollment complete — registry update',
    kind: 'trial',
    source: 'ClinicalTrials.gov',
    phase: 'Phase 3',
    programKey: 'Efzofitimod',
    impact: 'high',
    briefKey: 'atyr-enrollment',
    summary:
      'Registry lists EFZO-FIT enrollment at 268 vs 264 target; primary remains mean oral-steroid change at week 48.',
    url: 'https://clinicaltrials.gov/study/NCT05415137',
    idea_best: true,
  },
  {
    id: 'disc-srpt-fda-req',
    ticker: 'SRPT',
    companyName: DISCOVER_COMPANIES.SRPT.name,
    intelMode: 'clinical',
    at: '2026-02-06',
    title: 'FDA requests additional SRP-9001 analyses',
    kind: 'regulatory',
    source: '8-K',
    phase: 'Phase 3',
    programKey: 'SRP-9001',
    impact: 'high',
    briefKey: 'srpt-fda-req',
    summary:
      'FDA requested supplemental functional analyses; management called it clarifying, but commercial timing slips another quarter.',
    url: 'https://www.sec.gov/edgar/search/#/q=SRPT',
    idea_best: true,
  },
  {
    id: 'disc-asml-orders',
    ticker: 'ASML',
    companyName: DISCOVER_COMPANIES.ASML.name,
    intelMode: 'market',
    at: '2026-03-14',
    title: 'High-NA allocation & extended EUV delivery times',
    kind: 'filing',
    source: '8-K',
    impact: 'high',
    briefKey: 'asml-orders',
    summary:
      'Commentary cites extended EUV delivery times and tight high-NA allocation, reinforcing lithography scarcity over demand weakness.',
    url: 'https://www.sec.gov/edgar/search/#/q=ASML',
    idea_best: true,
  },
  {
    id: 'disc-mrna-phase2',
    ticker: 'MRNA',
    companyName: DISCOVER_COMPANIES.MRNA.name,
    intelMode: 'clinical',
    at: '2026-01-30',
    title: 'Phase 2 CMV vaccine immunogenicity update',
    kind: 'trial',
    source: 'ClinicalTrials.gov',
    phase: 'Phase 2',
    programKey: 'mRNA-1647',
    impact: 'medium',
    briefKey: 'mrna-phase2',
    summary:
      'Phase 2 CMV immunogenicity met thresholds vs comparator; progression talk remains ahead of Phase 3 infection-rate proof.',
    url: 'https://clinicaltrials.gov/',
    idea_best: false,
  },
  {
    id: 'disc-atyr-connect',
    ticker: 'ATYR',
    companyName: DISCOVER_COMPANIES.ATYR.name,
    intelMode: 'clinical',
    at: '2026-01-22',
    title: 'EFZO-CONNECT registry refresh',
    kind: 'trial',
    source: 'ClinicalTrials.gov',
    phase: 'Phase 2',
    programKey: 'Efzofitimod',
    impact: 'low',
    briefKey: 'atyr-connect',
    summary:
      'EFZO-CONNECT PoC registry refresh does not change EFZO-FIT power; a positive read may help sentiment only after pivotal data.',
    url: 'https://clinicaltrials.gov/study/NCT05892614',
    idea_best: false,
  },
  {
    id: 'disc-nvda-earnings',
    ticker: 'NVDA',
    companyName: DISCOVER_COMPANIES.NVDA.name,
    intelMode: 'market',
    at: '2026-05-15',
    title: 'Q1 earnings — data-center revenue & supply commentary',
    kind: 'earnings',
    source: '8-K',
    impact: 'high',
    briefKey: 'nvda-q1-earnings',
    summary:
      'Q1 data-center beat with management citing accelerator demand and tight packaging supply at foundry and memory layers.',
    url: 'https://www.sec.gov/edgar/search/#/q=NVDA',
    idea_best: true,
  },
]

const KIND_LABEL = {
  catalyst: 'Catalyst',
  filing: 'Filing',
  earnings: 'Earnings',
  trial: 'Trial',
  regulatory: 'Regulatory',
  flow: 'Flow',
}

export function discoverKindLabel(kind) {
  return KIND_LABEL[kind] ?? 'Event'
}

/** @param {DiscoverEvent} event @param {Set<string> | null | undefined} enabled */
export function discoverEventPassesFilters(event, enabled) {
  if (!enabled?.size) return false
  const sourceKey = normalizeResearchPaperSourceKey(event.source)
  return enabled.has(sourceKey)
}

function eventDayStartMs(at) {
  const raw = String(at ?? '').trim()
  if (!raw) return NaN
  const d = new Date(raw.includes('T') ? raw : `${raw}T12:00:00`)
  if (Number.isNaN(d.getTime())) return NaN
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function todayStartMs() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function discoverEventRelativeLabel(at) {
  const dayMs = eventDayStartMs(at)
  if (!Number.isFinite(dayMs)) return '—'
  const diffDays = Math.round((dayMs - todayStartMs()) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays === -1) return 'Yesterday'
  if (diffDays > 0 && diffDays <= 90) return `In ${diffDays}d`
  if (diffDays < 0 && diffDays >= -14) return `${Math.abs(diffDays)}d ago`
  return formatDiscoverDate(at)
}

/** Compact day count for Discover watchlist (e.g. `4d`, `Today`). */
export function discoverWatchlistDaysLabel(at) {
  const dayMs = eventDayStartMs(at)
  if (!Number.isFinite(dayMs)) return '—'
  const diffDays = Math.round((dayMs - todayStartMs()) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays > 0 && diffDays <= 90) return `${diffDays}d`
  if (diffDays < 0 && diffDays >= -14) return `${Math.abs(diffDays)}d ago`
  return formatDiscoverDate(at)
}

export function formatDiscoverDate(at) {
  const raw = String(at ?? '').trim()
  if (!raw) return '—'
  const d = new Date(raw.includes('T') ? raw : `${raw}T12:00:00`)
  if (Number.isNaN(d.getTime())) return '—'
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const yr = d.getFullYear()
  const thisYear = new Date().getFullYear()
  return yr === thisYear ? `${mo}-${day}` : `${mo}-${day}-${yr}`
}

export function formatDiscoverDayHead(at) {
  const raw = String(at ?? '').trim()
  if (!raw) return '—'
  const d = new Date(raw.includes('T') ? raw : `${raw}T12:00:00`)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function isSameLocalCalendarDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function isAtLocalToday(at) {
  const d = at instanceof Date ? at : new Date(at)
  if (Number.isNaN(d.getTime())) return false
  return isSameLocalCalendarDay(d, new Date())
}

function isAtLocalThisMonth(at, ref = new Date()) {
  const d = at instanceof Date ? at : new Date(at)
  const r = ref instanceof Date ? ref : new Date(ref)
  if (Number.isNaN(d.getTime()) || Number.isNaN(r.getTime())) return false
  return d.getFullYear() === r.getFullYear() && d.getMonth() === r.getMonth()
}

function discoverEventAtIso(event) {
  const raw = String(event?.at ?? '').trim()
  return raw.includes('T') ? raw : `${raw}T12:00:00`
}

/**
 * Paper-style timeline rows: TODAY (past only) / THIS MONTH / year gaps.
 * @param {DiscoverEvent[]} events
 * @param {'upcoming' | 'past'} variant
 */
export function buildDiscoverCardDisplayRows(events, variant) {
  /** @type {Array<{ type: 'sep'; key: string; label: string } | { type: 'event'; key: string; event: DiscoverEvent }>} */
  const out = []
  const items = (events ?? [])
    .map((event) => ({
      id: event.id,
      at: discoverEventAtIso(event),
      event,
    }))
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
  if (!items.length) return out

  for (let i = 0; i < items.length; i++) {
    const row = items[i]
    const prev = i > 0 ? items[i - 1] : null
    const gapCandidates = []

    if (variant === 'past' && prev && isAtLocalToday(prev.at) && !isAtLocalToday(row.at)) {
      gapCandidates.push({ rank: 0, key: `today-sep-${row.id}`, label: 'TODAY' })
    }
    if (prev && isAtLocalThisMonth(prev.at) && !isAtLocalThisMonth(row.at)) {
      gapCandidates.push({ rank: 1, key: `month-sep-${row.id}`, label: 'THIS MONTH' })
    }
    if (prev) {
      const y0 = new Date(prev.at).getFullYear()
      const y1 = new Date(row.at).getFullYear()
      if (Number.isFinite(y0) && Number.isFinite(y1) && y1 !== y0) {
        gapCandidates.push({ rank: 2, key: `year-${y1}-sep-${row.id}`, label: String(y1) })
      }
    }
    if (gapCandidates.length) {
      gapCandidates.sort((a, b) => a.rank - b.rank)
      out.push({ type: 'sep', key: gapCandidates[0].key, label: gapCandidates[0].label })
    }
    out.push({ type: 'event', key: row.id, event: row.event })
  }

  return out
}

/**
 * @param {{ filter?: 'all' | DiscoverIntelMode; query?: string }} [opts]
 * @returns {Array<{ type: 'today' } | { type: 'day'; date: string; variant: 'upcoming' | 'past'; events: DiscoverEvent[] }>}
 */
export function buildDiscoverDayGroups(opts = {}) {
  const { upcoming, past } = buildDiscoverTimeline(opts)
  /** @type {ReturnType<typeof buildDiscoverDayGroups>} */
  const groups = []

  let lastDay = null
  for (const event of upcoming) {
    const day = event.at.slice(0, 10)
    if (day !== lastDay) {
      groups.push({ type: 'day', date: day, variant: 'upcoming', events: [] })
      lastDay = day
    }
    groups.at(-1).events.push(event)
  }

  if (upcoming.length || past.length) {
    groups.push({ type: 'today' })
    lastDay = null
  }

  for (const event of past) {
    const day = event.at.slice(0, 10)
    if (day !== lastDay) {
      groups.push({ type: 'day', date: day, variant: 'past', events: [] })
      lastDay = day
    }
    groups.at(-1).events.push(event)
  }

  return groups
}

/** Group a flat event list by calendar day (preserves input order). */
export function groupEventsByDay(events, variant) {
  /** @type {Array<{ type: 'day'; date: string; variant: 'upcoming' | 'past'; events: DiscoverEvent[] }>} */
  const groups = []
  let lastDay = null
  for (const event of events) {
    const day = event.at.slice(0, 10)
    if (day !== lastDay) {
      groups.push({ type: 'day', date: day, variant, events: [] })
      lastDay = day
    }
    groups.at(-1).events.push(event)
  }
  return groups
}

export { getEventMentioned } from './eventBriefs.js'

export function truncateDiscoverSummary(text, max = 160) {
  const t = String(text ?? '').trim().replace(/\s+/g, ' ')
  if (!t) return ''
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

/**
 * @param {{ query?: string; enabledFilters?: Set<string> }} [opts]
 * @returns {{ upcoming: DiscoverEvent[]; past: DiscoverEvent[] }}
 */
export function buildDiscoverTimeline(opts = {}) {
  const q = String(opts.query ?? '')
    .trim()
    .toLowerCase()
  const enabledFilters = opts.enabledFilters ?? DISCOVER_WATCHLIST_FILTER_DEFAULT
  const today = todayStartMs()
  const sourceRows = opts.events ?? DISCOVER_EVENTS

  let rows = sourceRows.filter((e) => discoverEventPassesFilters(e, enabledFilters))

  if (q) {
    rows = rows.filter((e) => {
      const mentioned =
        e.mentioned != null
          ? eventMentionedSearchText(e.ticker, e.mentioned)
          : eventMentionedSearchText(e.ticker, getEventMentioned(e.briefKey))
      const hay = `${e.ticker} ${e.companyName} ${e.title} ${e.programKey ?? ''} ${e.source ?? ''} ${e.summary ?? ''} ${mentioned}`.toLowerCase()
      return hay.includes(q)
    })
  }

  const upcoming = []
  const past = []

  for (const e of rows) {
    const ms = eventDayStartMs(e.at)
    if (!Number.isFinite(ms)) continue
    if (ms >= today) upcoming.push(e)
    else past.push(e)
  }

  upcoming.sort((a, b) => eventDayStartMs(a.at) - eventDayStartMs(b.at))
  past.sort((a, b) => eventDayStartMs(b.at) - eventDayStartMs(a.at))

  return { upcoming, past }
}

/** Upcoming catalyst rows for the watchlist column (strictly future + best tier). */
export function getDiscoverWatchlistEvents(opts = {}) {
  const { query, enabledFilters } = opts
  const today = todayStartMs()
  return buildDiscoverTimeline({ query, enabledFilters }).upcoming.filter(
    (e) => e.idea_best && eventDayStartMs(e.at) > today,
  )
}

/** Past cards eligible for Market Moves: green-highlight tier (same as Investigate feed). */
export function isDiscoverMarketMove(event) {
  if (!event) return false
  if (!event.idea_best) return false
  if (String(event.summary ?? '').trim()) return true
  if (event.kind === 'flow' && String(event.title ?? '').trim()) return true
  return false
}

/** Past document rows with analysis text for market moves (best-graded only). */
export function getDiscoverMarketMoves(opts = {}) {
  const { query, enabledFilters } = opts
  const { past } = buildDiscoverTimeline({ query, enabledFilters })
  return past.filter((e) => isDiscoverMarketMove(e))
}

export function discoverImpactClass(impact) {
  if (impact === 'high') return 'discoverEventCard--impactHigh'
  if (impact === 'medium') return 'discoverEventCard--impactMed'
  return ''
}
