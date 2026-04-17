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

function parseDay(ts) {
  const m = String(ts ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

function fmtDay(d) {
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${mm}/${dd}`
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

function App() {
  const [selectedId, setSelectedId] = useState(MOCK_EVENTS[0]?.id ?? '')
  const selected = MOCK_EVENTS.find((e) => e.id === selectedId) ?? MOCK_EVENTS[0]
  const hasSafety = Array.isArray(selected?.safety) && selected.safety.length > 0

  const daily = selected?.daily ?? []
  const dailyMin = daily.length ? Math.min(...daily) : 0
  const dailyMax = daily.length ? Math.max(...daily) : 0
  const dailyLast = daily.length ? daily[daily.length - 1] : 0
  const dailyMid = Math.round((dailyMin + dailyMax) / 2)

  const baseDay = parseDay(selected?.ts) ?? new Date()

  // Reserve margins for axis labels; draw plot inside this area.
  const plotInset = { left: 28, right: 10, top: 10, bottom: 22 }
  const plotLeft = plotInset.left
  const plotRight = 900 - plotInset.right
  const plotTop = plotInset.top
  const plotBottom = 140 - plotInset.bottom

  const xTickCount = 5
  const xTicks = Array.from({ length: xTickCount }, (_, i) => {
    const frac = i / (xTickCount - 1)
    const x = plotLeft + frac * (plotRight - plotLeft)
    const daysBack = (xTickCount - 1) - i
    return { x, d: new Date(baseDay.getTime() - daysBack * 86400000) }
  })

  const yTickCount = 5
  const yTicks = Array.from({ length: yTickCount }, (_, i) => {
    const frac = i / (yTickCount - 1)
    const y = plotTop + frac * (plotBottom - plotTop)
    const v = Math.round(dailyMax - frac * (dailyMax - dailyMin))
    return { y, v }
  })

  return (
    <main className="terminal" aria-label="KENSIGLINE terminal grid">
      <section className="panel feed" aria-label="Event feed">
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
                onClick={() => setSelectedId(ev.id)}
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

      <section className="panel snapshot" aria-label="Trial snapshot">
        <header className="panelHeader">
          <div className="panelTitle">TRIAL SNAPSHOT</div>
          <div className="panelMeta">{selected?.id ?? '—'}</div>
        </header>
        <div className="kvStack">
          <div className="kvLine">
            <span className="kvK dim">DRUG</span>
            <span className="kvV mono">{selected?.trialSnapshot?.drug ?? '—'}</span>
          </div>
          <div className="kvLine">
            <span className="kvK dim">MECH</span>
            <span className="kvV">{selected?.trialSnapshot?.mechanism ?? '—'}</span>
          </div>
          <div className="kvLine">
            <span className="kvK dim">PHASE</span>
            <span className="kvV mono">{selected?.trialSnapshot?.phase ?? '—'}</span>
          </div>
          <div className="kvLine">
            <span className="kvK dim">IND</span>
            <span className="kvV">{selected?.trialSnapshot?.indication ?? '—'}</span>
          </div>
          <div className="kvLine">
            <span className="kvK dim">SPONSOR</span>
            <span className="kvV">{selected?.trialSnapshot?.sponsor ?? '—'}</span>
          </div>
          <div className="kvLine">
            <span className="kvK dim">INTV</span>
            <span className="kvV">{selected?.trialSnapshot?.intervention ?? '—'}</span>
          </div>
        </div>
      </section>

      <section className="panel file" aria-label="Trial file">
        <header className="panelHeader">
          <div className="panelTitle">TRIAL FILE</div>
          <div className="panelMeta">{selected?.timelineDetails?.status ?? '—'}</div>
        </header>
        <div className="kvStack">
          <div className="kvLine">
            <span className="kvK dim">START</span>
            <span className="kvV mono">{selected?.timelineDetails?.studyStart ?? '—'}</span>
          </div>
          <div className="kvLine">
            <span className="kvK dim">PRI COMP</span>
            <span className="kvV mono">{selected?.timelineDetails?.primaryCompletion ?? '—'}</span>
          </div>
          <div className="kvLine">
            <span className="kvK dim">STUDY COMP</span>
            <span className="kvV mono">{selected?.timelineDetails?.studyCompletion ?? '—'}</span>
          </div>
          <div className="kvLine">
            <span className="kvK dim">SOURCE</span>
            <span className="kvV">{selected?.timelineDetails?.eventSource ?? '—'}</span>
          </div>
          <div className="kvLine">
            <span className="kvK dim">DETAIL</span>
            <span className="kvV">{selected?.timelineDetails?.eventSubtype ?? '—'}</span>
          </div>
        </div>
      </section>

      <section className="panel voidTR" aria-label="Empty panel" />

      <section className="panel design" aria-label="Study design">
        <header className="panelHeader">
          <div className="panelTitle">STUDY DESIGN</div>
          <div className="panelMeta">{selected?.eventType ?? '—'}</div>
        </header>
        <div className="kvStack">
          <div className="kvLine">
            <span className="kvK dim">ARMS</span>
            <span className="kvV">{selected?.studyDesign?.arms ?? '—'}</span>
          </div>
          <div className="kvLine">
            <span className="kvK dim">RAND</span>
            <span className="kvV">{selected?.studyDesign?.randomization ?? '—'}</span>
          </div>
          <div className="kvLine">
            <span className="kvK dim">CTRL</span>
            <span className="kvV">{selected?.studyDesign?.control ?? '—'}</span>
          </div>
          <div className="kvLine">
            <span className="kvK dim">MASK</span>
            <span className="kvV">{selected?.studyDesign?.masking ?? '—'}</span>
          </div>
          <div className="kvLine">
            <span className="kvK dim">N</span>
            <span className="kvV mono">{selected?.studyDesign?.sampleSize ?? '—'}</span>
          </div>
        </div>
      </section>

      <section className="panel population" aria-label="Population">
        <header className="panelHeader">
          <div className="panelTitle">POPULATION</div>
          <div className="panelMeta">{selected?.population?.condition ?? '—'}</div>
        </header>
        <div className="kvStack">
          <div className="kvLine">
            <span className="kvK dim">COND</span>
            <span className="kvV kvVWrap">{selected?.population?.condition ?? '—'}</span>
          </div>
          <div className="kvLine">
            <span className="kvK dim">BIO</span>
            <span className="kvV kvVWrap">{selected?.population?.biomarkers ?? '—'}</span>
          </div>
          <div className="kvLine">
            <span className="kvK dim">LOT</span>
            <span className="kvV mono">{selected?.population?.lineOfTherapy ?? '—'}</span>
          </div>
        </div>
      </section>

      <section className="panel endpoints" aria-label="Endpoints">
        <header className="panelHeader">
          <div className="panelTitle">ENDPOINTS</div>
          <div className="panelMeta">{(selected?.endpointsResults?.endpoints ?? []).length}</div>
        </header>
        <div className="kvStack">
          {(selected?.endpointsResults?.endpoints ?? []).length === 0 ? (
            <div className="dim">—</div>
          ) : (
            (selected?.endpointsResults?.endpoints ?? []).map((e, idx) => (
              <div key={e} className="kvLine">
                <span className="kvK dim">EP{String(idx + 1).padStart(2, '0')}</span>
                <span className="kvV kvVWrap">{e}</span>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="panel results" aria-label="Results">
        <header className="panelHeader">
          <div className="panelTitle">RESULTS</div>
          <div className="panelMeta">
            {(selected?.endpointsResults?.results ?? []).length > 0 ? 'AVAILABLE' : 'NONE'}
          </div>
        </header>
        <div className="kvStack" role="list" aria-label="Results table">
          {(selected?.endpointsResults?.results ?? []).length === 0 ? (
            <div className="dim">—</div>
          ) : (
            (selected?.endpointsResults?.results ?? []).map((r, idx) => (
              <div key={r.endpoint} className="kvLine" role="listitem">
                <span className="kvK dim">R{String(idx + 1).padStart(2, '0')}</span>
                <span className="kvV kvVWrap">
                  <span className="mono">{r.endpoint}</span>
                  {' = '}
                  <span className="mono">{r.value}</span>
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      {hasSafety ? (
        <section className="panel safety" aria-label="Safety">
          <header className="panelHeader">
            <div className="panelTitle">SAFETY</div>
            <div className="panelMeta">AVAILABLE</div>
          </header>
          <div className="kvStack" role="list">
            {selected.safety.map((s, idx) => (
              <div key={s.term} className="kvLine" role="listitem">
                <span className="kvK dim">S{String(idx + 1).padStart(2, '0')}</span>
                <span className="kvV kvVWrap">
                  <span className="mono">{s.term}</span>
                  {' = '}
                  <span className="mono">{s.value}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

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
            <g className="axes" aria-hidden="true">
              <path
                className="axisLine"
                d={`M ${plotLeft} ${plotTop} L ${plotLeft} ${plotBottom} M ${plotLeft} ${plotBottom} L ${plotRight} ${plotBottom}`}
              />
              {/* Y labels */}
              {yTicks.map((t, idx) => (
                <text
                  key={`${t.y}-${t.v}`}
                  className="axisLabel y"
                  x={plotLeft - 20}
                  y={t.y}
                  textAnchor="end"
                  dominantBaseline={idx === 0 ? 'hanging' : idx === yTicks.length - 1 ? 'ideographic' : 'middle'}
                >
                  {t.v}
                </text>
              ))}

              {/* X labels */}
              {xTicks.map((t, idx) => {
                const x = idx === 0 ? plotLeft : idx === xTicks.length - 1 ? plotRight : t.x
                const anchor = idx === 0 ? 'start' : idx === xTicks.length - 1 ? 'end' : 'middle'
                return (
                  <text
                    key={`${idx}-${t.x}`}
                    className="axisLabel x"
                    x={x}
                    y={plotBottom + 14}
                    textAnchor={anchor}
                    dominantBaseline="ideographic"
                  >
                    {fmtDay(t.d)}
                  </text>
                )
              })}
            </g>
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
