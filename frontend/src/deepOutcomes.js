/** DEEP actor dossier — mock realized track record from case trade rows. */

function hashSeed(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619)
  return h >>> 0
}

function seededJitter(seed, max) {
  const x = Math.sin(seed * 9999) * 10000
  return (x - Math.floor(x)) * max
}

function formatTrackDate(ts) {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
}

export function formatReturnFraction(v) {
  if (v == null || !Number.isFinite(Number(v))) return '—'
  const pct = Number(v) * 100
  const sign = pct > 0 ? '+' : ''
  const abs = Math.abs(pct)
  const digits = abs >= 10 ? 1 : 2
  return `${sign}${pct.toFixed(digits)}%`
}

function isBuyCode(code) {
  return ['P', 'A', 'B', 'NEW', 'BUY'].includes(code)
}

function isSellCode(code) {
  return ['S', 'D', 'SELL'].includes(code)
}

function tradeDetailLabel(trade) {
  const tick = trade.ticker && trade.ticker !== '—' ? trade.ticker : null
  const code = trade.code && trade.code !== '—' ? trade.code : null
  if (isBuyCode(code)) return [tick ? `Buy ${tick}` : 'Buy', code !== 'P' ? code : null].filter(Boolean).join(' · ')
  if (isSellCode(code)) return [tick ? `Sell ${tick}` : 'Sell', code !== 'S' ? code : null].filter(Boolean).join(' · ')
  return [tick, code].filter(Boolean).join(' · ') || 'Trade'
}

function mockRoundTripPnl(trade, actorName, buyTrade, sellIndex) {
  const seed = hashSeed(`${actorName}|${buyTrade.ticker}|${buyTrade.ts}|${trade.ts}|sell|${sellIndex}`)
  const lose = seededJitter(seed + 11, 10) < 2.8
  if (lose) return -(0.012 + seededJitter(seed + 3, 6) * 0.015)
  return 0.028 + seededJitter(seed, 9) * 0.045
}

function mockOrphanSellPnl(trade, actorName, index) {
  const seed = hashSeed(`${actorName}|${trade.ticker}|${trade.ts}|orphan|${index}`)
  return (seededJitter(seed, 7) - 3.5) * 0.012
}

function normalizeTrackTradeRow(row) {
  if (!row || (row.type !== 'trade' && !String(row.layout ?? '').startsWith('txn'))) return null
  const ts = row.ts ?? null
  if (!ts) return null
  const ticker = String(row.ticker ?? row.source ?? '').trim().toUpperCase()
  const code = String(row.code ?? '—').trim().toUpperCase() || '—'
  return { ts, ticker, code, when: row.when ?? formatTrackDate(ts) }
}

export function buildMockActorTrackRecord(tradeRows, actorName = '') {
  const trades = (tradeRows ?? [])
    .map(normalizeTrackTradeRow)
    .filter(Boolean)
    .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())

  if (!trades.length) {
    return { points: [], stats: null }
  }

  const openBuys = new Map()
  let cumulative = 0
  let sellIndex = 0
  const realized = []

  const points = [
    {
      cumulative: 0,
      delta: null,
      ts: trades[0].ts,
      dateLabel: formatTrackDate(trades[0].ts),
      detailLabel: 'Start',
      eventKind: 'start',
    },
  ]

  for (const trade of trades) {
    const code = trade.code
    let delta = null
    let eventKind = 'other'

    if (isBuyCode(code)) {
      const key = trade.ticker || '—'
      const queue = openBuys.get(key) ?? []
      queue.push(trade)
      openBuys.set(key, queue)
      eventKind = 'buy'
    } else if (isSellCode(code)) {
      eventKind = 'sell'
      const key = trade.ticker || '—'
      const queue = openBuys.get(key) ?? []
      if (queue.length) {
        const buyTrade = queue.shift()
        openBuys.set(key, queue)
        delta = mockRoundTripPnl(trade, actorName, buyTrade, sellIndex)
      } else {
        delta = mockOrphanSellPnl(trade, actorName, sellIndex)
      }
      sellIndex += 1
      cumulative += delta
      realized.push(delta)
    }

    points.push({
      cumulative,
      delta,
      ts: trade.ts,
      dateLabel: trade.when || formatTrackDate(trade.ts),
      detailLabel: tradeDetailLabel(trade),
      eventKind,
    })
  }

  const wins = realized.filter((r) => r > 0).length
  const sorted = [...realized].sort((a, b) => a - b)
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null

  return {
    points,
    stats: {
      winRate: realized.length ? `${Math.round((wins / realized.length) * 100)}%` : '—',
      medianReturn: formatReturnFraction(median),
      tradeCount: String(trades.length),
      cumulativeReturn: formatReturnFraction(cumulative),
      cumulativeReturnRaw: cumulative,
      roundTrips: String(realized.length),
    },
  }
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
