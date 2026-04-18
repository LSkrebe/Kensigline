import { useState } from 'react'
import './App.css'

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
]

function clamp01(n) {
  return Math.max(0, Math.min(1, n))
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

/** Strip role tags from the copy when the row label already states primary / secondary / …. */
function endpointDisplayValue(raw, idx) {
  const s = String(raw ?? '').trim()
  if (!s) return '—'

  let out = s

  if (idx === 0) {
    out = out.replace(/^\s*Primary\s*:\s*/i, '').trim()
    return out || '—'
  }

  out = out.replace(/^\s*Secondary\s*:\s*/i, '').trim()

  const extraRoles = ['Tertiary', 'Quaternary', 'Quinary', 'Senary']
  if (idx >= 2 && idx - 2 < extraRoles.length) {
    const re = new RegExp(`^\\s*${extraRoles[idx - 2]}\\s*:\\s*`, 'i')
    out = out.replace(re, '').trim()
  }

  return out || '—'
}

function buildWorksheetRows(selected, hasSafety) {
  const rows = []

  rows.push(
    <div key="drug" className="kvLine">
      <span className="kvK dim">DRUG</span>
      <span className="kvV mono">{selected?.trialSnapshot?.drug ?? '—'}</span>
    </div>,
    <div key="mech" className="kvLine">
      <span className="kvK dim">MECH</span>
      <span className="kvV">{selected?.trialSnapshot?.mechanism ?? '—'}</span>
    </div>,
    <div key="phase" className="kvLine">
      <span className="kvK dim">PHASE</span>
      <span className="kvV mono">{selected?.trialSnapshot?.phase ?? '—'}</span>
    </div>,
    <div key="ind" className="kvLine">
      <span className="kvK dim">IND</span>
      <span className="kvV">{selected?.trialSnapshot?.indication ?? '—'}</span>
    </div>,
    <div key="sponsor" className="kvLine">
      <span className="kvK dim">SPONSOR</span>
      <span className="kvV">{selected?.trialSnapshot?.sponsor ?? '—'}</span>
    </div>,
    <div key="intv" className="kvLine">
      <span className="kvK dim">INTV</span>
      <span className="kvV">{selected?.trialSnapshot?.intervention ?? '—'}</span>
    </div>,
    <div key="status" className="kvLine">
      <span className="kvK dim">STATUS</span>
      <span className="kvV">{selected?.timelineDetails?.status ?? '—'}</span>
    </div>,
    <div key="start" className="kvLine">
      <span className="kvK dim">START</span>
      <span className="kvV mono">{selected?.timelineDetails?.studyStart ?? '—'}</span>
    </div>,
    <div key="priComp" className="kvLine">
      <span className="kvK dim">PRI COMP</span>
      <span className="kvV mono">{selected?.timelineDetails?.primaryCompletion ?? '—'}</span>
    </div>,
    <div key="studyComp" className="kvLine">
      <span className="kvK dim">STUDY COMP</span>
      <span className="kvV mono">{selected?.timelineDetails?.studyCompletion ?? '—'}</span>
    </div>,
    <div key="source" className="kvLine">
      <span className="kvK dim">SOURCE</span>
      <span className="kvV">{selected?.timelineDetails?.eventSource ?? '—'}</span>
    </div>,
    <div key="detail" className="kvLine">
      <span className="kvK dim">DETAIL</span>
      <span className="kvV">{selected?.timelineDetails?.eventSubtype ?? '—'}</span>
    </div>,
    <div key="evt" className="kvLine">
      <span className="kvK dim">EVT</span>
      <span className="kvV">{selected?.eventType ?? '—'}</span>
    </div>,
    <div key="arms" className="kvLine">
      <span className="kvK dim">ARMS</span>
      <span className="kvV">{selected?.studyDesign?.arms ?? '—'}</span>
    </div>,
    <div key="rand" className="kvLine">
      <span className="kvK dim">RAND</span>
      <span className="kvV">{selected?.studyDesign?.randomization ?? '—'}</span>
    </div>,
    <div key="ctrl" className="kvLine">
      <span className="kvK dim">CTRL</span>
      <span className="kvV">{selected?.studyDesign?.control ?? '—'}</span>
    </div>,
    <div key="mask" className="kvLine">
      <span className="kvK dim">MASK</span>
      <span className="kvV">{selected?.studyDesign?.masking ?? '—'}</span>
    </div>,
    <div key="n" className="kvLine">
      <span className="kvK dim">N</span>
      <span className="kvV mono">{selected?.studyDesign?.sampleSize ?? '—'}</span>
    </div>,
    <div key="cond" className="kvLine">
      <span className="kvK dim">COND</span>
      <span className="kvV kvVWrap">{selected?.population?.condition ?? '—'}</span>
    </div>,
    <div key="bio" className="kvLine">
      <span className="kvK dim">BIO</span>
      <span className="kvV kvVWrap">{selected?.population?.biomarkers ?? '—'}</span>
    </div>,
    <div key="lot" className="kvLine">
      <span className="kvK dim">LOT</span>
      <span className="kvV mono">{selected?.population?.lineOfTherapy ?? '—'}</span>
    </div>,
  )

  const eps = selected?.endpointsResults?.endpoints ?? []
  if (eps.length === 0) {
    rows.push(
      <div key="ep-empty" className="kvLine">
        <span className="kvK dim">Endpoints</span>
        <span className="kvV dim">—</span>
      </div>,
    )
  } else {
    eps.forEach((e, idx) => {
      rows.push(
        <div key={`ep-${idx}-${e}`} className="kvLine">
          <span className="kvK dim">{endpointRowLabel(idx)}</span>
          <span className="kvV kvVWrap">{endpointDisplayValue(e, idx)}</span>
        </div>,
      )
    })
  }

  const res = selected?.endpointsResults?.results ?? []
  if (res.length === 0) {
    rows.push(
      <div key="res-empty" className="kvLine">
        <span className="kvK dim">Results</span>
        <span className="kvV dim">—</span>
      </div>,
    )
  } else {
    res.forEach((r, idx) => {
      rows.push(
        <div key={`res-${idx}-${r.endpoint}`} className="kvLine">
          <span className="kvK dim kvLong">{r.endpoint}</span>
          <span className="kvV mono">{r.value}</span>
        </div>,
      )
    })
  }

  if (!hasSafety) {
    rows.push(
      <div key="safe-empty" className="kvLine">
        <span className="kvK dim">Safety</span>
        <span className="kvV dim">—</span>
      </div>,
    )
  } else {
    selected.safety.forEach((s, idx) => {
      rows.push(
        <div key={`safe-${idx}-${s.term}`} className="kvLine">
          <span className="kvK dim kvLong">{s.term}</span>
          <span className="kvV mono">{s.value}</span>
        </div>,
      )
    })
  }

  return rows
}

function EventFeedPanel({ selectedId, onSelectId, placement }) {
  const label = placement === 'left' ? 'Event feed' : 'Event feed mirror'
  return (
    <section className={`panel feed feed--${placement}`} aria-label={label}>
      <header className="panelHeader">
        <div className="panelTitle">EVENT FEED</div>
        <div className="panelMeta">CATALYST TAPE</div>
      </header>
      <div className="feedList" role="list">
        {MOCK_EVENTS.map((ev) => {
          const active = ev.id === selectedId
          return (
            <button
              key={ev.id}
              type="button"
              className={`feedItem ${active ? 'isActive' : ''}`}
              onClick={() => onSelectId(ev.id)}
              role="listitem"
            >
              <div className="feedRow1">
                <span className="feedTrial">{ev.trial}</span>
                <span className={`feedType type-${ev.eventType.replace(/\s/g, '')}`}>
                  {ev.eventType}
                </span>
              </div>
              <div className="feedRow2">
                <span className="feedDrug">{ev.drug}</span>
                <span className="feedTs">{ev.ts}</span>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function App() {
  const [selectedId, setSelectedId] = useState(MOCK_EVENTS[0]?.id ?? '')
  const selected = MOCK_EVENTS.find((e) => e.id === selectedId) ?? MOCK_EVENTS[0]
  const hasSafety = Array.isArray(selected?.safety) && selected.safety.length > 0

  const daily = selected?.daily ?? []
  const dailyMin = daily.length ? Math.min(...daily) : 0
  const dailyMax = daily.length ? Math.max(...daily) : 0
  const dailyLast = daily.length ? daily[daily.length - 1] : 0

  const worksheetRows = buildWorksheetRows(selected, hasSafety)

  /* Inner padding inside SVG viewBox (stroke clearance); outer gutter is CSS .graphWrap */
  const plotInset = { left: 8, right: 8, top: 8, bottom: 8 }

  return (
    <main className="terminal" aria-label="KENSIGLINE terminal grid">
      <EventFeedPanel selectedId={selectedId} onSelectId={setSelectedId} placement="left" />
      <EventFeedPanel selectedId={selectedId} onSelectId={setSelectedId} placement="right" />

      <section className="panel worksheet" aria-label="Trial worksheet">
        <header className="panelHeader">
          <div className="panelTitle">CASE WORKSHEET</div>
          <div className="panelMeta">{selected?.id ?? '—'}</div>
        </header>

        <div className="worksheetBody">{worksheetRows}</div>
      </section>

      <section className="panel graph" aria-label="Daily graph">
        <header className="panelHeader">
          <div className="panelTitle">DAILY GRAPH</div>
          <div className="panelMeta">
            {selected?.id ?? '—'} · L {dailyLast} · R {dailyMin}–{dailyMax}
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

      <section className="panel logo" aria-label="Logo panel">
        <header className="panelHeader">
          <div className="panelTitle">KENSIGLINE</div>
          <div className="panelMeta">BIO INTEL</div>
        </header>
        <img className="logoOrb" src="/kensigline_logo_transparent.png" alt="Kensigline logo" />
      </section>
    </main>
  )
}

export default App
