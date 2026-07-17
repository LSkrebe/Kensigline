/**
 * Evaluate Explore recap catalog against a day's filings → ranked slides.
 * Mock-only for now; same contract can wrap a live API later.
 */

import {
  compareRecapSlides,
  EXPLORE_RECAP_CATALOG_BY_ID,
  EXPLORE_RECAP_MAX_SLIDES,
} from './exploreRecapCatalog.js'
import {
  pickRecapCopy,
  priceReactionCopyKey,
  withRoleCopyKey,
} from './exploreRecapCopy.js'

/**
 * @typedef {object} RecapDayFiling
 * @property {string} id
 * @property {'Form 4' | 'PTR' | '8-K' | '10-Q' | '13F'} doc
 * @property {'buy' | 'sell' | null} side
 * @property {string} ticker
 * @property {string} companyName
 * @property {string | null} actorId
 * @property {string | null} actorName
 * @property {string | null} actorRole
 * @property {'insider' | 'politicians' | 'institutions' | null} actorMode
 * @property {number | null} amountUsd
 * @property {string | null} code
 * @property {string | null} headline
 * @property {number[]} priceSeries
 * @property {number | null} dayMovePct
 */

/**
 * @typedef {object} RecapSlide
 * @property {string} id
 * @property {string} typeId
 * @property {string} kicker
 * @property {string} headline
 * @property {string} summary
 * @property {string} source
 * @property {string} ticker
 * @property {string | null} moveLabel
 * @property {boolean} moveUp
 * @property {number[]} priceSeries
 * @property {number} score
 * @property {string[]} [memberIds]
 */

function formatUsd(n) {
  if (n == null || !Number.isFinite(Number(n))) return null
  const v = Number(n)
  const abs = Math.abs(v)
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}

function formatPct(pct) {
  if (!Number.isFinite(pct)) return null
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}

function catalog(id) {
  return EXPLORE_RECAP_CATALOG_BY_ID[id] ?? null
}

function baseSlide(typeId, partial) {
  const entry = catalog(typeId)
  return {
    typeId,
    kicker: entry?.kicker ?? 'Today',
    score: entry?.weight ?? 0,
    moveLabel: null,
    moveUp: true,
    memberIds: [],
    ...partial,
  }
}

function form4Buys(filings) {
  return filings.filter((f) => f.doc === 'Form 4' && f.side === 'buy')
}

function form4Sells(filings) {
  return filings.filter((f) => f.doc === 'Form 4' && f.side === 'sell')
}

function groupBy(filings, keyFn) {
  const map = new Map()
  for (const f of filings) {
    const key = keyFn(f)
    if (!key) continue
    const list = map.get(key) ?? []
    list.push(f)
    map.set(key, list)
  }
  return map
}

function uniqueActors(rows) {
  const seen = new Set()
  const out = []
  for (const r of rows) {
    const id = r.actorId || r.actorName
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(r)
  }
  return out
}

function companyPhrase(name, ticker) {
  const raw = String(name || ticker || 'the company').trim()
  return raw.replace(/\.+$/, '')
}

function rolePlain(role) {
  return String(role ?? '')
    .replace(/\s*·\s*/g, ' at ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** @returns {RecapSlide[]} */
function evalInsiderBuyingCluster(filings) {
  const slides = []
  for (const [ticker, rows] of groupBy(form4Buys(filings), (f) => f.ticker)) {
    const actors = uniqueActors(rows)
    if (actors.length < 2) continue
    const total = rows.reduce((s, r) => s + (r.amountUsd ?? 0), 0)
    const lead = rows.slice().sort((a, b) => (b.amountUsd ?? 0) - (a.amountUsd ?? 0))[0]
    const company = companyPhrase(lead?.companyName, ticker)
    const copy = pickRecapCopy('insider_buying_cluster', `buy-${ticker}`, { company })
    slides.push(
      baseSlide('insider_buying_cluster', {
        id: `cluster-buy-${ticker}`,
        headline: copy.headline,
        summary: copy.summary,
        source: 'Form 4',
        ticker,
        moveLabel: formatPct(lead?.dayMovePct) ?? formatUsd(total),
        moveUp: (lead?.dayMovePct ?? 0) >= 0,
        priceSeries: lead?.priceSeries ?? [],
        score: (catalog('insider_buying_cluster')?.weight ?? 0) + actors.length * 4 + Math.min(20, total / 1e6),
        memberIds: rows.map((r) => r.id),
      }),
    )
  }
  return slides
}

/** @returns {RecapSlide[]} */
function evalInsiderSellingCluster(filings) {
  const slides = []
  for (const [ticker, rows] of groupBy(form4Sells(filings), (f) => f.ticker)) {
    const actors = uniqueActors(rows)
    if (actors.length < 2) continue
    const total = rows.reduce((s, r) => s + (r.amountUsd ?? 0), 0)
    const lead = rows.slice().sort((a, b) => (b.amountUsd ?? 0) - (a.amountUsd ?? 0))[0]
    const company = companyPhrase(lead?.companyName, ticker)
    const copy = pickRecapCopy('insider_selling_cluster', `sell-${ticker}`, { company })
    slides.push(
      baseSlide('insider_selling_cluster', {
        id: `cluster-sell-${ticker}`,
        headline: copy.headline,
        summary: copy.summary,
        source: 'Form 4',
        ticker,
        moveLabel: formatPct(lead?.dayMovePct) ?? formatUsd(total),
        moveUp: false,
        priceSeries: lead?.priceSeries ?? [],
        score: (catalog('insider_selling_cluster')?.weight ?? 0) + actors.length * 3,
        memberIds: rows.map((r) => r.id),
      }),
    )
  }
  return slides
}

/** @returns {RecapSlide[]} */
function evalMultiplePeopleOneCompany(filings, coveredTickers) {
  const slides = []
  const form4 = filings.filter((f) => f.doc === 'Form 4')
  for (const [ticker, rows] of groupBy(form4, (f) => f.ticker)) {
    if (coveredTickers.has(ticker)) continue
    const actors = uniqueActors(rows)
    if (actors.length < 2) continue
    const lead = rows[0]
    const company = companyPhrase(lead?.companyName, ticker)
    const copy = pickRecapCopy('multiple_people_one_company', `multi-${ticker}`, { company })
    slides.push(
      baseSlide('multiple_people_one_company', {
        id: `multi-people-${ticker}`,
        headline: copy.headline,
        summary: copy.summary,
        source: 'Form 4',
        ticker,
        moveLabel: formatPct(lead?.dayMovePct),
        moveUp: (lead?.dayMovePct ?? 0) >= 0,
        priceSeries: lead?.priceSeries ?? [],
        score: catalog('multiple_people_one_company')?.weight ?? 0,
        memberIds: rows.map((r) => r.id),
      }),
    )
  }
  return slides
}

/** @returns {RecapSlide[]} */
function evalOnePersonMultipleCompanies(filings) {
  const slides = []
  const withActor = filings.filter((f) => f.actorId && (f.doc === 'Form 4' || f.doc === 'PTR'))
  for (const [actorId, rows] of groupBy(withActor, (f) => f.actorId)) {
    const tickers = [...new Set(rows.map((r) => r.ticker))]
    if (tickers.length < 2) continue
    const lead = rows.slice().sort((a, b) => (b.amountUsd ?? 0) - (a.amountUsd ?? 0))[0]
    const copy = pickRecapCopy('one_person_multiple_companies', `person-multi-${actorId}`, {
      person: lead.actorName,
    })
    slides.push(
      baseSlide('one_person_multiple_companies', {
        id: `person-multi-${actorId}`,
        headline: copy.headline,
        summary: copy.summary,
        source: lead.doc,
        ticker: lead.ticker,
        moveLabel: formatUsd(lead.amountUsd) ?? formatPct(lead.dayMovePct),
        moveUp: lead.side !== 'sell',
        priceSeries: lead.priceSeries ?? [],
        score: (catalog('one_person_multiple_companies')?.weight ?? 0) + tickers.length * 5,
        memberIds: rows.map((r) => r.id),
      }),
    )
  }
  return slides
}

/** @returns {RecapSlide[]} */
function evalPersonActivity(filings, suppressedActors) {
  const slides = []
  const withActor = filings.filter((f) => f.actorId && (f.doc === 'Form 4' || f.doc === 'PTR'))
  for (const [actorId, rows] of groupBy(withActor, (f) => f.actorId)) {
    if (suppressedActors.has(actorId)) continue
    if (rows.length < 2) continue
    const lead = rows.slice().sort((a, b) => (b.amountUsd ?? 0) - (a.amountUsd ?? 0))[0]
    const total = rows.reduce((s, r) => s + (r.amountUsd ?? 0), 0)
    const role = rolePlain(lead.actorRole)
    const copy = pickRecapCopy(withRoleCopyKey('person_activity', role), `person-${actorId}`, {
      person: lead.actorName,
      role: role || undefined,
    })
    slides.push(
      baseSlide('person_activity', {
        id: `person-${actorId}`,
        headline: copy.headline,
        summary: copy.summary,
        source: lead.doc,
        ticker: lead.ticker,
        moveLabel: formatUsd(total),
        moveUp: lead.side !== 'sell',
        priceSeries: lead.priceSeries ?? [],
        score: (catalog('person_activity')?.weight ?? 0) + rows.length * 3,
        memberIds: rows.map((r) => r.id),
      }),
    )
  }
  return slides
}

/** @returns {RecapSlide | null} */
function evalLargestForm4(filings, side, typeId) {
  const pool = side === 'buy' ? form4Buys(filings) : form4Sells(filings)
  if (!pool.length) return null
  const lead = pool.slice().sort((a, b) => (b.amountUsd ?? 0) - (a.amountUsd ?? 0))[0]
  if (!lead?.amountUsd) return null
  const role = rolePlain(lead.actorRole)
  const company = companyPhrase(lead.companyName, lead.ticker)
  const copy = pickRecapCopy(withRoleCopyKey(typeId, role), `largest-${side}-${lead.id}`, {
    person: lead.actorName,
    role: role || undefined,
    company,
  })
  return baseSlide(typeId, {
    id: `largest-${side}-${lead.id}`,
    headline: copy.headline,
    summary: copy.summary,
    source: 'Form 4',
    ticker: lead.ticker,
    moveLabel: formatUsd(lead.amountUsd),
    moveUp: side === 'buy',
    priceSeries: lead.priceSeries ?? [],
    score: (catalog(typeId)?.weight ?? 0) + Math.min(25, lead.amountUsd / 1e6),
    memberIds: [lead.id],
  })
}

/** @returns {RecapSlide[]} */
function evalSingles(filings, suppressedIds) {
  const slides = []
  for (const f of filings) {
    if (suppressedIds.has(f.id)) continue
    const role = rolePlain(f.actorRole)
    const company = companyPhrase(f.companyName, f.ticker)

    if (f.doc === 'Form 4' && f.side === 'buy' && (f.amountUsd ?? 0) >= 400_000) {
      const copy = pickRecapCopy(withRoleCopyKey('insider_purchase', role), `single-buy-${f.id}`, {
        person: f.actorName,
        role: role || undefined,
        company,
      })
      slides.push(
        baseSlide('insider_purchase', {
          id: `single-buy-${f.id}`,
          headline: copy.headline,
          summary: copy.summary,
          source: 'Form 4',
          ticker: f.ticker,
          moveLabel: formatUsd(f.amountUsd),
          moveUp: true,
          priceSeries: f.priceSeries ?? [],
          score: (catalog('insider_purchase')?.weight ?? 0) + Math.min(15, (f.amountUsd ?? 0) / 1e6),
          memberIds: [f.id],
        }),
      )
    }

    if (f.doc === 'Form 4' && f.side === 'sell' && (f.amountUsd ?? 0) >= 400_000) {
      const copy = pickRecapCopy(withRoleCopyKey('insider_sale', role), `single-sell-${f.id}`, {
        person: f.actorName,
        role: role || undefined,
        company,
      })
      slides.push(
        baseSlide('insider_sale', {
          id: `single-sell-${f.id}`,
          headline: copy.headline,
          summary: copy.summary,
          source: 'Form 4',
          ticker: f.ticker,
          moveLabel: formatUsd(f.amountUsd),
          moveUp: false,
          priceSeries: f.priceSeries ?? [],
          score: (catalog('insider_sale')?.weight ?? 0) + Math.min(12, (f.amountUsd ?? 0) / 1e6),
          memberIds: [f.id],
        }),
      )
    }

    if (f.doc === 'PTR' && f.side === 'buy') {
      const copy = pickRecapCopy('politician_purchase', `single-ptr-buy-${f.id}`, {
        person: f.actorName,
        company,
      })
      slides.push(
        baseSlide('politician_purchase', {
          id: `single-ptr-buy-${f.id}`,
          headline: copy.headline,
          summary: copy.summary,
          source: 'PTR',
          ticker: f.ticker,
          moveLabel: formatUsd(f.amountUsd) ?? formatPct(f.dayMovePct),
          moveUp: true,
          priceSeries: f.priceSeries ?? [],
          score: catalog('politician_purchase')?.weight ?? 0,
          memberIds: [f.id],
        }),
      )
    }

    if (f.doc === 'PTR' && f.side === 'sell') {
      const copy = pickRecapCopy('politician_sale', `single-ptr-sell-${f.id}`, {
        person: f.actorName,
        company,
      })
      slides.push(
        baseSlide('politician_sale', {
          id: `single-ptr-sell-${f.id}`,
          headline: copy.headline,
          summary: copy.summary,
          source: 'PTR',
          ticker: f.ticker,
          moveLabel: formatUsd(f.amountUsd) ?? formatPct(f.dayMovePct),
          moveUp: false,
          priceSeries: f.priceSeries ?? [],
          score: catalog('politician_sale')?.weight ?? 0,
          memberIds: [f.id],
        }),
      )
    }

    if (f.doc === '8-K') {
      // Always templated — never use freeform 8-K item text as the hook.
      const copy = pickRecapCopy('material_8k', `single-8k-${f.id}`, { company })
      slides.push(
        baseSlide('material_8k', {
          id: `single-8k-${f.id}`,
          headline: copy.headline,
          summary: copy.summary,
          source: '8-K',
          ticker: f.ticker,
          moveLabel: formatPct(f.dayMovePct),
          moveUp: (f.dayMovePct ?? 0) >= 0,
          priceSeries: f.priceSeries ?? [],
          score: (catalog('material_8k')?.weight ?? 0) + Math.abs(f.dayMovePct ?? 0),
          memberIds: [f.id],
        }),
      )
    }

    if (f.doc === '10-Q') {
      const copy = pickRecapCopy('quarterly_10q', `single-10q-${f.id}`, { company })
      slides.push(
        baseSlide('quarterly_10q', {
          id: `single-10q-${f.id}`,
          headline: copy.headline,
          summary: copy.summary,
          source: '10-Q',
          ticker: f.ticker,
          moveLabel: formatPct(f.dayMovePct),
          moveUp: (f.dayMovePct ?? 0) >= 0,
          priceSeries: f.priceSeries ?? [],
          score: catalog('quarterly_10q')?.weight ?? 0,
          memberIds: [f.id],
        }),
      )
    }
  }
  return slides
}

/** @returns {RecapSlide[]} */
function evalCompanyFilingBurst(filings) {
  const slides = []
  for (const [ticker, rows] of groupBy(filings, (f) => f.ticker)) {
    if (rows.length < 2) continue
    const docs = [...new Set(rows.map((r) => r.doc))]
    if (docs.length < 2 && rows.length < 3) continue
    const lead = rows.find((r) => r.doc === '8-K') ?? rows[0]
    const company = companyPhrase(lead.companyName, ticker)
    const copy = pickRecapCopy('company_filing_burst', `burst-${ticker}`, { company })
    slides.push(
      baseSlide('company_filing_burst', {
        id: `burst-${ticker}`,
        headline: copy.headline,
        summary: copy.summary,
        source: docs[0] ?? 'Filing',
        ticker,
        moveLabel: formatPct(lead.dayMovePct),
        moveUp: (lead.dayMovePct ?? 0) >= 0,
        priceSeries: lead.priceSeries ?? [],
        score: (catalog('company_filing_burst')?.weight ?? 0) + rows.length * 4,
        memberIds: rows.map((r) => r.id),
      }),
    )
  }
  return slides
}

/** @returns {RecapSlide | null} */
function evalFilingPriceReaction(filings) {
  const withMove = filings.filter((f) => Number.isFinite(f.dayMovePct) && Math.abs(f.dayMovePct) >= 2.5)
  if (!withMove.length) return null
  const lead = withMove.slice().sort((a, b) => Math.abs(b.dayMovePct) - Math.abs(a.dayMovePct))[0]
  const company = companyPhrase(lead.companyName, lead.ticker)
  const up = lead.dayMovePct >= 0
  const copy = pickRecapCopy(priceReactionCopyKey(up), `reaction-${lead.id}`, { company })
  return baseSlide('filing_price_reaction', {
    id: `reaction-${lead.id}`,
    headline: copy.headline,
    summary: copy.summary,
    source: lead.doc,
    ticker: lead.ticker,
    moveLabel: formatPct(lead.dayMovePct),
    moveUp: up,
    priceSeries: lead.priceSeries ?? [],
    score: (catalog('filing_price_reaction')?.weight ?? 0) + Math.abs(lead.dayMovePct),
    memberIds: [lead.id],
  })
}

/**
 * @param {{ filings: RecapDayFiling[] }} day
 * @returns {{ slides: RecapSlide[] }}
 */
export function evaluateExploreRecap(day) {
  const filings = Array.isArray(day?.filings) ? day.filings : []
  if (!filings.length) return { slides: [] }

  const buyClusters = evalInsiderBuyingCluster(filings)
  const sellClusters = evalInsiderSellingCluster(filings)
  const clusterTickerCover = new Set(
    [...buyClusters, ...sellClusters].map((s) => s.ticker).filter(Boolean),
  )
  const multiPeople = evalMultiplePeopleOneCompany(filings, clusterTickerCover)
  const personMulti = evalOnePersonMultipleCompanies(filings)
  const suppressedActors = new Set(
    personMulti.flatMap((s) => {
      const id = String(s.id ?? '').replace(/^person-multi-/, '')
      return id ? [id] : []
    }),
  )
  const personActivity = evalPersonActivity(filings, suppressedActors)

  const largestBuy = evalLargestForm4(filings, 'buy', 'largest_insider_purchase')
  const largestSale = evalLargestForm4(filings, 'sell', 'largest_insider_sale')

  const suppressedForSingles = new Set([
    ...buyClusters.flatMap((s) => s.memberIds ?? []),
    ...sellClusters.flatMap((s) => s.memberIds ?? []),
    ...multiPeople.flatMap((s) => s.memberIds ?? []),
  ])
  // Keep largest-of-day as ranking even if also in a cluster; suppress duplicate singles only.
  const singles = evalSingles(filings, suppressedForSingles).filter((s) => {
    if (s.typeId === 'insider_purchase' && largestBuy && s.memberIds?.[0] === largestBuy.memberIds?.[0]) {
      return false
    }
    if (s.typeId === 'insider_sale' && largestSale && s.memberIds?.[0] === largestSale.memberIds?.[0]) {
      return false
    }
    return true
  })

  const bursts = evalCompanyFilingBurst(filings)
  const reaction = evalFilingPriceReaction(filings)

  /** Prefer cluster over burst for same ticker when both fire. */
  const burstFiltered = bursts.filter((b) => !clusterTickerCover.has(b.ticker))

  // Prefer buy-cluster over "largest purchase" when it's the same ticker lead.
  const clusterBuyTickers = new Set(buyClusters.map((s) => s.ticker))
  const largestBuyKept =
    largestBuy && !clusterBuyTickers.has(largestBuy.ticker) ? largestBuy : null

  // Prefer price-reaction over raw 8-K / burst for the same ticker.
  const reactionTicker = reaction?.ticker ?? null
  const singlesNoDup8k = singles.filter((s) => {
    if (reactionTicker && s.typeId === 'material_8k' && s.ticker === reactionTicker) return false
    return true
  })
  const burstNoReaction = burstFiltered.filter((b) => b.ticker !== reactionTicker)

  const candidates = [
    ...buyClusters,
    ...sellClusters,
    ...multiPeople,
    ...personMulti,
    ...personActivity,
    ...(largestBuyKept ? [largestBuyKept] : []),
    ...(largestSale ? [largestSale] : []),
    ...singlesNoDup8k,
    ...burstNoReaction,
    ...(reaction ? [reaction] : []),
  ]

  // Soft dedupe: one slide fingerprint per typeId+ticker+primary actor vibe
  const seen = new Set()
  const deduped = []
  for (const slide of candidates.sort(compareRecapSlides)) {
    const fp = `${slide.typeId}|${slide.ticker}|${slide.headline}`
    if (seen.has(fp)) continue
    seen.add(fp)
    deduped.push(slide)
  }

  // Hard cap: tier hierarchy already sorted — keep the top dozen only.
  const slides = deduped.slice(0, EXPLORE_RECAP_MAX_SLIDES)
  return { slides }
}
