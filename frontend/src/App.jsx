import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import './App.css'

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n))
}

function getBackendBase() {
  const fromEnv = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_BACKEND_URL : null
  return String(fromEnv || 'http://localhost:3001').replace(/\/$/, '')
}

async function fetchJsonSafe(path, { timeoutMs = 4500 } = {}) {
  const base = getBackendBase()
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${base}${path}`, { signal: ctrl.signal })
    if (!res.ok) return { ok: false, status: res.status, data: null }
    const data = await res.json()
    return { ok: true, status: res.status, data }
  } catch {
    return { ok: false, status: 0, data: null }
  } finally {
    clearTimeout(t)
  }
}

const EMPTY = '-'

const MOCK_EVENTS = [
  {
    id: 'ONC-441-P2-READOUT',
    trial: 'ONC-441 Phase II (mCRC)',
    drug: 'ONC-441',
    mechanism: 'CD47×EGFR bispecific',
    phase: 'Phase II',
    indication: 'metastatic colorectal cancer (mCRC)',
    sponsor: 'OncoNadir Therapeutics',
    intervention: 'ONC-441 IV q2w + SOC',
    eventType: 'READOUT',
    ts: '2026-04-14 09:31:12Z',
    trialSnapshot: {
      drug: 'ONC-441',
      mechanism: 'CD47×EGFR bispecific',
      phase: 'Phase II',
      indication: 'mCRC',
      sponsor: 'OncoNadir Therapeutics',
      intervention: 'ONC-441 IV q2w + SOC',
      assetOrigin: 'In-house bispecific platform',
    },
    studyDesign: {
      arms: '2 (Dose A / Dose B)',
      randomization: 'Non-randomized',
      control: 'External SOC benchmark',
      masking: 'Open-label',
      sampleSize: 'N=124',
    },
    population: {
      condition: 'mCRC (2L+)',
      biomarkers: 'EGFR-high enriched cohort',
      lineOfTherapy: '2L+',
    },
    endpointsResults: {
      endpoints: ['Primary: ORR (RECIST v1.1)', 'Secondary: DOR, PFS, OS, Safety'],
      results: [
        { endpoint: 'ORR', value: '28.2%' },
        { endpoint: 'DCR', value: '71.0%' },
        { endpoint: 'Median DOR', value: '5.6 mo (immature)' },
      ],
    },
    timelineDetails: {
      studyStart: '2025-02-18',
      primaryCompletion: '2026-08-30 (est.)',
      studyCompletion: '2027-01-15 (est.)',
      status: 'Active, not recruiting',
      eventSource: 'Company release',
      eventSubtype: 'Interim efficacy update',
    },
    safety: [
      { term: 'Grade ≥3 TRAE', value: '9%' },
      { term: 'IRR', value: '12% (mostly Grade 1–2)' },
      { term: 'Treatment discontinuation (AE)', value: '3%' },
    ],
    daily: [94, 96, 92, 90, 91, 93, 95, 99, 101, 98, 102, 106, 103, 108, 112, 109, 113],
  },
  {
    id: 'NRX-118-FDA-UPDATE',
    trial: 'NRX-118 Phase I/II (RARE-NEURO)',
    drug: 'NRX-118',
    mechanism: 'Intrathecal ASO',
    phase: 'Phase I/II',
    indication: 'rare neurodegenerative disease',
    sponsor: 'NeuroRex Bio',
    intervention: 'NRX-118 IT q4w',
    eventType: 'FDA UPDATE',
    ts: '2026-04-14 10:04:51Z',
    trialSnapshot: {
      drug: 'NRX-118',
      mechanism: 'Intrathecal ASO',
      phase: 'Phase I/II',
      indication: 'RARE-NEURO',
      sponsor: 'NeuroRex Bio',
      intervention: 'NRX-118 IT q4w',
      assetOrigin: 'University partnership (preclinical in-licensed)',
    },
    studyDesign: {
      arms: '1 (dose escalation + expansion)',
      randomization: 'Not applicable (dose-finding)',
      control: 'None',
      masking: 'Open-label',
      sampleSize: 'N=38 planned',
    },
    population: {
      condition: 'RARE-NEURO',
      biomarkers: 'Target RNA baseline required',
      lineOfTherapy: 'Any',
    },
    endpointsResults: {
      endpoints: ['Primary: Biomarker knockdown', 'Secondary: Functional scale (exploratory)', 'Safety'],
      results: [],
    },
    timelineDetails: {
      studyStart: '2025-09-03',
      primaryCompletion: '2027-03-20 (est.)',
      studyCompletion: '2027-06-01 (est.)',
      status: 'Recruiting',
      eventSource: 'Regulatory correspondence',
      eventSubtype: 'CMC request (comparability)',
    },
    daily: [52, 51, 49, 48, 49, 50, 51, 50, 52, 53, 52, 54, 55, 54, 53, 52, 53],
  },
  {
    id: 'KLM-210-TRIAL-DELAY',
    trial: 'KLM-210 Phase III (NASH)',
    drug: 'KLM-210',
    mechanism: 'FXR agonist',
    phase: 'Phase III',
    indication: 'NASH',
    sponsor: 'KaleidoMetrix',
    intervention: 'KLM-210 PO daily',
    eventType: 'DELAY',
    ts: '2026-04-14 11:22:03Z',
    trialSnapshot: {
      drug: 'KLM-210',
      mechanism: 'FXR agonist',
      phase: 'Phase III',
      indication: 'NASH',
      sponsor: 'KaleidoMetrix',
      intervention: 'KLM-210 PO daily',
      assetOrigin: 'Acquired program (2019)',
    },
    studyDesign: {
      arms: '2 (active / placebo)',
      randomization: 'Randomized 1:1',
      control: 'Placebo',
      masking: 'Double-blind',
      sampleSize: 'N=1,200',
    },
    population: {
      condition: 'NASH with fibrosis (F2–F3)',
      biomarkers: 'Baseline liver biopsy required',
      lineOfTherapy: 'Not applicable',
    },
    endpointsResults: {
      endpoints: ['Primary: fibrosis improvement w/o worsening NASH', 'Secondary: NASH resolution, safety'],
      results: [],
    },
    timelineDetails: {
      studyStart: '2024-11-11',
      primaryCompletion: '2026-12-10 (est.)',
      studyCompletion: '2027-04-08 (est.)',
      status: 'Active, not recruiting',
      eventSource: 'Site audit notice',
      eventSubtype: 'Enrollment pause',
    },
    daily: [77, 78, 76, 74, 73, 72, 70, 71, 69, 68, 66, 65, 64, 63, 62, 61, 60],
  },
  {
    id: 'BETA-AMYLOID-FAIL',
    trial: 'BA-19 Phase II (Early AD)',
    drug: 'BA-19',
    mechanism: 'Beta-amyloid mAb',
    phase: 'Phase II',
    indication: 'Early Alzheimer’s disease',
    sponsor: 'BlueArc Biologics',
    intervention: 'BA-19 IV monthly',
    eventType: 'ENDPOINT MISS',
    ts: '2026-04-14 12:09:44Z',
    trialSnapshot: {
      drug: 'BA-19',
      mechanism: 'Beta-amyloid mAb',
      phase: 'Phase II',
      indication: 'Early AD',
      sponsor: 'BlueArc Biologics',
      intervention: 'BA-19 IV monthly',
      assetOrigin: 'Internal antibody discovery',
    },
    studyDesign: {
      arms: '2 (active / placebo)',
      randomization: 'Randomized 1:1',
      control: 'Placebo',
      masking: 'Double-blind',
      sampleSize: 'N=312',
    },
    population: {
      condition: 'Early Alzheimer’s disease',
      biomarkers: 'Amyloid PET positive required',
      lineOfTherapy: 'Not applicable',
    },
    endpointsResults: {
      endpoints: ['Primary: cognitive composite (18 mo)', 'Secondary: PET amyloid, safety'],
      results: [
        { endpoint: 'Primary cognitive composite', value: 'Not met' },
        { endpoint: 'Amyloid PET', value: 'Reduced vs baseline' },
      ],
    },
    timelineDetails: {
      studyStart: '2024-06-22',
      primaryCompletion: '2026-03-15',
      studyCompletion: '2026-07-30 (est.)',
      status: 'Completed',
      eventSource: 'Topline release',
      eventSubtype: 'Primary endpoint result',
    },
    safety: [
      { term: 'ARIA-E', value: '8.1%' },
      { term: 'Serious AE', value: '6.4%' },
      { term: 'Discontinuation (AE)', value: '4.5%' },
    ],
    daily: [120, 118, 116, 112, 108, 104, 101, 97, 94, 90, 88, 85, 84, 82, 81, 80, 79],
  },
  {
    id: 'RXQ-701-PH3-START',
    trial: 'RXQ-701 Phase III (IgAN)',
    drug: 'RXQ-701',
    mechanism: 'Endothelin antagonist',
    phase: 'Phase III',
    indication: 'IgA nephropathy',
    sponsor: 'Renexus Pharma',
    intervention: 'RXQ-701 PO qd',
    eventType: 'SITE START',
    ts: '2026-04-13 08:15:00Z',
    trialSnapshot: {
      drug: 'RXQ-701',
      mechanism: 'Endothelin antagonist',
      phase: 'Phase III',
      indication: 'IgAN',
      sponsor: 'Renexus Pharma',
      intervention: 'RXQ-701 PO qd',
      assetOrigin: 'In-licensed (JP origin asset)',
    },
    studyDesign: {
      arms: '2 (active / placebo)',
      randomization: 'Randomized 2:1',
      control: 'Placebo',
      masking: 'Double-blind',
      sampleSize: 'N=980',
    },
    population: {
      condition: 'Primary IgAN (biopsy-confirmed)',
      biomarkers: 'UPCR ≤3.5 g/g at screening',
      lineOfTherapy: 'Standard-of-care RAS blockade allowed',
    },
    endpointsResults: {
      endpoints: ['Primary: eGFR slope (wk 104)', 'Secondary: UPCR, composite renal, safety'],
      results: [{ endpoint: 'Enrollment', value: '412 / 980 (42%)' }],
    },
    timelineDetails: {
      studyStart: '2026-02-02',
      primaryCompletion: '2029-03-31 (est.)',
      studyCompletion: '2029-11-01 (est.)',
      status: 'Recruiting',
      eventSource: 'Trial registry',
      eventSubtype: 'First China site activated',
    },
    safety: [
      { term: 'Hypotension', value: '7%' },
      { term: 'Hyperkalemia', value: '4%' },
      { term: 'Acute kidney injury', value: '<1%' },
    ],
    daily: [63, 64, 62, 65, 67, 66, 68, 70, 69, 71, 73, 72, 74, 76, 75, 77, 78],
  },
  /** Same sponsor as ONC-441 row — second program for PROGRAMS rail demo */
  {
    id: 'ONC-992-P1-START',
    trial: 'ONC-992 Phase I (mCRC)',
    drug: 'ONC-992',
    mechanism: 'CD47×EGFR bispecific',
    phase: 'Phase I',
    indication: 'metastatic colorectal cancer (mCRC)',
    sponsor: 'OncoNadir Therapeutics',
    intervention: 'ONC-992 IV q3w',
    eventType: 'SITE START',
    ts: '2026-03-02 14:30:00Z',
    trialSnapshot: {
      drug: 'ONC-992',
      mechanism: 'CD47×EGFR bispecific',
      phase: 'Phase I',
      indication: 'mCRC',
      sponsor: 'OncoNadir Therapeutics',
      intervention: 'ONC-992 IV q3w',
      assetOrigin: 'In-house bispecific platform',
    },
    studyDesign: {
      arms: '3 (dose levels)',
      randomization: 'Not applicable',
      control: 'None',
      masking: 'Open-label',
      sampleSize: 'N=54',
    },
    population: {
      condition: 'mCRC (1L)',
      biomarkers: 'EGFR-high',
      lineOfTherapy: '1L',
    },
    endpointsResults: {
      endpoints: ['Primary: MTD / RP2D', 'Secondary: preliminary ORR', 'Safety'],
      results: [],
    },
    timelineDetails: {
      studyStart: '2025-11-01',
      primaryCompletion: '2027-06-01 (est.)',
      studyCompletion: '2027-12-01 (est.)',
      status: 'Recruiting',
      eventSource: 'Company release',
      eventSubtype: 'First site activated',
    },
    daily: [58, 59, 58, 60, 61, 60, 62, 63, 62, 64, 63, 65, 66, 65, 67, 68, 69],
  },
]

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function isSameLocalCalendarDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** Event timestamp falls on today’s calendar day in local time (matches feed date stamps). */
function isAtLocalToday(at) {
  const d = at instanceof Date ? at : new Date(at)
  if (Number.isNaN(d.getTime())) return false
  return isSameLocalCalendarDay(d, new Date())
}

function isAtLocalThisYear(at) {
  const d = at instanceof Date ? at : new Date(at)
  if (Number.isNaN(d.getTime())) return false
  return d.getFullYear() === new Date().getFullYear()
}

function formatMmDd(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}-${dd}`
}

function formatYyyyMmDd(d) {
  const yyyy = String(d.getFullYear())
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function formatYyMmDd(d) {
  const yy = String(d.getFullYear()).slice(-2)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
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

/** Newest events first (by `at`). */
function sortFeedRowsByAtDesc(rows) {
  return [...rows].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
}

/** Rows for compact feed UI: inserts separators for timeline groups (newest-first lists). */
function buildFeedDisplayRows(items, opts = {}) {
  const sepMode = opts?.sepMode ?? 'today' // today | year | today+years
  const out = []
  for (let i = 0; i < items.length; i++) {
    const row = items[i]
    const prev = i > 0 ? items[i - 1] : null

    const wantTodaySep = sepMode === 'today' || sepMode === 'today+years'
    if (wantTodaySep && prev && !isAtLocalToday(row.at) && isAtLocalToday(prev.at)) {
      out.push({ type: 'sep', key: `today-sep-before-${row.id}`, label: 'TODAY' })
    }

    const wantYearSeps = sepMode === 'year' || sepMode === 'today+years'
    if (wantYearSeps && prev) {
      const y0 = new Date(prev.at).getFullYear()
      const y1 = new Date(row.at).getFullYear()
      if (Number.isFinite(y0) && Number.isFinite(y1) && y1 !== y0) {
        // Insert the year of the rows that follow (older group).
        out.push({ type: 'sep', key: `year-${y1}-sep-before-${row.id}`, label: String(y1) })
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

function parseMockTs(iso) {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})[\sT](\d{2}):(\d{2})/)
  if (!m) return new Date(iso)
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00Z`)
}

function isoDayToDate(isoDay) {
  const m = String(isoDay ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  return new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00Z`)
}

function addDays(d, n) {
  const x = new Date(d)
  x.setUTCDate(x.getUTCDate() + n)
  return x
}

function formatProgramTimelineDate(at) {
  const d = at instanceof Date ? at : new Date(at)
  if (Number.isNaN(d.getTime())) return EMPTY
  return formatFeedDate(d)
}

function buildProgramTimelineForEvent(ev) {
  const start = isoDayToDate(ev?.timelineDetails?.studyStart) ?? isoDayToDate(ev?.timelineDetails?.primaryCompletion)
  const primary = isoDayToDate(ev?.timelineDetails?.primaryCompletion)
  const ts = parseMockTs(ev?.ts).toISOString()
  const sponsor = ev?.sponsor ?? null
  const drug = ev?.trialSnapshot?.drug ?? ev?.drug ?? '—'
  const phase = ev?.trialSnapshot?.phase ?? ev?.phase ?? ''
  const ind = ev?.trialSnapshot?.indication ?? ev?.indication ?? ''

  const out = []
  const reg = start ? addDays(start, -45) : new Date(new Date(ts).getTime() - 120 * 86400000)
  out.push({ at: reg.toISOString(), label: 'Trial registered' })
  if (start) out.push({ at: addDays(start, 30).toISOString(), label: 'First patient dosed' })
  if (start) out.push({ at: addDays(start, 90).toISOString(), label: 'Site activated' })
  if (start) out.push({ at: addDays(start, 170).toISOString(), label: 'Enrollment ongoing' })
  if (start) out.push({ at: addDays(start, 220).toISOString(), label: 'Protocol amended' })
  out.push({
    at: ts,
    label:
      String(ev?.eventType ?? '').toUpperCase() === 'READOUT'
        ? 'Interim data released'
        : String(ev?.eventType ?? '').toUpperCase() === 'ENDPOINT MISS'
          ? 'Interim data released'
          : 'Company update released',
  })
  if (primary) out.push({ at: primary.toISOString(), label: 'Primary completion (est.)' })

  out.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())

  return {
    sponsor,
    drug,
    meta: [phase, ind].filter(Boolean).join(' | '),
    milestones: out,
  }
}

/** PROGRAMS rail: timeline rows per program for a sponsor (grouped by drug name). */
function buildProgramFeedItemsForSponsor(sponsor) {
  if (!sponsor) return []
  const evs = MOCK_EVENTS.filter((e) => e.sponsor === sponsor)
  evs.sort((a, b) => a.drug.localeCompare(b.drug))
  const out = []
  for (const ev of evs) {
    const tl = buildProgramTimelineForEvent(ev)
    for (let i = 0; i < tl.milestones.length; i++) {
      const m = tl.milestones[i]
      out.push({
        id: `prog-${ev.id}-${i}`,
        group: tl.drug,
        label: m.label,
        ticker: '',
        at: m.at,
        programMeta: tl.meta,
        trialEventId: ev.id,
        milestoneLabel: m.label,
        milestoneAt: m.at,
      })
    }
  }
  return out
}

/** Drug name → short symbol for ticker column (letters prefix before dose/dash). */
function tickerFromDrug(drug) {
  const s = String(drug ?? '')
  const prefix = s.match(/^([A-Za-z]{2,6})/)
  if (prefix) return prefix[1].toUpperCase()
  const letters = s.replace(/[^A-Za-z]/g, '')
  return letters.slice(0, 4).toUpperCase() || 'DRUG'
}

const INSIDER_KINDS = ['P Purchase']
/** Realistic issuer tickers only (no counts in this column). */
const INSIDER_TICKERS = ['PRIM', 'HG', 'SPRU', 'VRA', 'FFIN']

/** Keys shown as document / transaction rows in the insider case worksheet */
const INSIDER_DOC_KEYS = [
  'CEO Code P purchase (open market)',
  'Director Code P purchase (open market)',
  'CFO Code P purchase (open market)',
  'Officer Code P purchase (open market)',
]

const INSIDER_ISSUERS = [
  'Horizon Grain Co.',
  'SilverSpruce Therapeutics',
  'Arrival Labs',
  'Northern Harbor REIT',
  'VeraBio Holding Co.',
]

// Insider pipeline target: Form 4 only (Code P purchases).
const FORM_TYPES_INSIDER = ['Form 4']

// Politicians: mock names used in CASE key column (in place of insider roles).
const POLITICIAN_NAMES = [
  'Nancy Pelosi',
  'Dan Crenshaw',
  'Josh Gottheimer',
  'Ro Khanna',
  'Tommy Tuberville',
  'Michael McCaul',
]

// ------------------------------------------------------------
// BOSHA (Explore tab) — mock causal graph system
// ------------------------------------------------------------
const BOSHA_TICKER = 'ATYR'

const BOSHA_ALLOWED_EDGE_TYPES = new Set([
  'catalyst',
  'timing_link',
  'insider_activity',
  'political_exposure',
  'indirect_risk',
  'initiated_by',
  'affects',
])

function boshaMockPriceSeries(seed, n = 110) {
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

function boshaExplainerForTicker(ticker) {
  const t = String(ticker ?? '').toUpperCase()
  if (t === 'ATYR')
    return [
      'EFZO-FIT is NCT05415137, 268 people, three arms with placebo, and the primary is mean daily OCS change at week 48. Trust the SAP more than the press release.',
      'EFZO-CONNECT is NCT05892614 with about 25 patients. It is a mechanism check, not something that saves Phase 3 if the big study misses.',
      'Treat this like trial forensics. Stack the protocol and filings and ignore the story until the numbers in the SAP actually print.',
    ]
  if (t === 'MRNA')
    return [
      'MRNA is a large-cap biotech where regulatory milestones and trial readouts can dominate flows before the market fully reprices expectations.',
      'Short-horizon price moves tend to cluster around scheduled updates, endpoint language, and shifts in perceived probability of approval.',
      'For this case, prioritize dated events and disclosures that change the approval narrative or timing window.',
    ]
  if (t === 'SRPT')
    return [
      'SRPT is a clinical-stage biotech with high sensitivity to FDA communications, trial data quality, and disclosure timing.',
      'When regulatory language shifts, the implied approval probability can change quickly, which often drives volatility and risk hedging behavior.',
      'For this case, focus on what the regulator asked for, what data claims were implied, and whether actions cluster before a formal update.',
    ]
  return [
    `${t} is a biotech-linked asset where event timing and information flow can dominate short-horizon price discovery.`,
    'The highest-signal windows are scheduled catalysts (readouts, meetings, filings) and any behavior that clusters right before those dates.',
    'Use this paper to track what changed first, what followed, and what the next “known date” is.',
  ]
}

const BOSHA_DATASETS = {
  ASML: {
    entities: [{ id: 'c1', type: 'company', name: 'ASML Holding N.V.' }],
    events: [
      { id: 'e1', type: 'capacity_signal', title: 'EUV throughput remains the gating function', date: '2026-05-02', entities: ['c1'], sentiment: 'bullish', impact: 'high' },
    ],
    edges: [],
    price: boshaMockPriceSeries(712, 140),
  },
  XBI: {
    constituents: ['SRPT', 'IONS', 'RARE', 'BMRN', 'EXAS', 'CRSP'],
    entities: [
      { id: 'c1', type: 'company', name: 'SPDR S&P Biotech ETF' },
      { id: 'p1', type: 'politician', name: 'Sen. Mark Reynolds' },
      { id: 'i1', type: 'insider', name: 'Dr. Sarah Klein (Ex-Amgen)' },
      { id: 'd1', type: 'drug', name: 'AMG-301' },
      { id: 'f1', type: 'institution', name: 'FDA' },
      { id: 'x1', type: 'company', name: 'Sarepta Therapeutics (SRPT)' },
      { id: 'x2', type: 'company', name: 'Ionis Pharmaceuticals (IONS)' },
    ],
    events: [
      {
        id: 'e0',
        type: 'trial_result_rumor',
        title: 'Leak: AMG-301 Phase 2 chatter appears in sell-side notes',
        date: '2026-04-12',
        entities: ['d1'],
        sentiment: 'bullish',
        impact: 'high',
      },
      {
        id: 'e1',
        type: 'fda_meeting',
        title: 'FDA advisory meeting scheduled for AMG-301',
        date: '2026-04-18',
        entities: ['d1', 'f1'],
        sentiment: 'neutral',
        impact: 'high',
      },
      {
        id: 'e2',
        type: 'insider_buy',
        title: 'Insider purchase of biotech exposure ETF',
        date: '2026-04-20',
        entities: ['i1', 'c1'],
        sentiment: 'bullish',
        impact: 'medium',
      },
      {
        id: 'e3',
        type: 'politician_trade',
        title: 'Senator Reynolds discloses biotech ETF position',
        date: '2026-04-21',
        entities: ['p1', 'c1'],
        sentiment: 'bullish',
        impact: 'medium',
      },
      {
        id: 'e4',
        type: 'trial_result_rumor',
        title: 'Leak: AMG-301 Phase 2 data stronger than expected',
        date: '2026-04-22',
        entities: ['d1'],
        sentiment: 'bullish',
        impact: 'high',
      },
      {
        id: 'e5',
        type: 'hiring_signal',
        title: 'Two mid-cap constituents add BD/commercial roles within 10 days',
        date: '2026-04-24',
        entities: ['x1', 'x2'],
        sentiment: 'bullish',
        impact: 'medium',
      },
    ],
    edges: [
      { from: 'e0', to: 'd1', type: 'catalyst' },
      { from: 'e1', to: 'd1', type: 'affects' },
      { from: 'e1', to: 'c1', type: 'indirect_risk' },
      { from: 'e2', to: 'c1', type: 'insider_activity' },
      { from: 'e2', to: 'i1', type: 'initiated_by' },
      { from: 'e3', to: 'c1', type: 'political_exposure' },
      { from: 'e3', to: 'p1', type: 'initiated_by' },
      { from: 'e4', to: 'd1', type: 'catalyst' },
      { from: 'e4', to: 'e1', type: 'timing_link' },
      { from: 'e5', to: 'c1', type: 'indirect_risk' },
    ],
    price: boshaMockPriceSeries(119),
  },
  ATYR: {
    entities: [
      { id: 'c1', type: 'company', name: 'aTyr Pharma, Inc.' },
      { id: 'd1', type: 'drug', name: 'Efzofitimod (ILD)' },
      { id: 'f1', type: 'institution', name: 'FDA' },
      { id: 'i1', type: 'insider', name: 'Chief Medical Officer (issuer)' },
    ],
    events: [
      {
        id: 'e1',
        type: 'trial_update',
        title: 'Efzofitimod ILD studies: enrollment pacing and site mix disclosed',
        date: '2026-04-05',
        entities: ['d1', 'c1'],
        sentiment: 'neutral',
        impact: 'medium',
      },
      {
        id: 'e2',
        type: 'fda_meeting',
        title: 'Regulatory correspondence on pulmonary endpoints and safety follow-up',
        date: '2026-04-22',
        entities: ['d1', 'f1'],
        sentiment: 'neutral',
        impact: 'high',
      },
      {
        id: 'e3',
        type: 'catalyst',
        title: 'Medical meeting abstract window: efzofitimod ILD data expected',
        date: '2026-05-14',
        entities: ['d1', 'c1'],
        sentiment: 'bullish',
        impact: 'high',
      },
      {
        id: 'e4',
        type: 'insider_buy',
        title: 'Open-market purchases by issuer officer cluster ahead of data window',
        date: '2026-04-28',
        entities: ['i1', 'c1'],
        sentiment: 'bullish',
        impact: 'medium',
      },
    ],
    edges: [
      { from: 'e1', to: 'd1', type: 'catalyst' },
      { from: 'e2', to: 'd1', type: 'affects' },
      { from: 'e2', to: 'c1', type: 'indirect_risk' },
      { from: 'e3', to: 'd1', type: 'catalyst' },
      { from: 'e4', to: 'c1', type: 'insider_activity' },
    ],
    price: boshaMockPriceSeries(401, 130).map((x) => Math.round((x / 100) * 100) / 100),
  },
  MRNA: {
    entities: [
      { id: 'c1', type: 'company', name: 'Moderna, Inc.' },
      { id: 'd1', type: 'drug', name: 'mRNA-1647' },
      { id: 'f1', type: 'institution', name: 'FDA' },
      { id: 'i1', type: 'insider', name: 'CFO (Issuer insider)' },
      { id: 'p1', type: 'politician', name: 'Rep. Jordan Collins' },
    ],
    events: [
      {
        id: 'e1',
        type: 'fda_meeting',
        title: 'FDA meeting set to discuss endpoint alignment for mRNA-1647',
        date: '2026-03-11',
        entities: ['d1', 'f1'],
        sentiment: 'neutral',
        impact: 'high',
      },
      {
        id: 'e2',
        type: 'insider_buy',
        title: 'Issuer CFO adds shares ahead of data window',
        date: '2026-03-18',
        entities: ['i1', 'c1'],
        sentiment: 'bullish',
        impact: 'medium',
      },
      {
        id: 'e3',
        type: 'trial_result_rumor',
        title: 'Channel checks imply strong immunogenicity readout',
        date: '2026-03-21',
        entities: ['d1'],
        sentiment: 'bullish',
        impact: 'high',
      },
      {
        id: 'e4',
        type: 'politician_trade',
        title: 'Disclosure: House member reports position in issuer',
        date: '2026-03-28',
        entities: ['p1', 'c1'],
        sentiment: 'neutral',
        impact: 'medium',
      },
    ],
    edges: [
      { from: 'e1', to: 'd1', type: 'affects' },
      { from: 'e1', to: 'c1', type: 'indirect_risk' },
      { from: 'e2', to: 'c1', type: 'insider_activity' },
      { from: 'e2', to: 'i1', type: 'initiated_by' },
      { from: 'e3', to: 'd1', type: 'catalyst' },
      { from: 'e3', to: 'e1', type: 'timing_link' },
      { from: 'e4', to: 'c1', type: 'political_exposure' },
      { from: 'e4', to: 'p1', type: 'initiated_by' },
    ],
    price: boshaMockPriceSeries(331),
  },
  SRPT: {
    entities: [
      { id: 'c1', type: 'company', name: 'Sarepta Therapeutics, Inc.' },
      { id: 'd1', type: 'drug', name: 'SRP-9001' },
      { id: 'f1', type: 'institution', name: 'FDA' },
      { id: 'i1', type: 'insider', name: 'Director (Issuer insider)' },
    ],
    events: [
      {
        id: 'e1',
        type: 'fda_meeting',
        title: 'FDA requests additional analyses for SRP-9001 submission',
        date: '2026-02-06',
        entities: ['d1', 'f1'],
        sentiment: 'bearish',
        impact: 'high',
      },
      {
        id: 'e2',
        type: 'trial_result_rumor',
        title: 'Rumor: dataset re-cut improves responder narrative',
        date: '2026-02-10',
        entities: ['d1'],
        sentiment: 'bullish',
        impact: 'medium',
      },
      {
        id: 'e3',
        type: 'insider_buy',
        title: 'Director purchase disclosed after regulatory headline',
        date: '2026-02-14',
        entities: ['i1', 'c1'],
        sentiment: 'bullish',
        impact: 'medium',
      },
    ],
    edges: [
      { from: 'e1', to: 'd1', type: 'affects' },
      { from: 'e1', to: 'c1', type: 'indirect_risk' },
      { from: 'e2', to: 'd1', type: 'catalyst' },
      { from: 'e2', to: 'e1', type: 'timing_link' },
      { from: 'e3', to: 'c1', type: 'insider_activity' },
      { from: 'e3', to: 'i1', type: 'initiated_by' },
    ],
    price: boshaMockPriceSeries(907),
  },
}

function boshaDatasetForTicker(ticker) {
  const t = String(ticker ?? '').toUpperCase()
  return BOSHA_DATASETS[t] ?? BOSHA_DATASETS.ATYR
}

function boshaImpactScore(impact) {
  const x = String(impact ?? '').toLowerCase()
  if (x === 'high') return 3
  if (x === 'medium') return 2
  return 1
}

function boshaSentimentColor(sentiment) {
  const s = String(sentiment ?? '').toLowerCase()
  if (s === 'bullish') return 'rgba(80, 255, 190, 0.92)'
  if (s === 'bearish') return 'rgba(255, 88, 108, 0.95)'
  return 'rgba(216, 255, 235, 0.35)'
}

function boshaParseDay(yyyyMmDd) {
  const d = new Date(`${yyyyMmDd}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

function boshaFormatTimelineDay(yyyyMmDd) {
  const d = boshaParseDay(yyyyMmDd)
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

/** Insider worksheet: `18 Apr` (same rhythm as feed date stamps, without year). */
function insiderTxnDateShort(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return EMPTY
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
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
  const ticker = INSIDER_TICKERS[i % INSIDER_TICKERS.length]
  const thisYear = new Date().getFullYear()
  let at
  if (i < 10) {
    const t = new Date()
    t.setMinutes(t.getMinutes() - i * 17 - i * i)
    at = t.toISOString()
  } else if (i < 24) {
    const t = new Date()
    t.setDate(t.getDate() - 1 - (i % 5))
    t.setHours(14, 20 + (i % 30), 0, 0)
    at = t.toISOString()
  } else if (i < 36) {
    at = new Date(thisYear, 1, 8 + (i % 12), 9, 15).toISOString()
  } else {
    at = new Date(2024, 6, 19, 11, 0).toISOString()
  }

  const formType = FORM_TYPES_INSIDER[i % FORM_TYPES_INSIDER.length]
  const isForm4 = formType === 'Form 4'
  const issuer = INSIDER_ISSUERS[i % INSIDER_ISSUERS.length]
  const filingId = `${ticker}-${String(220000 + (i * 7919) % 879000)}`

  // Keep rows aligned with "count" and represent actual purchase transactions.
  const rowCount = count
  const rows = []
  for (let k = 0; k < rowCount; k++) {
    const si = (i * 11 + k * 5) % INSIDER_DOC_KEYS.length
    const key = INSIDER_DOC_KEYS[si]
    const ts = new Date(at)
    // Spread transaction timestamps across a wider window so graph markers vary by date.
    // Keep within ~30 days for "cluster" feel, but not all on the same day.
    const dayJitter = Math.floor(seededJitter(i * 97 + k * 19, 28)) // 0..27 days
    ts.setDate(ts.getDate() - dayJitter)
    ts.setHours(9 + ((i + k) % 8), ((i * k * 13) % 55) + 5, 0, 0)
    const rowIso = ts.toISOString()
    let amountUsd = null
    if (isForm4) {
      // Mock Code P purchases: non-trivial dollar amounts, always positive.
      const base = 25_000 + seededJitter(i * 101 + k * 17, 2_400_000)
      amountUsd = Math.round(base)
    }
    rows.push({ key, amountUsd, ts: rowIso })
  }

  const totalUsd = isForm4 ? rows.reduce((a, r) => a + (Number(r.amountUsd) || 0), 0) : 0
  const label = totalUsd > 0 ? formatUsdCompact(totalUsd) : '—'

  const roleFromKey = (k) => (/\bCEO\b/i.test(k) ? 'CEO' : /\bCFO\b/i.test(k) ? 'CFO' : /\bDirector\b/i.test(k) ? 'Director' : 'Officer')
  const roleCounts = {}
  for (const r of rows) roleCounts[roleFromKey(r.key)] = (roleCounts[roleFromKey(r.key)] || 0) + 1
  const rolesSorted = Object.entries(roleCounts).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
  const topRole = rolesSorted[0]?.[0] ?? 'Insider'
  const rolesPhrase =
    rolesSorted.length >= 2
      ? `${topRole} and ${rolesSorted[1][0]}`
      : topRole

  const daysSinceLast = Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 86400000))
  const spanDays =
    rows.length > 1
      ? Math.max(
          1,
          Math.round(
            (Math.max(...rows.map((r) => new Date(r.ts).getTime())) -
              Math.min(...rows.map((r) => new Date(r.ts).getTime()))) /
              86400000,
          ),
        )
      : 1
  const caveat =
    totalUsd < 75_000
      ? 'The dollar amount is small, so this may not be a high-conviction signal.'
      : totalUsd < 300_000
        ? 'The dollar amount is moderate, so it is worth monitoring rather than over-weighting.'
        : 'The dollar amount is meaningful, so it is more likely to be intentional signaling.'
  const companyBit =
    ticker === 'HG'
      ? 'Horizon Grain Co. is a grain handling and agricultural logistics business.'
      : ticker === 'SPRU'
        ? 'SilverSpruce Therapeutics is a clinical-stage biotech developing small-molecule therapies.'
        : ticker === 'VRA'
          ? 'VeraBio Holding Co. is a biotech focused on immunology and inflammation programs.'
          : ticker === 'FFIN'
            ? 'FFIN is a community bank and financial services provider in the United States.'
            : `${issuer} is a public company.`

  const distinctDays = new Set(
    rows
      .map((r) => {
        const d = new Date(r.ts)
        if (Number.isNaN(d.getTime())) return null
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      })
      .filter(Boolean),
  ).size

  return {
    id: `ins-${i}`,
    label,
    count,
    ticker,
    at,
    daily: buildInsiderDailySeries(i + 31),
    __context_sentences: [
      companyBit,
      `${count} Code P open-market purchase${count === 1 ? '' : 's'} were reported over about ${spanDays} days, led by the ${topRole}.`,
      `The buying adds up to about ${formatUsdCompact(totalUsd)} across ${distinctDays || 1} trading day${(distinctDays || 1) === 1 ? '' : 's'}, with activity coming from ${rolesPhrase}.`,
      `The most recent purchase was about ${daysSinceLast} day${daysSinceLast === 1 ? '' : 's'} ago. ${caveat}`,
    ],
    caseSheet: {
      filingId,
      formType,
      issuer,
      ticker,
      isForm4,
      filedAt: at,
      rows,
    },
  }
}

const INSIDER_FEED_ROWS = sortFeedRowsByAtDesc(
  Array.from({ length: 42 }, (_, i) => insiderCaseForRowIndex(i)),
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
  const nPeople = 1 + (i % 3)
  const people = Array.from({ length: nPeople }, (_, j) => POLITICIAN_NAMES[(i + j) % POLITICIAN_NAMES.length])
  const rows = (base?.caseSheet?.rows ?? []).map((r, idx) => {
    const who = people[idx % people.length]
    return { ...r, key: lastName(who).toUpperCase() }
  })
  return {
    ...base,
    id: `pol-${i}`,
    politicians: people,
    caseSheet: {
      ...(base.caseSheet ?? {}),
      issuer: people[0] ?? '—',
      rows,
    },
  }
}

const POLITICIAN_FEED_ROWS = sortFeedRowsByAtDesc(
  Array.from({ length: 240 }, (_, i) => politicianCaseForRowIndex(i)),
)

function PoliticiansFilterPanel({ activeName, items, onSelect, focused, onFocus }) {
  return (
    <section
      className={['panel', 'feed', 'feedCompact', 'filterTile', focused ? 'isFocused' : ''].filter(Boolean).join(' ')}
      aria-label="Filter"
      onMouseDown={() => onFocus?.()}
    >
      <header className="feedCompactHeader">
        <div className="panelTitle feedCompactTitle">FILTER</div>
      </header>
      <div className="feedCompactList feedCompactList--scroll scrollThin filterList" role="list">
        <button
          type="button"
          className={['feedRowCompact', 'feedRowCompact--two', 'filterRow', !activeName ? 'isActive' : '']
            .filter(Boolean)
            .join(' ')}
          role="listitem"
          onClick={() => onSelect(null)}
        >
          <span className="feedCell feedCellLabel kvFeedMain dim">ALL</span>
          <span className="feedCell feedCellTicker mono kvFeedDim">{items?.length ?? 0}</span>
        </button>
        {(items ?? []).map((it) => (
          <button
            type="button"
            key={it.name}
            className={['feedRowCompact', 'feedRowCompact--two', 'filterRow', activeName === it.name ? 'isActive' : '']
              .filter(Boolean)
              .join(' ')}
            role="listitem"
            onClick={() => {
              onFocus?.()
              onSelect(it.name)
            }}
          >
            <span className="feedCell feedCellLabel kvFeedMain">{it.name}</span>
            <span className="feedCell feedCellTicker mono kvFeedDim">{it.count}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function BoshaTickerPanel({ selectedTicker, onSelectTicker, focused, onFocus, q, onQuery, filtered }) {
  return (
    <section
      className={['panel', 'feed', 'feedCompact', 'feed--left', 'boshaTicker', focused ? 'isFocused' : '']
        .filter(Boolean)
        .join(' ')}
      aria-label="Ticker selector"
      onMouseDown={() => onFocus?.()}
    >
      <header className="feedCompactHeader">
        <div className="panelTitle feedCompactTitle">FEED</div>
        <div className="feedCompactMeta feedCompactMeta--ghost" aria-hidden="true">
          <span className="feedPageInd">0/0</span>
        </div>
      </header>
      <div className="feedCompactList feedCompactList--scroll scrollThin" role="list">
        <div className="feedRowCompact feedRowCompact--two boshaTickerSearchRow" role="listitem">
          <input
            className="boshaTickerSearchInput"
            value={q ?? ''}
            placeholder="Search"
            onChange={(e) => onQuery?.(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onQuery?.('')
            }}
            aria-label="Search tickers"
            spellCheck={false}
            onFocus={() => onFocus?.()}
          />
        </div>
        <div className="feedRowCompact feedRowCompact--blank" role="presentation" />
        {filtered.map((it) => (
          <button
            key={it.rowKey ?? it.ticker}
            type="button"
            role="listitem"
            className={['feedRowCompact', 'feedRowCompact--two', it.ticker === selectedTicker ? 'isActive' : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => {
              onFocus?.()
              onSelectTicker(it.ticker)
            }}
          >
            <span className="feedCell feedCellLabel kvFeedMain">{it.name}</span>
            <span className="feedCell feedCellTicker mono kvFeedDim">{it.ticker}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function BoshaGraphFigure({ entities, events, edges }) {
  const wrapRef = useRef(null)
  const [size, setSize] = useState({ w: 640, h: 320 })

  const entitiesById = useMemo(() => Object.fromEntries((entities ?? []).map((e) => [e.id, e])), [entities])
  const eventsById = useMemo(() => Object.fromEntries((events ?? []).map((e) => [e.id, e])), [events])

  const visibleEdges = useMemo(() => {
    const cleaned = (edges ?? [])
      .filter((e) => BOSHA_ALLOWED_EDGE_TYPES.has(String(e?.type ?? '')))
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
      .map((e) => ({ id: e.id, d: boshaParseDay(e.date) }))
      .filter((x) => x.d)
      .sort((a, b) => a.d - b.d)
    const min = ds[0]?.d?.getTime?.() ?? Date.now()
    const max = ds.at(-1)?.d?.getTime?.() ?? Date.now()
    const span = Math.max(1, max - min)
    const x0 = w * 0.06
    const x1 = w * 0.94

    function xForEvent(eid) {
      const d = boshaParseDay(eventsById?.[eid]?.date)
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
    <div className="boshaGraphFigure" aria-label="Causal graph figure">
      <div
        ref={wrapRef}
        className="boshaGraphFigureWrap"
        role="img"
        aria-label="Causal graph"
      >
        <svg className="boshaGraphSvg" width="100%" height="100%">
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
                  className="boshaEdge"
                  opacity={0.22}
                />
              </g>
            )
          })}

          {Array.from(layout.values()).map((n) => {
            const isEv = n.kind === 'event'
            const fill = isEv ? boshaSentimentColor(n.sentiment) : 'rgba(90, 220, 255, 0.42)'
            const stroke = 'rgba(140, 255, 195, 0.16)'
            const r = isEv ? 9 + 3 * boshaImpactScore(n.impact) : 9
            return isEv ? (
              <g key={n.id} opacity={1}>
                <rect x={n.x - r} y={n.y - r} width={r * 2} height={r * 2} rx="2" fill={fill} stroke={stroke} strokeWidth="1" />
              </g>
            ) : (
              <g key={n.id} opacity={1}>
                <circle cx={n.x} cy={n.y} r={r} fill={fill} stroke={stroke} strokeWidth="1" />
              </g>
            )
          })}
        </svg>
      </div>
      <div className="boshaFigureCaption mono dim">
        Evidence graph: squares are events (impact-sized), circles are entities.
      </div>
    </div>
  )
}

function BoshaMiniPrice({ series, label, showMeta = true }) {
  const wrapRef = useRef(null)
  const [size, setSize] = useState({ w: 360, h: 192 })

  useEffect(() => {
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
  }, [])

  const w = size.w
  const h = size.h
  // Keep the plot flush with the paper text column while still allowing
  // Y-axis labels to render to the *left* of the axis line.
  const viewPadL = 36
  const margin = { l: 0, r: 6, t: 8, b: 18 }
  const innerW = Math.max(1, w - margin.l - margin.r)
  const innerH = Math.max(1, h - margin.t - margin.b)

  const vals = Array.isArray(series) ? series : []
  const min = vals.length ? Math.min(...vals) : 0
  const max = vals.length ? Math.max(...vals) : 1
  const span = max - min || 1

  function xAt(i) {
    return margin.l + (i / Math.max(1, vals.length - 1)) * innerW
  }
  function yAt(v) {
    return margin.t + (1 - (v - min) / span) * innerH
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
  }, [vals, w, h])

  const yTicks = useMemo(() => priceTicks(min, max, 4), [min, max])
  const xTickIdx = useMemo(() => {
    const n = Math.max(0, vals.length)
    if (n <= 1) return []
    return [0.08, 0.32, 0.56, 0.8].map((p) => Math.round(clamp01(p) * (n - 1)))
  }, [vals.length])

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

  const last = Array.isArray(series) && series.length ? series.at(-1) : null
  const prev = Array.isArray(series) && series.length > 1 ? series.at(-2) : null
  const ch = last != null && prev != null ? last - prev : null
  const chPct = last != null && prev ? ((last - prev) / Math.max(1e-6, prev)) * 100 : null
  const up = ch != null ? ch >= 0 : true

  return (
    <div
      className={['boshaMiniPrice', showMeta ? '' : 'boshaMiniPrice--chartOnly'].filter(Boolean).join(' ')}
      aria-label="Price chart"
    >
      {showMeta ? (
        <div className="boshaMiniPriceMeta">
          <div className="mono dim">{label ?? 'PRICE'}</div>
          <div className="mono">{last != null ? `$${Number(last).toFixed(2)}` : '—'}</div>
          <div className={['mono', 'boshaMiniDelta', up ? 'isUp' : 'isDown'].filter(Boolean).join(' ')}>
            {ch != null && chPct != null ? `${up ? '+' : ''}${ch.toFixed(2)} (${up ? '+' : ''}${chPct.toFixed(2)}%)` : '—'}
          </div>
        </div>
      ) : null}
      <div ref={wrapRef} className="boshaMiniPriceWrap" role="img" aria-label="Mini price sparkline">
        <svg className="graphSvg" viewBox={`${-viewPadL} 0 ${w + viewPadL} ${h}`} preserveAspectRatio="xMidYMid meet" role="img">
          <path
            className="graphAxis"
            d={`M ${margin.l} ${margin.t} L ${margin.l} ${h - margin.b} L ${w - margin.r} ${h - margin.b}`}
          />

          {yTicks.map((v, i) => {
            const y = yAt(v)
            return (
              <g key={`yt-${i}`}>
                <text className="graphTick graphTick--y" x={margin.l - 6} y={y + 4}>
                  {formatPriceTick(v)}
                </text>
                <path className="graphTickLine" d={`M ${margin.l} ${y} L ${margin.l + 6} ${y}`} />
              </g>
            )
          })}

          {xTickIdx.map((idx, i) => {
            const x = xAt(idx)
            const d = dates[idx]
            const m = d instanceof Date && !Number.isNaN(d.getTime()) ? MONTHS_SHORT[d.getMonth()] : EMPTY
            return (
              <g key={`xt-${i}`}>
                <path className="graphTickLine" d={`M ${x} ${h - margin.b} L ${x} ${h - margin.b - 6}`} />
                <text className="graphTick graphTick--x" x={x} y={h - 4}>
                  {m}
                </text>
              </g>
            )
          })}

          <path className="graphPath" d={path} vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
    </div>
  )
}

function boshaSignalForEvent(ev) {
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

function boshaWhatWhyForEvent(ev) {
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

function boshaStructuralInterpretation(events) {
  const es = Array.isArray(events) ? events : []
  const hi = es.filter((e) => String(e?.impact ?? '').toLowerCase() === 'high').length
  const bull = es.filter((e) => String(e?.sentiment ?? '').toLowerCase() === 'bullish').length
  const bear = es.filter((e) => String(e?.sentiment ?? '').toLowerCase() === 'bearish').length
  if (hi >= 2 && bull > bear) return 'Structure resembles “positive leak → positioning → catalyst window” with elevated gap risk.'
  if (hi >= 1 && bear >= bull) return 'Structure resembles “regulatory overhang → narrative counter-signal → repricing window.”'
  return 'Structure looks like mixed evidence with moderate timing risk; prioritize the next dated catalyst.'
}

function boshaSeedFromTicker(ticker) {
  const t = String(ticker ?? '').toUpperCase()
  let s = 7
  for (let i = 0; i < t.length; i++) s = (s * 31 + t.charCodeAt(i)) % 10_000
  return s
}

function boshaIsEtf(ticker) {
  const t = String(ticker ?? '').toUpperCase()
  return ['XBI', 'IBB', 'ARKG', 'LABU'].includes(t)
}

function boshaMockSignalBits(ticker) {
  const seed = boshaSeedFromTicker(ticker)
  const a = Math.floor(seededJitter(seed + 11, 9))
  const b = Math.floor(seededJitter(seed + 29, 9))
  const c = Math.floor(seededJitter(seed + 47, 9))
  const funding = [
    'non-dilutive grant',
    'strategic financing',
    'accelerated spend',
    'partner-funded study',
    'manufacturing scale signal',
    'guidance language shift',
    'backlog / demand pull',
    'new reimbursement signal',
    'pipeline reprioritization',
  ][a]
  const hiring = [
    'clinical ops hiring',
    'regulatory affairs hiring',
    'commercial build-out hiring',
    'CMC / manufacturing hiring',
    'BD partnership hires',
    'quality systems expansion',
    'medical affairs expansion',
    'field team build hints',
    'enterprise sales hiring',
  ][b]
  const partnership = [
    'distribution partner',
    'co-dev partner',
    'data-sharing agreement',
    'supply chain contract',
    'payer / provider partnership',
    'defense / gov contract rumor',
    'major platform integration',
    'site network expansion',
    'KOL / investigator network',
  ][c]
  return { funding, hiring, partnership }
}

function boshaDateStamp() {
  const d = new Date()
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

function BoshaCausalDiagram({ ticker, diagramSpec }) {
  const wrapRef = useRef(null)
  const [size, setSize] = useState({ w: 720, h: 150 })
  const tUpper = String(ticker ?? '').toUpperCase()
  const isForkMergeDiagram =
    diagramSpec?.layout === 'fork_merge' || tUpper === 'ASML' || tUpper === 'ATYR'

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

    if (t === 'ASML' || t === 'ATYR') {
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
          : [
              ['p0', 'SEC / CT.gov disclosures'],
              ['p1', 'EFZO-FIT Ph3 (N=268)'],
              ['p2', 'EFZO-CONNECT Ph2 PoC'],
              ['p3', 'FDA / commercial read'],
              ['p4', 'ATYR repricing'],
            ]

      return [
        { id: pack[0][0], label: pack[0][1], x: xTop, y: y0, w: topW, h: rh },
        { id: pack[1][0], label: pack[1][1], x: xMidL, y: y1, w: midW, h: rh },
        { id: pack[2][0], label: pack[2][1], x: xMidR, y: y1, w: midW, h: rh },
        { id: pack[3][0], label: pack[3][1], x: xMerge, y: y2, w: mergeW, h: rh },
        { id: pack[4][0], label: pack[4][1], x: xBot, y: y3, w: botW, h: rh },
      ]
    }

    const a = boshaIsEtf(t)
      ? ['Signal leak / schedule', 'Vol bid rises', 'Constituents gap']
      : ['Process signal', 'Positioning shifts', 'Dated catalyst']
    const b = boshaIsEtf(t)
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
    if (diagramSpec?.layout !== 'fork_merge' && t !== 'ASML' && t !== 'ATYR') return h
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
    if (t === 'ATYR') {
      return [
        ['p0', 'p1'],
        ['p0', 'p2'],
        ['p1', 'p3'],
        ['p2', 'p3'],
        ['p3', 'p4'],
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
        : tUpper === 'ATYR'
          ? 'Clinical catalyst chain diagram'
          : 'Causal chain diagram'

  return (
    <div
      ref={wrapRef}
      className={['boshaCausalWrap', isForkMergeDiagram ? 'boshaCausalWrap--supply' : ''].filter(Boolean).join(' ')}
      aria-label={forkAria}
      role="img"
    >
      <svg className="boshaCausalSvg" viewBox={`0 0 ${w} ${vbH}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          <marker
            id="boshaArrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(216, 255, 235, 0.42)" />
          </marker>
        </defs>

        {edges.map((e, i) => {
          const d = routedPath(e.a, e.b)
          return (
            <path
              key={`e-${i}`}
              d={d}
              className={['boshaCausalEdge', e.kind === 'loop' ? 'boshaCausalEdge--loop' : ''].filter(Boolean).join(' ')}
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
              strokeLinejoin="round"
              markerEnd="url(#boshaArrow)"
            />
          )
        })}

        {nodes.map((n) => (
          <g key={n.id}>
            <rect
              className={['boshaCausalNode', n.id === 't1' || n.id === 'a4' || n.id === 'p4' ? 'boshaCausalNode--edge' : ''].filter(Boolean).join(' ')}
              x={n.x + 0.5}
              y={n.y + 0.5}
              width={n.w - 1}
              height={n.h - 1}
              rx="6"
            />
            <text className="boshaCausalText" x={n.x + n.w / 2} y={n.y + n.h / 2 + 4}>
              {n.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

function boshaFmtDate(d) {
  const x = boshaParseDay(d)
  if (!x) return '—'
  return `${MONTHS_SHORT[x.getMonth()]} ${String(x.getDate()).padStart(2, '0')}`
}

function boshaVolPct(series, n) {
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

function boshaThesisMemo({ ticker, companyName, events, priceSeries, constituents = [] }) {
  const t = String(ticker ?? '').toUpperCase()
  const name = String(companyName ?? '').trim() || t
  const es = (events ?? []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))
  const top = es[0] ?? null
  const hi = es.find((e) => String(e?.impact ?? '').toLowerCase() === 'high') ?? top
  const bits = boshaMockSignalBits(t)

  const rv14 = boshaVolPct(priceSeries, 14)
  const rv60 = boshaVolPct(priceSeries, 60)
  const rvPhrase =
    rv14 != null && rv60 != null
      ? `Realized vol is ~${rv14.toFixed(0)}% annualized vs ~${rv60.toFixed(0)}% on the last ~3 months, which is the market paying up for timing before it pays up for price.`
      : `Vol is firming before price, which is what you see when timing compresses before confirmation hits the tape.`

  const cNames = (constituents ?? []).filter(Boolean).slice(0, 4)
  const cPhrase = cNames.length ? `${cNames.join(', ')}` : 'mid-cap constituents'

  const chartX = boshaIsEtf(t) ? 'lagging despite a tightening catalyst window' : 'muted reaction to accumulating pre-catalyst signals'

  const title = boshaIsEtf(t)
    ? `${t}: Biotech catalyst risk is compressing, but price is still treating it as noise`
    : `${t}: The market is underpricing a near-term catalyst window implied by behavior and language shifts`

  const openingA = boshaIsEtf(t)
    ? `${name} is seeing a clean regime shift: the “date risk” in the underlying ecosystem is compressing into a narrower window, while positioning signals are showing up ahead of the headline. The edge is not “biotech will go up”; the edge is that timing is tightening while the tape still prices it as background noise.`
    : `${name} is entering a new positioning regime where the timing signal is getting louder than the narrative. The market is still pricing it as “normal drift,” but the evidence trail looks like pre-catalyst behavior: a dated regulatory window, reinforcement from smart-activity proxies, and language that suggests the next update will change probability, not just timing.`

  const openingB = boshaIsEtf(t)
    ? `This matters because dispersion is what drives ETF repricing: the highest-beta names move first, the basket follows, and the lag creates a window where vol is bid but spot is not. If you’re early, you get paid twice—first when the market admits the window exists, then when confirmation forces flows.`
    : `This matters because once the next “known date” is clear, liquidity shifts from patient holders to fast money and the repricing happens in days, not quarters. If you wait for the formal update, you typically pay for the same probability shift that is already being hinted at in behavior and process signals.`

  const priceRef = `Price is still behaving like ${chartX}; that mismatch is the setup, not the conclusion.`

  const core = (() => {
    const dHi = hi?.date ? boshaFmtDate(hi.date) : '—'
    const dTop = top?.date ? boshaFmtDate(top.date) : '—'
    const evA = hi?.title ? `The trigger is already dated: ${dHi} — “${hi.title},”` : 'The trigger is already dated,'
    const evB = top?.title && top?.id !== hi?.id ? ` reinforced by ${dTop} — “${top.title}.”` : '.'
    const mech = boshaIsEtf(t)
      ? ` What makes this actionable now is that the “soft” signals are not soft anymore: ${rvPhrase} On the fundamental side, you can point to concrete behavior—${cPhrase} are the kind of names that lead early when windows tighten, and we already have process-like signals showing up as ${bits.hiring} plus ${bits.funding} rather than post-hoc narratives.`
      : ` What makes this actionable now is that the signals have become concrete: ${rvPhrase} When you see ${bits.hiring} alongside ${bits.partnership} and a ${bits.funding}, it implies internal confidence that the next milestone unlocks a commercial step-change, not just another data point.`
    const chain = boshaIsEtf(t)
      ? ` The second-order edge is dispersion: leaders gap first, laggards follow, and the ETF reprices last. If you want the tradeable asymmetry, you’re not “long biotech,” you’re long the window: signal leakage tightens timing → vol bid rises → leaders gap → flows chase → ETF reprices.`
      : ` The causal chain is: pre-catalyst signals imply improving probability → positioning shifts ahead of the dated window → confirmation changes guidance language → counterparties/partners commit → revenue expectations expand and the multiple follows.`
    return `${evA}${evB}${mech}${chain}`
  })()

  const causalChain = `Process signal → positioning shifts → dated catalyst → confirmation headline → flows re-rate → repricing`

  const final = boshaIsEtf(t)
    ? `Best expression is to be long the window, not the story: long ${t} vol into the next 4–8 weeks while selectively leaning into leaders (${cPhrase}) versus the basket if dispersion picks up. Confirmation is concrete: scheduling language tightens again, realized vol stays elevated while spot lags, and the first gaps appear in the high-beta names before the ETF follows. Invalidation is also concrete: the window pushes out, vol mean-reverts, and moves revert to pure beta with no micro-driven gaps.`
    : `Next, watch for concrete confirmation that the market’s probability is too low: earnings language that moves from “monitoring” to “preparing,” a partnership/contract that pulls timelines forward, or disclosure that clarifies endpoints and dates. The thesis is confirmed when guidance language or counterparties shift in a way that forces revenue expectations higher; it fails if the next dated update is delayed or softened and behavior signals unwind without replacement.`

  const created = boshaDateStamp()
  return { created, title, openingA, openingB, priceRef, chartX, core, causalChain, final }
}

function boshaAsmlText() {
  return {
    title: 'Leading-edge capacity remains EUV-gated; equity attention still clusters on downstream AI hardware',
    subtitle: 'ASML · May 2026',
    intro:
      'Extreme ultraviolet lithography is the binding step for adding leading-edge wafer supply, and ASML is the systems supplier the industry depends on for that step. Output at the most advanced nodes therefore scales with EUV delivery and installation, not with the near-term pace of demand headlines. Market attention and flows still concentrate on accelerators and hyperscale operators because those markets are liquid, well covered, and map cleanly to a simple growth narrative, while lithography capacity is technical and slow to adjust. The result is often a lag between how downstream AI semiconductors reprice and how the upstream tool chain is valued, even when both sit in the same end-use story. The view here is that this lag can persist until allocation pressure in EUV is reflected more fully in ASML’s relative performance.',
    priceCaption:
      'ASML only. Use it with a broad GPU or AI-semiconductor complex in mind: wide relative strength there versus little movement here implies demand is being discounted ahead of lithography constraint.',
    middle:
      'Constraint should show up first in order books, delivery timing, and pricing for EUV tools, then propagate into how foundries allocate leading-edge capacity, and only later into the equity prices of the most visible downstream names. That sequencing is what produces the pattern this note targets: downstream beta can extend on expectations while the tool layer is still clearing physical limits. When downstream multiples compress or stabilize while EUV timing stays tight, or when ASML begins to outperform while GPU-heavy semiconductors stall, the original dispersion has largely normalized and the setup described above has largely played through.',
    diagramCaption:
      'Hyperscaler AI demand branches into GPU-led spending and fab ramps; both bind on finite EUV allocation before reaching ASML-supplied EUV capacity.',
    action:
      'The obvious side is buy ASML when GPU-heavy semis have ripped and ASML still looks flat against them. You are paying for the lithography choke point while the crowd pays for the louder downstream story, and that mismatch is what this note is about. When ASML later jumps ahead while those names stall, take profits instead of chasing more. Sell only if people start acting like EUV tools are easy to get again or fabs seriously pull back on cutting-edge builds, because then the scarcity story falls apart.',
  }
}

function boshaAtyrText() {
  return {
    title:
      'EFZO-FIT finished enrollment while still blinded. The protocol and SAP lean hard on a mean-OCS primary that is messy statistically, so the stock is basically a catalyst flip until real tables drop.',
    subtitle: 'aTyr Pharma, ticker ATRY, May 2026. Blinded dossier only (mock).',
    intro:
      'This note pulls only from documents. ClinicalTrials.gov, enrollment updates, what the company says about clinical risk, blinded safety tables. You cannot defend an efficacy claim until topline. EFZO-FIT (NCT05415137) is sarcoidosis with three arms at 5 mg per kg, 3 mg per kg, and placebo. Enrollment hit 268 against a 264 target. Placebo is real and the N matters. The SAP emphasizes absolute change from baseline in mean daily oral steroid dose at week 48. That is what regulators stare at first. Everything else is narrative until you see milligrams per day with spread. EFZO-CONNECT (NCT05892614) is a separate SSc-ILD proof-of-concept with about 25 patients and placebo. It can reveal a monster effect if one exists. It cannot statistically rescue Phase 3 if the pivotal mean-OCS line fails.',
    priceCaption:
      'ATYR only. Price is mostly enthusiasm minus hard facts. If the stock rips before anyone has deltas and confidence intervals, that is guessing.',
    middle:
      'Beating the enrollment target helps operations. It does not tighten the error bars on a mean steroid taper when placebo arms also step down on the same visit cadence baked into the protocol. A hit on the week-48 OCS primary can still be a coin toss unless the drug separation is huge. Patients miss doses and titrate differently, which can chew through several mg per day at the cohort level. Blinded safety updates so far have not screamed a toxicity spiral, which is the one qualitative cushion for holders into the print. Connect is small, tens of patients. If Phase 3 misses, that PoC does not prove you get approval. It only shows biology at a scale too tiny to fix power. Off documents alone, odds on clearing the written primary look low to middling. Steroid-free rate and lung numbers could still move how people trade if the separation is clean, because doctors care about those even when the headline mean-dose fight is noisy.',
    diagramCaption:
      'Filings and trial registries link EFZO-FIT and EFZO-CONNECT. The FDA still wants both paths to tell one approvable story before the name reprices.',
    action:
      'Blinded-file view says do not add fresh equity before unblinding. A long here is mostly variance on a mean-OCS endpoint that fights clean stats. Trim or hedge into any pre-data rally. If someone wants to gamble the print, use structures where downside is capped, like options. Buying more common into a binary FDA-style read without tables is how retail accounts vaporize. After topline, focus on what actually prints. Mean change in daily oral steroids with confidence intervals, steroid-free rates, FVC and the other pulmonary rows. Until then the protocol stack is the whole thesis.',
  }
}

function BoshaPaperPanel({
  ticker,
  companyName,
  entities,
  events,
  edges,
  priceSeries,
  livePresentation,
  liveCompanyName,
  backendUp,
}) {
  const priceHeadline = useMemo(() => {
    const vals = Array.isArray(priceSeries) ? priceSeries : []
    const last = vals.length ? vals.at(-1) : null
    const prev = vals.length > 1 ? vals.at(-2) : null
    const ch = last != null && prev != null ? last - prev : null
    const chPct = last != null && prev ? ((last - prev) / Math.max(1e-6, prev)) * 100 : null
    const up = ch != null ? ch >= 0 : true
    return { last, ch, chPct, up }
  }, [priceSeries])

  const titleText =
    backendUp && livePresentation?.title && String(liveCompanyName ?? '').trim()
      ? String(liveCompanyName ?? '').trim()
      : String(companyName ?? '').trim() || String(ticker ?? '—').toUpperCase()
  const memo = useMemo(
    () =>
      boshaThesisMemo({
        ticker,
        companyName: titleText,
        events,
        priceSeries,
        constituents: boshaIsEtf(ticker) ? boshaDatasetForTicker(ticker)?.constituents ?? [] : [],
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ticker, titleText, events, priceSeries],
  )

  return (
    <section className="panel boshaPaper" aria-label={titleText}>
      <header className="feedCompactHeader">
        <div className="panelTitle feedCompactTitle">{titleText}</div>
        <div className="feedCompactMeta" aria-hidden="true" />
      </header>
      <div className="boshaPaperBody scrollThin">
        <div className="boshaPaperDoc">
          {(() => {
            const u = String(ticker ?? '').toUpperCase()
            if (backendUp && livePresentation?.title) {
              const pres = livePresentation
              const sub = pres.subtitle || ''
              return (
                <>
                  <div className="boshaPaperTitleBlock">
                    <div className="boshaPaperTitle boshaThesisTitle">{pres.title}</div>
                    <div className="boshaPaperSubtitle mono dim">{sub}</div>
                  </div>
                  <div className="boshaThesisBody">
                    {(pres.blocks || []).map((b, i) => {
                      if (b.type === 'paragraph') {
                        return (
                          <p className="boshaThesisP" key={`bp-${i}`}>
                            {b.text}
                          </p>
                        )
                      }
                      if (b.type === 'price') {
                        return (
                          <div key={`bpr-${i}`}>
                            <BoshaMiniPrice
                              series={priceSeries}
                              label={String(ticker ?? 'PRICE').toUpperCase()}
                              showMeta={false}
                            />
                            <div className="boshaFigureCaption boshaFigureCaption--tight boshaFigureCaption--break mono dim">
                              {b.caption}
                            </div>
                          </div>
                        )
                      }
                      if (b.type === 'diagram') {
                        return (
                          <div key={`bdg-${i}`}>
                            <BoshaCausalDiagram ticker={ticker} diagramSpec={pres.diagram} />
                            <div className="boshaFigureCaption boshaFigureCaption--tight boshaFigureCaption--break mono dim">
                              {b.caption}
                            </div>
                          </div>
                        )
                      }
                      return null
                    })}
                    {Array.isArray(pres.explainer) && pres.explainer.length ? (
                      <ul className="boshaExplainerList" style={{ margin: '0.75rem 0 0', paddingLeft: '1.1rem' }}>
                        {pres.explainer.map((line, j) => (
                          <li className="boshaThesisP" key={`ex-${j}`} style={{ marginBottom: '0.35rem' }}>
                            {line}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </>
              )
            }
            if (u === 'ASML') {
              const asml = boshaAsmlText()
              return (
                <>
                  <div className="boshaPaperTitleBlock">
                    <div className="boshaPaperTitle boshaThesisTitle">{asml.title}</div>
                    <div className="boshaPaperSubtitle mono dim">{asml.subtitle}</div>
                  </div>

                  <div className="boshaThesisBody">
                    <p className="boshaThesisP">{asml.intro}</p>

                    <BoshaMiniPrice series={priceSeries} label={String(ticker ?? 'PRICE').toUpperCase()} showMeta={false} />
                    <div className="boshaFigureCaption boshaFigureCaption--tight boshaFigureCaption--break mono dim">
                      {asml.priceCaption}
                    </div>

                    <p className="boshaThesisP">{asml.middle}</p>

                    <BoshaCausalDiagram ticker={ticker} />
                    <div className="boshaFigureCaption boshaFigureCaption--tight boshaFigureCaption--break mono dim">
                      {asml.diagramCaption}
                    </div>

                    <p className="boshaThesisP">{asml.action}</p>
                  </div>
                </>
              )
            }
            if (u === 'ATYR') {
              const ph = boshaAtyrText()
              return (
                <>
                  <div className="boshaPaperTitleBlock">
                    <div className="boshaPaperTitle boshaThesisTitle">{ph.title}</div>
                    <div className="boshaPaperSubtitle mono dim">{ph.subtitle}</div>
                  </div>

                  <div className="boshaThesisBody">
                    <p className="boshaThesisP">{ph.intro}</p>

                    <BoshaMiniPrice series={priceSeries} label={String(ticker ?? 'PRICE').toUpperCase()} showMeta={false} />
                    <div className="boshaFigureCaption boshaFigureCaption--tight boshaFigureCaption--break mono dim">
                      {ph.priceCaption}
                    </div>

                    <p className="boshaThesisP">{ph.middle}</p>

                    <BoshaCausalDiagram ticker={ticker} />
                    <div className="boshaFigureCaption boshaFigureCaption--tight boshaFigureCaption--break mono dim">
                      {ph.diagramCaption}
                    </div>

                    <p className="boshaThesisP">{ph.action}</p>
                  </div>
                </>
              )
            }
            return (
              <>
                <div className="boshaPaperTitleBlock">
                  <div className="boshaPaperTitle boshaThesisTitle">{memo.title}</div>
                  <div className="boshaPaperSubtitle mono dim">
                    {String(ticker ?? '').toUpperCase()} — {memo.created}
                  </div>
                </div>

                <div className="boshaThesisBody">
                  <p className="boshaThesisP">{memo.openingA}</p>
                  <p className="boshaThesisP">{memo.openingB}</p>
                  <p className="boshaThesisP">{memo.priceRef}</p>

                  <BoshaMiniPrice series={priceSeries} label={String(ticker ?? 'PRICE').toUpperCase()} showMeta={false} />
                  <div className="boshaFigureCaption boshaFigureCaption--tight boshaFigureCaption--break mono dim">
                    Price chart shows {memo.chartX}.
                  </div>

                  <p className="boshaThesisP">{memo.core}</p>

                  <BoshaCausalDiagram ticker={ticker} />
                  <div className="boshaFigureCaption boshaFigureCaption--tight boshaFigureCaption--break mono dim">
                    Diagram summarizes how early process signals turn into positioning, a dated catalyst, and eventual repricing.
                  </div>

                  <p className="boshaThesisP">{memo.final}</p>
                </div>
              </>
            )
          })()}
        </div>
      </div>
    </section>
  )
}

function buildPharmaFeedRows() {
  function pharmaImportanceLabel(phase) {
    const p = String(phase ?? '')
    if (/III/i.test(p)) return 'Lead'
    if (/II/i.test(p)) return 'Core'
    return 'Early'
  }

  function pharmaProgressLabel(eventType) {
    const t = String(eventType ?? '').toUpperCase()
    if (t === 'READOUT' || t === 'ENDPOINT MISS') return 'Result'
    if (t === 'SITE START') return 'Active'
    if (t === 'FDA UPDATE') return 'Ongoing'
    if (t === 'DELAY') return 'Ongoing'
    return 'Active'
  }

  function pharmaPhaseNumeral(phase) {
    const p = String(phase ?? '')
    if (/III/i.test(p) || /\b3\b/.test(p)) return 'III'
    if (/II/i.test(p) || /\b2\b/.test(p)) return 'II'
    if (/I/i.test(p) || /\b1\b/.test(p)) return 'I'
    return ''
  }

  function pharmaFeedLabel(ev) {
    const phase = ev?.phase ?? ev?.trialSnapshot?.phase ?? 'Phase'
    const imp = pharmaImportanceLabel(phase)
    const status = String(ev?.timelineDetails?.status ?? '').toLowerCase()
    const typeState = pharmaProgressLabel(ev?.eventType)
    const state =
      status.includes('completed')
        ? 'Completed'
        : status.includes('recruiting')
          ? 'Ongoing'
          : status.includes('active')
            ? 'Active'
            : status.includes('not recruiting')
              ? 'Near Completion'
              : typeState
    const numeral = pharmaPhaseNumeral(phase)
    return `${imp} ${numeral || phase} ${state}`.replace(/\bPhase\s*/i, '').trim()
  }

  const fromTrials = MOCK_EVENTS.map((ev) => ({
    id: `ph-${ev.id}`,
    label: pharmaFeedLabel(ev),
    ticker: tickerFromDrug(ev.drug),
    at: parseMockTs(ev.ts).toISOString(),
    trialEventId: ev.id,
  }))
  const PHARMA_FILLER_LABELS = [
    'Enrollment pause',
    'Primary endpoint',
    'IND cleared',
    'Orphan designation',
    'Fast track',
    'Breakthrough',
    'SAP update',
    'DSMB review',
    'Site activation',
    'Label expansion',
    'Completion forecast',
  ]
  const fillerTickers = ['BLUE', 'ALNY', 'ROG', 'GILD', 'MRNA', 'NBIX']
  const filler = Array.from({ length: 30 }, (_, i) => {
    const t = new Date()
    if (i % 9 === 0) {
      t.setMinutes(t.getMinutes() - i * 3 - 11)
    } else if (i % 9 < 5) {
      t.setDate(t.getDate() - 2 - (i % 4))
      t.setHours(10 + (i % 8), (i * 5) % 60, 0, 0)
    } else {
      t.setFullYear(t.getFullYear() - 1 - (i % 2))
      t.setMonth((i % 12) + 1, 5 + (i % 20))
    }
    return {
      id: `ph-f-${i}`,
      label: pharmaFeedLabel(MOCK_EVENTS[i % MOCK_EVENTS.length]),
      ticker: fillerTickers[i % fillerTickers.length],
      at: t.toISOString(),
      trialEventId: MOCK_EVENTS[i % MOCK_EVENTS.length].id,
    }
  })
  return [...fromTrials, ...filler]
}

const PHARMA_FEED_ROWS = sortFeedRowsByAtDesc(buildPharmaFeedRows())

/** Historical Outcomes tile (blankTile--a): mock aggregates + conditioning facets */
const MOCK_HISTORICAL_INSIDER = {
  avgReturn21d63d252d: '+0.42% / +1.08% / +2.34%',
  medianReturn: '+0.61%',
  winRate: '54%',
  sampleSize: '12,480',
  conditioningRole: 'CEO | director',
  conditioningTxn: 'Buy | sell',
  conditioningSizePct: 'P40–P90',
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
  industry: 'Pharmaceuticals',
  country: 'US',
  mcap: '$8.46M USD',
  earnings: '5 Aug',
  /** Shown only when pharma feed is focused */
  pharmaPrograms: '1×III | 1×II | 1×I',
  pharmaLead: `DrugX (III – Alzheimer's)`,
}

function toPath(values, w, h, inset) {
  if (!values?.length) return ''
  const { left = 0, right = 0, top = 0, bottom = 0 } = inset ?? {}
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const innerW = Math.max(1, w - left - right)
  const innerH = Math.max(1, h - top - bottom)
  return values
    .map((v, i) => {
      const x = left + (i / (values.length - 1)) * innerW
      const y = top + (1 - (v - min) / span) * innerH
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
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
  if (x >= 100) return String(Math.round(x))
  if (x >= 10) return x.toFixed(1)
  return x.toFixed(2)
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

/** Demo data until a top-picks API exists; `pct` is period return (%). */
const MAIN_TOP_PICKS_DEMO = [
  { ticker: 'NVDA', pct: 12.2 },
  { ticker: 'AMD', pct: 5.4 },
  { ticker: 'LLY', pct: 3.8 },
  { ticker: 'META', pct: -1.6 },
  { ticker: 'DELL', pct: 7.9 },
  { ticker: 'AAPL', pct: 2.3 },
  { ticker: 'MSFT', pct: 4.1 },
  { ticker: 'AVGO', pct: 8.6 },
  { ticker: 'TSLA', pct: -3.2 },
  { ticker: 'COIN', pct: 6.5 },
  { ticker: 'MU', pct: -0.8 },
  { ticker: 'AMZN', pct: 1.9 },
]

/** Mock “opportunity board” sourced from BOSHA-style papers; size = opportunity score (0–100). */
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

function shuffleStable(xs, salt = 0) {
  const arr = xs.slice()
  arr.sort((a, b) => stringHash01(a?.ticker, salt) - stringHash01(b?.ticker, salt))
  return arr
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
    // Greedy balance split (list is expected sorted by area desc).
    const a = []
    const b = []
    let sa = 0
    let sb = 0
    for (const it of list) {
      if (sa <= sb) {
        a.push(it)
        sa += it.area
      } else {
        b.push(it)
        sb += it.area
      }
    }
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
    const headerH = Math.max(18, Math.min(28, Math.round(H * 0.06)))

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

    // Order affects binary splits; keep it stable but not “all biggest in one corner”.
    sectorRaw.sort(
      (a, b) =>
        b.weight - a.weight ||
        stringHash01(a.sector, 501) - stringHash01(b.sector, 501) ||
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

      raw.sort(
        (a, b) =>
          b.weight - a.weight || stringHash01(a.ticker, 207) - stringHash01(b.ticker, 207) || a.ticker.localeCompare(b.ticker),
      )

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
              <div className="oppScore mono">
                {it.pct >= 0 ? '+' : ''}
                {it.pct.toFixed(1)}%
              </div>
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

const MainTopPicksBarChart = memo(function MainTopPicksBarChart({ bars = MAIN_TOP_PICKS_DEMO }) {
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
  const list = Array.isArray(bars) && bars.length ? bars : MAIN_TOP_PICKS_DEMO
  const pcts = list.map((b) => b.pct)
  const rawMin = Math.min(0, ...pcts)
  const rawMax = Math.max(0, ...pcts)
  const span0 = rawMax - rawMin || 1
  const pad = Math.max(span0 * 0.1, 0.5)
  let yMin = rawMin - pad
  let yMax = rawMax + pad
  if (yMax - yMin < 3) {
    const mid = (yMin + yMax) / 2
    yMin = mid - 1.5
    yMax = mid + 1.5
  }
  const ySpan = yMax - yMin || 1

  function yAt(v) {
    return margin.t + (1 - (v - yMin) / ySpan) * innerH
  }

  const y0 = yAt(0)
  const yTicks = useMemo(() => pctAxisTicks(yMin, yMax, 4), [yMin, yMax])
  const n = list.length
  const slot = innerW / Math.max(1, n)
  const barW = Math.max(4, slot * 0.46)

  return (
    <div ref={wrapRef} className="graphWrap" aria-label="Top picks ticker performance">
      <svg className="graphSvg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" role="img">
        <path
          className="graphAxis"
          d={`M ${margin.l} ${margin.t} L ${margin.l} ${h - margin.b} L ${w - margin.r} ${h - margin.b}`}
        />
        {yTicks.map((v, i) => {
          const y = yAt(v)
          return (
            <g key={`yt-${i}`}>
              <text className="graphTick graphTick--y" x={margin.l - 6} y={y + 4}>
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
    </div>
  )
})

function GraphPanel({ title, series, dates, markers = [], selectedMarker = null }) {
  const wrapRef = useRef(null)
  const [size, setSize] = useState({ w: 900, h: 220 })

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
    sync()
    return () => ro.disconnect()
  }, [])

  const w = size.w
  const h = size.h

  // Inner margins (in SVG px). Keep these tight so the plot fills the large panel.
  const margin = { l: 26, r: 6, t: 8, b: 18 }
  const innerW = Math.max(1, w - margin.l - margin.r)
  const innerH = Math.max(1, h - margin.t - margin.b)

  const vals = Array.isArray(series) ? series : []
  const ds = Array.isArray(dates) ? dates : []

  const min = vals.length ? Math.min(...vals) : 0
  const max = vals.length ? Math.max(...vals) : 1
  const span = max - min || 1

  function xAt(i) {
    return margin.l + (i / Math.max(1, vals.length - 1)) * innerW
  }
  function yAt(v) {
    return margin.t + (1 - (v - min) / span) * innerH
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
  }, [vals, w, h])

  const yTicks = useMemo(() => priceTicks(min, max, 4), [min, max])
  const xTickIdx = useMemo(() => {
    const n = Math.max(0, ds.length)
    if (n <= 1) return []
    return [0.08, 0.32, 0.56, 0.8].map((p) => Math.round(clamp01(p) * (n - 1)))
  }, [ds.length])

  const markerX = useMemo(() => {
    const n = Math.max(0, ds.length)
    if (n <= 1) return []
    const now = new Date()
    const dayKey = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const dayToIdx = new Map()
    for (let i = 0; i < ds.length; i++) {
      const d = ds[i]
      if (!(d instanceof Date) || Number.isNaN(d.getTime())) continue
      dayToIdx.set(dayKey(d), i)
    }
    const seen = new Set()
    const xs = []
    for (const m of markers ?? []) {
      const d = m instanceof Date ? m : new Date(m)
      if (Number.isNaN(d.getTime())) continue
      const key = dayKey(d)
      if (seen.has(key)) continue
      seen.add(key)
      const idxFromSeries = dayToIdx.get(key)
      const idx =
        typeof idxFromSeries === 'number'
          ? idxFromSeries
          : (() => {
              const daysAgo = Math.floor((now.getTime() - d.getTime()) / 86400000)
              return clamp(n - 1 - daysAgo, 0, n - 1)
            })()
      xs.push(xAt(idx))
    }
    return xs
  }, [markers, ds.length, w, h])

  const selectedMarkerX = useMemo(() => {
    const n = Math.max(0, ds.length)
    if (n <= 1 || !selectedMarker) return null
    const d = selectedMarker instanceof Date ? selectedMarker : new Date(selectedMarker)
    if (Number.isNaN(d.getTime())) return null
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    for (let i = 0; i < ds.length; i++) {
      const x = ds[i]
      if (!(x instanceof Date) || Number.isNaN(x.getTime())) continue
      const k = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
      if (k === key) return xAt(i)
    }
    const now = new Date()
    const daysAgo = Math.floor((now.getTime() - d.getTime()) / 86400000)
    const idx = clamp(n - 1 - daysAgo, 0, n - 1)
    return xAt(idx)
  }, [selectedMarker, ds, w, h])

  return (
    <section className="panel graph" aria-label="Daily graph">
      <header className="panelHeader">
        <div className="panelTitle">{title}</div>
        <div className="panelMeta">
          L {vals.length ? vals[vals.length - 1] : 0} | R {min}–{max}
        </div>
      </header>
      <div ref={wrapRef} className="graphWrap" aria-label="Daily price graph">
        <svg className="graphSvg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" role="img">
          {/* axes */}
          <path
            className="graphAxis"
            d={`M ${margin.l} ${margin.t} L ${margin.l} ${h - margin.b} L ${w - margin.r} ${h - margin.b}`}
          />

          {/* y ticks */}
          {yTicks.map((v, i) => {
            const y = yAt(v)
            return (
              <g key={`yt-${i}`}>
                <text className="graphTick graphTick--y" x={margin.l - 6} y={y + 4}>
                  {formatPriceTick(v)}
                </text>
                <path className="graphTickLine" d={`M ${margin.l} ${y} L ${margin.l + 6} ${y}`} />
              </g>
            )
          })}

          {/* x ticks */}
          {xTickIdx.map((idx, i) => {
            const x = xAt(idx)
            const d = ds[idx]
            const label = d ? MONTHS_SHORT[d.getMonth()] : EMPTY
            return (
              <g key={`xt-${i}`}>
                <path className="graphTickLine" d={`M ${x} ${h - margin.b} L ${x} ${h - margin.b - 6}`} />
                <text className="graphTick graphTick--x" x={x} y={h - 4}>
                  {label}
                </text>
              </g>
            )
          })}

          {/* line */}
          <path className="graphPath" d={path} vectorEffect="non-scaling-stroke" />

          {/* transaction markers (drawn over line) */}
          {markerX.map((x, i) => (
            <path
              key={`m-${i}`}
              className="graphMarker"
              d={`M ${x.toFixed(2)} ${margin.t} L ${x.toFixed(2)} ${(h - margin.b).toFixed(2)}`}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {selectedMarkerX != null ? (
            <path
              className="graphMarker graphMarker--selected"
              d={`M ${selectedMarkerX.toFixed(2)} ${margin.t} L ${selectedMarkerX.toFixed(2)} ${(h - margin.b).toFixed(2)}`}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>
      </div>
    </section>
  )
}

const ENDPOINT_ORDINAL = [
  'First',
  'Second',
  'Third',
  'Fourth',
  'Fifth',
  'Sixth',
  'Seventh',
  'Eighth',
  'Ninth',
  'Tenth',
]

function endpointRowLabel(idx) {
  if (idx === 0) return 'Primary endpoint'
  if (idx === 1) return 'Secondary endpoint'
  const ord = ENDPOINT_ORDINAL[idx]
  return ord ? `${ord} endpoint` : `Endpoint ${idx + 1}`
}

/** Long text in key/value cells (row height comes from `KvLine`). */
function WorksheetRhythmWrap({ className = '', children }) {
  return <span className={className}>{children}</span>
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

/** Strip role tags from the copy when the row label already states primary / secondary / …. */
function endpointDisplayValue(raw, idx) {
  const s = String(raw ?? '').trim()
  if (!s) return EMPTY

  let out = s

  if (idx === 0) {
    out = out.replace(/^\s*Primary\s*:\s*/i, '').trim()
    return out || EMPTY
  }

  out = out.replace(/^\s*Secondary\s*:\s*/i, '').trim()

  const extraRoles = ['Tertiary', 'Quaternary', 'Quinary', 'Senary']
  if (idx >= 2 && idx - 2 < extraRoles.length) {
    const re = new RegExp(`^\\s*${extraRoles[idx - 2]}\\s*:\\s*`, 'i')
    out = out.replace(re, '').trim()
  }

  return out || EMPTY
}

/** Insider case worksheet: keys are document / transaction descriptors; Form 4 rows get "$ | day". */
function buildInsiderWorksheetRows(caseSheet) {
  if (!caseSheet) return []

  const rows = []
  rows.push(
    <KvLine key="issuer">
      <span className="kvK dim">Issuer</span>
      <span className="kvV mono">{caseSheet.ticker ?? '—'}</span>
    </KvLine>,
    <KvLine key="form">
      <span className="kvK dim">Form</span>
      <span className="kvV mono">{caseSheet.formType ?? '—'}</span>
    </KvLine>,
    <KvLine key="fno">
      <span className="kvK dim">Accession</span>
      <span className="kvV mono">{caseSheet.filingId ?? '—'}</span>
    </KvLine>,
    <KvLine key="after-filing-meta" className="kvSpacer" aria-hidden="true">
      <span className="kvK">&nbsp;</span>
      <span className="kvV">&nbsp;</span>
    </KvLine>,
  )

  const showMoney = Boolean(caseSheet.isForm4)

  function roleFromKey(key) {
    const k = String(key ?? '').trim()
    const m = k.match(/^(CEO|Director|CFO|Officer)\b/i)
    if (m) return m[1].toUpperCase()
    const first = k.split(/\s+/)[0]
    return first ? first.toUpperCase() : '—'
  }

  ;(caseSheet.rows ?? []).forEach((r, idx) => {
    const val =
      showMoney && r.amountUsd != null && Number(r.amountUsd) > 0
        ? `${formatUsdCompact(r.amountUsd)} | ${insiderTxnDateShort(r.ts)}`
        : ''
    rows.push(
      <KvLine key={`txn-${idx}-${r.key}`}>
        <WorksheetRhythmWrap className="kvK dim">{roleFromKey(r.key)}</WorksheetRhythmWrap>
        <span className={`kvV mono ${val ? '' : 'dim'}`}>{val}</span>
      </KvLine>,
    )
  })

  return rows
}

function buildWorksheetRows(selected, hasSafety) {
  const rows = []
  if (!selected) return []

  rows.push(
    <KvLine key="drug">
      <span className="kvK dim">DRUG</span>
      <span className="kvV mono">{selected?.trialSnapshot?.drug ?? '—'}</span>
    </KvLine>,
    <KvLine key="mech">
      <span className="kvK dim">MECH</span>
      <span className="kvV">{selected?.trialSnapshot?.mechanism ?? '—'}</span>
    </KvLine>,
    <KvLine key="phase">
      <span className="kvK dim">PHASE</span>
      <span className="kvV mono">{selected?.trialSnapshot?.phase ?? '—'}</span>
    </KvLine>,
    <KvLine key="ind">
      <span className="kvK dim">IND</span>
      <span className="kvV">{selected?.trialSnapshot?.indication ?? '—'}</span>
    </KvLine>,
    <KvLine key="sponsor">
      <span className="kvK dim">SPONSOR</span>
      <span className="kvV">{selected?.trialSnapshot?.sponsor ?? '—'}</span>
    </KvLine>,
    <KvLine key="origin">
      <span className="kvK dim">ORIGIN</span>
      <span className="kvV">{selected?.trialSnapshot?.assetOrigin ?? '—'}</span>
    </KvLine>,
    <KvLine key="intv">
      <span className="kvK dim">INTV</span>
      <span className="kvV">{selected?.trialSnapshot?.intervention ?? '—'}</span>
    </KvLine>,
    <KvLine key="status">
      <span className="kvK dim">STATUS</span>
      <span className="kvV">{selected?.timelineDetails?.status ?? '—'}</span>
    </KvLine>,
    <KvLine key="start">
      <span className="kvK dim">START</span>
      <span className="kvV mono">{selected?.timelineDetails?.studyStart ?? '—'}</span>
    </KvLine>,
    <KvLine key="priComp">
      <span className="kvK dim">PRI COMP</span>
      <span className="kvV mono">{selected?.timelineDetails?.primaryCompletion ?? '—'}</span>
    </KvLine>,
    <KvLine key="studyComp">
      <span className="kvK dim">STUDY COMP</span>
      <span className="kvV mono">{selected?.timelineDetails?.studyCompletion ?? '—'}</span>
    </KvLine>,
    <KvLine key="source">
      <span className="kvK dim">SOURCE</span>
      <span className="kvV">{selected?.timelineDetails?.eventSource ?? '—'}</span>
    </KvLine>,
    <KvLine key="detail">
      <span className="kvK dim">DETAIL</span>
      <span className="kvV">{selected?.timelineDetails?.eventSubtype ?? '—'}</span>
    </KvLine>,
    <KvLine key="evt">
      <span className="kvK dim">EVT</span>
      <span className="kvV">{selected?.eventType ?? '—'}</span>
    </KvLine>,
    <KvLine key="arms">
      <span className="kvK dim">ARMS</span>
      <span className="kvV">{selected?.studyDesign?.arms ?? '—'}</span>
    </KvLine>,
    <KvLine key="rand">
      <span className="kvK dim">RAND</span>
      <span className="kvV">{selected?.studyDesign?.randomization ?? '—'}</span>
    </KvLine>,
    <KvLine key="ctrl">
      <span className="kvK dim">CTRL</span>
      <span className="kvV">{selected?.studyDesign?.control ?? '—'}</span>
    </KvLine>,
    <KvLine key="mask">
      <span className="kvK dim">MASK</span>
      <span className="kvV">{selected?.studyDesign?.masking ?? '—'}</span>
    </KvLine>,
    <KvLine key="n">
      <span className="kvK dim">N</span>
      <span className="kvV mono">{selected?.studyDesign?.sampleSize ?? '—'}</span>
    </KvLine>,
    <KvLine key="cond">
      <span className="kvK dim">COND</span>
      <WorksheetRhythmWrap className="kvV kvVWrap">
        {selected?.population?.condition ?? '—'}
      </WorksheetRhythmWrap>
    </KvLine>,
    <KvLine key="bio">
      <span className="kvK dim">BIO</span>
      <WorksheetRhythmWrap className="kvV kvVWrap">
        {selected?.population?.biomarkers ?? '—'}
      </WorksheetRhythmWrap>
    </KvLine>,
    <KvLine key="lot">
      <span className="kvK dim">LOT</span>
      <span className="kvV mono">{selected?.population?.lineOfTherapy ?? '—'}</span>
    </KvLine>,
  )

  const eps = selected?.endpointsResults?.endpoints ?? []
  if (eps.length === 0) {
    rows.push(
      <KvLine key="ep-empty">
        <span className="kvK dim">Endpoints</span>
        <span className="kvV dim">—</span>
      </KvLine>,
    )
  } else {
    eps.forEach((e, idx) => {
      rows.push(
        <KvLine key={`ep-${idx}-${e}`}>
          <span className="kvK dim">{endpointRowLabel(idx)}</span>
          <WorksheetRhythmWrap className="kvV kvVWrap">
            {endpointDisplayValue(e, idx)}
          </WorksheetRhythmWrap>
        </KvLine>,
      )
    })
  }

  const res = selected?.endpointsResults?.results ?? []
  if (res.length === 0) {
    rows.push(
      <KvLine key="res-empty">
        <span className="kvK dim">Results</span>
        <span className="kvV dim">—</span>
      </KvLine>,
    )
  } else {
    res.forEach((r, idx) => {
      rows.push(
        <KvLine key={`res-${idx}-${r.endpoint}`}>
          <WorksheetRhythmWrap className="kvK dim kvLong">{r.endpoint}</WorksheetRhythmWrap>
          <span className="kvV mono">{r.value}</span>
        </KvLine>,
      )
    })
  }

  if (!hasSafety) {
    rows.push(
      <KvLine key="safe-empty">
        <span className="kvK dim">Safety</span>
        <span className="kvV dim">—</span>
      </KvLine>,
    )
  } else {
    selected.safety.forEach((s, idx) => {
      rows.push(
        <KvLine key={`safe-${idx}-${s.term}`}>
          <WorksheetRhythmWrap className="kvK dim kvLong">{s.term}</WorksheetRhythmWrap>
          <span className="kvV mono">{s.value}</span>
        </KvLine>,
      )
    })
  }

  return rows
}

function HistoricalOutcomesPanel({ mode, backendUp }) {
  const insider = mode === 'insider'
  const [live, setLive] = useState(null)

  useEffect(() => {
    let alive = true
    async function run() {
      try {
        const m = insider ? 'insider' : 'pharma'
        const r = await fetchJsonSafe(`/api/outcomes?mode=${encodeURIComponent(m)}`, { timeoutMs: 2500 })
        const json = r.data
        const data = json?.data ?? null
        if (!alive) return
        setLive(data && typeof data === 'object' ? data : null)
      } catch {
        if (!alive) return
        setLive(null)
      }
    }
    run()
    const t = setInterval(run, 30_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [insider])

  const ins = backendUp
    ? live
    : insider
      ? live ?? MOCK_HISTORICAL_INSIDER
      : live ?? MOCK_HISTORICAL_TRIALS

  const norm = (v) => {
    if (v == null) return EMPTY
    let s = String(v)
    // Avoid mixed dash glyphs in UI.
    s = s.replace(/—/g, '-').trim()
    if (!s) return EMPTY
    if (s === '0' || s === '0.0' || s === '0%' || s === '0.00%') return EMPTY
    return s
  }

  const sampleSizeNum = (() => {
    if (!ins) return null
    const raw = ins.sampleSize
    const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(/[^\d.-]/g, ''))
    return Number.isFinite(n) ? n : null
  })()

  const hasDataset = sampleSizeNum != null ? sampleSizeNum > 0 : Boolean(ins && ins.sampleSize)

  return (
    <section className="panel historicalOutcomes blankTile--a" aria-label="Historical outcomes">
      <header className="feedCompactHeader">
        <div className="panelTitle feedCompactTitle">HISTORICAL OUTCOMES</div>
      </header>
      <div className="worksheetBody historicalOutcomesBody">
        {insider ? (
          <>
            {(() => {
              const raw = hasDataset ? norm(ins?.avgReturn21d63d252d) : EMPTY
              const parts = String(raw ?? '')
                .split('/')
                .map((s) => s.trim())
                .filter(Boolean)
              const v21 = parts[0] ?? EMPTY
              const v63 = parts[1] ?? EMPTY
              const v252 = parts[2] ?? EMPTY
              return (
                <>
                  <KvLine key="ho-ins-avg-21">
                    <span className="kvK dim">Avg return 21d</span>
                    <span className="kvV mono">{v21}</span>
                  </KvLine>
                  <KvLine key="ho-ins-avg-63">
                    <span className="kvK dim">Avg return 63d</span>
                    <span className="kvV mono">{v63}</span>
                  </KvLine>
                  <KvLine key="ho-ins-avg-252">
                    <span className="kvK dim">Avg return 252d</span>
                    <span className="kvV mono">{v252}</span>
                  </KvLine>
                </>
              )
            })()}
            <KvLine key="ho-ins-med">
              <span className="kvK dim">Median return</span>
              <span className="kvV mono">{hasDataset ? norm(ins?.medianReturn) : EMPTY}</span>
            </KvLine>
            <KvLine key="ho-ins-win">
              <span className="kvK dim">Win rate</span>
              <span className="kvV mono">{hasDataset ? norm(ins?.winRate) : EMPTY}</span>
            </KvLine>
            <KvLine key="ho-ins-n">
              <span className="kvK dim">Sample size</span>
              <span className="kvV mono">{hasDataset ? (ins?.sampleSize ?? EMPTY) : EMPTY}</span>
            </KvLine>
            <KvLine key="ho-ins-role">
              <span className="kvK dim">Role</span>
              <span className="kvV">{hasDataset ? norm(ins?.conditioningRole) : EMPTY}</span>
            </KvLine>
            <KvLine key="ho-ins-pct">
              <span className="kvK dim">Size percentile</span>
              <span className="kvV mono">{hasDataset ? norm(ins?.conditioningSizePct) : EMPTY}</span>
            </KvLine>
          </>
        ) : (
          <>
            <KvLine key="ho-ph-p3">
              <span className="kvK dim">Phase 3 failure</span>
              <span className="kvV mono">{hasDataset ? norm(ins?.avgAfterPh3Failure) : EMPTY}</span>
            </KvLine>
            <KvLine key="ho-ph-p2">
              <span className="kvK dim">Phase 2 miss</span>
              <span className="kvV mono">{hasDataset ? norm(ins?.avgAfterPh2Miss) : EMPTY}</span>
            </KvLine>
            <KvLine key="ho-ph-med">
              <span className="kvK dim">Median return</span>
              <span className="kvV mono">{hasDataset ? norm(ins?.medianReturn) : EMPTY}</span>
            </KvLine>
            <KvLine key="ho-ph-drop">
              <span className="kvK dim">{'% large drops (>30%)'}</span>
              <span className="kvV mono">{hasDataset ? norm(ins?.pctLargeDropsOver30) : EMPTY}</span>
            </KvLine>
            <KvLine key="ho-ph-n">
              <span className="kvK dim">Sample size</span>
              <span className="kvV mono">{hasDataset ? (ins?.sampleSize ?? EMPTY) : EMPTY}</span>
            </KvLine>
            <KvLine key="ho-ph-ind">
              <span className="kvK dim">Indication</span>
              <span className="kvV">{hasDataset ? norm(ins?.conditioningIndication) : EMPTY}</span>
            </KvLine>
            <KvLine key="ho-ph-co">
              <span className="kvK dim">Company size bucket</span>
              <span className="kvV">{hasDataset ? norm(ins?.conditioningCoSize) : EMPTY}</span>
            </KvLine>
          </>
        )}
        </div>
    </section>
  )
}

function stripPrimaryLabel(s) {
  return String(s ?? '')
    .replace(/^Primary:\s*/i, '')
    .replace(/^Secondary:\s*/i, '')
    .trim()
}

/** Readable mechanism chip (drops unexplained abbreviations where we can). */
function plainMechanismSnippet(mech) {
  let m = String(mech ?? '').trim()
  if (!m) return ''
  m = m.replace(/\bmAb\b/gi, 'monoclonal antibody')
  m = m.replace(/\bASO\b/g, 'antisense oligonucleotide')
  return m
}

/**
 * Turn coded intervention strings into one plain sentence (route + schedule + SOC),
 * so "BA-19 IV monthly" reads as human dosing, not jargon alone.
 */
function describeTrialDosingPlain(drug, intervention, mech) {
  const raw = String(intervention ?? '').trim()
  const drugName = String(drug ?? 'The drug').trim() || 'The drug'

  if (!raw) {
    const pm = plainMechanismSnippet(mech)
    return pm
      ? `Mechanism is ${pm.toLowerCase()}; schedule is whatever the protocol specifies for this trial.`
      : 'Dosing follows the trial protocol.'
  }

  const hasSOC = /(?:\+\s*|\b)SOC\b/i.test(raw)
  const soc = hasSOC ? ', together with usual standard-of-care drugs for this disease' : ''

  const iv = /\bIV\b/i.test(raw)
  const po = /\bPO\b/i.test(raw)
  const itRoute = /\bIT\b/i.test(raw)

  if (iv && /monthly/i.test(raw)) {
    return `${drugName} is given by intravenous infusion—into a vein—about once a month${soc}.`
  }
  if (iv && /q2w/i.test(raw)) {
    return `${drugName} is given by intravenous infusion every two weeks${soc}.`
  }
  if (po && (/\bqd\b/i.test(raw) || /\bdaily\b/i.test(raw))) {
    return `${drugName} is taken by mouth (a pill), once per day${soc}.`
  }
  if (itRoute && /q4w/i.test(raw)) {
    return `${drugName} is injected into the spinal fluid (intrathecal), every four weeks${soc}.`
  }
  if (iv && /q4w/i.test(raw)) {
    return `${drugName} is given by intravenous infusion every four weeks${soc}.`
  }

  const expanded = raw
    .replace(/\bIV\b/gi, 'intravenous infusion')
    .replace(/\bPO\b/gi, 'oral (by mouth)')
    .replace(/\bIT\b/gi, 'intrathecal (spinal injection)')
    .replace(/\bq2w\b/gi, 'every 2 weeks')
    .replace(/\bq4w\b/gi, 'every 4 weeks')
    .replace(/\bqd\b/gi, 'once daily')
    .replace(/\bSOC\b/gi, 'standard-of-care therapy')
    .replace(/\s*\+\s*/g, ' plus ')
    .replace(/\bmonthly\b/gi, 'once monthly')

  return `${drugName}: ${expanded}.`
}

/** Three short sentences for the selected clinical program. */
function buildPharmaContextSentences(ev) {
  if (!ev) return [EMPTY]
  if (Array.isArray(ev.__context_sentences) && ev.__context_sentences.some(Boolean)) {
    return ev.__context_sentences.map((s) => String(s)).filter(Boolean).slice(0, 3)
  }
  const snap = ev.trialSnapshot ?? {}
  const drug = snap.drug ?? ev.drug ?? 'This drug'
  const ind = ev.population?.condition ?? snap.indication ?? ev.indication ?? 'this indication'
  const mech = snap.mechanism ?? ev.mechanism ?? ''
  const phase = snap.phase ?? ev.phase ?? ''
  const intervention = snap.intervention ?? ev.intervention ?? ''
  const control = ev.studyDesign?.control ?? ''
  const primary =
    stripPrimaryLabel(ev.endpointsResults?.endpoints?.[0] ?? '') || 'the main endpoints'
  const hook = (ev.timelineDetails?.eventSubtype ?? ev.eventType ?? '').trim()

  const pm = plainMechanismSnippet(mech)
  const s1 =
    phase && pm
      ? `${drug} is in ${phase} for ${ind} and works via ${pm.toLowerCase()}.`
      : phase
        ? `${drug} is in ${phase} for ${ind}.`
        : `${drug} is being tested for ${ind}.`

  const s2 = describeTrialDosingPlain(drug, intervention, mech)

  let cmp = ''
  if (control && !/^none$/i.test(control) && !/not applicable/i.test(control)) {
    cmp = ` vs ${control.toLowerCase()}`
  }
  const s3 = hook
    ? `They measure ${primary}${cmp}. Latest note: ${hook}.`
    : `They measure ${primary}${cmp}.`

  return [s1, s2, s3]
}

/** Buy / sell / other from worksheet key text (same rows as the case cluster). */
function insiderKeyDirection(key) {
  const k = String(key ?? '').toLowerCase()
  const iBuy = k.search(/\bbuy\b|purchase|cluster purchase|acquisition\b/)
  const iSell = k.search(/\bsell\b|\bsale\b|short/)
  if (iBuy >= 0 && iSell >= 0) return iSell < iBuy ? 'sell' : 'buy'
  if (iSell >= 0) return 'sell'
  if (iBuy >= 0) return 'buy'
  if (/gift|charity/.test(k)) return 'gift'
  if (/exercise/.test(k)) return 'exercise'
  return 'other'
}

function insiderKeyExecRole(key) {
  const k = String(key ?? '')
  if (/\bCEO\b/i.test(k)) return 'CEO'
  if (/\bCFO\b/i.test(k)) return 'CFO'
  if (/President/i.test(k)) return 'President'
  if (/Chief Medical Officer/i.test(k)) return 'CMO'
  if (/\bChair\b/i.test(k)) return 'Chair'
  if (/\bEVP\b/i.test(k)) return 'EVP'
  return null
}

function insiderKeyTradeFlavor(key) {
  const k = String(key ?? '')
  if (/open market/i.test(k)) return 'open-market purchases'
  if (/10b5-1/i.test(k)) return 'planned Rule 10b5-1 trades'
  if (/gift|charity/i.test(k)) return 'gifts / charity'
  if (/derivative|exercise/i.test(k)) return 'option exercise flows'
  if (/award|contract/i.test(k)) return 'compensation-style awards'
  return 'reported insider trades'
}

/** Human list: ["CEO","CFO"] → "CEO and CFO"; three+ uses commas. */
function joinActorPhrases(names) {
  const u = [...new Set(names)].filter(Boolean)
  if (u.length === 0) return ''
  if (u.length === 1) return u[0]
  if (u.length === 2) return `${u[0]} and ${u[1]}`
  return `${u.slice(0, -1).join(', ')}, and ${u[u.length - 1]}`
}

/** Three sentences summarizing the selected insider cluster (who, concentration, timing). */
function buildInsiderContextSentences(row) {
  if (!row?.caseSheet) return [EMPTY]
  if (Array.isArray(row.__context_sentences) && row.__context_sentences.some(Boolean)) {
    return row.__context_sentences.map((s) => String(s)).filter(Boolean).slice(0, 4)
  }
  const cs = row.caseSheet
  const rows = cs.rows ?? []
  const n = rows.length
  if (n === 0) return [EMPTY]

  const tsList = rows
    .map((r) => new Date(r.ts).getTime())
    .filter((t) => Number.isFinite(t))
  const tMin = tsList.length ? Math.min(...tsList) : NaN
  const tMax = tsList.length ? Math.max(...tsList) : NaN
  const spanDays =
    Number.isFinite(tMin) && Number.isFinite(tMax)
      ? Math.max(1, Math.round((tMax - tMin) / 86400000))
      : null
  const daysSinceLast =
    Number.isFinite(tMax) ? Math.max(0, Math.round((Date.now() - tMax) / 86400000)) : null

  let buyUsd = 0
  let sellUsd = 0
  const buyRoles = []
  let otherBuyLines = 0
  const flavorWeights = {}

  for (const r of rows) {
    const dir = insiderKeyDirection(r.key)
    const amt = cs.isForm4 ? Number(r.amountUsd) || 0 : 0
    if (dir === 'buy') {
      if (amt > 0) buyUsd += amt
      const role = insiderKeyExecRole(r.key)
      if (role) buyRoles.push(role)
      else otherBuyLines += 1
      const f = insiderKeyTradeFlavor(r.key)
      flavorWeights[f] = (flavorWeights[f] || 0) + (amt > 0 ? amt : 1)
    } else if (dir === 'sell') {
      if (amt > 0) sellUsd += amt
    }
  }

  const roleSpend = {}
  for (const r of rows) {
    if (insiderKeyDirection(r.key) !== 'buy') continue
    const amt = cs.isForm4 ? Number(r.amountUsd) || 0 : 0
    const role = insiderKeyExecRole(r.key) ?? 'Other insiders'
    roleSpend[role] = (roleSpend[role] || 0) + (amt || 0)
  }

  const distinctExec = [...new Set(buyRoles)]
  const execPhrase = joinActorPhrases(distinctExec)
  let actorLead = ''
  if (distinctExec.length && otherBuyLines > 0) {
    actorLead = `${execPhrase} and ${otherBuyLines} other insider${otherBuyLines === 1 ? '' : 's'}`
  } else if (distinctExec.length) {
    actorLead = execPhrase
  } else if (otherBuyLines > 0 || buyUsd > 0 || rows.some((r) => insiderKeyDirection(r.key) === 'buy')) {
    actorLead = `${Math.max(otherBuyLines, 1)} insider${otherBuyLines === 1 ? '' : 's'}`
  }

  const buyCount = rows.filter((r) => insiderKeyDirection(r.key) === 'buy').length
  const sellCount = rows.filter((r) => insiderKeyDirection(r.key) === 'sell').length

  let netUsd = buyUsd - sellUsd
  const absNet = Math.abs(netUsd)
  const moneyKnown = cs.isForm4 && (buyUsd > 0 || sellUsd > 0)

  let windowPhrase = ''
  if (spanDays != null && spanDays <= 45) {
    windowPhrase = `the last ~${spanDays} day${spanDays === 1 ? '' : 's'}`
  } else if (spanDays != null) {
    windowPhrase = `~${spanDays} calendar days`
  }

  let s1 = ''
  if (buyCount && !sellCount) {
    const who = actorLead ? `${actorLead} bought shares` : 'Reported insider buys'
    const when = windowPhrase ? ` ${windowPhrase}` : ''
    if (moneyKnown) {
      s1 = `${who}${when}, total net buying ~${formatUsdCompact(absNet)}, no insider selling in this cluster.`
    } else {
      s1 = `${who}${when}; dollar sizes are not itemized line-by-line on this filing type.`
    }
    s1 = s1.replace(/\s+/g, ' ').trim()
  } else if (sellCount && !buyCount) {
    const amtBit = moneyKnown ? ` (~${formatUsdCompact(sellUsd)} gross sales)` : ''
    const when = windowPhrase ? ` across ${windowPhrase}` : ''
    s1 = `Selling-only lines in this bundle${amtBit}${when}; no buys here.`
  } else if (buyCount && sellCount) {
    const netWord = netUsd >= 0 ? 'buying' : 'selling'
    const amtPart = moneyKnown
      ? `~${formatUsdCompact(absNet)} net ${netWord}`
      : 'mixed buys and sells without full dollar detail'
    const actorBit = actorLead ? `${actorLead}: ` : ''
    const over = windowPhrase ? `Over ${windowPhrase}, ` : ''
    s1 = `${actorBit}${over}${amtPart}.`.replace(/\s+/g, ' ').trim()
  } else {
    s1 = `Cluster has ${n} linked lines (${cs.formType ?? 'filing'}); mostly non-trade rows.`
  }

  let s2 = ''
  const spendEntries = Object.entries(roleSpend).filter(([, v]) => v > 0)
  const totalRoleSpend = spendEntries.reduce((a, [, v]) => a + v, 0)
  if (spendEntries.length && totalRoleSpend > 0) {
    spendEntries.sort((a, b) => b[1] - a[1])
    const [topRole, topAmt] = spendEntries[0]
    const pct = Math.round((topAmt / totalRoleSpend) * 100)
    const flavors = Object.entries(flavorWeights).sort((a, b) => b[1] - a[1])
    const topFlavor = flavors[0]?.[0] ?? 'reported insider trades'
    s2 = `${topRole} accounts for ~${pct}% of buy-side dollars here, mostly ${topFlavor}.`
  } else if (buyCount) {
    const flavors = Object.entries(flavorWeights).sort((a, b) => b[1] - a[1])
    const topFlavor = flavors[0]?.[0] ?? 'reported insider trades'
    s2 =
      distinctExec.length > 0
        ? `Pattern skews to ${distinctExec.join(', ')}; trades read as mostly ${topFlavor}.`
        : `Activity reads as mostly ${topFlavor}.`
  } else {
    s2 = 'No buy-side lines stand out in this scrape—sales or non-trade rows drive the bundle.'
  }

  let s3 = ''
  const clustered = spanDays != null && spanDays <= 14
  const recent = daysSinceLast != null && daysSinceLast <= 7
  const offsetting = sellCount > 0 && buyCount > 0
  const parts = []
  if (recent && clustered) {
    parts.push('Activity looks recent and clustered.')
  } else if (recent) {
    parts.push('Activity looks recent.')
  } else if (clustered) {
    parts.push('Trades land in a tight window.')
  } else if (spanDays != null && spanDays > 21) {
    parts.push('Dates are spread out.')
  }
  if (daysSinceLast != null && recent) {
    parts.push(
      daysSinceLast === 0
        ? 'Last line is basically today.'
        : `Last line within ${daysSinceLast} day${daysSinceLast === 1 ? '' : 's'}.`,
    )
  } else if (daysSinceLast != null) {
    parts.push(`Last activity about ${daysSinceLast} days ago.`)
  }
  if (!sellCount && buyCount) parts.push('No offsetting sales in this scrape.')
  else if (sellCount && !buyCount) parts.push('Sales-only bundle.')
  else if (offsetting) parts.push('Buys and sells both appear—check net.')
  s3 = parts.join(' ')

  return [s1, s2, s3]
}

function ContextPanel({ mode, pharmaEvent, insiderRow, backendUp, maxSentences = 3 }) {
  const pharma = mode === 'pharma'
  const sentencesRaw = pharma ? buildPharmaContextSentences(pharmaEvent) : buildInsiderContextSentences(insiderRow)
  const sentences = backendUp
    ? (sentencesRaw?.filter((s) => String(s ?? '').trim()).slice(0, maxSentences) ?? [])
    : (sentencesRaw?.slice(0, maxSentences) ?? [])
  const display = backendUp ? sentences : sentences

  return (
    <section className="panel contextPanel blankTile--b" aria-label="Context">
      <header className="feedCompactHeader">
        <div className="panelTitle feedCompactTitle">CONTEXT</div>
      </header>
      <div className="contextPanelBody">
        {display.map((text, i) => (
          <p key={i} className="contextSentence">
            {text}
          </p>
        ))}
        </div>
      </section>
  )
}

function CompanyPanel({ mode, company, backendUp }) {
  const c = backendUp ? (company ?? {}) : MOCK_COMPANY
  const pharma = mode === 'pharma'

  const earnings =
    c?.earnings_date && typeof c.earnings_date === 'string'
      ? c.earnings_date
      : c?.earnings ?? EMPTY

  return (
    <section className="panel companyTile" aria-label="Company">
      <header className="feedCompactHeader">
        <div className="panelTitle feedCompactTitle">COMPANY</div>
      </header>
      <div className="worksheetBody historicalOutcomesBody">
        <KvLine key="co-industry">
          <span className="kvK dim">INDUSTRY</span>
          <span className="kvV">{c?.industry ?? EMPTY}</span>
        </KvLine>
        <KvLine key="co-country">
          <span className="kvK dim">COUNTRY</span>
          <span className="kvV">{c?.country ?? EMPTY}</span>
        </KvLine>
        <KvLine key="co-mcap">
          <span className="kvK dim">MCAP</span>
          <span className="kvV mono">{c?.mcap ?? EMPTY}</span>
        </KvLine>
        <KvLine key="co-earnings">
          <span className="kvK dim">EARNINGS</span>
          <span className="kvV">{earnings}</span>
        </KvLine>
        {pharma ? (
          <>
            <KvLine key="co-programs">
              <span className="kvK dim">PROGRAMS</span>
              <span className="kvV">{c?.pharmaPrograms ?? EMPTY}</span>
            </KvLine>
            <KvLine key="co-lead">
              <span className="kvK dim">LEAD</span>
              <span className="kvV">{c?.pharmaLead ?? EMPTY}</span>
            </KvLine>
          </>
        ) : null}
        </div>
    </section>
  )
}

function CompactFeed({
  placement,
  title,
  items,
  selectedIndex,
  focused,
  onSelectIndex,
  panelClassName = '',
  /** Header right: page indicator | invisible ghost (layout) | pagination-only rail styling. */
  headerMetaMode = 'full',
  /** Drug / indication / phase stacked; row height uses triple `--feed-row-slot`. */
  programsStackedRows = false,
  /** PROGRAMS rail: show grouped timeline rows (separators per program). */
  programsTimeline = false,
  /** Feed separators: today | year | today+years */
  sepMode = 'today',
  /** Replace pagination with scroll-to-load. */
  scrollMode = false,
}) {
  const listRef = useRef(null)
  const [rowsPerPage, setRowsPerPage] = useState(16)
  const [renderLimit, setRenderLimit] = useState(80)

  const displayRows = useMemo(() => {
    if (programsTimeline) return buildProgramGroupedDisplayRows(items)
    return buildFeedDisplayRows(items, { sepMode })
  }, [items, programsTimeline, sepMode])

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
  }

  return (
    <section
      className={['panel', 'feed', 'feedCompact', `feed--${placement}`, panelClassName, focused ? 'isFocused' : '']
        .filter(Boolean)
        .join(' ')}
      aria-label={title}
    >
      <header
        className="feedCompactHeader"
      >
        <div className="panelTitle feedCompactTitle">{title}</div>
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
      </header>
      <div
        ref={listRef}
        className={['feedCompactList', scrollMode ? 'feedCompactList--scroll' : ''].filter(Boolean).join(' ')}
        role="list"
        onScroll={scrollMode ? onScrollLoadMore : undefined}
      >
        {visibleRows.map((entry, i) => {
          const globalIdx = scrollMode ? i : pageStart + i
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
                programsStackedRows ? 'feedRowCompact--programs' : '',
                programsTimeline ? 'feedRowCompact--timeline' : '',
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
              ) : (
                <>
                  <span className="feedCell feedCellLabel kvFeedMain">{row.label}</span>
                  {!programsTimeline ? (
                    <span className="feedCell feedCellTicker mono kvFeedDim">
                      {placement === 'left' ? (
                        <>
                          {row.ticker}
                          <span className="feedCountTag">{row.count ?? ''}</span>
                        </>
                      ) : (
                        row.ticker
                      )}
                    </span>
                  ) : null}
                  <span className="feedCell feedCellWhen mono kvFeedDim">
                    {programsTimeline ? formatProgramTimelineDate(row.at) : formatFeedDate(row.at)}
                  </span>
                </>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}

function CaseKvFeed({
  title,
  rows,
  placement = 'right',
  focused = false,
  selectedTradeRowIndex = -1,
  onSelectTradeRowIndex,
  scrollMode = false,
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
      const n = Math.max(1, Math.floor(avail / Math.max(rowH, 10)))
      setRowsPerPage((prev) => (prev !== n ? n : prev))
    }

    const ro = new ResizeObserver(() => {
      requestAnimationFrame(measure)
    })
    ro.observe(list)
    measure()
    return () => ro.disconnect()
  }, [rows.length, placement])

  const pageSize = Math.max(1, rowsPerPage)
  const total = rows.length
  const totalPages = Math.max(1, Math.ceil(Math.max(1, total) / pageSize))
  const page = total ? clamp(Math.floor(Math.max(0, selectedTradeRowIndex) / pageSize), 0, totalPages - 1) : 0
  const pageStart = page * pageSize
  const pageSlice = total ? rows.slice(pageStart, pageStart + pageSize) : []
  const visibleRows = scrollMode ? rows.slice(0, Math.min(total, Math.max(pageSize, renderLimit))) : pageSlice

  useEffect(() => {
    if (!scrollMode) return
    setRenderLimit((prev) => Math.max(prev, selectedTradeRowIndex + pageSize * 2))
  }, [scrollMode, selectedTradeRowIndex, pageSize])

  useLayoutEffect(() => {
    if (!scrollMode) return
    const list = listRef.current
    if (!list) return
    const el = list.querySelector(`[data-row-idx="${selectedTradeRowIndex}"]`)
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' })
  }, [scrollMode, selectedTradeRowIndex])

  function onScrollLoadMore() {
    if (!scrollMode) return
    const list = listRef.current
    if (!list) return
    const nearBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 60
    if (!nearBottom) return
    setRenderLimit((prev) => Math.min(total, prev + pageSize * 2))
  }

  return (
    <section
      className={['panel', 'feed', 'feedCompact', `feed--${placement}`, focused ? 'isFocused' : '']
        .filter(Boolean)
        .join(' ')}
      aria-label={title}
    >
      <header className="feedCompactHeader">
        <div className="panelTitle feedCompactTitle">{title}</div>
        {!scrollMode ? (
          <div className="feedCompactMeta feedCompactMeta--paginationOnly">
            <span className="feedPageInd">{total ? `${page + 1}/${totalPages}` : '0/0'}</span>
          </div>
        ) : null}
      </header>
      <div
        ref={listRef}
        className={['feedCompactList', scrollMode ? 'feedCompactList--scroll' : ''].filter(Boolean).join(' ')}
        role="list"
        onScroll={scrollMode ? onScrollLoadMore : undefined}
      >
        {visibleRows.map((r, j) => {
          const i = scrollMode ? j : pageStart + j
          return r?.type === 'blank' ? (
            <div key={`blank-${i}`} className="feedRowCompact feedRowCompact--blank" role="presentation" />
          ) : r?.layout === 'two' ? (
            <div
              key={`${r.k}-${i}`}
              className={['feedRowCompact', 'feedRowCompact--two'].filter(Boolean).join(' ')}
              role="listitem"
              data-row-idx={i}
            >
              <span className="feedCell feedCellLabel kvFeedMain dim">{r.k}</span>
              <span className="feedCell feedCellTicker mono kvFeedDim">{r.v}</span>
            </div>
          ) : (
            <div
              key={`${r.k}-${i}`}
              className={[
                'feedRowCompact',
                r?.type === 'trade' && i === selectedTradeRowIndex ? 'isActive' : '',
              ]
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
        })}
      </div>
    </section>
  )
}

function App() {
  const [activeTab, setActiveTab] = useState('main') // main | insider | pharma | politicians | explore
  /** Which feed column receives arrow up/down: insider | pharma | programs (rail). */
  const [feedPaneFocus, setFeedPaneFocus] = useState('insider')
  const [insiderIdx, setInsiderIdx] = useState(0)
  const [insiderCaseTradeIdx, setInsiderCaseTradeIdx] = useState(0)
  const [politiciansIdx, setPoliticiansIdx] = useState(0)
  const [politiciansCaseTradeIdx, setPoliticiansCaseTradeIdx] = useState(0)
  const [politiciansFilter, setPoliticiansFilter] = useState(null)
  const BOSHA_FEED_FALLBACK = useMemo(
    () => [
      { rowKey: 'fb-ASML', ticker: 'ASML', name: 'ASML Holding N.V.' },
      { rowKey: 'fb-ATYR', ticker: 'ATYR', name: 'aTyr Pharma, Inc.' },
    ],
    [],
  )

  const [boshaFeedLive, setBoshaFeedLive] = useState(null)
  const [boshaExploreLive, setBoshaExploreLive] = useState(null)
  const [boshaBarsSeries, setBoshaBarsSeries] = useState(null)

  const [boshaTicker, setBoshaTicker] = useState(BOSHA_TICKER)
  const [boshaQuery, setBoshaQuery] = useState('')
  const boshaDataset = useMemo(() => boshaDatasetForTicker(boshaTicker), [boshaTicker])

  const boshaFeedItems = useMemo(() => {
    if (Array.isArray(boshaFeedLive) && boshaFeedLive.length) {
      return boshaFeedLive.map((x) => ({
        rowKey:
          x.kind === 'paper' && x.id ? String(x.id) : `sig-${String(x.ticker ?? '').toUpperCase()}`,
        ticker: String(x.ticker ?? '').toUpperCase(),
        name: String(x.name ?? x.company_name ?? x.ticker ?? ''),
      }))
    }
    return BOSHA_FEED_FALLBACK
  }, [boshaFeedLive, BOSHA_FEED_FALLBACK])

  const boshaCompanyName = useMemo(() => {
    const t = String(boshaTicker ?? '').toUpperCase()
    if (
      boshaExploreLive &&
      String(boshaExploreLive.ticker ?? '').toUpperCase() === t &&
      String(boshaExploreLive.company_name ?? '').trim()
    ) {
      return String(boshaExploreLive.company_name).trim()
    }
    const fromFeed = boshaFeedItems.find((x) => String(x.ticker ?? '').toUpperCase() === t)?.name
    if (fromFeed) return fromFeed
    const companyEnt = boshaDataset.entities?.find((e) => String(e?.type ?? '').toLowerCase() === 'company')
    return companyEnt?.name ?? t
  }, [boshaFeedItems, boshaDataset.entities, boshaTicker, boshaExploreLive])

  const boshaPriceSeries = useMemo(() => {
    if (Array.isArray(boshaBarsSeries) && boshaBarsSeries.length) return boshaBarsSeries
    return boshaDataset.price
  }, [boshaBarsSeries, boshaDataset.price])

  const boshaFilteredFeed = useMemo(() => {
    const s = String(boshaQuery ?? '').trim().toUpperCase()
    if (!s) return boshaFeedItems
    return boshaFeedItems.filter((it) => {
      const t = String(it?.ticker ?? '').toUpperCase()
      const n = String(it?.name ?? '').toUpperCase()
      return t.includes(s) || n.includes(s)
    })
  }, [boshaFeedItems, boshaQuery])

  // Keep key navigation stable (avoid stale closures).
  const boshaFilteredRef = useRef(boshaFilteredFeed)
  const boshaTickerRef = useRef(boshaTicker)
  useEffect(() => {
    boshaFilteredRef.current = boshaFilteredFeed
  }, [boshaFilteredFeed])
  useEffect(() => {
    boshaTickerRef.current = boshaTicker
  }, [boshaTicker])

  useEffect(() => {
    // If the current selection falls out of the filter, snap to the first match.
    if (activeTab !== 'explore') return
    if (!boshaFilteredFeed.length) return
    const ok = boshaFilteredFeed.some((x) => x.ticker === boshaTicker)
    if (!ok) setBoshaTicker(boshaFilteredFeed[0].ticker)
  }, [activeTab, boshaFilteredFeed, boshaTicker])

  const [pharmaIdx, setPharmaIdx] = useState(0)
  /** When set, case sheet + graph follow this trial; cleared when pharma feed row or sponsor context changes */
  const [programRailEventId, setProgramRailEventId] = useState(null)
  const [programRailIdx, setProgramRailIdx] = useState(0)
  const [programRailMilestone, setProgramRailMilestone] = useState(null)

  const [backendUp, setBackendUp] = useState(false)
  const [backendLastOkAt, setBackendLastOkAt] = useState(0)
  const [backendStats, setBackendStats] = useState(null)

  useEffect(() => {
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
    if (!backendLastOkAt) return
    const t = setInterval(() => {
      const staleMs = Date.now() - backendLastOkAt
      if (staleMs > 15_000) setBackendUp(false)
    }, 1000)
    return () => clearInterval(t)
  }, [backendLastOkAt])

  useEffect(() => {
    let alive = true
    async function run() {
      if (!backendUp) return
      const r = await fetchJsonSafe('/api/stats', { timeoutMs: 3500 })
      if (!alive) return
      if (r.ok && r.data?.ok) setBackendStats(r.data)
    }
    run()
    const t = setInterval(run, 4000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [backendUp])

  const [insiderFeedLive, setInsiderFeedLive] = useState(null)
  const [insiderClusterLive, setInsiderClusterLive] = useState(null)
  const [barsLive, setBarsLive] = useState(null)
  const [companyLive, setCompanyLive] = useState(null)

  const [politiciansFeedLive, setPoliticiansFeedLive] = useState(null)
  const [politiciansClusterLive, setPoliticiansClusterLive] = useState(null)

  const [pharmaFeedLive, setPharmaFeedLive] = useState(null)
  const [pharmaEventLive, setPharmaEventLive] = useState(null)
  const [programFeedLive, setProgramFeedLive] = useState(null)

  useEffect(() => {
    if (backendUp) return
    setBoshaFeedLive(null)
    setBoshaExploreLive(null)
    setBoshaBarsSeries(null)
  }, [backendUp])

  useEffect(() => {
    if (!backendUp || activeTab !== 'explore') return
    let cancelled = false
    ;(async () => {
      const r = await fetchJsonSafe('/api/bosha/feed?limit=80', { timeoutMs: 8000 })
      if (cancelled || !r.ok || !r.data?.ok || !Array.isArray(r.data.items)) return
      setBoshaFeedLive(r.data.items)
    })()
    return () => {
      cancelled = true
    }
  }, [backendUp, activeTab])

  useEffect(() => {
    if (!backendUp || activeTab !== 'explore') return
    const tick = String(boshaTicker ?? '')
      .trim()
      .toUpperCase()
    if (!tick) return
    let cancelled = false
    ;(async () => {
      const enc = encodeURIComponent(tick)
      const [ex, br] = await Promise.all([
        fetchJsonSafe(`/api/bosha/explore?ticker=${enc}`, { timeoutMs: 12_000 }),
        fetchJsonSafe(`/api/bars?ticker=${enc}&days=400`, { timeoutMs: 12_000 }),
      ])
      if (cancelled) return
      if (ex.ok && ex.data?.ok && String(ex.data.ticker ?? '').toUpperCase() === tick) {
        setBoshaExploreLive(ex.data)
      } else if (!cancelled) {
        setBoshaExploreLive(null)
      }
      if (cancelled) return
      if (br.ok && Array.isArray(br.data?.items) && br.data.items.length) {
        const closes = br.data.items.map((row) => Number(row.close)).filter((n) => Number.isFinite(n))
        setBoshaBarsSeries(closes.length ? closes : null)
      } else {
        setBoshaBarsSeries(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [backendUp, activeTab, boshaTicker])

  useEffect(() => {
    let alive = true
    async function run() {
      if (!backendUp) return
      const r = await fetchJsonSafe('/api/insider/feed?mode=company&limit=120&days=30')
      if (!alive) return
      const items = Array.isArray(r.data?.items) ? r.data.items : []
      const mapped = items
        .map((it) => {
          const ticker = String(it.ticker ?? '').trim().toUpperCase()
          const at = String(it.feed_at ?? '')
          const id = String(it.id ?? '')
          const raw = String(it.feed_label ?? '')
          const m = raw.match(/^\s*([^()]+?)\s*\(\s*(\d+)\s*\)\s*$/)
          const label = (m ? m[1] : raw).trim() || '—'
          const count = m ? Number(m[2]) : null
          return {
            id,
            label,
            count,
            ticker,
            at,
            daily: [],
            __backend_id: id,
          }
        })
        .filter((x) => x.id && x.ticker && x.at)
      if (r.ok) setInsiderFeedLive(mapped)
    }
    run()
    const t = setInterval(run, 20_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [backendUp])

  const insiderFeedRows = backendUp && insiderFeedLive != null ? insiderFeedLive : INSIDER_FEED_ROWS
  const insiderSelected =
    insiderFeedRows.length > 0 ? insiderFeedRows[clamp(insiderIdx, 0, Math.max(0, insiderFeedRows.length - 1))] : null

  useEffect(() => {
    let alive = true
    async function run() {
      if (!backendUp) return
      const r = await fetchJsonSafe('/api/politicians/feed?limit=120&days=120', { timeoutMs: 5000 })
      if (!alive) return
      const items = Array.isArray(r.data?.items) ? r.data.items : []
      const mapped = items
        .map((it) => {
          const ticker = String(it.ticker ?? '').trim().toUpperCase()
          const at = String(it.feed_at ?? '')
          const id = String(it.id ?? '')
          const raw = String(it.feed_label ?? '')
          const m = raw.match(/^\s*([^()]+?)\s*\(\s*(\d+)\s*\)\s*$/)
          const label = (m ? m[1] : raw).trim() || '—'
          const count = m ? Number(m[2]) : null
          const politicians = Array.isArray(it.politicians) ? it.politicians.map((x) => String(x)) : []
          return {
            id,
            label,
            count,
            ticker,
            at,
            politicians,
            daily: [],
            __backend_id: id,
          }
        })
        .filter((x) => x.id && x.ticker && x.at)
      if (r.ok) setPoliticiansFeedLive(mapped)
    }
    run()
    const t = setInterval(run, 30_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [backendUp])

  const politiciansBaseRows = backendUp && politiciansFeedLive != null ? politiciansFeedLive : POLITICIAN_FEED_ROWS

  const politicianFilterItems = useMemo(() => {
    const counts = new Map()
    for (const r of politiciansBaseRows) {
      const people = Array.isArray(r?.politicians) ? r.politicians : []
      for (const p of people) {
        const k = String(p ?? '').trim()
        if (!k) continue
        counts.set(k, (counts.get(k) ?? 0) + 1)
      }
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  }, [politiciansBaseRows])

  const politiciansFeedRows = useMemo(() => {
    if (!politiciansFilter) return politiciansBaseRows
    return politiciansBaseRows.filter((r) => (r?.politicians ?? []).includes(politiciansFilter))
  }, [politiciansBaseRows, politiciansFilter])

  useEffect(() => {
    setPoliticiansIdx(0)
    setPoliticiansCaseTradeIdx(0)
  }, [politiciansFilter])

  const politiciansSelected =
    politiciansFeedRows.length > 0 ? politiciansFeedRows[clamp(politiciansIdx, 0, politiciansFeedRows.length - 1)] : null

  useEffect(() => {
    let alive = true
    async function run() {
      try {
        if (!backendUp) return
        const r = await fetchJsonSafe('/api/pharma/feed?limit=120&days=180', { timeoutMs: 5000 })
        const json = r.data
        const items = Array.isArray(json?.items) ? json.items : []
        if (!alive) return
        const mapped = items
          .map((r) => ({
            id: String(r.id),
            label: String(r.feed_label ?? 'Pharma update'),
            ticker: String(r.ticker ?? '').toUpperCase(),
            at: String(r.feed_at ?? ''),
            trialEventId: String(r.id),
          }))
          .filter((r) => r.id && r.ticker && r.at)
        if (r.ok) setPharmaFeedLive(mapped)
      } catch {
        if (!alive) return
        // Keep last-good feed instead of flapping.
      }
    }
    run()
    const t = setInterval(run, 60_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [backendUp])

  const pharmaFeedRows = backendUp && pharmaFeedLive != null ? pharmaFeedLive : PHARMA_FEED_ROWS

  const pharmaFeedEventId = useMemo(() => {
    const row = pharmaFeedRows[pharmaIdx]
    if (backendUp) return row?.trialEventId ?? null
    const fallbackId = MOCK_EVENTS[pharmaIdx % MOCK_EVENTS.length]?.id
    return row?.trialEventId ?? fallbackId ?? MOCK_EVENTS[0]?.id
  }, [pharmaFeedRows, pharmaIdx])

  const pharmaTicker = useMemo(() => {
    const row = pharmaFeedRows[pharmaIdx]
    return row?.ticker ? String(row.ticker).toUpperCase() : null
  }, [pharmaFeedRows, pharmaIdx])

  useEffect(() => {
    let alive = true
    async function run() {
      if (!backendUp) return
      if (!pharmaTicker) {
        // Backend is up but no pharma ticker is selected (or feed is empty).
        // Keep the PROGRAMS rail consistent with other feeds: live-empty, not mock.
        setProgramFeedLive([])
        return
      }
      try {
        const r = await fetchJsonSafe(
          `/api/pharma/programs?ticker=${encodeURIComponent(pharmaTicker)}&days=3650`,
          { timeoutMs: 6000 },
        )
        const json = r.data
        const items = Array.isArray(json?.items) ? json.items : []
        if (!alive) return
        const mapped = items
          .map((r) => ({
            id: String(r.id),
            group: String(r.drug ?? '').trim() || null,
            label: String(r.label ?? 'Update'),
            at: String(r.at ?? ''),
            ticker: '',
            trialEventId: String(r.id),
            milestoneLabel: String(r.label ?? 'Update'),
            milestoneAt: String(r.at ?? ''),
          }))
          .filter((r) => r.id && r.at)
        if (r.ok) setProgramFeedLive(mapped)
      } catch {
        if (!alive) return
        // Keep last-good instead of flapping.
      }
    }
    run()
    return () => {
      alive = false
    }
  }, [backendUp, pharmaTicker])

  const programFeedItems = useMemo(() => {
    if (backendUp && programFeedLive != null) return programFeedLive
    if (backendUp) return []
    const ev = MOCK_EVENTS.find((e) => e.id === pharmaFeedEventId)
    return buildProgramFeedItemsForSponsor(ev?.sponsor ?? null)
  }, [backendUp, programFeedLive, pharmaFeedEventId])

  useEffect(() => {
    // When sponsor context changes, reset rail selection.
    setProgramRailIdx(0)
    setProgramRailMilestone(null)
    setProgramRailEventId(null)
  }, [pharmaTicker])

  function synthesizeEventForMilestone(base, milestone) {
    if (!base || !milestone) return base
    const ts = milestone.milestoneAt ?? base.ts
    const label = milestone.milestoneLabel ?? base.eventType ?? 'UPDATE'
    return {
      ...base,
      ts,
      eventType: String(label).toUpperCase(),
      timelineDetails: {
        ...(base.timelineDetails ?? {}),
        eventSource: (base.timelineDetails?.eventSource ?? 'Company release'),
        eventSubtype: String(label),
      },
    }
  }

  const pharmaSelected = useMemo(() => {
    if (backendUp) return null
    const id =
      activeTab === 'pharma' && programRailEventId != null
        ? programRailEventId
        : pharmaFeedEventId
    const base = MOCK_EVENTS.find((e) => e.id === id) ?? MOCK_EVENTS[0]
    // When navigating the PROGRAMS rail, use the selected timeline row as the "current event"
    // so the case worksheet changes per row.
    if (feedPaneFocus === 'programs' && activeTab === 'pharma' && programRailMilestone) {
      return synthesizeEventForMilestone(base, programRailMilestone)
    }
    return base
  }, [backendUp, activeTab, feedPaneFocus, programRailEventId, pharmaFeedEventId, programRailMilestone])

  const pharmaSelectedResolved = useMemo(() => {
    if (backendUp && activeTab !== 'pharma') return null
    if (backendUp && !pharmaEventLive) return null
    if (!pharmaEventLive || activeTab !== 'pharma') return pharmaSelected
    const ws = pharmaEventLive?.worksheet ?? {}
    const snap = {
      drug: ws.drug ?? pharmaEventLive?.drug ?? null,
      mechanism: ws.mechanism ?? null,
      phase: ws.phase ?? pharmaEventLive?.phase ?? null,
      indication: ws.indication ?? pharmaEventLive?.indication ?? null,
      sponsor: ws.sponsor ?? pharmaEventLive?.company_name ?? null,
      intervention: ws.intervention ?? null,
      assetOrigin: ws.origin ?? null,
    }
    return {
      id: pharmaFeedEventId,
      ts: pharmaEventLive?.event_at ?? pharmaEventLive?.eventAt ?? pharmaEventLive?.event_at ?? new Date().toISOString(),
      eventType: pharmaEventLive?.event_type ?? pharmaEventLive?.eventType ?? 'UPDATE',
      trialSnapshot: snap,
      timelineDetails: {
        status: ws.status ?? null,
        studyStart: ws.study_start ?? null,
        primaryCompletion: ws.primary_completion ?? null,
        studyCompletion: ws.study_completion ?? null,
        eventSource: ws.source ?? 'SEC filing',
        eventSubtype: ws.detail ?? pharmaEventLive?.feed_label ?? 'Update',
      },
      endpointsResults: {
        endpoints: Array.isArray(ws.endpoints) ? ws.endpoints : [],
        results: Array.isArray(ws.results) ? ws.results : [],
      },
      safety: Array.isArray(ws.safety) ? ws.safety : [],
      __context_sentences: Array.isArray(pharmaEventLive?.context_sentences) ? pharmaEventLive.context_sentences : null,
      daily: pharmaSelected?.daily ?? [],
    }
  }, [backendUp, activeTab, pharmaEventLive, pharmaSelected, pharmaFeedEventId])

  const insiderSelectedResolved = useMemo(() => {
    if (!backendUp || activeTab !== 'insider' || !insiderClusterLive) return insiderSelected
    const rows = insiderClusterLive?.cluster?.worksheet_rows
    const wsRows = Array.isArray(rows) ? rows : []
    const caseSheet = {
      filingId: insiderClusterLive?.filing?.accession_no ?? insiderSelected?.id ?? insiderSelected?.ticker ?? '—',
      formType: insiderClusterLive?.filing?.form_type ?? 'Form 4',
      issuer: insiderClusterLive?.issuer?.name ?? insiderSelected?.ticker ?? '—',
      ticker: insiderClusterLive?.issuer?.ticker ?? insiderSelected?.ticker ?? '—',
      isForm4: true,
      filedAt: insiderClusterLive?.filing?.filed_at ?? insiderSelected?.at ?? null,
      rows: wsRows.map((r) => ({
        key: String(r?.key ?? '').trim() || 'Insider',
        amountUsd: r?.amount_usd != null ? Number(r.amount_usd) : null,
        ts: r?.ts != null ? String(r.ts) : null,
      })),
    }
    return {
      ...insiderSelected,
      caseSheet,
      __context_sentences: insiderClusterLive?.cluster?.context_sentences ?? null,
    }
  }, [backendUp, activeTab, insiderSelected, insiderClusterLive])

  const politiciansSelectedResolved = useMemo(() => {
    if (!backendUp || activeTab !== 'politicians' || !politiciansClusterLive) return politiciansSelected ?? null
    const rows = politiciansClusterLive?.cluster?.worksheet_rows
    const wsRows = Array.isArray(rows) ? rows : []
    const who =
      Array.isArray(politiciansClusterLive?.cluster?.politicians) && politiciansClusterLive.cluster.politicians.length
        ? String(politiciansClusterLive.cluster.politicians[0])
        : (politiciansSelected?.politicians?.[0] ?? '—')
    const caseSheet = {
      filingId: politiciansClusterLive?.filing?.accession_no ?? politiciansSelected?.id ?? politiciansSelected?.ticker ?? '—',
      formType: politiciansClusterLive?.filing?.form_type ?? 'PTR',
      issuer: who,
      ticker: politiciansClusterLive?.issuer?.ticker ?? politiciansSelected?.ticker ?? '—',
      isForm4: true,
      filedAt: politiciansClusterLive?.filing?.filed_at ?? politiciansSelected?.at ?? null,
      rows: wsRows.map((r) => ({
        key: String(r?.key ?? '').trim() || 'POLITICIAN',
        amountUsd: r?.amount_usd != null ? Number(r.amount_usd) : null,
        ts: r?.ts != null ? String(r.ts) : null,
      })),
    }
    return {
      ...politiciansSelected,
      caseSheet,
      __context_sentences: politiciansClusterLive?.cluster?.context_sentences ?? null,
    }
  }, [backendUp, activeTab, politiciansSelected, politiciansClusterLive])

  const isRealView = useMemo(() => {
    return Boolean(backendUp)
  }, [backendUp])

  // Insider cluster: case worksheet + context
  useEffect(() => {
    let alive = true
    async function run() {
      if (!backendUp || activeTab !== 'insider') {
        if (alive) setInsiderClusterLive(null)
        return
      }
      const id = insiderSelected?.__backend_id ?? null
      const ticker = insiderSelected?.ticker ? String(insiderSelected.ticker).toUpperCase() : null
      const useId = id || (ticker ? `company:${ticker}` : null)
      if (!useId) {
        if (alive) setInsiderClusterLive(null)
        return
      }
      const r = await fetchJsonSafe(`/api/insider/cluster/${encodeURIComponent(useId)}?days=30`)
      if (!alive) return
      const data = r.ok ? r.data?.data ?? null : null
      setInsiderClusterLive(data && typeof data === 'object' ? data : null)
    }
    run()
    return () => {
      alive = false
    }
  }, [backendUp, activeTab, insiderSelected?.ticker, insiderSelected?.__backend_id])

  // Politicians cluster: case worksheet + context
  useEffect(() => {
    let alive = true
    async function run() {
      if (!backendUp || activeTab !== 'politicians') {
        if (alive) setPoliticiansClusterLive(null)
        return
      }
      const ticker = politiciansSelected?.ticker ? String(politiciansSelected.ticker).toUpperCase() : null
      const useId = ticker ? `ticker:${ticker}` : null
      if (!useId) {
        if (alive) setPoliticiansClusterLive(null)
        return
      }
      const r = await fetchJsonSafe(`/api/politicians/cluster/${encodeURIComponent(useId)}?days=120`, { timeoutMs: 7000 })
      if (!alive) return
      const data = r.ok ? r.data?.data ?? null : null
      setPoliticiansClusterLive(data && typeof data === 'object' ? data : null)
    }
    run()
    return () => {
      alive = false
    }
  }, [backendUp, activeTab, politiciansSelected?.ticker])

  // Bars (Daily Graph) + Company panel: use selected ticker in either mode
  const selectedTicker = useMemo(() => {
    if (activeTab === 'insider') return insiderSelected?.ticker ? String(insiderSelected.ticker).toUpperCase() : null
    if (activeTab === 'politicians')
      return politiciansSelectedResolved?.ticker ? String(politiciansSelectedResolved.ticker).toUpperCase() : null
    return pharmaTicker ? String(pharmaTicker).toUpperCase() : null
  }, [activeTab, insiderSelected?.ticker, politiciansSelectedResolved?.ticker, pharmaTicker])

  useEffect(() => {
    let alive = true
    async function run() {
      if (!backendUp || !selectedTicker) return
      const r = await fetchJsonSafe(`/api/bars?ticker=${encodeURIComponent(selectedTicker)}&days=365`, { timeoutMs: 6000 })
      if (!alive) return
      const closes = Array.isArray(r.data?.items)
        ? r.data.items.map((x) => Number(x?.close)).filter((n) => Number.isFinite(n))
        : []
      if (r.ok) setBarsLive(closes.length ? closes : null)
    }
    run()
    const t = setInterval(run, 60_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [backendUp, selectedTicker])

  useEffect(() => {
    let alive = true
    async function run() {
      if (!backendUp || !selectedTicker) return
      const r = await fetchJsonSafe(`/api/company?ticker=${encodeURIComponent(selectedTicker)}`, { timeoutMs: 6000 })
      if (!alive) return
      if (r.ok) setCompanyLive(r.data)
    }
    run()
    return () => {
      alive = false
    }
  }, [backendUp, selectedTicker])

  useEffect(() => {
    let alive = true
    async function run() {
      if (activeTab !== 'pharma') {
        return
      }
      const id = pharmaFeedEventId
      if (!backendUp || !id || !pharmaFeedLive) {
        return
      }
      try {
        const r = await fetchJsonSafe(`/api/pharma/event/${encodeURIComponent(id)}`, { timeoutMs: 6000 })
        const json = r.data
        if (!alive) return
        if (r.ok) setPharmaEventLive(json?.data ?? null)
      } catch {
        if (!alive) return
        // Keep last-good instead of flapping.
      }
    }
    run()
    return () => {
      alive = false
    }
  }, [backendUp, activeTab, pharmaFeedEventId, pharmaFeedLive])

  const programSelectedIdx = useMemo(() => {
    if (activeTab !== 'pharma' || programFeedItems.length === 0) return 0
    return clamp(programRailIdx, 0, programFeedItems.length - 1)
  }, [activeTab, programFeedItems.length, programRailIdx])

  useEffect(() => {
    setProgramRailEventId(null)
    setProgramRailIdx(0)
    setProgramRailMilestone(null)
  }, [pharmaIdx])

  useEffect(() => {
    // When switching tabs, reset which pane gets arrows.
    if (activeTab === 'main') return
    if (activeTab === 'insider') {
      setFeedPaneFocus('insider')
      setProgramRailEventId(null)
      return
    }
    if (activeTab === 'pharma') {
      setFeedPaneFocus('pharma')
      return
    }
    if (activeTab === 'politicians') {
      setFeedPaneFocus('insider')
      return
    }
    if (activeTab === 'explore') {
      setFeedPaneFocus('explore')
      return
    }
  }, [activeTab])

  // Ensure there is always a valid focused/glowing panel per tab.
  useEffect(() => {
    if (activeTab === 'insider') {
      if (feedPaneFocus !== 'insider' && feedPaneFocus !== 'case') setFeedPaneFocus('insider')
      return
    }
    if (activeTab === 'pharma') {
      if (feedPaneFocus !== 'pharma' && feedPaneFocus !== 'programs') setFeedPaneFocus('pharma')
      return
    }
    if (activeTab === 'politicians') {
      if (feedPaneFocus !== 'insider' && feedPaneFocus !== 'case' && feedPaneFocus !== 'filter') setFeedPaneFocus('insider')
      return
    }
    if (activeTab === 'explore') {
      if (feedPaneFocus !== 'explore') setFeedPaneFocus('explore')
    }
  }, [activeTab, feedPaneFocus])

  const hasSafety =
    Array.isArray(pharmaSelectedResolved?.safety) && pharmaSelectedResolved.safety.length > 0

  const worksheetRows =
    activeTab === 'insider'
      ? buildInsiderWorksheetRows(insiderSelectedResolved?.caseSheet)
      : buildWorksheetRows(pharmaSelectedResolved, hasSafety)

  const daily =
    backendUp
      ? barsLive ?? []
      : activeTab === 'insider'
        ? (barsLive ?? insiderSelectedResolved?.daily ?? [])
        : activeTab === 'politicians'
          ? (politiciansSelectedResolved?.daily ?? [])
          : pharmaSelectedResolved?.daily ?? []

  const dailySeries = useMemo(() => {
    if (daily && daily.length >= 40) return daily
    return buildMockDailySeries(activeTab === 'insider' ? 71 : 133, 160)
  }, [daily, activeTab])

  const dailyDates = useMemo(() => buildEvenlySpacedDates(dailySeries.length), [dailySeries.length])
  const insiderTradeMarkers = useMemo(() => {
    if (!(activeTab === 'insider' || activeTab === 'politicians')) return []
    const cs = activeTab === 'politicians' ? politiciansSelectedResolved?.caseSheet : insiderSelectedResolved?.caseSheet
    if (!cs?.isForm4) return []
    const out = []
    for (const r of cs.rows ?? []) {
      const amt = Number(r?.amountUsd ?? 0)
      if (!(Number.isFinite(amt) && amt > 0)) continue
      const d = new Date(r.ts)
      if (Number.isNaN(d.getTime())) continue
      out.push(d)
    }
    return out
  }, [activeTab, insiderSelectedResolved?.caseSheet, politiciansSelectedResolved?.caseSheet])


  const dailyMin = dailySeries.length ? Math.min(...dailySeries) : 0
  const dailyMax = dailySeries.length ? Math.max(...dailySeries) : 0
  const dailyLast = dailySeries.length ? dailySeries[dailySeries.length - 1] : 0

  const worksheetMetaId =
    activeTab === 'insider'
      ? insiderSelectedResolved?.caseSheet?.issuer ?? insiderSelectedResolved?.id ?? '—'
      : activeTab === 'politicians'
        ? politiciansSelectedResolved?.caseSheet?.issuer ?? politiciansSelectedResolved?.id ?? '—'
        : pharmaSelectedResolved?.id ?? '—'

  const insiderCaseFeedRows = useMemo(() => {
    const cs = insiderSelectedResolved?.caseSheet
    if (!cs) return []
    const meta = []
    if (cs.ticker) meta.push({ layout: 'two', k: 'ISSUER', v: String(cs.ticker) })
    if (cs.formType) meta.push({ layout: 'two', k: 'FORM', v: String(cs.formType) })
    if (cs.filingId) meta.push({ layout: 'two', k: 'ACCESSION', v: String(cs.filingId) })

    function roleFromKey(key) {
      const k = String(key ?? '').trim()
      const m = k.match(/^(CEO|Director|CFO|Officer)\b/i)
      if (m) return m[1].toUpperCase()
      const first = k.split(/\s+/)[0]
      return first ? first.toUpperCase() : '-'
    }

    const showMoney = Boolean(cs.isForm4)
    let totalUsd = 0
    const trades = []
    for (const r of cs.rows ?? []) {
      const amt = showMoney && r.amountUsd != null ? Number(r.amountUsd) : 0
      if (Number.isFinite(amt) && amt > 0) totalUsd += amt
      const v = showMoney && r.amountUsd != null && Number(r.amountUsd) > 0 ? formatUsdCompact(r.amountUsd) : ''
      const when = showMoney && r.amountUsd != null && Number(r.amountUsd) > 0 ? formatFeedDate(r.ts) : ''
      if (!v) continue
      trades.push({ type: 'trade', k: roleFromKey(r.key), v, when, ts: r.ts })
    }

    const totalRow = { type: 'total', layout: 'two', k: 'TOTAL', v: totalUsd > 0 ? formatUsdCompact(totalUsd) : '-' }

    // Ordering: meta, TOTAL, blank separator, then trades. No trailing blank.
    return [...meta, totalRow, { type: 'blank' }, ...trades]
  }, [insiderSelectedResolved?.caseSheet])

  const politiciansCaseFeedRows = useMemo(() => {
    const cs = politiciansSelectedResolved?.caseSheet
    if (!cs) return []
    const meta = []
    if (cs.ticker) meta.push({ layout: 'two', k: 'ISSUER', v: String(cs.ticker) })
    if (cs.formType) meta.push({ layout: 'two', k: 'FORM', v: String(cs.formType) })
    if (cs.filingId) meta.push({ layout: 'two', k: 'ACCESSION', v: String(cs.filingId) })

    const showMoney = Boolean(cs.isForm4)
    let totalUsd = 0
    const trades = []
    for (const r of cs.rows ?? []) {
      const amt = showMoney && r.amountUsd != null ? Number(r.amountUsd) : 0
      if (Number.isFinite(amt) && amt > 0) totalUsd += amt
      const v = showMoney && r.amountUsd != null && Number(r.amountUsd) > 0 ? formatUsdCompact(r.amountUsd) : ''
      const when = showMoney && r.amountUsd != null && Number(r.amountUsd) > 0 ? formatFeedDate(r.ts) : ''
      if (!v) continue
      const k = String(r.key ?? '').trim()
      const first = k.split(/\s+/)[0]
      trades.push({ type: 'trade', k: first ? first.toUpperCase() : '-', v, when, ts: r.ts })
    }
    const totalRow = { type: 'total', layout: 'two', k: 'TOTAL', v: totalUsd > 0 ? formatUsdCompact(totalUsd) : '-' }
    return [...meta, totalRow, { type: 'blank' }, ...trades]
  }, [politiciansSelectedResolved?.caseSheet])

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

  const selectedInsiderTradeMarker = useMemo(() => {
    if (!(activeTab === 'insider' || activeTab === 'politicians')) return null
    const rowIndex = activeTab === 'politicians' ? politiciansCaseSelectedRowIndex : insiderCaseSelectedRowIndex
    const rows = activeTab === 'politicians' ? politiciansCaseFeedRows : insiderCaseFeedRows
    const row = rowIndex >= 0 ? rows[rowIndex] : null
    if (!row || row.type !== 'trade' || !row.ts) return null
    const d = new Date(row.ts)
    return Number.isNaN(d.getTime()) ? null : d
  }, [activeTab, insiderCaseSelectedRowIndex, insiderCaseFeedRows, politiciansCaseSelectedRowIndex, politiciansCaseFeedRows])

  useEffect(() => {
    // Reset case selection when the cluster changes.
    setInsiderCaseTradeIdx(0)
  }, [insiderSelected?.id, insiderSelected?.ticker])

  /* Inner padding inside SVG viewBox (stroke clearance); outer gutter is CSS .graphWrap */
  const plotInset = { left: 34, right: 8, top: 8, bottom: 18 }

  useEffect(() => {
    function onKey(e) {
      const el = e.target
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
        return
      }
      const k = e.key
      if (k === 'Tab') {
        e.preventDefault()
        setActiveTab((t) =>
          t === 'main'
            ? 'insider'
            : t === 'insider'
              ? 'pharma'
              : t === 'pharma'
                ? 'politicians'
                : t === 'politicians'
                  ? 'explore'
                  : 'main',
        )
        return
      }
      const left = k === 'ArrowLeft' || k === 'a' || k === 'A'
      const right = k === 'ArrowRight' || k === 'd' || k === 'D'
      const up = k === 'ArrowUp' || k === 'w' || k === 'W'
      const down = k === 'ArrowDown' || k === 's' || k === 'S'
      if (!left && !right && !up && !down) return
      e.preventDefault()
      if (left) {
        if (activeTab === 'pharma') {
          if (feedPaneFocus === 'programs') setFeedPaneFocus('pharma')
          return
        }
        if (activeTab === 'insider') {
          if (feedPaneFocus === 'case') setFeedPaneFocus('insider')
          return
        }
        if (activeTab === 'politicians') {
          if (feedPaneFocus === 'case') setFeedPaneFocus('insider')
          return
        }
        if (activeTab === 'explore') {
          return
        }
        return
      }
      if (right) {
        if (activeTab === 'pharma') {
          if (feedPaneFocus === 'pharma') setFeedPaneFocus('programs')
          return
        }
        if (activeTab === 'insider') {
          if (feedPaneFocus === 'insider') setFeedPaneFocus('case')
          return
        }
        if (activeTab === 'politicians') {
          if (feedPaneFocus === 'insider') setFeedPaneFocus('case')
          return
        }
        if (activeTab === 'explore') {
          return
        }
        return
      }
      if (feedPaneFocus === 'insider' && activeTab === 'insider') {
        setInsiderIdx((i) => clamp(i + (down ? 1 : -1), 0, insiderFeedRows.length - 1))
      } else if (feedPaneFocus === 'insider' && activeTab === 'politicians') {
        setPoliticiansIdx((i) => clamp(i + (down ? 1 : -1), 0, politiciansFeedRows.length - 1))
      } else if (feedPaneFocus === 'explore' && activeTab === 'explore') {
        const list = boshaFilteredRef.current ?? []
        if (!list.length) return
        const cur = list.findIndex((x) => x.ticker === boshaTickerRef.current)
        const idx = cur >= 0 ? cur : 0
        const next = clamp(idx + (down ? 1 : -1), 0, list.length - 1)
        setBoshaTicker(list[next].ticker)
      } else if (feedPaneFocus === 'case' && activeTab === 'insider') {
        const n = insiderCaseTradeRowIndices.length
        if (n <= 0) return
        setInsiderCaseTradeIdx((i) => clamp(i + (down ? 1 : -1), 0, n - 1))
      } else if (feedPaneFocus === 'case' && activeTab === 'politicians') {
        const n = politiciansCaseTradeRowIndices.length
        if (n <= 0) return
        setPoliticiansCaseTradeIdx((i) => clamp(i + (down ? 1 : -1), 0, n - 1))
      } else if (feedPaneFocus === 'pharma') {
        setPharmaIdx((i) => clamp(i + (down ? 1 : -1), 0, pharmaFeedRows.length - 1))
      } else if (feedPaneFocus === 'programs' && activeTab === 'pharma') {
        const items = programFeedItems
        if (items.length === 0) return
        setProgramRailIdx((cur) => {
          const next = clamp(cur + (down ? 1 : -1), 0, items.length - 1)
          const row = items[next]
          if (row?.trialEventId) setProgramRailEventId(row.trialEventId)
          setProgramRailMilestone(row ?? null)
          return next
        })
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [
    activeTab,
    feedPaneFocus,
    insiderFeedRows.length,
    politiciansFeedRows.length,
    pharmaFeedRows.length,
    insiderCaseTradeRowIndices,
    politiciansCaseTradeRowIndices,
    programFeedItems,
    pharmaFeedEventId,
    programRailEventId,
    programRailIdx,
    programRailMilestone,
  ])

  return (
    <>
      <nav className="sideTabsRail" aria-label="Views">
        <button
          type="button"
          className={activeTab === 'main' ? 'sideTab isActive' : 'sideTab'}
          aria-current={activeTab === 'main' ? 'page' : undefined}
          onClick={() => setActiveTab('main')}
        >
          <span className="sideTabLabel">MAIN</span>
        </button>
        <button
          type="button"
          className={activeTab === 'insider' ? 'sideTab isActive' : 'sideTab'}
          aria-current={activeTab === 'insider' ? 'page' : undefined}
          onClick={() => setActiveTab('insider')}
        >
          <span className="sideTabLabel">INSIDERS</span>
        </button>
        <button
          type="button"
          className={activeTab === 'pharma' ? 'sideTab isActive' : 'sideTab'}
          aria-current={activeTab === 'pharma' ? 'page' : undefined}
          onClick={() => setActiveTab('pharma')}
        >
          <span className="sideTabLabel">PHARMA</span>
        </button>
        <button
          type="button"
          className={activeTab === 'politicians' ? 'sideTab isActive' : 'sideTab'}
          aria-current={activeTab === 'politicians' ? 'page' : undefined}
          onClick={() => setActiveTab('politicians')}
        >
          <span className="sideTabLabel">POLITICIANS</span>
        </button>
        <button
          type="button"
          className={activeTab === 'explore' ? 'sideTab isActive' : 'sideTab'}
          aria-current={activeTab === 'explore' ? 'page' : undefined}
          onClick={() => setActiveTab('explore')}
        >
          <span className="sideTabLabel">EXPLORE</span>
        </button>
      </nav>
      <main className={`terminal terminal--${activeTab}`} aria-label="KENSIGLINE terminal grid">
      {activeTab === 'insider' ? (
        <>
          <CompactFeed
            placement="left"
            title="FEED"
            items={insiderFeedRows}
            selectedIndex={insiderIdx}
            focused={feedPaneFocus === 'insider'}
            sepMode="today+years"
            scrollMode
            onSelectIndex={(idx) => {
              setInsiderIdx(idx)
              setFeedPaneFocus('insider')
            }}
          />
          <CaseKvFeed
            title="CASE"
            rows={insiderCaseFeedRows}
            placement="right"
            focused={feedPaneFocus === 'case'}
            selectedTradeRowIndex={insiderCaseSelectedRowIndex}
            scrollMode
            onSelectTradeRowIndex={(rowIndex) => {
              const pos = insiderCaseTradeRowIndices.indexOf(rowIndex)
              if (pos >= 0) {
                setInsiderCaseTradeIdx(pos)
                setFeedPaneFocus('case')
              }
            }}
          />
        </>
      ) : null}

      {activeTab === 'pharma' ? (
        <>
          <CompactFeed
            placement="right"
            title="FEED"
            items={pharmaFeedRows}
            selectedIndex={pharmaIdx}
            focused={feedPaneFocus === 'pharma'}
            sepMode="today+years"
            scrollMode
            onSelectIndex={(idx) => {
              setPharmaIdx(idx)
              setFeedPaneFocus('pharma')
            }}
          />
          <CompactFeed
            placement="rail"
            panelClassName="blankFeedRail"
            title="PROGRAMS"
            programsTimeline
            items={programFeedItems}
            selectedIndex={programSelectedIdx}
            focused={feedPaneFocus === 'programs'}
            scrollMode
            onSelectIndex={(idx) => {
              setProgramRailIdx(idx)
              const row = programFeedItems[idx]
              if (row?.trialEventId) setProgramRailEventId(row.trialEventId)
              setProgramRailMilestone(row ?? null)
              setFeedPaneFocus('programs')
            }}
          />
        </>
      ) : null}

      {activeTab === 'politicians' ? (
        <>
          <PoliticiansFilterPanel
            activeName={politiciansFilter}
            items={politicianFilterItems}
            onSelect={(name) => setPoliticiansFilter(name)}
            focused={feedPaneFocus === 'filter'}
            onFocus={() => setFeedPaneFocus('filter')}
          />
          <CompactFeed
            placement="left"
            title="FEED"
            items={politiciansFeedRows}
            selectedIndex={politiciansIdx}
            focused={feedPaneFocus === 'insider'}
            sepMode="today+years"
            scrollMode
            onSelectIndex={(idx) => {
              setPoliticiansIdx(idx)
              setFeedPaneFocus('insider')
            }}
          />
          <CaseKvFeed
            title="CASE"
            rows={politiciansCaseFeedRows}
            placement="right"
            focused={feedPaneFocus === 'case'}
            selectedTradeRowIndex={politiciansCaseSelectedRowIndex}
            scrollMode
            onSelectTradeRowIndex={(rowIndex) => {
              const pos = politiciansCaseTradeRowIndices.indexOf(rowIndex)
              if (pos >= 0) {
                setPoliticiansCaseTradeIdx(pos)
                setFeedPaneFocus('case')
              }
            }}
          />
        </>
      ) : null}

      {activeTab === 'main' ? (
        <>
          <section className="panel mainTopPanel" aria-label="Main workspace">
            <div className="mainTopPanelBody">
              <MainOpportunityBoard />
            </div>
          </section>
          <section className="panel mainTopPicksPanel graph" aria-label="Top picks">
            <header className="feedCompactHeader">
              <div className="panelTitle feedCompactTitle">TOP PICKS</div>
            </header>
            <MainTopPicksBarChart />
          </section>
          <section className="panel mainLogoPanel" aria-label="Mercerline">
            <header className="feedCompactHeader">
              <div className="panelTitle feedCompactTitle">MERCERLINE</div>
            </header>
            <div className="mainLogoPanelInner">
              <div className="mainLogoPanelBrand">
                <img
                  className="mainLogoPanelImg"
                  src="/mercerline_logo_transparent.png"
                  alt="Mercerline"
                  decoding="async"
                />
              </div>
              <div className="mainLogoPanelStats" aria-label="Backend status">
                <div className="mainDashChips mainDashChips--inLogo">
                  <span className={`topStatChip ${backendUp ? 'isUp' : 'isDown'}`}>{backendUp ? 'UP' : 'DOWN'}</span>
                  <span className="topStatChip mono">
                    {backendUp ? `${(Math.max(0, Date.now() - backendLastOkAt) / 1000).toFixed(0)}s` : '-'}
                  </span>
                  <span className="topStatChip mono">Q{backendStats?.queue?.queued ?? 0}</span>
                  <span className="topStatChip mono">R{backendStats?.queue?.ready_to_parse ?? 0}</span>
                  <span className="topStatChip mono">P{backendStats?.queue?.parsing ?? 0}</span>
                  <span className="topStatChip mono">I{backendStats?.parsed?.insider?.count ?? 0}</span>
                  <span className="topStatChip mono">PH{backendStats?.parsed?.pharma?.count ?? 0}</span>
                </div>
              </div>
            </div>
          </section>
        </>
      ) : null}

      {activeTab === 'explore' ? (
        <>
          <BoshaTickerPanel
            selectedTicker={boshaTicker}
            onSelectTicker={setBoshaTicker}
            focused={feedPaneFocus === 'explore'}
            onFocus={() => setFeedPaneFocus('explore')}
            q={boshaQuery}
            onQuery={setBoshaQuery}
            filtered={boshaFilteredFeed}
          />
          <BoshaPaperPanel
            ticker={boshaTicker}
            companyName={boshaCompanyName}
            entities={boshaDataset.entities}
            events={boshaDataset.events}
            edges={boshaDataset.edges}
            priceSeries={boshaPriceSeries}
            backendUp={backendUp}
            livePresentation={boshaExploreLive?.presentation}
            liveCompanyName={boshaExploreLive?.company_name}
          />
        </>
      ) : null}

      {activeTab === 'pharma' ? (
        <section className="panel worksheet" aria-label="Trial worksheet">
          <header className="feedCompactHeader">
            <div className="panelTitle feedCompactTitle">CASE WORKSHEET</div>
            <div className="feedCompactMeta">
              <span>{worksheetMetaId}</span>
            </div>
          </header>

          <div className="worksheetBody">{worksheetRows}</div>
        </section>
      ) : null}

      {activeTab !== 'explore' && activeTab !== 'main' ? (
        <>
          <HistoricalOutcomesPanel mode={activeTab === 'politicians' ? 'insider' : activeTab} backendUp={backendUp} />
          <ContextPanel
            mode={activeTab === 'politicians' ? 'insider' : activeTab}
            pharmaEvent={pharmaSelectedResolved}
            insiderRow={activeTab === 'politicians' ? politiciansSelectedResolved : insiderSelectedResolved}
            backendUp={backendUp}
            maxSentences={activeTab === 'insider' ? 4 : 3}
          />

          <GraphPanel
            title="DAILY GRAPH"
            series={dailySeries}
            dates={dailyDates}
            markers={insiderTradeMarkers}
            selectedMarker={selectedInsiderTradeMarker}
          />

          <CompanyPanel mode={activeTab === 'politicians' ? 'insider' : activeTab} company={companyLive} backendUp={backendUp} />
        </>
      ) : null}
      </main>
    </>
  )
}

export default App
