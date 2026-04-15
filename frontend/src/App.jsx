import { useState } from 'react'
import './App.css'

const MOCK_EVENTS = [
  {
    id: 'ONC-441-P2-READOUT',
    trial: 'ONC-441 Phase II (mCRC)',
    drug: 'ONC-441 (CD47xEGFR)',
    eventType: 'READOUT',
    ts: '2026-04-14 09:31:12Z',
    what: 'Interim ORR signal printed above street; DCR stable, OS immature.',
    expectation: 'Street expected noisy ORR with fragile duration; buy-side expected miss vs SOC.',
    change: 'Model shifts response durability up; endpoint risk down modestly; pricing dislocation likely.',
    trialQuality: [
      'Primary: ORR (RECIST v1.1); Secondary: DOR, PFS, safety',
      'N=124; enrichment: EGFR-high; stratification partially balanced',
      'Control arm: external SOC benchmark; no randomized comparator',
      'Weakness: imaging cadence variability; cross-site reader drift risk',
    ],
    statIntegrity: [
      { label: 'p-value', value: 'Nominal p=0.041 (non-adjusted interim)', level: 'warn' },
      { label: 'effect size', value: 'ORR delta plausible; DOR tail uncertain', level: 'ok' },
      { label: 'subgroup risk', value: 'EGFR-high post-hoc boundary drift possible', level: 'warn' },
      { label: 'data quality', value: 'Dropouts low; AE reporting consistent', level: 'ok' },
    ],
    expectationGap: { market: 62, model: 74, gapScore: +12 },
    signal: {
      verdict: 'LONG (rare)',
      confidence: 0.66,
      reasons: ['Durability > expected', 'Narrative reversal vs skeptical tape', 'Low near-term FDA friction'],
      invalidations: ['DOR collapses on next scan', 'Safety signal emerges in expansion cohort'],
    },
    daily: [94, 96, 92, 90, 91, 93, 95, 99, 101, 98, 102, 106, 103, 108, 112, 109, 113],
  },
  {
    id: 'NRX-118-FDA-UPDATE',
    trial: 'NRX-118 Phase I/II (RARE-NEURO)',
    drug: 'NRX-118 (intrathecal ASO)',
    eventType: 'FDA UPDATE',
    ts: '2026-04-14 10:04:51Z',
    what: 'FDA asks for CMC comparability package; clinical hold not issued.',
    expectation: 'Market priced an imminent hold after supplier transition rumor.',
    change: 'Timeline slips 6–10 weeks; probability of full stop reduced.',
    trialQuality: [
      'Primary: biomarker knockdown; Secondary: functional scale (exploratory)',
      'N=38 planned; adaptive dose escalation with sentinel dosing',
      'Control: none; historical comparator for functional endpoints',
      'Weakness: endpoint surrogate acceptance uncertain; small N volatility',
    ],
    statIntegrity: [
      { label: 'p-value', value: 'Not applicable (dose-finding)', level: 'neutral' },
      { label: 'effect size', value: 'Biomarker effect robust but clinical link unproven', level: 'warn' },
      { label: 'subgroup risk', value: 'Responder definition may drift with dosing', level: 'warn' },
      { label: 'data quality', value: 'Missingness moderate (LP schedule)', level: 'warn' },
    ],
    expectationGap: { market: 41, model: 46, gapScore: +5 },
    signal: {
      verdict: 'AVOID',
      confidence: 0.58,
      reasons: ['CMC overhang persists', 'Surrogate-to-clinical bridge weak'],
      invalidations: ['FDA clears comparability cleanly', 'Functional trend aligns with biomarker'],
    },
    daily: [52, 51, 49, 48, 49, 50, 51, 50, 52, 53, 52, 54, 55, 54, 53, 52, 53],
  },
  {
    id: 'KLM-210-TRIAL-DELAY',
    trial: 'KLM-210 Phase III (NASH)',
    drug: 'KLM-210 (FXR agonist)',
    eventType: 'DELAY',
    ts: '2026-04-14 11:22:03Z',
    what: 'Enrollment pause due to site compliance audit; restart expected after remediation.',
    expectation: 'Street expected steady enrollment; no compliance flags.',
    change: 'Power timeline extends; competitive readouts compress window.',
    trialQuality: [
      'Primary: fibrosis improvement without worsening NASH',
      'N=1,200; global sites; heterogeneity risk high',
      'Control: placebo; background therapy variable across regions',
      'Weakness: endpoint adjudication complexity; protocol deviations likely',
    ],
    statIntegrity: [
      { label: 'p-value', value: 'Interim not disclosed', level: 'neutral' },
      { label: 'effect size', value: 'FXR class historically modest', level: 'warn' },
      { label: 'subgroup risk', value: 'Region/site effects could dominate', level: 'warn' },
      { label: 'data quality', value: 'Protocol deviations elevated', level: 'bad' },
    ],
    expectationGap: { market: 55, model: 43, gapScore: -12 },
    signal: {
      verdict: 'SHORT',
      confidence: 0.71,
      reasons: ['Execution slippage', 'Class effect skepticism', 'Crowded catalyst window'],
      invalidations: ['Audit resolves with no material findings', 'Enrollment re-accelerates immediately'],
    },
    daily: [77, 78, 76, 74, 73, 72, 70, 71, 69, 68, 66, 65, 64, 63, 62, 61, 60],
  },
  {
    id: 'BETA-AMYLOID-FAIL',
    trial: 'BA-19 Phase II (Early AD)',
    drug: 'BA-19 (beta-amyloid mAb)',
    eventType: 'ENDPOINT MISS',
    ts: '2026-04-14 12:09:44Z',
    what: 'Primary cognitive endpoint missed; biomarker cleared but clinical separation absent.',
    expectation: 'Market expected marginal win with heavy statistical “massaging”.',
    change: 'Probability of Phase III drops sharply; valuation floor uncertain.',
    trialQuality: [
      'Primary: cognitive composite at 18 months; Secondary: PET amyloid, safety',
      'N=312; mild AD; background standard-of-care uneven',
      'Control: placebo; blinding intact; dropout rises late',
      'Weakness: endpoint sensitivity; learning effects; site variability',
    ],
    statIntegrity: [
      { label: 'p-value', value: 'p=0.27 (primary); secondary multiplicity not met', level: 'bad' },
      { label: 'effect size', value: 'Biomarker-clinical decoupling persists', level: 'bad' },
      { label: 'subgroup risk', value: 'APOE subgroup fishing likely', level: 'warn' },
      { label: 'data quality', value: 'Dropouts high; missing data imputation heavy', level: 'bad' },
    ],
    expectationGap: { market: 48, model: 28, gapScore: -20 },
    signal: {
      verdict: 'SHORT',
      confidence: 0.79,
      reasons: ['Primary miss definitive', 'Imputation reliance', 'Crowded space, no differentiation'],
      invalidations: ['Unexpected FDA pathway signal', 'Replicated cognitive effect in extension'],
    },
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
      <section className="panel structure" aria-label="Trial structure panel">
        <header className="panelHeader">
          <div className="panelTitle">TRIAL STRUCTURE</div>
          <div className="panelMeta">{selected?.trial ?? '—'}</div>
        </header>
        <div className="structureBody">
          <div className="structureBadges" aria-label="Trial badges">
            <span className={`badge badge-event type-${(selected?.eventType ?? '').replace(/\s/g, '')}`}>
              {selected?.eventType ?? '—'}
            </span>
            <span className="badge badge-dim">{selected?.ts ?? '—'}</span>
          </div>

          <div className="structureCard" aria-label="Key fields">
            <div className="kvTable">
              <div className="kvKey dim">DRUG</div>
              <div className="kvVal mono">{selected?.drug ?? '—'}</div>

              <div className="kvKey dim">TRIAL</div>
              <div className="kvVal">{selected?.trial ?? '—'}</div>

              <div className="kvKey dim">EVENT</div>
              <div className="kvVal mono">{selected?.eventType ?? '—'}</div>
            </div>
          </div>

          <div className="structureSection">
            <div className="structureSectionTitle">DESIGN NOTES</div>
            <div className="noteList" role="list" aria-label="Design notes">
              {(selected?.trialQuality ?? []).map((t, idx) => (
                <div key={t} className="noteRow" role="listitem">
                  <span className="noteIdx">{String(idx + 1).padStart(2, '0')}</span>
                  <span className="noteText">{t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="panel feed" aria-label="Event feed">
        <header className="panelHeader">
          <div className="panelTitle">EVENT FEED</div>
          <div className="panelMeta">CATALYST TAPE · CLICK TO ROUTE</div>
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
