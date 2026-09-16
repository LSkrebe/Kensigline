/** Price-series display helpers. No simulated investment performance. */

export function formatReturnFraction(v) {
  if (v == null || !Number.isFinite(Number(v))) return '—'
  const pct = Number(v) * 100
  const sign = pct > 0 ? '+' : ''
  const abs = Math.abs(pct)
  const digits = abs >= 10 ? 1 : 2
  return `${sign}${pct.toFixed(digits)}%`
}


const TRACK_RANGE_DAYS = { '1M': 30, '3M': 90, '6M': 180, '1Y': 365, YTD: null }

/** Keep trades whose timestamp falls inside the chart range window. */
export function filterTrackTradesByRange(tradeRows, range) {
  const start = priceRangeWindowStartMs(range)
  if (start == null) return Array.isArray(tradeRows) ? tradeRows : []
  return (tradeRows ?? []).filter((row) => {
    const ts = row?.ts
    if (ts == null) return true
    const t = new Date(ts).getTime()
    if (!Number.isFinite(t)) return true
    return t >= start
  })
}

function priceRangeWindowStartMs(range, ref = new Date()) {
  if (range === 'YTD') {
    const start = new Date(ref.getFullYear(), 0, 1)
    start.setHours(0, 0, 0, 0)
    return start.getTime()
  }
  if (range === 'ALL') return null
  const days = TRACK_RANGE_DAYS[range]
  if (days == null) return null
  const start = new Date(ref)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - days)
  return start.getTime()
}

export const DEEP_OUTCOME_HORIZON_LABELS = ['1M', '3M', '1Y']

export const DEEP_MOCK_OUTCOMES_BY_MODE = {
  insider: {
    avgReturn21d63d252d: '+0.42% / +1.08% / +2.34%',
    medianReturn: '+0.61%',
    winRate: '54%',
    sampleSize: '28,640',
    conditioningRole: 'CEO | director',
    conditioningTxn: 'Buy | sell',
  },
  politicians: {
    avgReturn21d63d252d: '+0.18% / +0.52% / +1.12%',
    medianReturn: '+0.31%',
    winRate: '51%',
    sampleSize: '4,820',
    conditioningPolitician: 'Pelosi | Tuberville',
    conditioningTxn: 'Buy | sell',
  },
  institutions: {
    avgReturn21d63d252d: '+0.22% / +0.64% / +1.38%',
    medianReturn: '+0.44%',
    winRate: '53%',
    sampleSize: '12,140',
    conditioningRole: 'Top holder | new position',
    conditioningSizePct: 'P40–P90',
  },
}

export function deepOutcomesModeKey(mode) {
  if (mode === 'politicians') return 'politicians'
  if (mode === 'institutions') return 'institutions'
  return 'insider'
}

export function getDeepMockOutcomes(mode) {
  return DEEP_MOCK_OUTCOMES_BY_MODE[deepOutcomesModeKey(mode)] ?? DEEP_MOCK_OUTCOMES_BY_MODE.insider
}

function parseOutcomePercent(v) {
  const s = String(v ?? '').trim()
  if (!s || s === '—' || s === '-') return null
  const n = Number(s.replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

export function parseDeepOutcomeHorizons(avgReturnStr) {
  const parts = String(avgReturnStr ?? '')
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)
  return DEEP_OUTCOME_HORIZON_LABELS.map((label, i) => {
    const pct = parseOutcomePercent(parts[i])
    return {
      label,
      pct,
      display: parts[i] ?? '—',
      tone: deepOutcomeTone(pct),
    }
  })
}

export function deepOutcomeTone(pct) {
  if (pct == null || !Number.isFinite(pct)) return ''
  if (pct > 0) return 'isUp'
  if (pct < 0) return 'isDown'
  return ''
}

export function deepOutcomeValueClass(tone) {
  if (tone === 'isUp') return 'drpt-outcomesTone--up'
  if (tone === 'isDown') return 'drpt-outcomesTone--down'
  return ''
}

export function buildDeepOutcomeLines(ins, mode) {
  const horizons = parseDeepOutcomeHorizons(ins?.avgReturn21d63d252d)
  const returns = horizons.map((h) => (h.pct != null ? h.pct / 100 : null))
  if (!returns.some((r) => Number.isFinite(r))) return []
  const label =
    mode === 'politicians' ? 'Politician' : mode === 'institutions' ? 'Institution' : 'Insider'
  return [{ id: 'aggregate', label, returns, color: 'var(--drpt-accent)' }]
}

export function getDeepConditioningRows(ins, mode) {
  if (!ins) return []
  const rows = []
  if (mode === 'politicians' && ins.conditioningPolitician) {
    rows.push({ label: 'Politician', value: ins.conditioningPolitician })
  } else if (mode === 'institutions') {
    if (ins.conditioningRole) rows.push({ label: 'Position', value: ins.conditioningRole })
    if (ins.conditioningSizePct) rows.push({ label: 'Size', value: ins.conditioningSizePct })
  } else {
    if (ins.conditioningRole) rows.push({ label: 'Role', value: ins.conditioningRole })
  }
  if (ins.conditioningTxn) rows.push({ label: 'Txn', value: ins.conditioningTxn })
  return rows
}

export function formatDeepEventsCount(sampleSize) {
  const s = String(sampleSize ?? '').trim()
  if (!s) return '—'
  return s.replace(/^N\s*=\s*/i, '').trim() || s
}

export function horizonBarWidth(pct, maxAbs) {
  if (pct == null || !Number.isFinite(pct) || maxAbs <= 0) return 0
  return Math.min(100, Math.round((Math.abs(pct) / maxAbs) * 100))
}

/** Legacy UI interface: unverified personal returns remain unavailable. */
export function buildMockActorTrackRecord() { return null }

export function buildDailyTrackRecord(performance, range) {
  const daily=performance?.daily
  const raw=daily?.points??[]
  if(!raw.length)return null
  const start=priceRangeWindowStartMs(range,new Date(raw.at(-1).ts))
  const window=raw.filter(p=>start==null||Date.parse(p.ts)>=start)
  if(window.length<2)return null
  const base=1+window[0].cumulative
  const points=window.map(p=>({...p,cumulative:(1+p.cumulative)/base-1}))
  const moves=points.slice(1).map((p,i)=>(1+p.cumulative)/(1+points[i].cumulative)-1)
  const sorted=moves.slice().sort((a,b)=>a-b)
  const mid=Math.floor(sorted.length/2)
  const median=sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2
  const end=points.at(-1).cumulative
  return {...daily,points,stats:{winRate:formatReturnFraction(moves.filter(x=>x>0).length/moves.length),medianReturn:formatReturnFraction(median),roundTrips:daily.symbols,cumulativeReturn:formatReturnFraction(end),cumulativeReturnRaw:end}}
}
