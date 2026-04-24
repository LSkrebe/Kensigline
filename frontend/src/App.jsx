import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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

/** ISO or Date → numeric date (YY-MM-DD). */
function formatFeedDate(at) {
  const d = at instanceof Date ? at : new Date(at)
  if (Number.isNaN(d.getTime())) return EMPTY
  return formatYyMmDd(d)
}

/** Newest events first (by `at`). */
function sortFeedRowsByAtDesc(rows) {
  return [...rows].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
}

/** Rows for compact feed UI: inserts a “TODAY” divider between local-today events and older (newest-first lists). */
function buildFeedDisplayRows(items) {
  const out = []
  for (let i = 0; i < items.length; i++) {
    const row = items[i]
    if (
      i > 0 &&
      !isAtLocalToday(row.at) &&
      isAtLocalToday(items[i - 1].at)
    ) {
      out.push({ type: 'sep', key: `today-sep-before-${row.id}` })
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
  // Timeline should be explicit (no time-of-day).
  return formatYyMmDd(d)
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

  return {
    id: `ins-${i}`,
    label,
    count,
    ticker,
    at,
    daily: buildInsiderDailySeries(i + 31),
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
  if (!caseSheet) {
    return [
      <KvLine key="empty">
        <span className="kvK dim">Case</span>
        <span className="kvV dim">{EMPTY}</span>
      </KvLine>,
    ]
  }

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
  if (!selected) {
    rows.push(
      <KvLine key="empty">
        <span className="kvK dim">Case</span>
        <span className="kvV dim">{EMPTY}</span>
      </KvLine>,
    )
    return rows
  }

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

  return (
    <section className="panel historicalOutcomes blankTile--a" aria-label="Historical outcomes">
      <header className="feedCompactHeader">
        <div className="panelTitle feedCompactTitle">HISTORICAL OUTCOMES</div>
      </header>
      <div className="worksheetBody historicalOutcomesBody">
        {insider ? (
          <>
            <KvLine key="ho-ins-avg">
              <span className="kvK dim">Avg ret (21d/63d/252d)</span>
              <span className="kvV mono">{ins?.avgReturn21d63d252d ?? '—'}</span>
            </KvLine>
            <KvLine key="ho-ins-med">
              <span className="kvK dim">Median return</span>
              <span className="kvV mono">{ins?.medianReturn ?? '—'}</span>
            </KvLine>
            <KvLine key="ho-ins-win">
              <span className="kvK dim">Win rate</span>
              <span className="kvV mono">{ins?.winRate ?? '—'}</span>
            </KvLine>
            <KvLine key="ho-ins-n">
              <span className="kvK dim">Sample size</span>
              <span className="kvV mono">{ins?.sampleSize ?? '—'}</span>
            </KvLine>
            <KvLine key="ho-ins-role">
              <span className="kvK dim">Role</span>
              <span className="kvV">{ins?.conditioningRole ?? '—'}</span>
            </KvLine>
            <KvLine key="ho-ins-txn">
              <span className="kvK dim">Transaction type</span>
              <span className="kvV">{ins?.conditioningTxn ?? '—'}</span>
            </KvLine>
            <KvLine key="ho-ins-pct">
              <span className="kvK dim">Size percentile</span>
              <span className="kvV mono">{ins?.conditioningSizePct ?? '—'}</span>
            </KvLine>
          </>
        ) : (
          <>
            <KvLine key="ho-ph-p3">
              <span className="kvK dim">Phase 3 failure</span>
              <span className="kvV mono">{ins?.avgAfterPh3Failure ?? '—'}</span>
            </KvLine>
            <KvLine key="ho-ph-p2">
              <span className="kvK dim">Phase 2 miss</span>
              <span className="kvV mono">{ins?.avgAfterPh2Miss ?? '—'}</span>
            </KvLine>
            <KvLine key="ho-ph-med">
              <span className="kvK dim">Median return</span>
              <span className="kvV mono">{ins?.medianReturn ?? '—'}</span>
            </KvLine>
            <KvLine key="ho-ph-drop">
              <span className="kvK dim">{'% large drops (>30%)'}</span>
              <span className="kvV mono">{ins?.pctLargeDropsOver30 ?? '—'}</span>
            </KvLine>
            <KvLine key="ho-ph-n">
              <span className="kvK dim">Sample size</span>
              <span className="kvV mono">{ins?.sampleSize ?? '—'}</span>
            </KvLine>
            <KvLine key="ho-ph-ind">
              <span className="kvK dim">Indication</span>
              <span className="kvV">{ins?.conditioningIndication ?? '—'}</span>
            </KvLine>
            <KvLine key="ho-ph-co">
              <span className="kvK dim">Company size bucket</span>
              <span className="kvV">{ins?.conditioningCoSize ?? '—'}</span>
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
      ? `${drug} (${phase}) targets ${ind}; ${pm}.`
      : phase
        ? `${drug} (${phase}) targets ${ind}.`
        : `${drug} targets ${ind}.`

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
    return row.__context_sentences.map((s) => String(s)).filter(Boolean).slice(0, 3)
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

function ContextPanel({ mode, pharmaEvent, insiderRow, backendUp }) {
  const pharma = mode === 'pharma'
  const sentencesRaw = pharma ? buildPharmaContextSentences(pharmaEvent) : buildInsiderContextSentences(insiderRow)
  const sentences = backendUp ? (sentencesRaw?.filter((s) => String(s ?? '').trim()).slice(0, 3) ?? []) : sentencesRaw
  const display = backendUp ? (sentences.length ? sentences : [EMPTY]) : sentences

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
}) {
  const listRef = useRef(null)
  const [rowsPerPage, setRowsPerPage] = useState(16)

  const displayRows = useMemo(
    () => (programsTimeline ? buildProgramGroupedDisplayRows(items) : buildFeedDisplayRows(items)),
    [items, programsTimeline],
  )

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

  const totalPages = Math.max(1, Math.ceil(Math.max(1, displayLen || total) / pageSize))
  const page =
    displayLen && total
      ? clamp(Math.floor(selectedDisplayIdx / pageSize), 0, totalPages - 1)
      : 0
  const pageStart = page * pageSize
  const pageSlice =
    displayLen && total ? displayRows.slice(pageStart, pageStart + pageSize) : []

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
        {headerMetaMode === 'full' ? (
          <div className="feedCompactMeta feedCompactMeta--paginationOnly">
            <span className="feedPageInd">
              {total ? `${page + 1}/${totalPages}` : '0/0'}
            </span>
          </div>
        ) : null}
        {headerMetaMode === 'ghost' ? (
          <div className="feedCompactMeta feedCompactMeta--ghost" aria-hidden="true">
            <span className="feedPageInd">
              {total ? `${page + 1}/${totalPages}` : '0/0'}
            </span>
          </div>
        ) : null}
        {headerMetaMode === 'paginationOnly' ? (
          <div className="feedCompactMeta feedCompactMeta--paginationOnly">
            <span className="feedPageInd">{total ? `${page + 1}/${totalPages}` : '0/0'}</span>
          </div>
        ) : null}
      </header>
      <div ref={listRef} className="feedCompactList" role="list">
        {pageSlice.map((entry, i) => {
          const globalIdx = pageStart + i
          if (entry.type === 'sep') {
            return (
              <div
                key={`${placement}-${entry.key}-${globalIdx}`}
                className="feedRowTodaySep"
                  role="presentation"
              >
                {programsTimeline ? entry.label : 'TODAY'}
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

function App() {
  const [focusFeed, setFocusFeed] = useState('insider')
  /** Which feed column receives arrow up/down: insider | pharma | programs (rail). */
  const [feedPaneFocus, setFeedPaneFocus] = useState('insider')
  const [insiderIdx, setInsiderIdx] = useState(0)
  const [pharmaIdx, setPharmaIdx] = useState(0)
  /** When set, case sheet + graph follow this trial; cleared when pharma feed row or sponsor context changes */
  const [programRailEventId, setProgramRailEventId] = useState(null)
  const [programRailIdx, setProgramRailIdx] = useState(0)
  const [programRailMilestone, setProgramRailMilestone] = useState(null)

  const [backendUp, setBackendUp] = useState(false)
  const [backendLastOkAt, setBackendLastOkAt] = useState(0)

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

  const [insiderFeedLive, setInsiderFeedLive] = useState(null)
  const [insiderClusterLive, setInsiderClusterLive] = useState(null)
  const [barsLive, setBarsLive] = useState(null)
  const [companyLive, setCompanyLive] = useState(null)

  const [pharmaFeedLive, setPharmaFeedLive] = useState(null)
  const [pharmaEventLive, setPharmaEventLive] = useState(null)
  const [programFeedLive, setProgramFeedLive] = useState(null)

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
      focusFeed === 'pharma' && programRailEventId != null
        ? programRailEventId
        : pharmaFeedEventId
    const base = MOCK_EVENTS.find((e) => e.id === id) ?? MOCK_EVENTS[0]
    // When navigating the PROGRAMS rail, use the selected timeline row as the "current event"
    // so the case worksheet changes per row.
    if (feedPaneFocus === 'programs' && focusFeed === 'pharma' && programRailMilestone) {
      return synthesizeEventForMilestone(base, programRailMilestone)
    }
    return base
  }, [feedPaneFocus, focusFeed, programRailEventId, pharmaFeedEventId, programRailMilestone])

  const pharmaSelectedResolved = useMemo(() => {
    if (backendUp && focusFeed !== 'pharma') return null
    if (backendUp && !pharmaEventLive) return null
    if (!pharmaEventLive || focusFeed !== 'pharma') return pharmaSelected
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
  }, [pharmaEventLive, focusFeed, pharmaSelected, pharmaFeedEventId])

  const insiderSelectedResolved = useMemo(() => {
    if (!backendUp || focusFeed !== 'insider' || !insiderClusterLive) return insiderSelected
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
  }, [backendUp, focusFeed, insiderSelected, insiderClusterLive])

  const viewLabel = useMemo(() => {
    const base = focusFeed === 'insider' ? 'Insider terminal' : 'Pharma terminal'
    return base
  }, [focusFeed])

  const isRealView = useMemo(() => {
    return Boolean(backendUp)
  }, [backendUp])

  // Insider cluster: case worksheet + context
  useEffect(() => {
    let alive = true
    async function run() {
      if (!backendUp || focusFeed !== 'insider') {
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
  }, [backendUp, focusFeed, insiderSelected?.ticker, insiderSelected?.__backend_id])

  // Bars (Daily Graph) + Company panel: use selected ticker in either mode
  const selectedTicker = useMemo(() => {
    if (focusFeed === 'insider') return insiderSelected?.ticker ? String(insiderSelected.ticker).toUpperCase() : null
    return pharmaTicker ? String(pharmaTicker).toUpperCase() : null
  }, [focusFeed, insiderSelected?.ticker, pharmaTicker])

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
      if (focusFeed !== 'pharma') {
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
  }, [backendUp, focusFeed, pharmaFeedEventId, pharmaFeedLive])

  const programSelectedIdx = useMemo(() => {
    if (focusFeed !== 'pharma' || programFeedItems.length === 0) return 0
    return clamp(programRailIdx, 0, programFeedItems.length - 1)
  }, [focusFeed, programFeedItems.length, programRailIdx])

  useEffect(() => {
    setProgramRailEventId(null)
    setProgramRailIdx(0)
    setProgramRailMilestone(null)
  }, [pharmaIdx])

  useEffect(() => {
    if (focusFeed === 'insider') {
      setProgramRailEventId(null)
      setFeedPaneFocus('insider')
    }
  }, [focusFeed])

  const hasSafety =
    Array.isArray(pharmaSelectedResolved?.safety) && pharmaSelectedResolved.safety.length > 0

  const worksheetRows =
    focusFeed === 'insider'
      ? buildInsiderWorksheetRows(insiderSelectedResolved?.caseSheet)
      : buildWorksheetRows(pharmaSelectedResolved, hasSafety)

  const daily =
    backendUp
      ? barsLive ?? []
      : focusFeed === 'insider'
        ? (barsLive ?? insiderSelectedResolved?.daily ?? [])
        : pharmaSelectedResolved?.daily ?? []

  const dailyMin = daily.length ? Math.min(...daily) : 0
  const dailyMax = daily.length ? Math.max(...daily) : 0
  const dailyLast = daily.length ? daily[daily.length - 1] : 0

  const worksheetMetaId =
    focusFeed === 'insider'
      ? insiderSelectedResolved?.caseSheet?.issuer ?? insiderSelectedResolved?.id ?? '—'
      : pharmaSelectedResolved?.id ?? '—'

  /* Inner padding inside SVG viewBox (stroke clearance); outer gutter is CSS .graphWrap */
  const plotInset = { left: 8, right: 8, top: 8, bottom: 8 }

  useEffect(() => {
    function onKey(e) {
      const el = e.target
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
        return
      }
      const k = e.key
      const left = k === 'ArrowLeft' || k === 'a' || k === 'A'
      const right = k === 'ArrowRight' || k === 'd' || k === 'D'
      const up = k === 'ArrowUp' || k === 'w' || k === 'W'
      const down = k === 'ArrowDown' || k === 's' || k === 'S'
      if (!left && !right && !up && !down) return
      e.preventDefault()
      if (left) {
        if (feedPaneFocus === 'programs') {
          setFeedPaneFocus('pharma')
          setFocusFeed('pharma')
        } else if (feedPaneFocus === 'pharma') {
          setFeedPaneFocus('insider')
          setFocusFeed('insider')
        }
        return
      }
      if (right) {
        if (feedPaneFocus === 'insider') {
          setFeedPaneFocus('pharma')
          setFocusFeed('pharma')
        } else if (feedPaneFocus === 'pharma') {
          setFeedPaneFocus('programs')
          setFocusFeed('pharma')
        }
        return
      }
      if (feedPaneFocus === 'insider') {
        setInsiderIdx((i) => clamp(i + (down ? 1 : -1), 0, insiderFeedRows.length - 1))
      } else if (feedPaneFocus === 'pharma') {
        setPharmaIdx((i) => clamp(i + (down ? 1 : -1), 0, pharmaFeedRows.length - 1))
      } else if (feedPaneFocus === 'programs' && focusFeed === 'pharma') {
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
    feedPaneFocus,
    focusFeed,
    programFeedItems,
    pharmaFeedEventId,
    programRailEventId,
    programRailIdx,
    programRailMilestone,
  ])

  return (
    <>
      <header className="topTabsBar" aria-label="Views">
        <div className="topTabsLeft">
          <div className="topTab" aria-current="page">
            {viewLabel}
          </div>
        </div>
        <div className="topTabsRight">
          <span className={`sourceBadge ${isRealView ? 'isReal' : 'isMock'}`}>
            {isRealView ? 'REAL' : 'MOCK'}
          </span>
        </div>
      </header>
      <main className="terminal" aria-label="KENSIGLINE terminal grid">
      <CompactFeed
        placement="left"
        title="INSIDER FEED"
        items={insiderFeedRows}
        selectedIndex={insiderIdx}
        focused={feedPaneFocus === 'insider'}
        onSelectIndex={(idx) => {
          setInsiderIdx(idx)
          setFocusFeed('insider')
          setFeedPaneFocus('insider')
        }}
      />
      <CompactFeed
        placement="right"
        title="PHARMA FEED"
        items={pharmaFeedRows}
        selectedIndex={pharmaIdx}
        focused={feedPaneFocus === 'pharma'}
        onSelectIndex={(idx) => {
          setPharmaIdx(idx)
          setFocusFeed('pharma')
          setFeedPaneFocus('pharma')
        }}
      />

      <CompactFeed
        placement="rail"
        panelClassName="blankFeedRail"
        title="PROGRAMS"
        headerMetaMode="paginationOnly"
        programsTimeline
        items={focusFeed === 'pharma' ? programFeedItems : []}
        selectedIndex={programSelectedIdx}
        focused={feedPaneFocus === 'programs'}
        onSelectIndex={(idx) => {
          setProgramRailIdx(idx)
          const row = programFeedItems[idx]
          if (row?.trialEventId) setProgramRailEventId(row.trialEventId)
          setProgramRailMilestone(row ?? null)
          setFocusFeed('pharma')
          setFeedPaneFocus('programs')
        }}
      />

      <section
        className={`panel worksheet ${focusFeed === 'insider' ? 'worksheet--insider' : ''}`}
        aria-label={focusFeed === 'insider' ? 'Insider filing worksheet' : 'Trial worksheet'}
      >
        <header className="feedCompactHeader">
          <div className="panelTitle feedCompactTitle">CASE WORKSHEET</div>
          <div className="feedCompactMeta">
            <span>{worksheetMetaId}</span>
          </div>
        </header>

        <div className="worksheetBody">{worksheetRows}</div>
      </section>

      <HistoricalOutcomesPanel mode={focusFeed} backendUp={backendUp} />
      <ContextPanel mode={focusFeed} pharmaEvent={pharmaSelectedResolved} insiderRow={insiderSelectedResolved} backendUp={backendUp} />

      <section className="panel graph" aria-label="Daily graph">
        <header className="panelHeader">
          <div className="panelTitle">
            DAILY GRAPH
          </div>
          <div className="panelMeta">
            L {dailyLast} | R {dailyMin}–{dailyMax}
          </div>
        </header>
        <div className="graphWrap" aria-label="Mock daily price graph">
          <svg
            className="graphSvg"
            viewBox="0 0 900 140"
            preserveAspectRatio="none"
            role="img"
            aria-label="Sparkline"
          >
            <path className="graphPath" d={toPath(daily, 900, 140, plotInset)} />
                </svg>
        </div>
      </section>

      <CompanyPanel mode={focusFeed} company={companyLive} backendUp={backendUp} />
      </main>
    </>
  )
}

export default App
