/** Discover tab — curated market + clinical calendar (mock until live ingest). */

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
 * @property {string} [url]
 * @property {'high' | 'medium' | 'low'} [impact]
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
    title: 'EFZO-FIT topline readout',
    kind: 'catalyst',
    source: 'ClinicalTrials.gov',
    phase: 'Phase 3',
    programKey: 'Efzofitimod',
    impact: 'high',
    url: 'https://clinicaltrials.gov/study/NCT05415137',
  },
  {
    id: 'disc-asml-earnings',
    ticker: 'ASML',
    companyName: DISCOVER_COMPANIES.ASML.name,
    intelMode: 'market',
    at: '2026-06-14',
    title: 'Q2 earnings & EUV order commentary',
    kind: 'earnings',
    source: '8-K',
    impact: 'high',
  },
  {
    id: 'disc-atyr-biomarker',
    ticker: 'ATYR',
    companyName: DISCOVER_COMPANIES.ATYR.name,
    intelMode: 'clinical',
    at: '2026-06-06',
    title: 'Biomarker update — sarcoidosis cohort',
    kind: 'trial',
    source: 'ClinicalTrials.gov',
    phase: 'Phase 2',
    programKey: 'Efzofitimod',
    impact: 'medium',
  },
  {
    id: 'disc-atyr-2810',
    ticker: 'ATYR',
    companyName: DISCOVER_COMPANIES.ATYR.name,
    intelMode: 'clinical',
    at: '2026-05-22',
    title: 'Initial response signal — ATYR-2810 escalation',
    kind: 'trial',
    source: 'SEC filing',
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
    title: 'mRNA-1345 Phase 3 interim — older-adult RSV',
    kind: 'catalyst',
    source: 'ClinicalTrials.gov',
    phase: 'Phase 3',
    programKey: 'mRNA-1345',
    impact: 'high',
  },
  {
    id: 'disc-srpt-fda',
    ticker: 'SRPT',
    companyName: DISCOVER_COMPANIES.SRPT.name,
    intelMode: 'clinical',
    at: '2026-06-02',
    title: 'FDA response window — SRP-9001 supplemental analyses',
    kind: 'regulatory',
    source: '8-K',
    phase: 'Phase 3',
    programKey: 'SRP-9001',
    impact: 'high',
  },
  {
    id: 'disc-nvda-computex',
    ticker: 'NVDA',
    companyName: DISCOVER_COMPANIES.NVDA.name,
    intelMode: 'market',
    at: '2026-06-04',
    title: 'Computex keynote — next-gen accelerator roadmap',
    kind: 'catalyst',
    source: 'Press release',
    impact: 'high',
  },
  {
    id: 'disc-tsm-cmd',
    ticker: 'TSM',
    companyName: DISCOVER_COMPANIES.TSM.name,
    intelMode: 'market',
    at: '2026-06-10',
    title: 'Capital markets day — advanced-node capacity outlook',
    kind: 'earnings',
    source: 'Investor presentation',
    impact: 'medium',
  },
  {
    id: 'disc-biib-adu',
    ticker: 'BIIB',
    companyName: DISCOVER_COMPANIES.BIIB.name,
    intelMode: 'clinical',
    at: '2026-05-30',
    title: 'Leqembi subcutaneous formulation PDUFA target',
    kind: 'regulatory',
    source: 'FDA calendar',
    phase: 'Approved',
    programKey: 'Leqembi',
    impact: 'medium',
  },
  {
    id: 'disc-lrcx-analyst',
    ticker: 'LRCX',
    companyName: DISCOVER_COMPANIES.LRCX.name,
    intelMode: 'market',
    at: '2026-06-18',
    title: 'Analyst day — WFE cycle & memory recovery timing',
    kind: 'catalyst',
    source: 'Investor presentation',
    impact: 'medium',
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
    summary:
      'Same-day 8-K: no material clinical update, routine disclosure ahead of the week-48 readout window. Useful as a timestamp anchor; does not change the binary mean-OCS setup.',
    url: 'https://www.sec.gov/edgar/search/#/q=ATYR',
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
    summary:
      'DoD IDIQ modification ($18.4M) names ASML US, Inc. as awardee for EUV lithography sustainment and field engineering at a domestic high-volume fab. Award text ties delivery to existing high-NA install base rather than a new platform buy. Supports the scarcity thesis: defense-side spend is maintaining installed EUV, not signaling a cancellation wave.',
    url: 'https://sam.gov/',
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
    summary:
      'Management updated cash runway guidance and reiterated that EFZO-FIT remains fully enrolled with no change to the week-48 mean oral-steroid primary. The filing is operational, not efficacy-bearing, but it narrows financing overhang ahead of the binary readout.',
    url: 'https://www.sec.gov/edgar/search/#/q=ATYR',
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
    summary:
      'The company filed an interim blinded safety update without unblinded efficacy tables. Management reiterated that blinded review has not shown a toxicity spiral ahead of topline. The disclosure is supportive for holders into the print but does not change the statistical fight on the mean oral-steroid primary.',
    url: 'https://www.sec.gov/edgar/search/#/q=ATYR',
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
    summary:
      'Q1 commentary highlights backlog stability and longer EUV lead times rather than a cancellation wave. Management frames demand as capacity-constrained at the leading edge, which keeps pricing power on high-NA slots intact even when downstream GPU names wobble.',
    url: 'https://www.sec.gov/edgar/search/#/q=ASML',
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
    summary:
      'Risk factors again stress that EFZO-FIT success depends on demonstrating steroid reduction with acceptable variability across sites. The filing cautions that enrollment completion does not tighten confidence intervals on a mean-dose endpoint when placebo arms follow the same visit cadence. Language stays consistent with a binary catalyst rather than a de-risked fundamental story.',
    url: 'https://www.sec.gov/edgar/search/#/q=ATYR',
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
    summary:
      'EFZO-FIT (NCT05415137) lists enrollment at 268 participants versus a 264 target for the sarcoidosis program. The trial remains three-arm with 5 mg/kg, 3 mg/kg, and placebo. The registry still frames the primary endpoint as absolute change from baseline in mean daily oral steroid dose at week 48, which is the regulatory line investors should track before any efficacy narrative hardens.',
    url: 'https://clinicaltrials.gov/study/NCT05415137',
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
    summary:
      'Regulatory correspondence asks for supplemental functional analyses on the gene-therapy dataset. Management framed the request as clarifying rather than a complete response letter, but the timeline pushes commercial assumptions out another quarter and raises the bar for how cleanly responder narratives must read.',
    url: 'https://www.sec.gov/edgar/search/#/q=SRPT',
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
    summary:
      'Management commentary points to extended EUV delivery timelines and continued tightness in high-NA tool allocation. Customers are prioritizing leading-edge slots even as downstream AI demand headlines dominate equity flows. The filing reinforces scarcity in lithography rather than a demand air pocket for the tools themselves.',
    url: 'https://www.sec.gov/edgar/search/#/q=ASML',
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
    summary:
      'Interim immunogenicity met pre-specified thresholds versus a licensed comparator in the CMV program. The update supports progression talk but does not substitute for Phase 3 event-driven efficacy; investors still need infection-rate separation at scale.',
    url: 'https://clinicaltrials.gov/',
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
    summary:
      'EFZO-CONNECT (NCT05892614) remains a separate SSc-ILD proof-of-concept with roughly 25 patients and placebo control. The registry update does not alter EFZO-FIT power. A strong PoC read could help sentiment after Phase 3 tables, but it cannot statistically rescue a failed pivotal mean-OCS outcome.',
    url: 'https://clinicaltrials.gov/study/NCT05892614',
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

/** Day heading for grouped timeline (e.g. "Jul 18"). */
export function formatDiscoverDayHead(at) {
  const raw = String(at ?? '').trim()
  if (!raw) return '—'
  const d = new Date(raw.includes('T') ? raw : `${raw}T12:00:00`)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
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

export function truncateDiscoverSummary(text, max = 160) {
  const t = String(text ?? '').trim().replace(/\s+/g, ' ')
  if (!t) return ''
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

/**
 * @param {{ filter?: 'all' | DiscoverIntelMode; query?: string }} [opts]
 * @returns {{ upcoming: DiscoverEvent[]; past: DiscoverEvent[] }}
 */
export function buildDiscoverTimeline(opts = {}) {
  const filter = opts.filter ?? 'all'
  const q = String(opts.query ?? '')
    .trim()
    .toLowerCase()
  const today = todayStartMs()

  let rows = DISCOVER_EVENTS.filter((e) => filter === 'all' || e.intelMode === filter)

  if (q) {
    rows = rows.filter((e) => {
      const hay = `${e.ticker} ${e.companyName} ${e.title} ${e.programKey ?? ''} ${e.source ?? ''}`.toLowerCase()
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

export function discoverImpactClass(impact) {
  if (impact === 'high') return 'discoverEventCard--impactHigh'
  if (impact === 'medium') return 'discoverEventCard--impactMed'
  return ''
}
