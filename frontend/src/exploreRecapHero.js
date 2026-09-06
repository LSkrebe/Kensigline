/**
 * Hero vs Headlines split for Explore recap.
 *
 * Hero (≤5): best-of-best first — tier-1 events, clusters, large flow, convergence.
 * Backfills from broader pool when the day is quiet so the carousel is never empty.
 * Headlines: everything else, in the original tier/score order from the evaluator.
 */

import {
  EXPLORE_RECAP_CATALOG_BY_ID,
  EXPLORE_RECAP_HERO_MAX,
  compareRecapSlides,
  recapSlideTier,
} from './exploreRecapCatalog.js'
import { parseExploreTrailUsd } from './exploreDirectoryMock.js'

/** Story types that are always "best of the best" when they fire. */
const PREMIUM_TYPE_IDS = new Set([
  'largest_insider_purchase',
  'largest_insider_sale',
  'insider_buying_cluster',
  'insider_selling_cluster',
  'politician_buying_cluster',
  'politician_selling_cluster',
  'earnings_watch',
  'one_person_multiple_companies',
  'multiple_people_one_company',
])

function parsePctFromMoveLabel(label) {
  const raw = String(label ?? '').trim()
  const m = raw.match(/^([+\-−])?\s*([\d.]+)\s*%$/)
  if (!m) return null
  const n = Number(m[2])
  if (!Number.isFinite(n)) return null
  return m[1] === '-' || m[1] === '−' ? -n : n
}

function notionalUsd(slide) {
  const parsed = parseExploreTrailUsd(slide?.moveLabel)
  if (parsed != null && Math.abs(parsed) > 0) return Math.abs(parsed)
  return 0
}

function tickerOverlapCounts(slides) {
  const map = new Map()
  for (const slide of slides) {
    const ticker = String(slide?.ticker ?? '').trim().toUpperCase()
    if (!ticker) continue
    map.set(ticker, (map.get(ticker) ?? 0) + 1)
  }
  return map
}

/**
 * Best-of-best gate — intentionally permissive so quiet days still have premium candidates.
 * @param {import('./exploreRecapEvaluate.js').RecapSlide} slide
 */
export function isPremiumRecapSlide(slide) {
  const typeId = String(slide?.typeId ?? '')
  if (PREMIUM_TYPE_IDS.has(typeId)) return true

  const tier = recapSlideTier(typeId)
  if (tier <= 1) return true

  const baseWeight = EXPLORE_RECAP_CATALOG_BY_ID[typeId]?.weight ?? 0
  const score = Number(slide?.score ?? 0)
  if (tier === 2 && score >= baseWeight) return true

  if (typeId === 'filing_price_reaction') {
    const pct = parsePctFromMoveLabel(slide?.moveLabel)
    if (pct != null && Math.abs(pct) >= 4) return true
  }

  if (typeId === 'person_activity' && (slide?.memberIds?.length ?? 0) >= 3) return true

  if (typeId === 'company_filing_burst' && (slide?.memberIds?.length ?? 0) >= 3) return true

  // Large single insider/politician flow counts as premium even at tier 4.
  const usd = notionalUsd(slide)
  if (usd >= 2_000_000 && (typeId === 'insider_purchase' || typeId === 'insider_sale')) return true
  if (usd >= 1_000_000 && (typeId === 'politician_purchase' || typeId === 'politician_sale')) return true

  return false
}

/**
 * @param {import('./exploreRecapEvaluate.js').RecapSlide} slide
 * @param {Map<string, number>} tickerCounts
 */
export function computeRecapHeroScore(slide, tickerCounts) {
  let score = Number(slide?.score ?? 0)
  const typeId = String(slide?.typeId ?? '')
  const tier = recapSlideTier(typeId)

  score += Math.max(0, (5 - tier) * 10)

  const usd = notionalUsd(slide)
  if (usd >= 1_000) score += Math.min(28, Math.log10(usd) * 5.5)

  const members = slide?.memberIds?.length ?? 0
  if (members >= 2) score += Math.min(18, members * 4)

  const ticker = String(slide?.ticker ?? '').trim().toUpperCase()
  if (ticker && (tickerCounts.get(ticker) ?? 0) >= 2) score += 14

  const pct = parsePctFromMoveLabel(slide?.moveLabel)
  if (pct != null) score += Math.min(12, Math.abs(pct) * 0.8)

  if (isPremiumRecapSlide(slide)) score += 8

  return score
}

function compareHeroEntries(a, b) {
  const delta = b.heroScore - a.heroScore
  if (delta !== 0) return delta
  return compareRecapSlides(a.slide, b.slide)
}

/**
 * Split ranked slides: hero carousel (best-of-best, backfilled) vs headline cards (broader rest).
 * @param {import('./exploreRecapEvaluate.js').RecapSlide[]} slides
 * @param {number} [heroMax]
 */
export function splitExploreRecapSlides(slides, heroMax = EXPLORE_RECAP_HERO_MAX) {
  const list = Array.isArray(slides) ? slides.filter(Boolean) : []
  if (!list.length) return { heroSlides: [], storySlides: [] }

  const cap = Math.max(1, Math.min(list.length, Math.floor(heroMax) || EXPLORE_RECAP_HERO_MAX))
  const tickerCounts = tickerOverlapCounts(list)

  const entries = list.map((slide) => ({
    slide,
    premium: isPremiumRecapSlide(slide),
    heroScore: computeRecapHeroScore(slide, tickerCounts),
  }))

  const hero = []
  const usedIds = new Set()
  const usedTickers = new Set()

  function pickFrom(pool, allowTickerDup) {
    for (const entry of pool) {
      if (hero.length >= cap) break
      const slide = entry.slide
      if (!slide?.id || usedIds.has(slide.id)) continue
      const ticker = String(slide.ticker ?? '').trim().toUpperCase()
      if (!allowTickerDup && ticker && usedTickers.has(ticker)) continue
      hero.push(slide)
      usedIds.add(slide.id)
      if (ticker) usedTickers.add(ticker)
    }
  }

  const premiumPool = entries.filter((e) => e.premium).sort(compareHeroEntries)
  const standardPool = entries.filter((e) => !e.premium).sort(compareHeroEntries)
  const allByHero = [...entries].sort(compareHeroEntries)

  // 1. Best-of-best with ticker diversity
  pickFrom(premiumPool, false)
  // 2. Broader stories backfill hero when the day is thin
  pickFrom(standardPool, false)
  // 3. Leftover premium + high scorers (allow same ticker if needed)
  pickFrom(allByHero, true)

  // Quiet day: never leave hero empty when we have any slide
  if (!hero.length) hero.push(list[0])

  const heroIds = new Set(hero.map((s) => s.id))
  const storySlides = list.filter((s) => !heroIds.has(s.id))

  return { heroSlides: hero, storySlides }
}
