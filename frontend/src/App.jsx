import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { fetchJsonSafe } from './api.js'
import { useAuth } from './AuthContext.jsx'
import { IntroPage } from './IntroPage.jsx'
import { SettingsPanel } from './SettingsPanel.jsx'
import './App.css'

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n))
}

const EMPTY = '-'

/* Chart area fill under line — CSS vars follow market/clinical intel theme. */
const CHART_AREA_GRAD_TOP = 'var(--intel-accent-area-top)'
const CHART_AREA_GRAD_BOTTOM = 'var(--intel-accent-area-bottom)'

/** Inline SVG paint: avoids WebKit/CSS cascade quirks on <text> and export rasterizers. */
const GRAPH_SVG_FONT =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
const GRAPH_SVG_TICK = { fill: 'rgba(255, 255, 255, 0.42)', fontSize: 11, fontFamily: GRAPH_SVG_FONT }
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

/** Mock CASE panel copy — narrative analysis per trial event (replaces KV worksheet). */
const MOCK_PHARMA_ANALYSIS = {
  'ONC-441-P2-READOUT':
    'OncoNadir disclosed an interim Phase II efficacy update for ONC-441, a CD47×EGFR bispecific in second-line metastatic colorectal cancer. The company-reported readout showed an objective response rate of 28.2% and disease control rate of 71.0% in an EGFR-high enriched cohort (N=124), with median duration of response still immature at 5.6 months.\n\nSafety remained manageable relative to prior bispecific concerns: grade ≥3 treatment-related adverse events were 9%, infusion-related reactions 12% (mostly grade 1–2), and treatment discontinuation due to adverse events 3%. The study remains active but not recruiting, with primary completion estimated August 2026.\n\nInvestors will weigh whether the ORR/DCR profile is competitive versus SOC benchmarks in 2L+ mCRC and whether durability matures favorably ahead of a registrational path.',
  'NRX-118-FDA-UPDATE':
    'NeuroRex filed an 8-K noting FDA feedback on NRX-118, an intrathecal antisense oligonucleotide in a Phase I/II rare neurodegenerative program. The correspondence centered on chemistry, manufacturing, and controls—specifically a comparability request—rather than a clinical hold or trial stop.\n\nThe program remains recruiting (N=38 planned) with primary focus on target RNA knockdown and exploratory functional endpoints. No efficacy data were disclosed in this filing.\n\nFor holders, the update signals regulatory scrutiny on CMC scale-up rather than a fundamental efficacy setback; timeline risk hinges on how quickly comparability packages satisfy the agency.',
  'KLM-210-TRIAL-DELAY':
    'KaleidoMetrix reported a Phase III NASH enrollment pause tied to a site audit notice for KLM-210, an oral FXR agonist. The double-blind placebo-controlled study (N≈1,200) targets fibrosis improvement without worsening of NASH; the filing did not revise primary completion guidance (December 2026 estimate).\n\nManagement framed the pause as operational—audit-driven—without citing new safety signals in the release excerpt. The trial status remains active, not recruiting, during the pause window.\n\nThe delay extends time-to-data for a crowded NASH landscape and may pressure near-term sentiment until enrollment restarts and audit findings are cleared.',
  'BETA-AMYLOID-FAIL':
    'BlueArc Biologics announced topline Phase II results for BA-19, a beta-amyloid monoclonal antibody in early Alzheimer’s disease. The primary cognitive composite at 18 months was not met despite amyloid PET reduction versus baseline, marking an endpoint miss on the clinical outcome investors track most closely.\n\nSafety included ARIA-E at 8.1%, serious adverse events 6.4%, and discontinuation for adverse events 4.5%. The study is completed from an enrollment standpoint with primary completion in March 2026.\n\nThe readout challenges the program’s commercial thesis: biomarker engagement alone did not translate into functional benefit, raising questions on dose, population enrichment, or competitive positioning versus approved amyloid therapies.',
  'RXQ-701-PH3-START':
    'Renexus Pharma activated the first China site in the global Phase III IgA nephropathy trial of RXQ-701, an endothelin antagonist given once daily. The registrational program (N=980, 2:1 randomization) uses eGFR slope at week 104 as the primary endpoint, with UPCR and composite renal outcomes as key secondaries.\n\nEnrollment stood at 412 of 980 patients (42%) at the time of disclosure; standard-of-care RAS blockade is permitted. Early safety monitoring highlighted hypotension (7%), hyperkalemia (4%), and acute kidney injury under 1%.\n\nSite activation in China broadens geographic recruitment capacity and de-risks timeline slippage if US/EU sites were pacing behind plan.',
  'ONC-992-P1-START':
    'OncoNadir announced first-site activation for ONC-992, a Phase I dose-escalation study of the same CD47×EGFR bispecific platform in first-line mCRC. The open-label design (three dose levels, N=54) seeks MTD/RP2D with preliminary ORR and safety as secondary readouts.\n\nThis program sits alongside the Phase II ONC-441 readout and shares sponsor and mechanism class, but targets an earlier line of therapy. No efficacy data are expected near term.\n\nFor the sponsor, parallel Phase I and Phase II assets demonstrate platform breadth; investors should monitor dose-limiting toxicities and any overlap with ONC-441 safety learnings.',
}

function resolvePharmaAnalysis(liveEvent, mockEvent) {
  const ws = liveEvent?.worksheet
  if (typeof ws?.analysis === 'string' && ws.analysis.trim()) return ws.analysis.trim()
  if (typeof liveEvent?.analysis === 'string' && liveEvent.analysis.trim()) return liveEvent.analysis.trim()
  const ctx = liveEvent?.context_sentences
  if (Array.isArray(ctx) && ctx.length > 0) {
    return ctx
      .map((s) => String(s ?? '').trim())
      .filter(Boolean)
      .join('\n\n')
  }
  const mockId = mockEvent?.id
  if (mockId && MOCK_PHARMA_ANALYSIS[mockId]) return MOCK_PHARMA_ANALYSIS[mockId]
  if (typeof mockEvent?.analysis === 'string' && mockEvent.analysis.trim()) return mockEvent.analysis.trim()
  return null
}

function PharmaCaseAnalysis({ text }) {
  const body = String(text ?? '').trim()
  if (!body) {
    return <p className="researchPaperProse pharmaCaseProse dim">No analysis available for this event.</p>
  }
  const paras = body.split(/\n\n+/).map((p) => p.trim()).filter(Boolean)
  if (paras.length === 0) {
    return <p className="researchPaperProse pharmaCaseProse">{body}</p>
  }
  return paras.map((p, i) => (
    <p className="researchPaperProse pharmaCaseProse" key={`pharma-case-p-${i}`}>
      {p}
    </p>
  ))
}

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
const BOSHA_TICKER_MARKET = 'ASML'
const BOSHA_TICKER_CLINICAL = 'ATYR'

/** Research feed + offline papers per top-bar intelligence mode. */
const RESEARCH_FEED_BY_INTEL = {
  market: [{ rowKey: 'fb-ASML', ticker: 'ASML', name: 'ASML Holding N.V.' }],
  clinical: [{ rowKey: 'fb-ATYR', ticker: 'ATYR', name: 'aTyr Pharma, Inc.' }],
}

function researchTickersForIntelMode(intelMode) {
  return (RESEARCH_FEED_BY_INTEL[intelMode === 'clinical' ? 'clinical' : 'market'] ?? RESEARCH_FEED_BY_INTEL.market).map(
    (x) => String(x.ticker).toUpperCase(),
  )
}

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

function _boshaExplainerForTicker(ticker) {
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

/** PTR paper/context row: chamber then member name. */
function paperPoliticianTxnLabel(chamber, name) {
  const prefix = paperPoliticianChamberLabel(chamber)
  const n = String(name ?? '').trim()
  if (!n) return prefix
  return `${prefix}, ${n}`
}

/** Research CONTEXT panel mock profiles (offline); keyed to feed/paper tickers ASML + ATYR. */
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
    mcap: '€350B',
    earningsDaysAhead: 17,
    insiders: [
      { key: 'CEO', person: 'Christophe Borel', at: 'today', amount: '$8.2M' },
      { key: 'CEO', person: 'Christophe Borel', at: '2026-05-10', amount: '$1.1M' },
      { key: 'CFO', person: 'Roger Dassen', at: '2026-03-25', amount: '$2.1M' },
      { key: 'CFO', person: 'Roger Dassen', at: '2026-05-18', amount: '$640K' },
      { key: 'CTO', person: 'Frederic Schneider-Maunoury', at: '2026-02-20', amount: '$960K' },
      { key: 'Director', person: 'Sophie van der Meer', at: '2026-01-14', amount: '$1.4M' },
    ],
    politicians: [
      { name: 'Nancy Pelosi', chamber: 'house', at: '2026-05-02', amount: '$420K' },
      { name: 'Nancy Pelosi', chamber: 'house', at: '2026-05-20', amount: '$95K' },
      { name: 'Dan Crenshaw', chamber: 'house', at: '2026-03-01', amount: '$180K' },
      { name: 'John Thune', chamber: 'senate', at: '2026-02-08', amount: '$210K' },
      { name: 'Gina Raimondo', chamber: 'executive', at: '2026-01-12', amount: '$95K' },
    ],
  },
  ATYR: {
    sector: 'Biotechnology',
    country: 'US',
    mcap: '$320M',
    earningsDaysAhead: 5,
    leadDrug: {
      name: 'Efzofitimod',
      indication: 'ILD',
      stage: 'Phase 3',
      next: '2026-07-18',
    },
    programs: [
      {
        key: 'Efzofitimod',
        indication: 'ILD',
        stage: 'Phase 3',
        milestones: [
          { at: '2026-02-11', label: 'Enrollment update', url: 'https://clinicaltrials.gov/study/NCT05415137' },
          { at: '2026-04-09', label: 'Interim safety', url: 'https://www.sec.gov/edgar/search/' },
          { at: '2026-07-18', label: 'Topline readout', url: 'https://clinicaltrials.gov/study/NCT05415137' },
        ],
      },
      {
        key: 'Efzofitimod',
        indication: 'Sarcoidosis',
        stage: 'Phase 2',
        milestones: [
          { at: '2026-03-03', label: 'Dose selection', url: 'https://clinicaltrials.gov/study/NCT05415137' },
          { at: '2026-06-06', label: 'Biomarker update', url: 'https://www.sec.gov/edgar/search/' },
        ],
      },
      {
        key: 'ATYR-2810',
        indication: 'Solid tumors',
        stage: 'Phase 1',
        milestones: [
          { at: '2026-01-17', label: 'Escalation ongoing', url: 'https://www.sec.gov/edgar/search/' },
          { at: '2026-05-22', label: 'Initial response signal', url: 'https://www.sec.gov/edgar/search/' },
        ],
      },
    ],
    insiders: [
      { key: 'CMO', person: 'Sanjay S. Shukla', at: '2026-05-20', amount: '$240K' },
      { key: 'CEO', person: 'John Mendlein', at: '2026-04-02', amount: '$890K' },
      { key: 'Director', person: 'Jill Bates', at: '2026-03-05', amount: '$125K' },
      { key: 'CFO', person: 'Stephen A. Hall', at: '2026-01-30', amount: '$310K' },
    ],
    politicians: [
      { name: 'Tommy Tuberville', chamber: 'senate', at: '2026-04-24', amount: '$65K' },
      { name: 'Mark Kelly', chamber: 'senate', at: '2026-03-28', amount: '$42K' },
      { name: 'Ro Khanna', chamber: 'house', at: '2026-02-20', amount: '$28K' },
    ],
  },
}

function contextMockFlowDate(row, dateDaysAgo) {
  if (String(row?.at ?? '').trim().toLowerCase() === 'today') {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }
  if (row?.at) {
    const d = new Date(`${String(row.at).trim()}T00:00:00.000Z`)
    if (Number.isFinite(d.getTime())) return d
  }
  if (row?.daysAgo != null) return dateDaysAgo(row.daysAgo)
  return dateDaysAgo(0)
}

function contextMockForTicker(ticker, priceSeries) {
  const t = String(ticker ?? 'ATYR').toUpperCase()
  const base = CONTEXT_MOCK_PROFILES[t] ?? CONTEXT_MOCK_PROFILES.ATYR
  const dateDaysAgo = (daysAgo) => {
    const d = new Date()
    d.setDate(d.getDate() - daysAgo)
    d.setHours(0, 0, 0, 0)
    return d
  }
  const offlinePrice = boshaDatasetForTicker(t).price
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
    sector: base.sector,
    domicile: contextCountryLabel(base.country),
    mcap: base.mcap,
    earnings: contextEarningsFromDate(earningsDay),
    leadDrug: base.leadDrug ?? null,
    programs: Array.isArray(base.programs) ? base.programs : [],
    insiders: base.insiders.map((row) => ({
      key: row.key,
      person: row.person ?? null,
      date: contextMockFlowDate(row, dateDaysAgo),
      amount: row.amount,
    })),
    politicians: base.politicians.map((row) => ({
      name: row.name,
      chamber: row.chamber ?? 'house',
      date: contextMockFlowDate(row, dateDaysAgo),
      amount: row.amount,
    })),
  }
}

const CONTEXT_FLOW_MONTH_DAYS = 30

/** Matches backend `Horizon` in outcomes.ts — trading days after event, not calendar weeks. */
const OUTCOME_HORIZON_DAYS = [21, 63, 252]
const OUTCOME_HORIZON_LABELS = ['21d', '63d', '252d']

/** Baseline avg forward returns (fractions) from global insider outcomes mock / API shape. */
const OUTCOME_BASE_INSIDER_RETURNS = [0.0042, 0.0108, 0.0234]
const OUTCOME_BASE_POLITICIAN_RETURNS = [0.0018, 0.0052, 0.0112]

const CONTEXT_OUTCOME_LINE_COLORS = [
  'rgba(255, 255, 255, 0.9)',
  'rgba(168, 196, 255, 0.82)',
  'rgba(255, 212, 92, 0.78)',
  'rgba(120, 220, 160, 0.76)',
  'rgba(255, 160, 200, 0.74)',
  'rgba(200, 180, 255, 0.72)',
]

function mockOutcomeReturnsForKey(key, baseReturns, ticker) {
  const seed = boshaSeedFromTicker(`${ticker}-${key}`)
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
  if (!Number.isFinite(x) || x <= 0) return EMPTY
  if (x >= 1e9) return `$${(x / 1e9).toFixed(2)}B`
  if (x >= 1e6) return `$${(x / 1e6).toFixed(1)}M`
  if (x >= 1e3) return `$${Math.round(x / 1e3)}K`
  return `$${Math.round(x)}`
}

function isWithinPastDays(date, days = CONTEXT_FLOW_MONTH_DAYS) {
  const t = date instanceof Date ? date.getTime() : new Date(date).getTime()
  if (!Number.isFinite(t)) return false
  return t >= Date.now() - days * 86400000
}

function aggregateContextInsiders(rows, days = CONTEXT_FLOW_MONTH_DAYS) {
  const map = new Map()
  for (const row of rows ?? []) {
    if (!isWithinPastDays(row.date, days)) continue
    const id = `${row.key}|${row.person ?? ''}`
    const usd = parseTxnAmountUsd(row.amount)
    if (usd <= 0) continue
    const prev = map.get(id) ?? { key: row.key, person: row.person, totalUsd: 0 }
    prev.totalUsd += usd
    map.set(id, prev)
  }
  return [...map.values()]
    .map((x) => ({
      id: `${x.key}|${x.person ?? ''}`,
      roleKey: x.key,
      label: paperInsiderTxnLabel(x.key, x.person),
      nameStyle: 'insider',
      total: formatTxnAmountUsd(x.totalUsd),
      totalUsd: x.totalUsd,
    }))
    .sort((a, b) => b.totalUsd - a.totalUsd)
}

function aggregateContextPoliticians(rows, days = CONTEXT_FLOW_MONTH_DAYS) {
  const map = new Map()
  for (const row of rows ?? []) {
    if (!isWithinPastDays(row.date, days)) continue
    const id = String(row.name ?? '')
    const usd = parseTxnAmountUsd(row.amount)
    if (usd <= 0) continue
    const prev = map.get(id) ?? {
      name: row.name,
      chamber: row.chamber,
      totalUsd: 0,
    }
    prev.totalUsd += usd
    map.set(id, prev)
  }
  return [...map.values()]
    .map((x) => ({
      id: x.name,
      label: paperPoliticianTxnLabel(x.chamber, x.name),
      nameStyle: 'politician',
      total: formatTxnAmountUsd(x.totalUsd),
      totalUsd: x.totalUsd,
    }))
    .sort((a, b) => b.totalUsd - a.totalUsd)
}

function buildContextCatalystItems(programs, limit = 4) {
  const rows = []
  for (const p of programs ?? []) {
    for (const m of p.milestones ?? []) {
      rows.push({
        id: `${p.key}-${m.at}-${m.label}`,
        programKey: p.key,
        phase: p.stage ?? null,
        label: m.label,
        at: m.at,
        url: m.url ?? null,
        kind: 'trial',
      })
    }
  }
  const now = Date.now()
  return rows
    .filter((r) => {
      const t = new Date(`${String(r.at).trim()}T12:00:00`).getTime()
      return Number.isFinite(t) && t >= now - 86400000 * 2
    })
    .sort((a, b) => new Date(`${a.at}T12:00:00`) - new Date(`${b.at}T12:00:00`))
    .slice(0, limit)
}

function mapClinicalContextFromApi(data) {
  if (!data || typeof data !== 'object') return null
  const programs = (Array.isArray(data.programs) ? data.programs : []).map((p) => ({
    key: String(p?.key ?? '').trim(),
    indication: p?.indication != null ? String(p.indication) : null,
    stage: p?.stage != null ? String(p.stage) : null,
    milestones: (Array.isArray(p?.milestones) ? p.milestones : [])
      .map((m) => ({
        at: m?.at != null ? String(m.at).slice(0, 10) : null,
        label: m?.label != null ? String(m.label) : null,
        url: m?.url != null ? String(m.url) : null,
      }))
      .filter((m) => m.label),
  })).filter((p) => p.key)

  const catalysts = (Array.isArray(data.catalysts) ? data.catalysts : []).map((c) => ({
    id: String(c?.id ?? ''),
    programKey: String(c?.programKey ?? '').trim() || '—',
    label: String(c?.label ?? '').trim() || '—',
    at: c?.at != null ? String(c.at).slice(0, 10) : null,
    url: c?.url != null ? String(c.url) : null,
    phase: c?.phase != null ? String(c.phase) : null,
    kind: c?.kind === 'earnings' ? 'earnings' : 'trial',
  })).filter((c) => c.id)

  const lead = data.lead
    ? {
        name: String(data.lead.name ?? '').trim(),
        indication: data.lead.indication != null ? String(data.lead.indication) : null,
        stage: data.lead.stage != null ? String(data.lead.stage) : null,
        next: data.lead.next != null ? String(data.lead.next).slice(0, 10) : null,
      }
    : null

  return { programs, catalysts, lead }
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
  return (
    <div className="contextSection" aria-label={ariaLabel ?? title}>
      <div className="contextSectionHeader">
        <div className="contextSectionTitle">{title}</div>
      </div>
      {children}
    </div>
  )
}

function ContextFlowOutcomeChart({ lines = [], ariaLabel = 'Historical outcome returns' }) {
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
    measure()
    return () => ro.disconnect()
  }, [])

  const w = size.w
  const h = size.h
  const n = OUTCOME_HORIZON_LABELS.length
  const margin = { l: 0, r: 0, t: 10, b: 22 }
  const yTickGap = 8
  const innerW = Math.max(1, w - margin.l - margin.r)
  const plotTop = margin.t
  const axisY = h - margin.b
  const innerH = Math.max(1, axisY - plotTop)

  const allVals = lines.flatMap((l) => (Array.isArray(l.returns) ? l.returns : []))
  const rawMin = allVals.length ? Math.min(...allVals, 0) : 0
  const rawMax = allVals.length ? Math.max(...allVals, 0) : 0.01
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

  const yTicks = useMemo(() => returnTicks(min, max, 3), [min, max])
  const viewPadL = useMemo(() => {
    const maxLen = yTicks.reduce((m, v) => Math.max(m, formatReturnTick(v).length), 3)
    return Math.min(40, Math.max(28, Math.ceil(maxLen * 6.5) + yTickGap + 4))
  }, [yTicks])
  const yTickLabelX = margin.l - yTickGap

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
  }, [lines, w, h, min, max])

  const zeroY =
    min < 0 && max > 0 ? yAt(0) : null

  if (!lines.length) return null

  return (
    <div className="contextFlowOutcomeChart" ref={wrapRef} role="img" aria-label={ariaLabel}>
      <svg
        className="contextFlowOutcomeSvg"
        viewBox={`${-viewPadL} 0 ${w + viewPadL} ${h}`}
        preserveAspectRatio="xMinYMid meet"
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
        {OUTCOME_HORIZON_LABELS.map((lab, i) => (
          <text
            key={`ox-${lab}`}
            className="graphTick graphTick--x"
            style={GRAPH_SVG_TICK}
            textAnchor="middle"
            x={xAt(i)}
            y={h - 4}
          >
            {lab}
          </text>
        ))}
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

function ContextFlowTotalsList({ rows = [], outcomeLines = [], emptyLabel = 'None in the past 30 days.' }) {
  const totalsHead = (
    <div className="contextFlowTotalsMeta" aria-hidden="true">
      <span className="contextFlowTotalsMetaL mono dim">Past 30 days</span>
      <span className="contextFlowTotalsMetaR mono dim">Total</span>
    </div>
  )
  const outcomeChart =
    rows.length && outcomeLines.length ? (
      <>
        <div className="contextFlowChartLabel mono dim">Historical outcomes</div>
        <ContextFlowOutcomeChart
          lines={outcomeLines}
          ariaLabel="Average forward returns by horizon (21, 63, 252 trading days)"
        />
      </>
    ) : null
  if (!rows.length) {
    return (
      <div className="contextFlowList contextFlowList--empty">
        <p className="contextFlowEmpty mono dim">{emptyLabel}</p>
      </div>
    )
  }
  return (
    <div className="contextFlowList" role="list">
      {outcomeChart}
      {totalsHead}
      {rows.map((row) => (
        <div key={row.id} className="contextFlowRow" role="listitem">
          <div className="contextFlowRowMain">
            <div className="contextFlowRowKeyWrap">
              {row.lineColor ? (
                <span
                  className="contextFlowRowLine"
                  style={{ background: row.lineColor }}
                  aria-hidden="true"
                />
              ) : null}
              <div
                className={[
                  'contextFlowRowKey',
                  row.nameStyle === 'politician' ? 'contextFlowRowKey--name' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {row.label}
              </div>
            </div>
          </div>
          <div className="contextFlowRowAmt mono">{row.total}</div>
        </div>
      ))}
    </div>
  )
}

function ContextCatalystCard({ items = [] }) {
  if (!items.length) {
    return <div className="contextCatalystCard contextCatalystCard--empty dim">No upcoming catalysts</div>
  }
  return (
    <div className="contextCatalystCard">
      {items.map((it) => {
        const rowInner = (
          <>
            <div className="contextCatalystMain">
              <div className="contextCatalystProgram mono">{it.programKey}</div>
              <div className="contextCatalystLabel">{it.label}</div>
              {it.phase ? <div className="contextCatalystPhase mono dim">{displayPhaseLabel(it.phase)}</div> : null}
            </div>
            <div className="contextCatalystWhen mono">{contextCatalystCountdown(it.at)}</div>
          </>
        )
        if (it.url) {
          return (
            <a
              key={it.id}
              className="contextCatalystRow contextCatalystRow--link"
              href={it.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {rowInner}
            </a>
          )
        }
        return (
          <div key={it.id} className="contextCatalystRow">
            {rowInner}
          </div>
        )
      })}
    </div>
  )
}

function contextLeadDrugFromEntities(entities) {
  if (!Array.isArray(entities)) return null
  const drug = entities.find((e) => String(e?.type ?? '').toLowerCase() === 'drug')
  const raw = String(drug?.name ?? '').trim()
  if (!raw) return null
  // Common pattern: "Name (Indication)". Keep both so the card can show a concise label.
  const m = raw.match(/^(.+?)\s*\((.+?)\)\s*$/)
  return m ? { name: m[1].trim(), indication: m[2].trim() } : { name: raw, indication: null }
}

function shortPhaseLabel(stage) {
  const s = String(stage ?? '').trim()
  if (!s) return null
  const m = s.match(/phase\s*([0-9]+[a-zA-Z]?)/i)
  if (m) return `P${String(m[1]).toUpperCase()}`
  return s.length > 8 ? s.slice(0, 8) : s
}

/** Full phase copy for context program cards (e.g. Phase 3). */
function displayPhaseLabel(stage) {
  const s = String(stage ?? '').trim()
  if (!s) return null
  const m = s.match(/phase\s*([0-9]+[a-zA-Z]?)/i)
  if (m) return `Phase ${m[1]}`
  return s
}

function groupPrograms(programs) {
  const rows = Array.isArray(programs) ? programs : []
  const byKey = new Map()
  for (const p of rows) {
    const key = String(p?.key ?? '').trim()
    if (!key) continue
    const prev = byKey.get(key) ?? { key, variants: [] }
    const milestonesRaw = Array.isArray(p?.milestones) ? p.milestones : []
    const milestones = milestonesRaw
      .map((m) => {
        if (typeof m === 'string') return { at: null, label: m }
        return { at: m?.at ?? null, label: m?.label ?? null, url: m?.url ?? null }
      })
      .map((m) => ({
        at: m.at ? parseDayOnly(m.at)?.toISOString?.() ?? String(m.at) : null,
        label: String(m.label ?? '').trim() || null,
        url: m.url ? String(m.url) : null,
      }))
      .filter((m) => m.label)

    prev.variants.push({
      indication: String(p?.indication ?? '').trim() || null,
      stage: String(p?.stage ?? '').trim() || null,
      milestones,
    })
    byKey.set(key, prev)
  }
  return Array.from(byKey.values())
}

function programVariantMatchesLead(variant, leadDrug) {
  if (!variant || !leadDrug) return false
  const leadInd = String(leadDrug.indication ?? '').trim().toLowerCase()
  const leadStage = String(leadDrug.stage ?? '').trim().toLowerCase()
  const varInd = String(variant.indication ?? '').trim().toLowerCase()
  const varStage = String(variant.stage ?? '').trim().toLowerCase()
  const indOk = !leadInd || !varInd || leadInd === varInd
  const stageOk =
    !leadStage ||
    !varStage ||
    leadStage === varStage ||
    shortPhaseLabel(leadStage) === shortPhaseLabel(varStage)
  return indOk && stageOk
}

function leadProgramVariantForGroup(pg, leadDrug) {
  if (!pg || !leadDrug) return null
  const leadName = String(leadDrug.name ?? '').trim().toLowerCase()
  const pgKey = String(pg.key ?? '').trim().toLowerCase()
  if (!leadName || leadName !== pgKey) return null
  const variants = Array.isArray(pg.variants) ? pg.variants : []
  const exact = variants.find((v) => programVariantMatchesLead(v, leadDrug))
  return exact ?? variants[0] ?? null
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

function _boshaFormatTimelineDay(yyyyMmDd) {
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
    chamber: 'house',
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

function PoliticiansFilterPanel({ activeName, items, onSelect }) {
  return (
    <section className="panel feed feedCompact filterTile" aria-label="Filter">
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
            onClick={() => onSelect(it.name)}
          >
            <span className="feedCell feedCellLabel kvFeedMain">{it.name}</span>
            <span className="feedCell feedCellTicker mono kvFeedDim">{it.count}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function MainContextPanel({
  intelMode = 'market',
  ticker,
  price,
  sector,
  domicile = null,
  mcap,
  priceSeries = [],
  insiderPriceMarkers = [],
  politicianPriceMarkers = [],
  earnings = null,
  leadDrug = null,
  programs = [],
  selectedProgramKey = null,
  onSelectProgramKey,
  insiders = [],
  politicians = [],
  catalystItems = [],
}) {
  const t = String(ticker ?? '').toUpperCase()
  const [priceRange, setPriceRange] = useState('6M')
  const showFlows = intelMode !== 'clinical'
  const programGroups = useMemo(() => groupPrograms(programs), [programs])
  const insidersFlow = useMemo(() => {
    const pastMonth = aggregateContextInsiders(insiders)
    const outcomeLines = buildMockInsiderOutcomeLines(pastMonth, t)
    const rows = attachOutcomeLineColors(pastMonth, outcomeLines, (row) => row.roleKey)
    return { rows, outcomeLines }
  }, [insiders, t])
  const politiciansFlow = useMemo(() => {
    const pastMonth = aggregateContextPoliticians(politicians)
    const outcomeLines = buildMockPoliticianOutcomeLines(pastMonth, t)
    const rows = attachOutcomeLineColors(pastMonth, outcomeLines, (row) => row.id)
    return { rows, outcomeLines }
  }, [politicians, t])

  return (
    <section
      className={[
        'panel',
        'feed',
        'feedCompact',
        'mainContextPanel',
        showFlows ? 'mainContextPanel--market' : 'mainContextPanel--clinical',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Context"
    >
      <header className="feedCompactHeader researchContextHeader">
        <div className="panelTitle feedCompactTitle">CONTEXT</div>
      </header>
      <div className="mainContextPanelBody scrollThin">
        <div className="contextCompanyCard" aria-label="Company snapshot">
          <div className="contextCompanyTopRow">
            <div className="contextCompanyTicker">{ticker}</div>
            <div className="contextCompanyPrice">${price.toFixed(2)}</div>
          </div>
          <div className="contextCompanyMeta">{sector}</div>
          {domicile ? <div className="contextCompanyMeta contextCompanyMeta--domicile">{domicile}</div> : null}
          <div className="contextCompanyMeta">{mcap} MCAP</div>
          <div className="contextCompanyChart" aria-label="Price chart">
            <BoshaMiniPrice
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
          {earnings && showFlows ? (
            <div
              className={[
                'contextCompanyEarnings',
                earnings.soon ? 'contextCompanyEarnings--soon' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span className="contextCompanyEarningsK">EARNINGS</span>
              <span className="contextCompanyEarningsV">{earnings.label}</span>
            </div>
          ) : null}
          {leadDrug ? (
            <div className="contextCompanyEarnings">
              <span className="contextCompanyEarningsK">LEAD</span>
              <span className="contextCompanyEarningsV">{leadDrug.name}</span>
            </div>
          ) : null}
        </div>

        {!showFlows ? (
          <>
            <ContextSection title="CATALYST CLOCK" ariaLabel="Upcoming catalysts">
              <ContextCatalystCard items={catalystItems} />
            </ContextSection>
            <div className="contextSection" aria-label="Programs">
              <div className="contextSectionHeader">
                <div className="contextSectionTitle dim">PROGRAMS</div>
              </div>
              <div className="contextProgramsGrid" role="list">
                {programGroups.map((pg) => {
                  const active = selectedProgramKey ? selectedProgramKey === pg.key : false
                  const leadVariant = leadProgramVariantForGroup(pg, leadDrug)
                  const isLeadProgram = Boolean(leadVariant)
                  const displayVariant = leadVariant ?? pg.variants?.[0] ?? {}
                  const phase = displayVariant?.stage ? displayPhaseLabel(displayVariant.stage) : null
                  const ind = displayVariant?.indication ?? null
                  const showMilestones = active || (!selectedProgramKey && programGroups.length === 1)
                  const allMilestones = (pg.variants ?? [])
                    .flatMap((v) => v.milestones ?? [])
                    .slice()
                    .sort((a, b) => {
                      const ta = a?.at ? new Date(a.at).getTime() : 0
                      const tb = b?.at ? new Date(b.at).getTime() : 0
                      return ta - tb
                    })
                  const visibleMilestones = showMilestones ? allMilestones.slice(0, 8) : []
                  return (
                    <div
                      key={pg.key}
                      className={['contextProgramCard', active ? 'isActive' : ''].filter(Boolean).join(' ')}
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelectProgramKey?.(pg.key)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') onSelectProgramKey?.(pg.key)
                      }}
                    >
                      <div className="contextProgramTop">
                        <div className="contextProgramTopMain">
                          <div className="contextProgramKey mono">{pg.key}</div>
                          <div className="contextProgramMeta mono dim">{ind || '—'}</div>
                        </div>
                        <div className="contextProgramTopRight">
                          {phase ? (
                            <div className="contextProgramPhase mono dim">{phase}</div>
                          ) : (
                            <div className="contextProgramPhase mono dim">—</div>
                          )}
                          {isLeadProgram ? (
                            <span className="contextProgramLeadBadge mono dim">LEAD</span>
                          ) : null}
                        </div>
                      </div>
                      {visibleMilestones.length ? (
                        <div className="contextProgramMilestones dim">
                          {visibleMilestones.map((m, idx) => (
                            <a
                              key={`${pg.key}-${idx}`}
                              className={[
                                'contextProgramMilestoneRow',
                                m?.url ? 'contextProgramMilestoneRow--link' : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                              href={m?.url || undefined}
                              target={m?.url ? '_blank' : undefined}
                              rel={m?.url ? 'noopener noreferrer' : undefined}
                              onClick={(e) => {
                                e.stopPropagation()
                                if (!m?.url) e.preventDefault()
                              }}
                            >
                              <div className="contextProgramMilestoneLabel">{m?.label ?? '—'}</div>
                              <div className="contextProgramMilestoneAt mono dim">
                                {m?.at ? formatProgramTimelineDate(m.at) : '—'}
                              </div>
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        ) : null}

        {showFlows ? (
          <>
            <ContextSection title="INSIDERS" ariaLabel="Insiders past month">
              <ContextFlowTotalsList
                rows={insidersFlow.rows}
                outcomeLines={insidersFlow.outcomeLines}
                emptyLabel="No insider filings in the past 30 days."
              />
            </ContextSection>
            <ContextSection title="POLITICIANS" ariaLabel="Politicians past month">
              <ContextFlowTotalsList
                rows={politiciansFlow.rows}
                outcomeLines={politiciansFlow.outcomeLines}
                emptyLabel="No PTR disclosures in the past 30 days."
              />
            </ContextSection>
          </>
        ) : null}
      </div>
    </section>
  )
}

function BoshaTickerPanel({ selectedTicker, onSelectTicker, q, onQuery, filtered, panelClassName = '' }) {
  return (
    <section
      className={[
        'panel',
        'feed',
        'feedCompact',
        'feed--left',
        'boshaTicker',
        'researchFeedPanel',
        panelClassName,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Ticker selector"
    >
      <header className="feedCompactHeader researchFeedHeader">
        <div className="panelTitle feedCompactTitle">FEED</div>
      </header>
      <div className="researchFeedBody">
        <label className="researchFeedSearch">
          <input
            className="researchFeedSearchInput"
            value={q ?? ''}
            placeholder="Search"
            onChange={(e) => onQuery?.(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onQuery?.('')
            }}
            aria-label="Search tickers"
            spellCheck={false}
          />
          <svg className="researchFeedSearchIcon" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.75" />
            <path d="M16 16 L20 20" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </label>
        <div className="researchFeedList scrollThin" role="list">
          {filtered.map((it) => (
            <button
              key={it.rowKey ?? it.ticker}
              type="button"
              role="listitem"
              className={['researchFeedRow', it.ticker === selectedTicker ? 'isActive' : ''].filter(Boolean).join(' ')}
              onClick={() => onSelectTicker(it.ticker)}
            >
              <span className="researchFeedRowName">{it.name}</span>
              <span className="researchFeedRowTicker mono">{it.ticker}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

function BoshaGraphFigure({ entities, events, edges }) {
  const wrapRef = useRef(null)
  const [size, setSize] = useState({ w: 640, h: 320 })

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
    const min = ds[0]?.d?.getTime?.() ?? 0
    const max = ds.at(-1)?.d?.getTime?.() ?? Math.max(1, min + 1)
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
            const fill = isEv ? boshaSentimentColor(n.sentiment) : undefined
            const r = isEv ? 9 + 3 * boshaImpactScore(n.impact) : 9
            return isEv ? (
              <g key={n.id} opacity={1}>
                <rect x={n.x - r} y={n.y - r} width={r * 2} height={r * 2} rx="2" fill={fill} stroke="rgba(255, 255, 255, 0.18)" strokeWidth="1" />
              </g>
            ) : (
              <g key={n.id} className="boshaGraphEntity" opacity={1}>
                <circle cx={n.x} cy={n.y} r={r} />
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

const POLITICIAN_CHAMBER_OPTS = [
  { id: 'all', label: 'ALL' },
  { id: 'house', label: 'HOUSE' },
  { id: 'senate', label: 'SENATE' },
  { id: 'executive', label: 'EXECUTIVE' },
]
const POLITICIAN_CHAMBER_ENABLED = new Set(['all', 'house'])

const PRICE_RANGE_OPTS = ['1M', '3M', '6M', '1Y', 'ALL']
const PRICE_RANGE_DAYS = { '1M': 30, '3M': 90, '6M': 180, '1Y': 365, ALL: null }

function slicePriceSeriesByRange(series, range) {
  const arr = Array.isArray(series) ? series : []
  const days = PRICE_RANGE_DAYS[range]
  if (!days || arr.length <= days) return arr
  return arr.slice(-days)
}

function slicePriceDataByRange(series, dates, range) {
  const s = Array.isArray(series) ? series : []
  const d = Array.isArray(dates) ? dates : []
  const n = s.length
  if (!n) return { series: [], dates: [] }
  const days = PRICE_RANGE_DAYS[range]
  const take = typeof days === 'number' && n > days ? days : n
  const sliced = s.slice(-take)
  if (d.length >= n) return { series: sliced, dates: d.slice(-take) }
  if (d.length === sliced.length) return { series: sliced, dates: d }
  return { series: sliced, dates: buildEvenlySpacedDates(sliced.length) }
}

function BoshaMiniPrice({
  series,
  label,
  showMeta = true,
  trimLeadingPlateau = false,
  showRangeSelector = false,
  chartRange: chartRangeProp,
  onChartRangeChange,
  chartAlign = 'default',
  insiderMarkers = [],
  politicianMarkers = [],
}) {
  const wrapRef = useRef(null)
  const [size, setSize] = useState({ w: 360, h: 192 })
  const [internalRange, setInternalRange] = useState('6M')
  const priceRange = chartRangeProp ?? internalRange
  const setPriceRange = onChartRangeChange ?? setInternalRange

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
  const margin =
    chartAlign === 'context' ? { l: 0, r: 0, t: 8, b: 18 } : { l: 0, r: 6, t: 8, b: 18 }
  const svgPreserveAspect = chartAlign === 'context' ? 'xMinYMid meet' : 'xMidYMid meet'
  const innerW = Math.max(1, w - margin.l - margin.r)
  const innerH = Math.max(1, h - margin.t - margin.b)

  const vals = useMemo(() => {
    let base = Array.isArray(series) ? series : []
    if (chartRangeProp != null || showRangeSelector) base = slicePriceSeriesByRange(base, priceRange)
    if (!trimLeadingPlateau || base.length < 8) return base
    const t = trimLeadingFlatSeries(base)
    return t.length >= 2 ? t : base
  }, [series, trimLeadingPlateau, showRangeSelector, chartRangeProp, priceRange])
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

  const areaPath = useMemo(() => {
    if (!vals.length) return ''
    const yBase = h - margin.b
    let d = `M ${xAt(0).toFixed(2)} ${yBase.toFixed(2)} `
    for (let i = 0; i < vals.length; i++) {
      const x = xAt(i)
      const y = yAt(vals[i])
      d += `L ${x.toFixed(2)} ${y.toFixed(2)} `
    }
    d += `L ${xAt(vals.length - 1).toFixed(2)} ${yBase.toFixed(2)} Z`
    return d.trim()
  }, [vals, w, h])

  const gradId = useMemo(() => {
    const s = String(label ?? 'PRICE')
    let h0 = 2166136261
    for (let i = 0; i < s.length; i++) h0 = Math.imul(h0 ^ s.charCodeAt(i), 16777619)
    return `miniFill-${(h0 >>> 0).toString(16)}`
  }, [label])

  const yTicks = useMemo(() => priceTicks(min, max, 4), [min, max])
  // Left viewBox gutter: fit widest y tick (end-anchored 8px left of axis). Context uses a tighter gutter.
  const yTickGap = 8
  const viewPadL = useMemo(() => {
    if (chartAlign !== 'context') return 50
    const maxLen = yTicks.reduce((m, v) => Math.max(m, formatPriceTick(v).length), 3)
    return Math.min(40, Math.max(28, Math.ceil(maxLen * 6.5) + yTickGap + 4))
  }, [chartAlign, yTicks])
  const yTickLabelX = margin.l - yTickGap
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
      {showRangeSelector ? (
        <div className="boshaPriceRange" role="group" aria-label="Chart range">
          {PRICE_RANGE_OPTS.map((r) => (
            <button
              key={r}
              type="button"
              className={['boshaPriceRangeBtn', priceRange === r ? 'isActive' : ''].filter(Boolean).join(' ')}
              onClick={() => setPriceRange(r)}
              aria-pressed={priceRange === r}
            >
              {r}
            </button>
          ))}
        </div>
      ) : null}
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
        {!vals.length ? (
          <div className="graphEmpty mono dim" role="status">
            No price data.
          </div>
        ) : (
          <svg
            className="graphSvg"
            viewBox={`${-viewPadL} 0 ${w + viewPadL} ${h}`}
            preserveAspectRatio={svgPreserveAspect}
            role="img"
          >
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
              d={`M ${margin.l} ${margin.t} L ${margin.l} ${h - margin.b} L ${w - margin.r} ${h - margin.b}`}
            />

            {yTicks.map((v, i) => {
              const y = yAt(v)
              return (
                <g key={`yt-${i}`}>
                  <text
                    className="graphTick graphTick--y"
                    style={GRAPH_SVG_TICK}
                    textAnchor="end"
                    dominantBaseline="middle"
                    x={yTickLabelX}
                    y={y}
                  >
                    {formatPriceTick(v)}
                  </text>
                  <path
                    className="graphTickLine"
                    style={GRAPH_SVG_TICK_LINE}
                    d={`M ${margin.l} ${y} L ${margin.l + (chartAlign === 'context' ? 4 : 6)} ${y}`}
                  />
                </g>
              )
            })}

            {xTickIdx.map((idx, i) => {
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
            })}

            <path className="graphPath" style={GRAPH_SVG_PATH} d={path} vectorEffect="non-scaling-stroke" />
          </svg>
        )}
      </div>
    </div>
  )
}

function _boshaSignalForEvent(ev) {
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

function _boshaWhatWhyForEvent(ev) {
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

function _boshaStructuralInterpretation(events) {
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

function formatPaperDateLabel(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return boshaDateStamp()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T12:00:00`)
    if (!Number.isNaN(d.getTime())) {
      return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
    }
  }
  return s
}

/** Paper hero subtitle: "Issuer · TICKER · May 28, 2026" */
function boshaPaperSubtitle(companyName, ticker, paperDate) {
  const name = String(companyName ?? '').trim()
  const t = String(ticker ?? '').toUpperCase()
  const date = formatPaperDateLabel(paperDate)
  const parts = [name, t].filter(Boolean)
  if (!parts.length) return date
  return `${parts.join(' · ')} · ${date}`
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

  const arrowMarkerId = useMemo(() => {
    const s = `bosha-arrow-${String(ticker ?? 'tk')}-${String(diagramSpec?.layout ?? 'x')}`
    let h0 = 2166136261
    for (let i = 0; i < s.length; i++) h0 = Math.imul(h0 ^ s.charCodeAt(i), 16777619)
    return `boshaArrow-${(h0 >>> 0).toString(16)}`
  }, [ticker, diagramSpec?.layout])

  const nodeWashIds = useMemo(() => {
    const s = `bosha-node-wash-${String(ticker ?? 'tk')}-${String(diagramSpec?.layout ?? 'x')}`
    let h0 = 2166136261
    for (let i = 0; i < s.length; i++) h0 = Math.imul(h0 ^ s.charCodeAt(i), 16777619)
    const hex = (h0 >>> 0).toString(16)
    return { a: `boshaNodeWashA-${hex}`, b: `boshaNodeWashB-${hex}` }
  }, [ticker, diagramSpec?.layout])

  return (
    <div
      ref={wrapRef}
      className={['boshaCausalWrap', isForkMergeDiagram ? 'boshaCausalWrap--supply' : ''].filter(Boolean).join(' ')}
      aria-label={forkAria}
      role="img"
    >
      <svg className="boshaCausalSvg" viewBox={`0 0 ${w} ${vbH}`} preserveAspectRatio="xMidYMid meet">
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
                className="boshaCausalNodeRim"
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
                className={['boshaCausalNode', edgeNode ? 'boshaCausalNode--edge' : ''].filter(Boolean).join(' ')}
                x={nx}
                y={ny}
                width={nw}
                height={nh}
                rx="6"
                fill="none"
                strokeWidth="1.25"
              />
              <text
                className="boshaCausalText"
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

function mockPaperFiledAtToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

/** Per-filing AI summaries shown under the paper price chart (newest first). */
const MOCK_PAPER_DOCUMENTS_ATYR = [
  {
    id: 'atyr-doc-8k-today',
    source: '8-K',
    filedAt: mockPaperFiledAtToday(),
    url: 'https://www.sec.gov/edgar/search/#/q=ATYR',
    analysis:
      'Same-day 8-K: no material clinical update, routine disclosure ahead of the week-48 readout window. Useful as a timestamp anchor; does not change the binary mean-OCS setup.',
  },
  {
    id: 'atyr-doc-8k-cash',
    source: '8-K',
    filedAt: '2026-05-08T00:00:00.000Z',
    url: 'https://www.sec.gov/edgar/search/#/q=ATYR',
    analysis:
      'Management updated cash runway guidance and reiterated that EFZO-FIT remains fully enrolled with no change to the week-48 mean oral-steroid primary. The filing is operational, not efficacy-bearing, but it narrows financing overhang ahead of the binary readout.',
  },
  {
    id: 'atyr-doc-8k-safety',
    source: '8-K',
    filedAt: '2026-04-09T00:00:00.000Z',
    url: 'https://www.sec.gov/edgar/search/#/q=ATYR',
    analysis:
      'The company filed an interim blinded safety update without unblinded efficacy tables. Management reiterated that blinded review has not shown a toxicity spiral ahead of topline. The disclosure is supportive for holders into the print but does not change the statistical fight on the mean oral-steroid primary.',
  },
  {
    id: 'atyr-doc-10q-risk',
    source: '10-Q',
    filedAt: '2026-03-18T00:00:00.000Z',
    url: 'https://www.sec.gov/edgar/search/#/q=ATYR',
    analysis:
      'Risk factors again stress that EFZO-FIT success depends on demonstrating steroid reduction with acceptable variability across sites. The filing cautions that enrollment completion does not tighten confidence intervals on a mean-dose endpoint when placebo arms follow the same visit cadence. Language stays consistent with a binary catalyst rather than a de-risked fundamental story.',
  },
  {
    id: 'atyr-doc-enrollment',
    source: 'ClinicalTrials.gov',
    filedAt: '2026-02-11T00:00:00.000Z',
    url: 'https://clinicaltrials.gov/study/NCT05415137',
    analysis:
      'EFZO-FIT (NCT05415137) lists enrollment at 268 participants versus a 264 target for the sarcoidosis program. The trial remains three-arm with 5 mg/kg, 3 mg/kg, and placebo. The registry still frames the primary endpoint as absolute change from baseline in mean daily oral steroid dose at week 48, which is the regulatory line investors should track before any efficacy narrative hardens.',
  },
  {
    id: 'atyr-doc-connect',
    source: 'ClinicalTrials.gov',
    filedAt: '2026-01-22T00:00:00.000Z',
    url: 'https://clinicaltrials.gov/study/NCT05892614',
    analysis:
      'EFZO-CONNECT (NCT05892614) remains a separate SSc-ILD proof-of-concept with roughly 25 patients and placebo control. The registry update does not alter EFZO-FIT power. A strong PoC read could help sentiment after Phase 3 tables, but it cannot statistically rescue a failed pivotal mean-OCS outcome.',
  },
  {
    id: 'atyr-doc-10k-prior',
    source: '10-K',
    filedAt: '2025-03-04T00:00:00.000Z',
    url: 'https://www.sec.gov/edgar/search/#/q=ATYR',
    analysis:
      'Prior-year 10-K language already framed EFZO-FIT as a mean oral-steroid primary with placebo-driven taper noise. Useful baseline if you are comparing how risk disclosure evolved into the current Phase 3 window.',
  },
]

const MOCK_PAPER_DOCUMENTS_ASML = [
  {
    id: 'asml-doc-q1',
    source: '8-K',
    filedAt: '2026-04-18T00:00:00.000Z',
    url: 'https://www.sec.gov/edgar/search/#/q=ASML',
    analysis:
      'Q1 commentary highlights backlog stability and longer EUV lead times rather than a cancellation wave. Management frames demand as capacity-constrained at the leading edge, which keeps pricing power on high-NA slots intact even when downstream GPU names wobble.',
  },
  {
    id: 'asml-doc-orders',
    source: '8-K',
    filedAt: '2026-03-14T00:00:00.000Z',
    url: 'https://www.sec.gov/edgar/search/#/q=ASML',
    analysis:
      'Management commentary points to extended EUV delivery timelines and continued tightness in high-NA tool allocation. Customers are prioritizing leading-edge slots even as downstream AI demand headlines dominate equity flows. The filing reinforces scarcity in lithography rather than a demand air pocket for the tools themselves.',
  },
  {
    id: 'asml-doc-annual',
    source: 'Annual report',
    filedAt: '2026-02-06T00:00:00.000Z',
    url: 'https://www.asml.com/en/investors/financial-results',
    analysis:
      'The annual report reiterates that advanced-node wafer output scales with EUV installs, not short-cycle GPU order headlines. Order book language emphasizes multi-year visibility on systems while foundry utilization commentary stays measured. Investors still appear to price downstream AI semiconductors ahead of the upstream constraint chain.',
  },
  {
    id: 'asml-doc-investor-day',
    source: 'Investor presentation',
    filedAt: '2026-01-08T00:00:00.000Z',
    url: 'https://www.asml.com/en/investors',
    analysis:
      'Investor day slides walk through EUV install cadence and high-NA mix shift without changing the core scarcity thesis. The deck is useful for framing where bottlenecks sit in the stack, but it does not by itself resolve timing on when downstream AI demand reprices back into ASML.',
  },
  {
    id: 'asml-doc-prior-annual',
    source: 'Annual report',
    filedAt: '2025-02-14T00:00:00.000Z',
    url: 'https://www.asml.com/en/investors/financial-results',
    analysis:
      'Prior-year annual framing already emphasized EUV as the binding step for leading-edge supply. The language is consistent with the current scarcity thesis, which makes timing shifts in orders and backlog the live variable rather than the structural story.',
  },
]

function paperDocumentOpenUrl(doc, ticker) {
  const direct = String(doc?.url ?? '').trim()
  if (direct) return direct
  const id = String(doc?.id ?? '')
  const source = String(doc?.source ?? '').toLowerCase()
  const t = String(ticker ?? '').trim().toUpperCase()
  if (id.includes('connect') || source.includes('connect')) {
    return 'https://clinicaltrials.gov/study/NCT05892614'
  }
  if (source.includes('clinicaltrials') || id.includes('enrollment') || id.includes('fit')) {
    return 'https://clinicaltrials.gov/study/NCT05415137'
  }
  if (source.includes('investor') && t === 'ASML') {
    return 'https://www.asml.com/en/investors'
  }
  if (t) return `https://www.sec.gov/edgar/search/#/q=${encodeURIComponent(t)}`
  return 'https://www.sec.gov/edgar/search/'
}

function ResearchPaperDocOpenIcon() {
  return (
    <svg className="researchPaperDocOpenIconSvg" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M14 4h6v6M10 20 20 10M20 10h-6M20 10v6M4 14V4h10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  )
}

function ResearchPaperDocCard({ doc, ticker }) {
  const source = doc?.source ?? 'Filing'
  const url = paperDocumentOpenUrl(doc, ticker)
  const openLabel = `Open ${source}`
  return (
    <article className="researchPaperDocCard">
      <header className="researchPaperDocCardMeta mono dim">
        <span className="researchPaperDocCardSource">{source}</span>
        <time className="researchPaperDocCardDate" dateTime={doc?.filedAt ?? undefined}>
          {doc?.filedAt ? formatFeedDate(doc.filedAt) : '—'}
        </time>
      </header>
      <ResearchPaperDocAnalysis text={doc?.analysis} />
      {url ? (
        <a
          className="researchPaperDocOpen"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={openLabel}
          title={openLabel}
        >
          <ResearchPaperDocOpenIcon />
        </a>
      ) : null}
    </article>
  )
}

function ResearchPaperDocAnalysis({ text }) {
  const body = String(text ?? '').trim()
  if (!body) return null
  const paras = body.split(/\n\n+/).map((p) => p.trim()).filter(Boolean)
  if (paras.length === 0) {
    return <p className="researchPaperDocCardAnalysis">{body}</p>
  }
  return paras.map((p, i) => (
    <p className="researchPaperDocCardAnalysis" key={`paper-doc-p-${i}`}>
      {p}
    </p>
  ))
}

function boshaAsmlPresentation() {
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
    subtitle: boshaPaperSubtitle('ASML Holding N.V.', 'ASML'),
    paperDate: boshaDateStamp(),
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
      { label: 'ASML — Investor relations', url: 'https://www.asml.com/en/investors' },
      { label: 'SEC EDGAR search', url: 'https://www.sec.gov/edgar/search/' },
      { label: 'EU regulation — company filings (mock)', url: 'https://www.sec.gov/edgar/search/' },
    ],
  }
}

function boshaAtyrPresentation() {
  const intro =
    'This note pulls only from documents. ClinicalTrials.gov, enrollment updates, what the company says about clinical risk, blinded safety tables. You cannot defend an efficacy claim until topline. EFZO-FIT (NCT05415137) is sarcoidosis with three arms at 5 mg per kg, 3 mg per kg, and placebo. Enrollment hit 268 against a 264 target. Placebo is real and the N matters. The SAP emphasizes absolute change from baseline in mean daily oral steroid dose at week 48. That is what regulators stare at first. Everything else is narrative until you see milligrams per day with spread. EFZO-CONNECT (NCT05892614) is a separate SSc-ILD proof-of-concept with about 25 patients and placebo. It can reveal a monster effect if one exists. It cannot statistically rescue Phase 3 if the pivotal mean-OCS line fails.'
  const priceCaption =
    'ATYR only. Price is mostly enthusiasm minus hard facts. If the stock rips before anyone has deltas and confidence intervals, that is guessing.'
  const middle =
    'Beating the enrollment target helps operations. It does not tighten the error bars on a mean steroid taper when placebo arms also step down on the same visit cadence baked into the protocol. A hit on the week-48 OCS primary can still be a coin toss unless the drug separation is huge. Patients miss doses and titrate differently, which can chew through several mg per day at the cohort level. Blinded safety updates so far have not screamed a toxicity spiral, which is the one qualitative cushion for holders into the print. Connect is small, tens of patients. If Phase 3 misses, that PoC does not prove you get approval. It only shows biology at a scale too tiny to fix power. Off documents alone, odds on clearing the written primary look low to middling. Steroid-free rate and lung numbers could still move how people trade if the separation is clean, because doctors care about those even when the headline mean-dose fight is noisy.'
  const diagramCaption =
    'Filings and trial registries link EFZO-FIT and EFZO-CONNECT. The FDA still wants both paths to tell one approvable story before the name reprices.'
  const action =
    'Blinded-file view says do not add fresh equity before unblinding. A long here is mostly variance on a mean-OCS endpoint that fights clean stats. Trim or hedge into any pre-data rally. If someone wants to gamble the print, use structures where downside is capped, like options. Buying more common into a binary FDA-style read without tables is how retail accounts vaporize. After topline, focus on what actually prints. Mean change in daily oral steroids with confidence intervals, steroid-free rates, FVC and the other pulmonary rows. Until then the protocol stack is the whole thesis.'
  return {
    title:
      'EFZO-FIT finished enrollment while still blinded. The protocol and SAP lean hard on a mean-OCS primary that is messy statistically, so the stock is basically a catalyst flip until real tables drop.',
    subtitle: boshaPaperSubtitle('aTyr Pharma, Inc.', 'ATYR'),
    paperDate: boshaDateStamp(),
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
    documents: MOCK_PAPER_DOCUMENTS_ATYR,
    sources: [
      { label: 'ClinicalTrials.gov — EFZO-FIT (NCT05415137)', url: 'https://clinicaltrials.gov/study/NCT05415137' },
      { label: 'ClinicalTrials.gov — EFZO-CONNECT (NCT05892614)', url: 'https://clinicaltrials.gov/study/NCT05892614' },
      { label: 'SEC EDGAR search', url: 'https://www.sec.gov/edgar/search/' },
    ],
  }
}

function boshaGenericOfflinePresentation(memo, titleText, ticker) {
  const t = String(ticker ?? '').toUpperCase()
  const priceCaption = `${memo.priceRef} Chart regime: ${memo.chartX}.`
  const diagramCaption = `Causal sketch: ${memo.causalChain}`
  return {
    title: memo.title,
    subtitle: boshaPaperSubtitle(String(titleText ?? '').trim() || t, t, memo.created),
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
    documents: [],
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

function isPaperTimelineItemToday(item) {
  const d = paperTimelineItemAt(item)
  if (!d) return false
  return isSameLocalCalendarDay(d, new Date())
}

function isPaperTimelineItemThisMonth(item) {
  const d = paperTimelineItemAt(item)
  if (!d) return false
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
}

function paperTimelineMonthGapLabel() {
  return 'THIS MONTH'
}

function isPaperTimelineItemThisYear(item) {
  const d = paperTimelineItemAt(item)
  if (!d) return false
  return d.getFullYear() === new Date().getFullYear()
}

function paperTimelineYearGapLabel() {
  return 'THIS YEAR'
}

/** Filings + insider / politician trades for the paper timeline (newest first). */
function buildPaperTimelineItems({ documents = [], insiders = [], politicians = [] }) {
  const items = []
  for (const doc of paperDocumentsFromPresentation({ documents })) {
    if (!doc?.id) continue
    items.push({ kind: 'document', id: String(doc.id), at: doc.filedAt, document: doc })
  }
  for (const row of insiders) {
    const role = String(row?.key ?? '').trim()
    const person = String(row?.person ?? '').trim()
    const label = paperInsiderTxnLabel(role, person)
    if (label === '—') continue
    items.push({
      kind: 'insider',
      id: `insider-${role}-${person}-${paperTimelineAtMs(row?.date)}`,
      at: row?.date,
      source: 'Form 4',
      name: label,
      amount: row?.amount,
    })
  }
  for (const row of politicians) {
    const member = String(row?.name ?? '').trim()
    const label = paperPoliticianTxnLabel(row?.chamber, member)
    if (label === paperPoliticianChamberLabel(row?.chamber) && !member) continue
    if (!member) continue
    items.push({
      kind: 'politician',
      id: `politician-${member}-${paperTimelineAtMs(row?.date)}`,
      at: row?.date,
      source: 'PTR',
      name: label,
      amount: row?.amount,
    })
  }
  return items.sort((a, b) => paperTimelineAtMs(b?.at) - paperTimelineAtMs(a?.at))
}

function resolveBoshaPresentation({ ticker, titleText, backendUp, livePresentation, memo, intelMode = 'market' }) {
  const u = String(ticker ?? '').toUpperCase()
  const clinical = intelMode === 'clinical'
  if (backendUp && livePresentation?.title) return livePresentation
  if (backendUp) return null
  if (clinical && u === 'ATYR') return boshaAtyrPresentation()
  if (!clinical && u === 'ASML') return boshaAsmlPresentation()
  return boshaGenericOfflinePresentation(memo, titleText, ticker)
}

function ResearchPaperTimelineGap({ label }) {
  const text = String(label ?? '').trim()
  if (!text) return null
  return (
    <div className="researchPaperTodayGap" aria-hidden="true">
      <div className="researchPaperTodayGapRow">
        <span className="researchPaperTodayGapRule" />
        <span className="researchPaperTodayGapLabel mono">{text}</span>
      </div>
    </div>
  )
}

function ResearchPaperTxnCard({ source, filedAt, name, amount }) {
  const label = String(name ?? '').trim()
  const amt = String(amount ?? '').trim()
  if (!label && !amt) return null
  return (
    <article className="researchPaperTxnCard">
      <header className="researchPaperDocCardMeta mono dim">
        <span className="researchPaperDocCardSource">{source ?? 'Filing'}</span>
        <time className="researchPaperDocCardDate" dateTime={filedAt ?? undefined}>
          {filedAt ? formatFeedDate(filedAt) : '—'}
        </time>
      </header>
      <div className="researchPaperTxnCardRow">
        <span className="researchPaperTxnCardName">{label || '—'}</span>
        <span className="researchPaperTxnCardAmt mono">{amt || '—'}</span>
      </div>
    </article>
  )
}

function BoshaPaperStructuredView({ documents = [], insiders = [], politicians = [], ticker = '' }) {
  const t = String(ticker ?? '').toUpperCase()
  const timelineRows = useMemo(
    () => buildPaperTimelineItems({ documents, insiders, politicians }),
    [documents, insiders, politicians],
  )
  return (
    <div className="researchPaperBody researchPaperBody--documentsOnly">
      {timelineRows.length ? (
        <div className="researchPaperDocuments" aria-label="Filings and transactions">
          {timelineRows.map((item, idx) => {
            const prev = idx > 0 ? timelineRows[idx - 1] : null
            const showTodayGap = prev && isPaperTimelineItemToday(prev) && !isPaperTimelineItemToday(item)
            const showMonthGap =
              prev &&
              isPaperTimelineItemThisMonth(prev) &&
              !isPaperTimelineItemThisMonth(item) &&
              !showTodayGap
            const showYearGap =
              prev &&
              isPaperTimelineItemThisYear(prev) &&
              !isPaperTimelineItemThisYear(item) &&
              !showTodayGap &&
              !showMonthGap
            const showTimelineGap = showTodayGap || showMonthGap || showYearGap
            return (
            <Fragment key={item.id}>
              {idx > 0 && !showTimelineGap ? <div className="researchPaperDocConnector" aria-hidden="true" /> : null}
              {showTodayGap ? <ResearchPaperTimelineGap label="TODAY" /> : null}
              {showMonthGap ? <ResearchPaperTimelineGap label={paperTimelineMonthGapLabel()} /> : null}
              {showYearGap ? <ResearchPaperTimelineGap label={paperTimelineYearGapLabel()} /> : null}
              {item.kind === 'document' ? (
                <ResearchPaperDocCard doc={item.document} ticker={t} />
              ) : (
                <ResearchPaperTxnCard
                  source={item.source}
                  filedAt={item.at}
                  name={item.name}
                  amount={item.amount}
                />
              )}
            </Fragment>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function BoshaPaperPanel({
  ticker,
  companyName,
  entities: _entities,
  events,
  edges: _edges,
  presentation,
  backendUp,
  insiders = [],
  politicians = [],
  panelClassName = '',
}) {
  const fullName = String(companyName ?? '').trim() || String(ticker ?? '—').toUpperCase()

  return (
    <section
      className={['panel', 'boshaPaper', 'researchPaperPanel', panelClassName].filter(Boolean).join(' ')}
      aria-label={fullName}
    >
      <header className="feedCompactHeader researchPaperPanelHeader">
        <div className="researchPaperPanelName">{fullName}</div>
      </header>
      <div className="boshaPaperBody scrollThin">
        <div className="boshaPaperDoc">
          {presentation?.title ? (
            <>
              <BoshaPaperStructuredView
                ticker={ticker}
                documents={presentation?.documents}
                insiders={insiders}
                politicians={politicians}
              />
            </>
          ) : backendUp ? (
            <div className="boshaThesisBody boshaThesisBody--live">
              <p className="boshaThesisP boshaThesisP--live mono dim">
                Bosha explore data is not available yet for this view (API error or empty response). Check that the
                backend is running and the database has been ingested.
              </p>
            </div>
          ) : null}
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
  conditioningPolitician: 'Pelosi | Tuberville',
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
  if (x >= 100) return String(Math.round(x))
  if (x >= 10) return x.toFixed(1)
  return x.toFixed(2)
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
        <div className="mono dim" style={{ padding: '12px 10px', fontSize: 12 }}>
          No top picks data from the API yet.
        </div>
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
    sync()
    return () => ro.disconnect()
  }, [])

  const w = size.w
  const h = size.h

  const isRet = yTickFormat === 'return'
  /* Plain axes: Y scale runs plotTop→axisY (min sits on the x-axis). Left gutter + bottom room for month labels. */
  const margin = { l: isRet ? 28 : 26, r: 6, t: isRet ? 10 : 8, b: isRet ? 22 : 20 }
  const marginL = margin.l
  const plotTop = margin.t
  const axisY = h - margin.b
  const innerW = Math.max(1, w - margin.l - margin.r)

  const { series: vals, dates: ds } = useMemo(() => {
    if (!showRangeSelector || metaMode !== 'range') {
      return {
        series: Array.isArray(series) ? series : [],
        dates: Array.isArray(dates) ? dates : [],
      }
    }
    const r = PRICE_RANGE_OPTS.includes(priceRange) ? priceRange : '6M'
    return slicePriceDataByRange(series, dates, r)
  }, [series, dates, showRangeSelector, metaMode, priceRange])

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
  }, [vals, w, h, marginL, margin.t, margin.b, plotTop, axisY])

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
  }, [vals, w, h, marginL, margin.t, margin.b, plotTop, axisY])

  const gradId = useMemo(() => {
    const s = String(title ?? 'graph')
    let h0 = 2166136261
    for (let i = 0; i < s.length; i++) h0 = Math.imul(h0 ^ s.charCodeAt(i), 16777619)
    return `graphFill-${(h0 >>> 0).toString(16)}`
  }, [title])

  const yTicks = useMemo(() => {
    if (yTickFormat === 'return') return returnTicks(min, max, 4)
    return priceTicks(min, max, 4)
  }, [min, max, yTickFormat])
  const xTickIdx = useMemo(() => {
    const n = Math.max(0, ds.length)
    if (n <= 1) return []
    return [0.08, 0.32, 0.56, 0.8].map((p) => Math.round(clamp01(p) * (n - 1)))
  }, [ds.length])

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
        <div className="panelTitle">{title}</div>
        {showRangeSelector && metaMode === 'range' ? (
          <div className="boshaPriceRange graphPriceRange" role="group" aria-label="Chart range">
            {PRICE_RANGE_OPTS.map((r) => (
              <button
                key={r}
                type="button"
                className={['boshaPriceRangeBtn', priceRange === r ? 'isActive' : ''].filter(Boolean).join(' ')}
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
                L {vals.length ? vals[vals.length - 1] : 0} | R {min}–{max}
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
                    x={margin.l - 8}
                    y={tyAdj}
                  >
                    {yTickFormat === 'return' ? formatReturnTick(v) : formatPriceTick(v)}
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
          </svg>
        )}
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
  const insider = mode === 'insider' || mode === 'politicians'
  const [live, setLive] = useState(null)

  useEffect(() => {
    let alive = true
    async function run() {
      try {
        const m = mode === 'pharma' ? 'pharma' : mode === 'politicians' ? 'politicians' : 'insider'
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
      ? (live ?? MOCK_HISTORICAL_INSIDER)
      : (live ?? MOCK_HISTORICAL_TRIALS)

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
              <span className="kvK dim">{mode === 'politicians' ? 'Politician' : 'Role'}</span>
              <span className="kvV">
                {hasDataset
                  ? (() => {
                      const v = norm(mode === 'politicians' ? ins?.conditioningPolitician : ins?.conditioningRole)
                      const first = String(v ?? '').split('|')[0]?.trim()
                      return first || EMPTY
                    })()
                  : EMPTY}
              </span>
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
              <span className="kvV">
                {hasDataset ? (() => {
                  const v = norm(ins?.conditioningIndication)
                  const first = String(v ?? '').split('|')[0]?.trim()
                  return first || EMPTY
                })() : EMPTY}
              </span>
            </KvLine>
            <KvLine key="ho-ph-co">
              <span className="kvK dim">Company size bucket</span>
              <span className="kvV">
                {hasDataset ? (() => {
                  const v = norm(ins?.conditioningCoSize)
                  const first = String(v ?? '').split('|')[0]?.trim()
                  return first || EMPTY
                })() : EMPTY}
              </span>
            </KvLine>
          </>
        )}
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
      className={['panel', 'feed', 'feedCompact', `feed--${placement}`, panelClassName]
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
      className={['panel', 'feed', 'feedCompact', `feed--${placement}`]
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

function TerminalTopBar({
  email,
  settingsActive,
  onSettingsClick,
  backendUp,
  intelMode,
  onIntelModeChange,
  showIntelSwitch = false,
  singleModeLabel = null,
  showPoliticianChamberSwitch = false,
  politicianChamber = 'all',
  onPoliticianChamberChange,
}) {
  return (
    <header className="terminalTopBar" aria-label="Mercerline">
      <div className="terminalTopBarStart">
        <div className="terminalTopBarBrand">
          <img
            className="terminalTopBarLogo"
            src="/mercerline_logo_transparent.png"
            alt=""
            width={22}
            height={22}
            decoding="async"
          />
          <span className="terminalTopBarName">MERCERLINE</span>
          <span
            className={backendUp ? 'terminalTopBarHealth isUp' : 'terminalTopBarHealth isDown'}
            title={backendUp ? 'API connected' : 'API offline'}
            aria-label={backendUp ? 'Backend up' : 'Backend down'}
          />
        </div>
      </div>

      <div className="terminalTopBarCenter">
        {showIntelSwitch ? (
          <div
            className={`terminalIntelSwitch terminalIntelSwitch--${intelMode}`}
            role="tablist"
            aria-label="Intelligence mode"
          >
            <button
              type="button"
              role="tab"
              className={intelMode === 'market' ? 'terminalIntelSwitchBtn isActive' : 'terminalIntelSwitchBtn'}
              aria-selected={intelMode === 'market'}
              onClick={() => onIntelModeChange('market')}
            >
              Market intelligence
            </button>
            <span className="terminalIntelSwitchSep" aria-hidden="true">
              |
            </span>
            <button
              type="button"
              role="tab"
              className={intelMode === 'clinical' ? 'terminalIntelSwitchBtn isActive' : 'terminalIntelSwitchBtn'}
              aria-selected={intelMode === 'clinical'}
              onClick={() => onIntelModeChange('clinical')}
            >
              Clinical intelligence
            </button>
          </div>
        ) : showPoliticianChamberSwitch ? (
          <div
            className={`terminalIntelSwitch terminalIntelSwitch--politicians terminalIntelSwitch--${politicianChamber}`}
            role="tablist"
            aria-label="Disclosure chamber"
          >
            {POLITICIAN_CHAMBER_OPTS.map((opt) => {
              const enabled = POLITICIAN_CHAMBER_ENABLED.has(opt.id)
              return (
                <Fragment key={opt.id}>
                  {opt.id === 'house' ? (
                    <span className="terminalIntelSwitchSep" aria-hidden="true">
                      |
                    </span>
                  ) : null}
                  {opt.id === 'senate' ? <span className="terminalIntelSwitchBranchGap" aria-hidden="true" /> : null}
                  <button
                    type="button"
                    role="tab"
                    className={[
                      'terminalIntelSwitchBtn',
                      politicianChamber === opt.id ? 'isActive' : '',
                      enabled ? '' : 'isUnavailable',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-selected={politicianChamber === opt.id}
                    disabled={!enabled}
                    title={enabled ? undefined : 'Not available yet'}
                    onClick={() => enabled && onPoliticianChamberChange?.(opt.id)}
                  >
                    {opt.label}
                  </button>
                </Fragment>
              )
            })}
          </div>
        ) : singleModeLabel ? (
          <div className="terminalIntelSwitch terminalIntelSwitch--single" role="tablist" aria-label="View mode">
            <button
              type="button"
              role="tab"
              className="terminalIntelSwitchBtn isActive"
              aria-selected
              onClick={() => {}}
            >
              {singleModeLabel}
            </button>
          </div>
        ) : null}
      </div>

      <div className="terminalTopBarEnd">
        <div className="terminalTopBarActions">
          {email ? (
            <span className="terminalTopBarEmail mono" title={email}>
              {email}
            </span>
          ) : null}
          <button
            type="button"
            className={
              settingsActive
                ? 'terminalTopBarSettings isActive isClose'
                : 'terminalTopBarSettings'
            }
            aria-label={settingsActive ? 'Close settings' : 'Settings'}
            aria-current={settingsActive ? 'page' : undefined}
            onClick={onSettingsClick}
          >
            {settingsActive ? (
              <svg className="terminalTopBarSettingsIcon" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12l-4.89 4.89a1 1 0 1 0 1.41 1.42L12 13.41l4.89 4.89a1 1 0 0 0 1.42-1.41L13.41 12l4.89-4.89a1 1 0 0 0 0-1.42z"
                />
              </svg>
            ) : (
              <svg className="terminalTopBarSettingsIcon" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.12.57-1.62.94l-2.39-.96a.488.488 0 0 0-.59.22L2.74 8.81a.49.49 0 0 0 .12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.13.22.39.3.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.12-.57 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.03-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z"
                />
              </svg>
            )}
          </button>
        </div>
      </div>
    </header>
  )
}

function KensiglineTerminal() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('main') // main | insider | pharma | politicians | settings
  const [intelMode, setIntelMode] = useState('market') // market | clinical
  const tabBeforeSettingsRef = useRef('main')

  /** Which feed column receives arrow up/down: insider | pharma | programs (rail). */
  const [insiderIdx, setInsiderIdx] = useState(0)
  const [insiderCaseTradeIdx, setInsiderCaseTradeIdx] = useState(0)
  const [politiciansIdx, setPoliticiansIdx] = useState(0)
  const [politiciansCaseTradeIdx, setPoliticiansCaseTradeIdx] = useState(0)
  const [politiciansFilter, setPoliticiansFilter] = useState(null)
  const [politiciansChamber, setPoliticiansChamber] = useState('all')
  const [boshaFeedLive, setBoshaFeedLive] = useState(null)
  const [boshaExploreLive, setBoshaExploreLive] = useState(null)
  const [boshaCompanyLive, setBoshaCompanyLive] = useState(null)
  const [contextClinicalLive, setContextClinicalLive] = useState(null)
  const [boshaBarsSeries, setBoshaBarsSeries] = useState(null)
  const [contextOutcomesLive, setContextOutcomesLive] = useState(null)

  const [boshaTicker, setBoshaTicker] = useState(BOSHA_TICKER_MARKET)
  const intelModePrevRef = useRef(intelMode)
  const [boshaQuery, setBoshaQuery] = useState('')
  const [backendUp, setBackendUp] = useState(false)
  const [backendLastOkAt, setBackendLastOkAt] = useState(0)
  const [backendStats, setBackendStats] = useState(null)
  const boshaDataset = useMemo(() => boshaDatasetForTicker(boshaTicker), [boshaTicker])
  const boshaFeedItems = useMemo(() => {
    const mode = intelMode === 'clinical' ? 'clinical' : 'market'
    const fallback = RESEARCH_FEED_BY_INTEL[mode]
    const allowed = new Set(researchTickersForIntelMode(intelMode))
    if (!backendUp) return fallback
    if (!Array.isArray(boshaFeedLive)) return []
    if (!boshaFeedLive.length) return []
    const mapped = boshaFeedLive
      .map((x) => ({
        rowKey:
          x.kind === 'paper' && x.id ? String(x.id) : `sig-${String(x.ticker ?? '').toUpperCase()}`,
        ticker: String(x.ticker ?? '').toUpperCase(),
        name: String(x.name ?? x.company_name ?? x.ticker ?? ''),
      }))
      .filter((x) => allowed.has(x.ticker))
    return mapped.length ? mapped : fallback
  }, [backendUp, boshaFeedLive, intelMode])

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
    if (backendUp) return []
    return boshaDataset.price
  }, [boshaBarsSeries, boshaDataset.price, backendUp])

  const contextMock = useMemo(
    () => contextMockForTicker(boshaTicker, boshaPriceSeries),
    [boshaTicker, boshaPriceSeries],
  )

  const contextEarnings = useMemo(() => {
    if (backendUp && boshaCompanyLive?.earnings_date) {
      return contextEarningsFromDate(boshaCompanyLive.earnings_date) ?? contextMock.earnings
    }
    return contextMock.earnings
  }, [backendUp, boshaCompanyLive, contextMock.earnings])

  const contextClinicalMapped = useMemo(
    () => mapClinicalContextFromApi(contextClinicalLive),
    [contextClinicalLive],
  )

  const contextPrograms = useMemo(() => {
    if (intelMode !== 'clinical') return []
    if (backendUp && contextClinicalMapped) return contextClinicalMapped.programs
    return contextMock.programs
  }, [backendUp, contextClinicalMapped, contextMock.programs, intelMode])

  const contextLeadDrug = useMemo(() => {
    if (intelMode !== 'clinical') return null
    if (backendUp && contextClinicalMapped?.lead?.name) {
      return contextClinicalMapped.lead
    }
    const fromEntities = contextLeadDrugFromEntities(boshaDataset.entities)
    if (fromEntities) {
      return {
        ...contextMock.leadDrug,
        ...fromEntities,
      }
    }
    return contextMock.leadDrug ?? null
  }, [backendUp, boshaDataset.entities, contextClinicalMapped, contextMock.leadDrug, intelMode])

  const [contextProgramKey, setContextProgramKey] = useState(null)
  const contextProgramDefaultKey = useMemo(() => {
    const groups = groupPrograms(contextPrograms)
    return groups[0]?.key ?? null
  }, [contextPrograms])
  useEffect(() => {
    if (intelMode === 'clinical') setContextProgramKey(contextProgramDefaultKey)
    else setContextProgramKey(null)
  }, [intelMode, boshaTicker, contextProgramDefaultKey])
  useEffect(() => {
    if (intelMode !== 'clinical') return
    if (!contextProgramDefaultKey) return
    if (!contextProgramKey) {
      setContextProgramKey(contextProgramDefaultKey)
      return
    }
    const allowed = new Set(groupPrograms(contextPrograms).map((g) => g.key))
    if (!allowed.has(contextProgramKey)) setContextProgramKey(contextProgramDefaultKey)
  }, [contextPrograms, contextProgramDefaultKey, contextProgramKey, intelMode])

  const contextCatalystItems = useMemo(() => {
    if (intelMode !== 'clinical') return []
    if (backendUp && contextClinicalMapped) return contextClinicalMapped.catalysts
    return buildContextCatalystItems(contextMock.programs, 6)
  }, [backendUp, contextClinicalMapped, contextMock.programs, intelMode])

  const boshaPaperMemo = useMemo(
    () =>
      boshaThesisMemo({
        ticker: boshaTicker,
        companyName: boshaCompanyName,
        events: boshaDataset.events,
        priceSeries: boshaPriceSeries,
        constituents: boshaIsEtf(boshaTicker) ? boshaDatasetForTicker(boshaTicker)?.constituents ?? [] : [],
      }),
    [boshaTicker, boshaCompanyName, boshaDataset.events, boshaPriceSeries],
  )

  const boshaPresentation = useMemo(
    () =>
      resolveBoshaPresentation({
        ticker: boshaTicker,
        titleText: boshaCompanyName,
        backendUp,
        livePresentation: boshaExploreLive?.presentation,
        memo: boshaPaperMemo,
        intelMode,
      }),
    [boshaTicker, boshaCompanyName, backendUp, boshaExploreLive?.presentation, boshaPaperMemo, intelMode],
  )

  useEffect(() => {
    if (activeTab !== 'main') return
    if (intelModePrevRef.current === intelMode) return
    intelModePrevRef.current = intelMode
    setBoshaTicker(intelMode === 'clinical' ? BOSHA_TICKER_CLINICAL : BOSHA_TICKER_MARKET)
    setBoshaQuery('')
  }, [intelMode, activeTab])

  const insiderPriceMarkers = useMemo(
    () => contextMock.insiders.map((x) => x.date),
    [contextMock],
  )
  const politicianPriceMarkers = useMemo(
    () => contextMock.politicians.map((x) => x.date),
    [contextMock],
  )

  const boshaFilteredFeed = useMemo(() => {
    const s = String(boshaQuery ?? '').trim().toUpperCase()
    if (!s) return boshaFeedItems
    return boshaFeedItems.filter((it) => {
      const t = String(it?.ticker ?? '').toUpperCase()
      const n = String(it?.name ?? '').toUpperCase()
      return t.includes(s) || n.includes(s)
    })
  }, [boshaFeedItems, boshaQuery])

  useEffect(() => {
    // If the current selection falls out of the filter, snap to the first match.
    if (activeTab !== 'main') return
    if (!boshaFilteredFeed.length) return
    const ok = boshaFilteredFeed.some((x) => x.ticker === boshaTicker)
    if (!ok) setBoshaTicker(boshaFilteredFeed[0].ticker)
  }, [activeTab, boshaFilteredFeed, boshaTicker])

  const [pharmaIdx, setPharmaIdx] = useState(0)
  /** When set, case sheet + graph follow this trial; cleared when pharma feed row or sponsor context changes */
  const [programRailEventId, setProgramRailEventId] = useState(null)
  const [programRailIdx, setProgramRailIdx] = useState(0)
  const [programRailMilestone, setProgramRailMilestone] = useState(null)

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
    if (!backendUp || activeTab !== 'main') return
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
    if (!backendUp || activeTab !== 'main') return
    const tick = String(boshaTicker ?? '')
      .trim()
      .toUpperCase()
    if (!tick) return
    let cancelled = false
    ;(async () => {
      const enc = encodeURIComponent(tick)
      const [ex, br, co] = await Promise.all([
        fetchJsonSafe(`/api/bosha/explore?ticker=${enc}`, { timeoutMs: 12_000 }),
        fetchJsonSafe(`/api/bars?ticker=${enc}&days=400`, { timeoutMs: 12_000 }),
        fetchJsonSafe(`/api/company?ticker=${enc}`, { timeoutMs: 12_000 }),
      ])
      if (cancelled) return
      if (ex.ok && ex.data?.ok && String(ex.data.ticker ?? '').toUpperCase() === tick) {
        setBoshaExploreLive(ex.data)
      } else if (!cancelled) {
        setBoshaExploreLive(null)
      }
      if (!cancelled) {
        if (co.ok && co.data?.earnings_date) setBoshaCompanyLive(co.data)
        else setBoshaCompanyLive(null)
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
      if (!backendUp || intelMode !== 'clinical' || activeTab !== 'main') {
        if (alive) setContextClinicalLive(null)
        return
      }
      const tick = String(boshaTicker ?? '').trim().toUpperCase()
      if (!tick) {
        if (alive) setContextClinicalLive(null)
        return
      }
      const r = await fetchJsonSafe(
        `/api/pharma/clinical-context?ticker=${encodeURIComponent(tick)}&catalyst_limit=6`,
        { timeoutMs: 14_000 },
      )
      if (!alive) return
      if (r.ok && r.data?.ticker) setContextClinicalLive(r.data)
      else setContextClinicalLive(null)
    }
    run()
    return () => {
      alive = false
    }
  }, [backendUp, intelMode, activeTab, boshaTicker])

  useEffect(() => {
    if (!backendUp || activeTab !== 'main') return
    let alive = true
    async function run() {
      try {
        const [ins, pol] = await Promise.all([
          fetchJsonSafe('/api/outcomes?mode=insider', { timeoutMs: 2500 }),
          fetchJsonSafe('/api/outcomes?mode=politicians', { timeoutMs: 2500 }),
        ])
        if (!alive) return
        const iData = ins.data?.data ?? null
        const pData = pol.data?.data ?? null
        setContextOutcomesLive({ insider: iData, politicians: pData })
      } catch {
        if (!alive) return
        setContextOutcomesLive(null)
      }
    }
    run()
    const t = setInterval(run, 60_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [backendUp, activeTab])

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

  const insiderFeedRows = !backendUp ? INSIDER_FEED_ROWS : (insiderFeedLive ?? [])
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
            chamber: 'house',
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

  const politiciansBaseRows = !backendUp ? POLITICIAN_FEED_ROWS : (politiciansFeedLive ?? [])

  const politiciansChamberRows = useMemo(() => {
    if (politiciansChamber === 'all') return politiciansBaseRows
    if (politiciansChamber === 'house') {
      return politiciansBaseRows.filter((r) => (r?.chamber ?? 'house') === 'house')
    }
    return []
  }, [politiciansBaseRows, politiciansChamber])

  const politicianFilterItems = useMemo(() => {
    const counts = new Map()
    for (const r of politiciansChamberRows) {
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
  }, [politiciansChamberRows])

  const politiciansFeedRows = useMemo(() => {
    if (!politiciansFilter) return politiciansChamberRows
    return politiciansChamberRows.filter((r) => (r?.politicians ?? []).includes(politiciansFilter))
  }, [politiciansChamberRows, politiciansFilter])

  useEffect(() => {
    setPoliticiansIdx(0)
    setPoliticiansCaseTradeIdx(0)
  }, [politiciansFilter, politiciansChamber])

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

  const pharmaFeedRows = !backendUp ? PHARMA_FEED_ROWS : (pharmaFeedLive ?? [])

  const pharmaFeedEventId = useMemo(() => {
    const row = pharmaFeedRows[pharmaIdx]
    if (backendUp) return row?.trialEventId ?? null
    const fallbackId = MOCK_EVENTS[pharmaIdx % MOCK_EVENTS.length]?.id
    return row?.trialEventId ?? fallbackId ?? MOCK_EVENTS[0]?.id
  }, [pharmaFeedRows, pharmaIdx, backendUp])

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
    const baseAnalysis = resolvePharmaAnalysis(null, base) ?? ''
    const milestoneNote = `Program timeline: ${String(label)} (${formatFeedDate(ts)}).`
    const analysis = baseAnalysis
      ? `${baseAnalysis}\n\n${milestoneNote}`
      : milestoneNote
    return {
      ...base,
      ts,
      eventType: String(label).toUpperCase(),
      analysis,
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
    if (activeTab === 'pharma' && programRailMilestone && programRailEventId != null) {
      return synthesizeEventForMilestone(base, programRailMilestone)
    }
    return base
  }, [backendUp, activeTab, programRailEventId, pharmaFeedEventId, programRailMilestone])

  const pharmaSelectedResolved = useMemo(() => {
    if (backendUp && activeTab !== 'pharma') return null
    if (backendUp && !pharmaEventLive) return null
    if (!pharmaEventLive || activeTab !== 'pharma') {
      if (!pharmaSelected) return null
      return {
        ...pharmaSelected,
        analysis: pharmaSelected.analysis ?? resolvePharmaAnalysis(null, pharmaSelected),
      }
    }
    const drug = pharmaEventLive?.drug ?? null
    const phase = pharmaEventLive?.phase ?? null
    return {
      id: pharmaFeedEventId,
      drug,
      phase,
      ts: pharmaEventLive?.event_at ?? pharmaEventLive?.eventAt ?? new Date().toISOString(),
      eventType: pharmaEventLive?.event_type ?? pharmaEventLive?.eventType ?? 'UPDATE',
      feedLabel: pharmaEventLive?.feed_label ?? null,
      analysis: resolvePharmaAnalysis(pharmaEventLive, pharmaSelected),
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
    }
  }, [backendUp, activeTab, politiciansSelected, politiciansClusterLive])

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

  const pharmaCaseAnalysisText = useMemo(() => {
    if (activeTab !== 'pharma') return null
    return pharmaSelectedResolved?.analysis ?? resolvePharmaAnalysis(pharmaEventLive, pharmaSelected) ?? null
  }, [activeTab, pharmaSelectedResolved, pharmaEventLive, pharmaSelected])

  const daily =
    backendUp
      ? barsLive ?? []
      : activeTab === 'insider'
        ? (barsLive ?? insiderSelectedResolved?.daily ?? [])
        : activeTab === 'politicians'
          ? (politiciansSelectedResolved?.daily ?? [])
          : pharmaSelectedResolved?.daily ?? []

  const dailySeries = useMemo(() => {
    if (Array.isArray(daily) && daily.length >= 40) return daily
    if (!backendUp) return buildMockDailySeries(activeTab === 'insider' ? 71 : 133, 160)
    return []
  }, [daily, backendUp, activeTab])

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


  const worksheetMetaId =
    activeTab === 'insider'
      ? insiderSelectedResolved?.caseSheet?.issuer ?? insiderSelectedResolved?.id ?? '—'
      : activeTab === 'politicians'
        ? politiciansSelectedResolved?.caseSheet?.issuer ?? politiciansSelectedResolved?.id ?? '—'
        : (() => {
            const p = pharmaSelectedResolved
            if (!p) return '—'
            const bits = [p.drug ?? p.trialSnapshot?.drug, p.phase ?? p.trialSnapshot?.phase, p.eventType]
              .map((x) => String(x ?? '').trim())
              .filter(Boolean)
            return bits.length ? bits.join(' · ') : (p.id ?? '—')
          })()

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

  const userEmail = user?.email ?? ''

  const onSettingsClick = useCallback(() => {
    if (activeTab === 'settings') {
      setActiveTab(tabBeforeSettingsRef.current)
      return
    }
    tabBeforeSettingsRef.current = activeTab
    setActiveTab('settings')
  }, [activeTab])

  return (
    <div
      className={[
        'terminalShell',
        activeTab === 'main' ? `terminalShell--intel-${intelMode}` : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <TerminalTopBar
        email={userEmail}
        settingsActive={activeTab === 'settings'}
        onSettingsClick={onSettingsClick}
        backendUp={backendUp}
        intelMode={intelMode}
        onIntelModeChange={setIntelMode}
        showIntelSwitch={activeTab === 'main'}
        singleModeLabel={
          activeTab === 'insider'
            ? 'Insider intelligence'
            : activeTab === 'pharma'
              ? 'Pharma intelligence'
              : null
        }
        showPoliticianChamberSwitch={activeTab === 'politicians'}
        politicianChamber={politiciansChamber}
        onPoliticianChamberChange={setPoliticiansChamber}
      />
      <div className="terminalWorkspace">
      <nav className="sideTabsRail" aria-label="Views">
        <button
          type="button"
          className={activeTab === 'main' ? 'sideTab isActive' : 'sideTab'}
          aria-current={activeTab === 'main' ? 'page' : undefined}
          onClick={() => setActiveTab('main')}
        >
          <span className="sideTabLabel">RESEARCH</span>
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
      </nav>
      <main
        className={[
          'terminal',
          `terminal--${activeTab}`,
          activeTab === 'main' ? `terminal--intel-${intelMode}` : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label="MERCERLINE terminal grid"
      >
      {activeTab === 'settings' ? <SettingsPanel /> : null}
      {activeTab === 'insider' ? (
        <>
          <CompactFeed
            placement="left"
            title="FEED"
            items={insiderFeedRows}
            selectedIndex={insiderIdx}
            sepMode="today+years"
            scrollMode
            onSelectIndex={setInsiderIdx}
          />
          <CaseKvFeed
            title="CASE"
            rows={insiderCaseFeedRows}
            placement="right"
            selectedTradeRowIndex={insiderCaseSelectedRowIndex}
            scrollMode
            onSelectTradeRowIndex={(rowIndex) => {
              const pos = insiderCaseTradeRowIndices.indexOf(rowIndex)
              if (pos >= 0) setInsiderCaseTradeIdx(pos)
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
            sepMode="today+years"
            scrollMode
            onSelectIndex={setPharmaIdx}
          />
          <CompactFeed
            placement="rail"
            panelClassName="blankFeedRail"
            title="PROGRAMS"
            programsTimeline
            items={programFeedItems}
            selectedIndex={programSelectedIdx}
            scrollMode
            onSelectIndex={(idx) => {
              setProgramRailIdx(idx)
              const row = programFeedItems[idx]
              if (row?.trialEventId) setProgramRailEventId(row.trialEventId)
              setProgramRailMilestone(row ?? null)
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
          />
          <CompactFeed
            placement="left"
            title="FEED"
            items={politiciansFeedRows}
            selectedIndex={politiciansIdx}
            sepMode="today+years"
            scrollMode
            onSelectIndex={setPoliticiansIdx}
          />
          <CaseKvFeed
            title="CASE"
            rows={politiciansCaseFeedRows}
            placement="right"
            selectedTradeRowIndex={politiciansCaseSelectedRowIndex}
            scrollMode
            onSelectTradeRowIndex={(rowIndex) => {
              const pos = politiciansCaseTradeRowIndices.indexOf(rowIndex)
              if (pos >= 0) setPoliticiansCaseTradeIdx(pos)
            }}
          />
        </>
      ) : null}

      {activeTab === 'main' ? (
        <>
          <BoshaTickerPanel
            selectedTicker={boshaTicker}
            onSelectTicker={setBoshaTicker}
            q={boshaQuery}
            onQuery={setBoshaQuery}
            filtered={boshaFilteredFeed}
            panelClassName="mainBoshaPicks"
          />

          <BoshaPaperPanel
            ticker={boshaTicker}
            companyName={boshaCompanyName}
            entities={boshaDataset.entities}
            events={boshaDataset.events}
            edges={boshaDataset.edges}
            backendUp={backendUp}
            presentation={boshaPresentation}
            insiders={contextMock.insiders}
            politicians={contextMock.politicians}
            panelClassName="mainMainBlank"
          />

          <MainContextPanel
            intelMode={intelMode}
            ticker={contextMock.ticker}
            price={contextMock.price}
            sector={contextMock.sector}
            domicile={contextMock.domicile}
            mcap={contextMock.mcap}
            priceSeries={boshaPriceSeries}
            insiderPriceMarkers={insiderPriceMarkers}
            politicianPriceMarkers={politicianPriceMarkers}
            earnings={contextEarnings}
            leadDrug={contextLeadDrug}
            programs={contextPrograms}
            selectedProgramKey={contextProgramKey}
            onSelectProgramKey={setContextProgramKey}
            insiders={contextMock.insiders}
            politicians={contextMock.politicians}
            catalystItems={contextCatalystItems}
          />
        </>
      ) : null}

      {/* Explore tab removed; BOSHA panels live inside MAIN now. */}

      {activeTab === 'pharma' ? (
        <section className="panel worksheet" aria-label="Trial case analysis">
          <header className="feedCompactHeader">
            <div className="panelTitle feedCompactTitle">CASE</div>
            <div className="feedCompactMeta">
              <span>{worksheetMetaId}</span>
            </div>
          </header>

          <div className="worksheetBody worksheetBody--analysis scrollThin pharmaCaseAnalysis">
            <PharmaCaseAnalysis text={pharmaCaseAnalysisText} />
          </div>
        </section>
      ) : null}

      {activeTab !== 'main' && activeTab !== 'settings' ? (
        <>
          <HistoricalOutcomesPanel mode={activeTab === 'politicians' ? 'politicians' : activeTab} backendUp={backendUp} />

          <GraphPanel
            title="PRICE"
            series={dailySeries}
            dates={dailyDates}
            markers={insiderTradeMarkers}
            selectedMarker={selectedInsiderTradeMarker}
          />

          <CompanyPanel mode={activeTab === 'politicians' ? 'insider' : activeTab} company={companyLive} backendUp={backendUp} />
        </>
      ) : null}
      </main>
      </div>
    </div>
  )
}

function AuthBootScreen() {
  return (
    <div className="authBoot mono" aria-live="polite">
      Mercerline
    </div>
  )
}

export default function App() {
  const { configured, loading, user } = useAuth()

  // Subscription gate disabled temporarily — re-enable SubscribePage + useSubscription when billing goes live.

  if (configured && loading) return <AuthBootScreen />
  if (configured && !user) return <IntroPage />

  return <KensiglineTerminal />
}
