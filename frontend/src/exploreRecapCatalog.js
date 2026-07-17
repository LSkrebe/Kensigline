/**
 * Explore daily-recap event catalog (v1).
 *
 * Only types we can truthfully back with Form 4 / PTR / research docs / bars
 * once a live builder exists. Mock evaluator uses the same ids today.
 *
 * Each entry is a story template — the day builder emits a slide only when
 * its condition fires (omit otherwise).
 *
 * `tier` is the hard hierarchy for the carousel (1 = show first). Within a
 * tier, `weight` + evaluator score break ties. Cap is EXPLORE_RECAP_MAX_SLIDES.
 */

/** @typedef {'single' | 'group' | 'ranking'} RecapCatalogKind */

/**
 * @typedef {object} RecapCatalogEntry
 * @property {string} id
 * @property {string} title
 * @property {RecapCatalogKind} kind
 * @property {string} kicker
 * @property {string[]} documents
 * @property {number} tier  1 = highest priority in the limited carousel
 * @property {number} weight  rank weight when fired (within-tier tiebreak)
 * @property {string} [notes]
 */

/** @type {RecapCatalogEntry[]} */
export const EXPLORE_RECAP_CATALOG = [
  {
    id: 'largest_insider_purchase',
    title: 'Largest Insider Purchase Today',
    kind: 'ranking',
    kicker: 'Event of the day',
    documents: ['Form 4'],
    tier: 1,
    weight: 80,
  },
  {
    id: 'largest_insider_sale',
    title: 'Largest Insider Sale Today',
    kind: 'ranking',
    kicker: 'Event of the day',
    documents: ['Form 4'],
    tier: 1,
    weight: 74,
  },
  {
    id: 'insider_buying_cluster',
    title: 'Insider Buying Cluster',
    kind: 'group',
    kicker: 'Cluster',
    documents: ['Form 4'],
    tier: 1,
    weight: 72,
    notes: 'Same ticker, 2+ distinct insiders buying same day',
  },
  {
    id: 'insider_selling_cluster',
    title: 'Insider Selling Cluster',
    kind: 'group',
    kicker: 'Cluster',
    documents: ['Form 4'],
    tier: 1,
    weight: 68,
  },
  {
    id: 'filing_price_reaction',
    title: 'Strong Price Reaction',
    kind: 'ranking',
    kicker: 'Market reaction',
    documents: ['Form 4', '8-K', 'PTR'],
    tier: 2,
    weight: 58,
    notes: 'Uses daily closes only (no intraday)',
  },
  {
    id: 'material_8k',
    title: 'Material Company Event',
    kind: 'single',
    kicker: 'Company filing',
    documents: ['8-K'],
    tier: 2,
    weight: 42,
  },
  {
    id: 'one_person_multiple_companies',
    title: 'Person Multi-Company Activity',
    kind: 'group',
    kicker: 'Investor of the day',
    documents: ['Form 4', 'PTR'],
    tier: 2,
    weight: 60,
  },
  {
    id: 'multiple_people_one_company',
    title: 'Multiple Insider Cluster',
    kind: 'group',
    kicker: 'Cluster',
    documents: ['Form 4'],
    tier: 2,
    weight: 64,
    notes: '2+ people any side on one company (fallback if buy/sell-only cluster misses)',
  },
  {
    id: 'politician_purchase',
    title: 'Politician Purchase',
    kind: 'single',
    kicker: 'Political disclosure',
    documents: ['PTR'],
    tier: 3,
    weight: 38,
  },
  {
    id: 'politician_sale',
    title: 'Politician Sale',
    kind: 'single',
    kicker: 'Political disclosure',
    documents: ['PTR'],
    tier: 3,
    weight: 34,
  },
  {
    id: 'person_activity',
    title: 'Person Activity',
    kind: 'group',
    kicker: 'Investor of the day',
    documents: ['Form 4', 'PTR'],
    tier: 3,
    weight: 55,
  },
  {
    id: 'company_filing_burst',
    title: 'Filing Burst',
    kind: 'group',
    kicker: 'Companies of the day',
    documents: ['8-K', '10-Q', 'Form 4', 'PTR'],
    tier: 3,
    weight: 50,
  },
  {
    id: 'insider_purchase',
    title: 'Insider Purchase',
    kind: 'single',
    kicker: 'Insider flow',
    documents: ['Form 4'],
    tier: 4,
    weight: 40,
  },
  {
    id: 'insider_sale',
    title: 'Insider Sale',
    kind: 'single',
    kicker: 'Insider flow',
    documents: ['Form 4'],
    tier: 4,
    weight: 36,
  },
  {
    id: 'quarterly_10q',
    title: 'Quarterly Report',
    kind: 'single',
    kicker: 'Company filing',
    documents: ['10-Q'],
    tier: 5,
    weight: 22,
  },
]

export const EXPLORE_RECAP_CATALOG_BY_ID = Object.fromEntries(
  EXPLORE_RECAP_CATALOG.map((entry) => [entry.id, entry]),
)

/** Hard ceiling for carousel dots / slides — keep the strip scannable. */
export const EXPLORE_RECAP_MAX_SLIDES = 12

export function recapSlideTier(typeId) {
  return EXPLORE_RECAP_CATALOG_BY_ID[typeId]?.tier ?? 99
}

/** Sort key: lower tier first, then higher score. */
export function compareRecapSlides(a, b) {
  const tierDelta = recapSlideTier(a?.typeId) - recapSlideTier(b?.typeId)
  if (tierDelta !== 0) return tierDelta
  return (b?.score ?? 0) - (a?.score ?? 0)
}
