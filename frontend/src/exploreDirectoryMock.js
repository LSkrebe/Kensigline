import { MOCK_SEMIS_BY_TICKER } from './mockWeekData.js'
import { exploreActorDocCode, exploreActorEventLabel, exploreCompanyDocCode, exploreCompanyEventLabel, mapActorEventRows, mapCompanyEventRows } from './exploreEventLabels.js'
import { formatUsdCompact } from './formatUsdCompact.js'
import { isPlausibleExploreInvestorRow, isExplorePositionCountOnlyHomeRow } from './exploreInvestorFilter.js'

export const HOME_DIRECTORY_PREVIEW = 12
export const EXPLORE_DIRECTORY_BLOCK = 20

function companyName(ticker) {
  const t = String(ticker ?? '').toUpperCase()
  return MOCK_SEMIS_BY_TICKER[t]?.name ?? t
}

function isoDaysAgo(days) {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function todayIso() {
  return isoDaysAgo(0)
}

export function todayIsoUtc() {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function isoDaysBefore(iso, days, utc = false) {
  const d = utc ? new Date(`${iso}T12:00:00Z`) : new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  if (utc) d.setUTCDate(d.getUTCDate() - days)
  else d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

/**
 * Pick the newest calendar day with activity, falling back from today when quiet.
 * @param {string[]} dates ISO date strings
 * @param {{ today?: string, maxLookback?: number, utc?: boolean }} [opts]
 */
export function resolveExploreDisplayDay(dates, opts = {}) {
  const utc = opts.utc === true
  const today = opts.today ?? (utc ? todayIsoUtc() : todayIso())
  const maxLookback = Math.max(0, opts.maxLookback ?? 14)
  const dateSet = new Set(
    (Array.isArray(dates) ? dates : [])
      .map((d) => String(d ?? '').slice(0, 10))
      .filter(Boolean),
  )

  if (dateSet.has(today)) {
    return { displayDayKey: today, requestedDayKey: today, isFallback: false }
  }

  for (let i = 1; i <= maxLookback; i += 1) {
    const candidate = isoDaysBefore(today, i, utc)
    if (dateSet.has(candidate)) {
      return { displayDayKey: candidate, requestedDayKey: today, isFallback: true }
    }
  }

  const floor = isoDaysBefore(today, maxLookback, utc)
  const newestInWindow = [...dateSet]
    .filter((d) => d <= today && d >= floor)
    .sort()
    .pop()
  if (newestInWindow) {
    return { displayDayKey: newestInWindow, requestedDayKey: today, isFallback: true }
  }

  return { displayDayKey: today, requestedDayKey: today, isFallback: false }
}

export function formatExploreRecency(iso, opts = {}) {
  const date = String(iso ?? '').trim()
  if (!date) return null
  const utc = opts.utc === true
  const today = opts.today ?? (utc ? todayIsoUtc() : todayIso())
  if (date === today) return 'Today'
  const then = utc ? new Date(`${date}T12:00:00Z`) : new Date(`${date}T12:00:00`)
  const now = utc ? new Date(`${today}T12:00:00Z`) : new Date(`${today}T12:00:00`)
  const days = Math.max(0, Math.round((now - then) / 86400000))
  if (days === 1) return '1d ago'
  if (days < 14) return `${days}d ago`
  const mm = String(then.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(then.getUTCDate()).padStart(2, '0')
  return utc ? `${mm}-${dd}` : `${String(then.getMonth() + 1).padStart(2, '0')}-${String(then.getDate()).padStart(2, '0')}`
}

/** Parse compact disclosure notional strings like +$5.2M or -$640K into signed USD. */
export function parseExploreTrailUsd(trail) {
  const raw = String(trail ?? '').trim()
  if (!raw || raw === '—') return null

  const match = raw.match(/^([+\-−])?\$?([\d,.]+)\s*([KMB])?$/i)
  if (!match) return null

  const signToken = match[1]
  const num = Number.parseFloat(String(match[2]).replace(/,/g, ''))
  if (!Number.isFinite(num)) return null

  const suffix = String(match[3] ?? '').toUpperCase()
  const scale = suffix === 'B' ? 1e9 : suffix === 'M' ? 1e6 : suffix === 'K' ? 1e3 : 1
  const sign = signToken === '-' || signToken === '−' ? -1 : 1

  return sign * num * scale
}

/** Signed net flow for directory rows: acquisitions/adds minus sales/trims. */
export function formatExploreNetFlowUsd(usd) {
  if (usd == null || !Number.isFinite(usd)) return '—'
  if (usd === 0) return '$0'
  return formatUsdCompact(usd, { signed: true }) ?? '—'
}

export function formatExplorePublishDate(iso) {
  const date = String(iso ?? '').trim()
  if (!date) return '—'
  const then = new Date(`${date}T12:00:00`)
  if (Number.isNaN(then.getTime())) return '—'
  const mm = String(then.getMonth() + 1).padStart(2, '0')
  const dd = String(then.getDate()).padStart(2, '0')
  return `${mm}-${dd}`
}

function isMeaningfulExploreTrail(trail) {
  const t = String(trail ?? '').trim()
  return Boolean(t && t !== '—')
}

function isMoneyOrPctExploreTrail(trail) {
  const t = String(trail ?? '').trim()
  if (!t) return false
  if (/^[+\-−]?\$/.test(t)) return true
  if (/^[+\-−]?[\d.]+\s*%/.test(t)) return true
  return false
}

function formatExplorePositionCount(count) {
  const n = Number(count)
  if (!Number.isFinite(n) || n < 1) return null
  return `${Math.trunc(n)} pos`
}

function formatExploreHoldingsCount(count) {
  return formatExplorePositionCount(count)
}

function isInstitutionChangeActivity(activity) {
  const a = String(activity ?? '').trim()
  return a === 'Increased stake' || a === 'Reduced stake' || a === 'New position'
}

function normalizeExploreInvestorTrail(trail, row) {
  const t = String(trail ?? '').trim()
  if (!t || t === '—') return null

  const positionsMatch = t.match(/^(\d+)\s+positions?$/i)
  if (positionsMatch) {
    return { trail: formatExplorePositionCount(positionsMatch[1]), muted: true }
  }

  const posMatch = t.match(/^(\d+)\s+pos$/i)
  if (posMatch) {
    return { trail: formatExplorePositionCount(posMatch[1]), muted: true }
  }

  const holdingsMatch = t.match(/^(\d+)\s+holdings?$/i)
  if (holdingsMatch) {
    return { trail: formatExploreHoldingsCount(holdingsMatch[1]), muted: true }
  }

  if (row?.docType && t.toUpperCase() === exploreActorDocCode(row.docType)) {
    return { trail: '$0', muted: true }
  }

  if (isMoneyOrPctExploreTrail(t)) {
    return { trail: t, muted: false }
  }

  return { trail: t, muted: true }
}

export function resolveExploreRowTrail(row, kind = 'company') {
  if (isMeaningfulExploreTrail(row?.trail)) {
    const trail = String(row.trail).trim()
    if (kind === 'investor') {
      const normalized = normalizeExploreInvestorTrail(trail, row)
      if (normalized) return normalized
    }
    if (kind === 'company' && row?.docType && trail === exploreCompanyDocCode(row.docType)) {
      return { trail: '—', muted: true }
    }
    return { trail, muted: !isMoneyOrPctExploreTrail(trail) }
  }
  if (kind === 'company' && row?.docType) {
    return { trail: '—', muted: true }
  }
  if (kind === 'investor' && row?.docType) {
    return { trail: '$0', muted: true }
  }
  return { trail: '—', muted: true }
}

/** @deprecated use resolveExploreRowTrail */
function exploreRowDisplayTrail(row, kind = 'company') {
  return resolveExploreRowTrail(row, kind).trail
}

/** Prefer rows with $/%/share trails over empty placeholders in home preview. */
function exploreRowActionScore(row, kind = 'company') {
  const trail = exploreRowDisplayTrail(row, kind)
  if (!isMeaningfulExploreTrail(trail)) return -1
  if (trail === '$0') return -1000
  let score = 0
  const usd = parseExploreTrailUsd(trail)
  if (usd != null) score += Math.log10(Math.max(Math.abs(usd), 1)) * 8
  const doc = String(row.docType ?? row.event ?? '').toLowerCase()
  if (doc.includes('purchase') || doc.includes('buy')) score += 28
  if (doc.includes('ptr') && doc.includes('buy')) score += 32
  if (doc.includes('increased')) score += 18
  if (doc.includes('reduced') || doc.includes('sale') || doc.includes('sell')) score += 12
  if (doc.includes('new position')) score -= 6
  if (kind === 'investor' && row.up === true) score += 6
  const date = String(row.date ?? row.lastDate ?? '')
  if (date) score += Math.min(8, Math.max(0, 7 - Math.floor((Date.now() - Date.parse(date)) / 86_400_000)))
  return score
}

function rankExploreHomeRows(rows, kind = 'company') {
  const list = Array.isArray(rows) ? rows : []
  return [...list].sort((a, b) => {
    const scoreDelta = exploreRowActionScore(b, kind) - exploreRowActionScore(a, kind)
    if (scoreDelta !== 0) return scoreDelta
    return String(b.date ?? b.lastDate ?? '').localeCompare(String(a.date ?? a.lastDate ?? ''))
  })
}

function mapExploreHomePreviewRow(row, kind) {
  const { trail, muted } = resolveExploreRowTrail(row, kind)
  const t = String(trail ?? '').trim()
  let up = false
  if (!(muted || t === '$0' || t === '—')) {
    if (typeof row.up === 'boolean') up = row.up
    else if (/^[−\-]/.test(t)) up = false
    else if (t.startsWith('+')) up = true
    else {
      const doc = String(row?.docType ?? row?.event ?? '').toLowerCase()
      up = /(purchase|buy|add|increas)/.test(doc) && !/(sale|sell|trim|reduc)/.test(doc)
    }
  }
  return {
    id: row.id,
    ticker: row.ticker,
    name: row.name,
    actorSlug: row.actorSlug,
    tickers: row.tickers,
    companyName: row.companyName,
    companies: row.companies,
    performanceEventIds: row.performanceEventIds,
    docType: row.docType,
    event: row.event,
    trail,
    trailMuted: muted,
    up,
    extraSameDay: row.extraSameDay ?? 0,
    date: row.date,
  }
}

function aggregateCompaniesByTicker(events) {
  const sorted = sortEventsNewestFirst(events)
  const byTicker = new Map()

  for (const ev of sorted) {
    if (!byTicker.has(ev.ticker)) byTicker.set(ev.ticker, [])
    byTicker.get(ev.ticker).push(ev)
  }

  const out = []

  for (const tickerEvents of byTicker.values()) {
    const newest = tickerEvents[0]
    const latestDate = newest.date
    const sameDayCount = tickerEvents.filter((ev) => ev.date === latestDate).length

    out.push({
      id: `co-${newest.ticker}`,
      ticker: newest.ticker,
      name: newest.name,
      event: newest.event,
      trail: newest.trail,
      up: newest.up,
      extraSameDay: Math.max(0, sameDayCount - 1),
      lastDate: latestDate,
      publishedDateLabel: formatExplorePublishDate(latestDate),
    })
  }

  return out.sort((a, b) => String(b.lastDate).localeCompare(String(a.lastDate)))
}

function aggregateInvestorsByName(events) {
  const sorted = sortEventsNewestFirst(events)
  const positionCounts = new Map()
  const tickerLists = new Map()
  const netFlows = new Map()

  for (const ev of sorted) {
    if (!tickerLists.has(ev.name)) tickerLists.set(ev.name, [])
    const tickers = tickerLists.get(ev.name)
    if (Array.isArray(ev.tickers) && ev.tickers.length) {
      for (const tick of ev.tickers) {
        if (tick && !tickers.includes(tick)) tickers.push(tick)
      }
    } else if (ev.ticker && !tickers.includes(ev.ticker)) {
      tickers.push(ev.ticker)
    }

    if (ev.baseline13f || /^\d+\s+(holdings?|pos)$/i.test(String(ev.trail ?? ''))) {
      continue
    }
    if (isInstitutionChangeActivity(ev.activity) || !ev.activity) {
      positionCounts.set(ev.name, (positionCounts.get(ev.name) ?? 0) + 1)
    }

    const signedUsd = parseExploreTrailUsd(ev.trail)
    if (signedUsd != null) {
      netFlows.set(ev.name, (netFlows.get(ev.name) ?? 0) + signedUsd)
    }
  }

  const seen = new Set()
  const out = []

  for (const ev of sorted) {
    if (seen.has(ev.name)) continue
    const baselineHoldings = ev.baseline13f || /^\d+\s+(holdings?|pos)$/i.test(String(ev.trail ?? ''))
    if (baselineHoldings) continue
    seen.add(ev.name)
    const netFlowUsd = netFlows.get(ev.name) ?? 0
    out.push({
      id: `ac-${String(ev.name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name: ev.name,
      actorSlug: ev.actorSlug,
      ticker: ev.ticker,
      tickers: tickerLists.get(ev.name) ?? [ev.ticker],
      docType: ev.docType,
      modeCode: exploreActorDocCode(ev.docType),
      positionCount: positionCounts.get(ev.name) ?? 1,
      baseline13f: false,
      netFlowUsd,
      netFlowLabel: formatExploreNetFlowUsd(netFlowUsd),
      lastDate: ev.date,
      lastDateLabel: formatExplorePublishDate(ev.date),
      recency: formatExploreRecency(ev.date),
      trail: ev.trail,
      up: ev.up,
    })
  }

  return out
}

function parsePctTrail(trail) {
  const m = String(trail ?? '').match(/([+\-−]?[\d.]+)\s*%/)
  if (!m) return null
  return Number(m[1].replace('−', '-'))
}

/** One Explore home row per company ticker (may combine multiple filings that day). */
function aggregateExploreCompaniesForHome(events) {
  const sorted = sortEventsNewestFirst(events)
  const byTicker = new Map()

  for (const ev of sorted) {
    const tick = String(ev.ticker ?? '').trim().toUpperCase()
    if (!tick) continue
    if (!byTicker.has(tick)) byTicker.set(tick, [])
    byTicker.get(tick).push(ev)
  }

  const out = []
  for (const group of byTicker.values()) {
    const lead = group[0]
    const extraSameDay = Math.max(0, group.length - 1)
    const docTypes = [...new Set(group.map((e) => e.docType).filter(Boolean))]
    const pcts = group.map((e) => parsePctTrail(e.trail)).filter((n) => n != null && Number.isFinite(n))
    const avgPct = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null

    out.push({
      ...lead,
      extraSameDay,
      event:
        group.length > 1
          ? docTypes.length > 1
            ? `${group.length} company filings`
            : `${group.length} ${exploreCompanyEventLabel(docTypes[0] ?? '').replace(/ filing$/, ' filings')}`
          : lead.event,
      trail: avgPct != null ? `${avgPct >= 0 ? '+' : ''}${avgPct.toFixed(1)}%` : lead.trail,
      up: avgPct != null ? avgPct >= 0 : lead.up,
    })
  }

  return sortEventsNewestFirst(out)
}

function mapAggregatedCompanyToHomeRow(row) {
  const { trail, muted } = resolveExploreRowTrail(row, 'company')
  return {
    id: row.id,
    ticker: row.ticker,
    name: row.name,
    docType: row.docType,
    event: row.event,
    trail,
    trailMuted: muted,
    up: muted ? false : row.up ?? true,
    extraSameDay: row.extraSameDay ?? 0,
    date: row.lastDate,
  }
}

/** One Explore home row per investor (may span multiple tickers / filings that day). */
function aggregateExploreInvestorsForHome(events) {
  const sorted = sortEventsNewestFirst(events)
  const byName = new Map()

  for (const ev of sorted) {
    const key = String(ev.name ?? '').trim()
    if (!key) continue
    if (!byName.has(key)) byName.set(key, [])
    byName.get(key).push(ev)
  }

  const out = []
  for (const group of byName.values()) {
    const changeEvents = group.filter(
      (e) => !e.baseline13f && !/^\d+\s+(holdings?|pos)$/i.test(String(e.trail ?? '')),
    )
    if (!changeEvents.length) continue
    const lead = changeEvents[0]
    const extraSameDay = Math.max(0, changeEvents.length - 1)
    const tickers = [...new Set(changeEvents.map((e) => e.ticker).filter(Boolean))]
    let netFlow = 0
    let hasUsdTrail = false
    for (const ev of changeEvents) {
      const usd = parseExploreTrailUsd(ev.trail)
      if (usd != null) {
        hasUsdTrail = true
        netFlow += usd
      }
    }
    const all13f = changeEvents.every((e) => String(e.docType ?? '').startsWith('13f'))
    const modeCode = exploreActorDocCode(lead.docType)

    out.push({
      ...lead,
      ticker: changeEvents.length > 1 ? modeCode : lead.ticker,
      tickers,
      companies: tickers.map(ticker=>({ticker,name:changeEvents.find(e=>e.ticker===ticker)?.companyName||ticker})),
      performanceEventIds: changeEvents.map(e => e.id),
      extraSameDay,
      trail: hasUsdTrail
        ? formatExploreNetFlowUsd(netFlow)
        : changeEvents.length > 1
          ? formatExplorePositionCount(
              changeEvents.filter((e) => isInstitutionChangeActivity(e.activity)).length || changeEvents.length,
            )
          : lead.trail,
      up: hasUsdTrail ? netFlow >= 0 : lead.up,
      event: changeEvents.length > 1 && all13f ? '13F institution filings' : lead.event,
    })
  }

  return sortEventsNewestFirst(out)
}

function mapAggregatedInvestorToHomeRow(row) {
  const baselineHoldings = row.baseline13f === true || /^\d+\s+(holdings?|pos)$/i.test(String(row.trail ?? ''))
  const count = Number.isFinite(Number(row.positionCount)) ? Math.max(1, Number(row.positionCount)) : 1
  const hasUsd = row.netFlowLabel && row.netFlowLabel !== '—'
  const tickers = Array.isArray(row.tickers) ? row.tickers.filter(Boolean) : []
  const rawTrail = baselineHoldings
    ? String(row.trail ?? formatExploreHoldingsCount(count))
    : hasUsd
      ? row.netFlowLabel
      : count > 1
        ? formatExplorePositionCount(count)
        : row.trail ?? '—'
  const trailRow = { ...row, trail: rawTrail }
  const resolved = hasUsd
    ? { trail: rawTrail, muted: false }
    : resolveExploreRowTrail(trailRow, 'investor')
  const mapped = {
    id: row.id,
    name: row.name,
    actorSlug: row.actorSlug,
    ticker: tickers.length > 1 ? row.modeCode : row.ticker,
    tickers: tickers.length > 1 ? tickers : undefined,
    docType: row.docType,
    event: exploreActorEventLabel(row.docType),
    trail: resolved.trail,
    trailMuted: resolved.muted,
    up: resolved.muted || resolved.trail === '$0' ? false : (row.netFlowUsd ?? 0) >= 0,
    extraSameDay: Math.max(0, count - 1),
    date: row.lastDate,
  }
  return isExplorePositionCountOnlyHomeRow(mapped) ? null : mapped
}

/** Company-level filings only (no Form 4, PTR, or 13F). */
function buildExploreCompanyEventSeed() {
  const today = todayIso()
  const d1 = isoDaysAgo(1)
  const d2 = isoDaysAgo(2)
  const d3 = isoDaysAgo(3)
  const d5 = isoDaysAgo(5)
  const d8 = isoDaysAgo(8)
  const d12 = isoDaysAgo(12)
  const d15 = isoDaysAgo(15)
  const d18 = isoDaysAgo(18)
  const d21 = isoDaysAgo(21)
  const d25 = isoDaysAgo(25)
  const d30 = isoDaysAgo(30)
  const d35 = isoDaysAgo(35)
  const d40 = isoDaysAgo(40)

  return mapCompanyEventRows(
    [
      { id: 'c-nvda-1', date: today, ticker: 'NVDA', docType: '8k_earnings', trail: '+2.4%', up: true },
      { id: 'c-nvda-2', date: today, ticker: 'NVDA', docType: '8k', trail: '+2.4%', up: true },
      { id: 'c-nvda-3', date: today, ticker: 'NVDA', docType: 'transcript', trail: '+2.4%', up: true },
      { id: 'c-nvda-4', date: today, ticker: 'NVDA', docType: 'press', trail: '+2.4%', up: true },
      { id: 'c-amd-1', date: today, ticker: 'AMD', docType: '8k', trail: '-1.1%', up: false },
      { id: 'c-amd-2', date: today, ticker: 'AMD', docType: 'guidance', trail: '-1.1%', up: false },
      { id: 'c-asml-1', date: today, ticker: 'ASML', docType: 'transcript', trail: '+0.8%', up: true },
      { id: 'c-avgo-1', date: today, ticker: 'AVGO', docType: 'earnings', trail: '+1.6%', up: true },
      { id: 'c-tsm-1', date: today, ticker: 'TSM', docType: 'guidance', trail: '-0.4%', up: false },
      { id: 'c-mu-1', date: today, ticker: 'MU', docType: '8k_earnings', trail: '+3.2%', up: true },
      { id: 'c-lrcx-1', date: today, ticker: 'LRCX', docType: 'transcript', trail: '+0.5%', up: true },
      { id: 'c-amat-1', date: today, ticker: 'AMAT', docType: '8k', trail: '-0.9%', up: false },
      { id: 'c-intc-1', date: today, ticker: 'INTC', docType: '10q', trail: '-2.1%', up: false },
      { id: 'c-qcom-1', date: today, ticker: 'QCOM', docType: 'earnings', trail: '+1.0%', up: true },
      { id: 'c-mrvl-1', date: today, ticker: 'MRVL', docType: '8k', trail: '+4.3%', up: true },
      { id: 'c-smci-1', date: today, ticker: 'SMCI', docType: '8k_earnings', trail: '+6.1%', up: true },
      { id: 'c-nvda-5', date: d1, ticker: 'NVDA', docType: '10q', trail: '+1.8%', up: true },
      { id: 'c-nvda-6', date: d1, ticker: 'NVDA', docType: 'press', trail: '+1.8%', up: true },
      { id: 'c-amd-3', date: d1, ticker: 'AMD', docType: 'transcript', trail: '+0.6%', up: true },
      { id: 'c-arm-1', date: d1, ticker: 'ARM', docType: 'earnings', trail: '+1.4%', up: true },
      { id: 'c-klac-1', date: d2, ticker: 'KLAC', docType: 'earnings', trail: '+0.3%', up: true },
      { id: 'c-on-1', date: d2, ticker: 'ON', docType: '8k', trail: '-1.8%', up: false },
      { id: 'c-avgo-2', date: d3, ticker: 'AVGO', docType: '8k', trail: '+0.9%', up: true },
      { id: 'c-tsm-2', date: d3, ticker: 'TSM', docType: '10q', trail: '-0.2%', up: false },
      { id: 'c-mu-2', date: d5, ticker: 'MU', docType: 'transcript', trail: '+2.1%', up: true },
      { id: 'c-lrcx-2', date: d5, ticker: 'LRCX', docType: 'guidance', trail: '+0.4%', up: true },
      { id: 'c-intc-2', date: d8, ticker: 'INTC', docType: '8k', trail: '-1.4%', up: false },
      { id: 'c-qcom-2', date: d8, ticker: 'QCOM', docType: 'transcript', trail: '+0.7%', up: true },
      { id: 'c-smci-2', date: d12, ticker: 'SMCI', docType: '10k', trail: '+3.8%', up: true },
      { id: 'c-asml-2', date: d12, ticker: 'ASML', docType: 'proxy', trail: '+1.1%', up: true },
      { id: 'c-crm-1', date: d15, ticker: 'CRM', docType: 'earnings', trail: '+1.2%', up: true },
      { id: 'c-orcl-1', date: d15, ticker: 'ORCL', docType: '8k', trail: '+0.4%', up: true },
      { id: 'c-adbe-1', date: d18, ticker: 'ADBE', docType: 'transcript', trail: '-0.8%', up: false },
      { id: 'c-now-1', date: d18, ticker: 'NOW', docType: '8k_earnings', trail: '+2.0%', up: true },
      { id: 'c-panw-1', date: d21, ticker: 'PANW', docType: 'earnings', trail: '+3.1%', up: true },
      { id: 'c-crwd-1', date: d21, ticker: 'CRWD', docType: '8k', trail: '+1.7%', up: true },
      { id: 'c-snps-1', date: d25, ticker: 'SNPS', docType: '10q', trail: '+0.9%', up: true },
      { id: 'c-cdns-1', date: d25, ticker: 'CDNS', docType: '8k', trail: '+1.3%', up: true },
      { id: 'c-mchp-1', date: d30, ticker: 'MCHP', docType: 'guidance', trail: '-1.0%', up: false },
      { id: 'c-txn-1', date: d30, ticker: 'TXN', docType: 'earnings', trail: '+0.5%', up: true },
      { id: 'c-adi-1', date: d35, ticker: 'ADI', docType: 'transcript', trail: '+1.1%', up: true },
      { id: 'c-nxpi-1', date: d35, ticker: 'NXPI', docType: '8k', trail: '-0.6%', up: false },
      { id: 'c-mpwr-1', date: d40, ticker: 'MPWR', docType: '8k_earnings', trail: '+2.8%', up: true },
      { id: 'c-stx-1', date: d40, ticker: 'STX', docType: '10q', trail: '+0.7%', up: true },
    ].map((row) => ({
      ...row,
      name: companyName(row.ticker),
    })),
  )
}

/** Investor-level filings only (Form 4, PTR, 13F). */
function buildExploreInvestorEventSeed() {
  const today = todayIso()
  const d1 = isoDaysAgo(1)
  const d2 = isoDaysAgo(2)
  const d4 = isoDaysAgo(4)
  const d6 = isoDaysAgo(6)
  const d10 = isoDaysAgo(10)
  const d14 = isoDaysAgo(14)
  const d15 = isoDaysAgo(15)
  const d18 = isoDaysAgo(18)
  const d21 = isoDaysAgo(21)
  const d25 = isoDaysAgo(25)
  const d30 = isoDaysAgo(30)
  const d35 = isoDaysAgo(35)
  const d40 = isoDaysAgo(40)

  return mapActorEventRows([
    { id: 'a-jh-1', date: today, name: 'Jensen Huang', ticker: 'NVDA', docType: 'form4_purchase', trail: '+$5.2M', up: true },
    { id: 'a-jh-2', date: today, name: 'Jensen Huang', ticker: 'NVDA', docType: 'form4_purchase', trail: '+$5.2M', up: true },
    { id: 'a-ck-1', date: today, name: 'Colette Kress', ticker: 'NVDA', docType: 'form4_purchase', trail: '+$8.1M', up: true },
    { id: 'a-ck-2', date: today, name: 'Colette Kress', ticker: 'NVDA', docType: 'form4', trail: '+$8.1M', up: true },
    { id: 'a-ls-1', date: today, name: 'Lisa Su', ticker: 'AMD', docType: 'form4_purchase', trail: '+$1.9M', up: true },
    { id: 'a-np-1', date: today, name: 'Nancy Pelosi', ticker: 'NVDA', docType: 'ptr_purchase', trail: '+$2.4M', up: true },
    { id: 'a-dc-1', date: today, name: 'Dan Crenshaw', ticker: 'LRCX', docType: 'ptr_purchase', trail: '+$640K', up: true },
    { id: 'a-vg-1', date: today, name: 'Vanguard Group', ticker: 'NVDA', docType: '13f_add', trail: '+$412M', up: true },
    { id: 'a-br-1', date: today, name: 'BlackRock', ticker: 'AVGO', docType: '13f_trim', trail: '-$186M', up: false },
    { id: 'a-mb-1', date: today, name: 'Mary Barra', ticker: 'GM', docType: 'form4_purchase', trail: '+$920K', up: true },
    { id: 'a-tc-1', date: today, name: 'Tim Cook', ticker: 'AAPL', docType: 'form4', trail: '+$1.1M', up: true },
    { id: 'a-jg-1', date: today, name: 'Josh Gottheimer', ticker: 'MSFT', docType: 'ptr_sale', trail: '-$780K', up: false },
    { id: 'a-rk-1', date: today, name: 'Ro Khanna', ticker: 'AMD', docType: 'ptr_purchase', trail: '+$420K', up: true },
    { id: 'a-tt-1', date: today, name: 'Tommy Tuberville', ticker: 'LRCX', docType: 'ptr_purchase', trail: '+$280K', up: true },
    { id: 'a-ss-1', date: today, name: 'State Street Global Advisors', ticker: 'MSFT', docType: '13f_add', trail: '+$96M', up: true },
    { id: 'a-jh-3', date: d1, name: 'Jensen Huang', ticker: 'NVDA', docType: 'form4_purchase', trail: '+$4.1M', up: true },
    { id: 'a-ck-3', date: d1, name: 'Colette Kress', ticker: 'NVDA', docType: 'form4_purchase', trail: '+$2.2M', up: true },
    { id: 'a-np-2', date: d2, name: 'Nancy Pelosi', ticker: 'NVDA', docType: 'ptr', trail: '+$1.8M', up: true },
    { id: 'a-vg-2', date: d2, name: 'Vanguard Group', ticker: 'NVDA', docType: '13f_add', trail: '+$220M', up: true },
    { id: 'a-ls-2', date: d4, name: 'Lisa Su', ticker: 'AMD', docType: 'form4_purchase', trail: '+$900K', up: true },
    { id: 'a-br-2', date: d4, name: 'BlackRock', ticker: 'TSM', docType: '13f_add', trail: '+$96M', up: true },
    { id: 'a-dc-2', date: d6, name: 'Dan Crenshaw', ticker: 'AMAT', docType: 'ptr_purchase', trail: '+$410K', up: true },
    { id: 'a-tc-2', date: d6, name: 'Tim Cook', ticker: 'AAPL', docType: 'form4_sale', trail: '-$4.2M', up: false },
    { id: 'a-ew-1', date: d10, name: 'Elizabeth Warren', ticker: 'MSFT', docType: 'ptr_sale', trail: '-$180K', up: false },
    { id: 'a-mm-1', date: d10, name: 'Michael McCaul', ticker: 'AVGO', docType: 'ptr_purchase', trail: '+$350K', up: true },
    { id: 'a-jg-2', date: d14, name: 'Josh Gottheimer', ticker: 'NVDA', docType: 'ptr_purchase', trail: '+$520K', up: true },
    { id: 'a-mb-2', date: d14, name: 'Mary Barra', ticker: 'GM', docType: 'form4_purchase', trail: '+$640K', up: true },
    { id: 'a-po-1', date: d15, name: 'Patricia Owens', ticker: 'CRM', docType: 'form4_purchase', trail: '+$310K', up: true },
    { id: 'a-sa-1', date: d15, name: 'Sarah Adams', ticker: 'ORCL', docType: 'ptr_purchase', trail: '+$190K', up: true },
    { id: 'a-fm-1', date: d18, name: 'Fidelity Management', ticker: 'ADBE', docType: '13f_add', trail: '+$88M', up: true },
    { id: 'a-cp-1', date: d18, name: 'Catherine Porter', ticker: 'NOW', docType: 'ptr', trail: '+$240K', up: true },
    { id: 'a-jp-1', date: d21, name: 'James Porter', ticker: 'PANW', docType: 'form4', trail: '+$760K', up: true },
    { id: 'a-kw-1', date: d21, name: 'Ken West', ticker: 'CRWD', docType: 'ptr_purchase', trail: '+$130K', up: true },
    { id: 'a-ge-1', date: d25, name: 'Geode Capital', ticker: 'SNPS', docType: '13f_add', trail: '+$54M', up: true },
    { id: 'a-hl-1', date: d25, name: 'Helena Liu', ticker: 'CDNS', docType: 'form4_purchase', trail: '+$420K', up: true },
    { id: 'a-rd-1', date: d30, name: 'Renaissance Technologies', ticker: 'MCHP', docType: '13f_trim', trail: '-$72M', up: false },
    { id: 'a-al-1', date: d30, name: 'Alex Lane', ticker: 'TXN', docType: 'ptr_sale', trail: '-$95K', up: false },
    { id: 'a-nc-1', date: d35, name: 'Northern Trust', ticker: 'ADI', docType: '13f_add', trail: '+$41M', up: true },
    { id: 'a-dw-1', date: d35, name: 'Debbie Walsh', ticker: 'NXPI', docType: 'form4', trail: '+$280K', up: true },
    { id: 'a-cs-1', date: d40, name: 'Capital Group', ticker: 'MPWR', docType: '13f_add', trail: '+$63M', up: true },
    { id: 'a-bn-1', date: d40, name: 'Brian Nguyen', ticker: 'STX', docType: 'ptr_purchase', trail: '+$110K', up: true },
  ])
}

function sortEventsNewestFirst(events) {
  return [...events].sort((a, b) => {
    const dateCmp = String(b.date).localeCompare(String(a.date))
    if (dateCmp !== 0) return dateCmp
    return String(b.id).localeCompare(String(a.id))
  })
}

/** Build directory views from live API event rows (same shape as mock seeds). */
export function buildExploreDirectoryFromEvents(companyEvents = [], investorEvents = []) {
  const companyEventsLabeled = mapCompanyEventRows(companyEvents)
  const investorEventsLabeled = mapActorEventRows(investorEvents).filter(isPlausibleExploreInvestorRow)
  const sortedCompany = sortEventsNewestFirst(companyEventsLabeled)
  const sortedInvestor = sortEventsNewestFirst(investorEventsLabeled)

  return {
    companyEvents: sortedCompany,
    investorEvents: sortedInvestor,
    actorEvents: sortedInvestor,
    companies: aggregateExploreSameDayEvents(sortedCompany, (row) => `${row.ticker}|${row.date}`),
    investors: aggregateExploreSameDayEvents(sortedInvestor, (row) => `${row.name}|${row.ticker}|${row.date}`),
    actors: aggregateExploreSameDayEvents(sortedInvestor, (row) => `${row.name}|${row.ticker}|${row.date}`),
  }
}

/**
 * Collapse same-day events for one company or actor into one row with +N suffix.
 * @param {Array} events
 * @param {(row: object) => string} groupKey
 */
export function aggregateExploreSameDayEvents(events, groupKey) {
  const sorted = sortEventsNewestFirst(events)
  const groups = new Map()

  for (const ev of sorted) {
    const key = groupKey(ev)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(ev)
  }

  const out = []
  const seen = new Set()

  for (const ev of sorted) {
    const key = groupKey(ev)
    if (seen.has(key)) continue
    seen.add(key)
    const group = groups.get(key) ?? [ev]
    const extraSameDay = Math.max(0, group.length - 1)
    out.push({ ...group[0], extraSameDay })
  }

  return out
}

export function buildExploreCompanyEvents() {
  return sortEventsNewestFirst(buildExploreCompanyEventSeed())
}

export function buildExploreInvestorEvents() {
  return sortEventsNewestFirst(buildExploreInvestorEventSeed())
}

/** @deprecated Use buildExploreInvestorEvents */
export const buildExploreActorEvents = buildExploreInvestorEvents

export function buildExploreDirectoryMock() {
  const companyEvents = buildExploreCompanyEvents()
  const investorEvents = buildExploreInvestorEvents()

  return {
    companyEvents,
    investorEvents,
    /** @deprecated Use investorEvents */
    actorEvents: investorEvents,
    companies: aggregateExploreSameDayEvents(companyEvents, (row) => `${row.ticker}|${row.date}`),
    investors: aggregateExploreSameDayEvents(investorEvents, (row) => `${row.name}|${row.ticker}|${row.date}`),
    /** @deprecated Use investors */
    actors: aggregateExploreSameDayEvents(investorEvents, (row) => `${row.name}|${row.ticker}|${row.date}`),
  }
}

/** Newest aggregated rows for Explore home sections (all dates). */
export function buildExploreDirectoryHomeLatest(directory = buildExploreDirectoryMock()) {
  const investorEvents = directory.investorEvents ?? directory.actorEvents ?? []

  return {
    companies: aggregateCompaniesByTicker(directory.companyEvents).map(mapAggregatedCompanyToHomeRow),
    investors: aggregateInvestorsByName(investorEvents).map(mapAggregatedInvestorToHomeRow).filter(Boolean),
  }
}

/** ~12 newest events from the display day for Explore home preview. */
export function buildExploreDirectoryHomePreview(directory = buildExploreDirectoryMock(), opts = {}) {
  const investorEvents = directory.investorEvents ?? directory.actorEvents ?? []
  const allDates = [
    ...directory.companyEvents.map((row) => row.date),
    ...investorEvents.map((row) => row.date),
  ]
  const resolved =
    opts.displayDayKey != null
      ? {
          displayDayKey: opts.displayDayKey,
          requestedDayKey: opts.today ?? (opts.utc ? todayIsoUtc() : todayIso()),
          isFallback: opts.displayDayKey !== (opts.today ?? (opts.utc ? todayIsoUtc() : todayIso())),
        }
      : resolveExploreDisplayDay(allDates, {
          today: opts.today,
          maxLookback: opts.maxLookback ?? 14,
          utc: opts.utc === true,
        })

  const { displayDayKey, requestedDayKey, isFallback } = resolved
  const dayCompanyEvents = directory.companyEvents.filter((row) => row.date === displayDayKey)
  const dayInvestorEvents = investorEvents.filter((row) => row.date === displayDayKey)
  const dayCompanyRows = aggregateExploreCompaniesForHome(dayCompanyEvents)
  const latestCompanyRows = aggregateExploreCompaniesForHome(
    sortEventsNewestFirst(directory.companyEvents).slice(0, 120),
  )
  const companyPreviewSource = dayCompanyRows.length ? dayCompanyRows : latestCompanyRows
  const dayInvestorRows = aggregateExploreInvestorsForHome(dayInvestorEvents)
  const latestInvestorRows = aggregateExploreInvestorsForHome(investorEvents)
  const investorPreviewSource = dayInvestorRows.length ? dayInvestorRows : latestInvestorRows

  return {
    companies: rankExploreHomeRows(
      companyPreviewSource.map((row) => mapExploreHomePreviewRow(row, 'company')),
      'company',
    ).slice(0, HOME_DIRECTORY_PREVIEW),
    investors: rankExploreHomeRows(
      investorPreviewSource
        .map((row) => mapExploreHomePreviewRow(row, 'investor'))
        .filter((row) => !isExplorePositionCountOnlyHomeRow(row)),
      'investor',
    ).slice(0, HOME_DIRECTORY_PREVIEW),
    displayDayKey,
    requestedDayKey,
    isFallback,
  }
}

export function buildExploreDirectoryFullList(kind, directory = buildExploreDirectoryMock()) {
  if (kind === 'investors' || kind === 'actors') {
    return sortEventsNewestFirst(directory.investorEvents ?? directory.actorEvents ?? []).map(event => ({
      ...mapExploreHomePreviewRow(event, 'investor'),
      performanceEventIds: [event.id],
    }))
  }
  return aggregateCompaniesByTicker(directory.companyEvents)
}
