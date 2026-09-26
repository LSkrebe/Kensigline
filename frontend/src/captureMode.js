/** Local screenshot / marketing capture: `?capture=1|hero|product` (dev only). */

export function isCaptureMode() {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).has('capture')
}

/**
 * Which curated cast to surface for marketing screenshots.
 * - hero: wow Explore home (Trump / Musk / Berkshire)
 * - product: second Explore cast + matching dossier (Pelosi / Zuckerberg / Jensen)
 */
export function captureShotSet() {
  if (!isCaptureMode()) return null
  const value = String(new URLSearchParams(window.location.search).get('capture') ?? '')
    .trim()
    .toLowerCase()
  if (value === 'product' || value === 'watchlist') return 'product'
  return 'hero'
}

/** Featured portrait cards for each marketing Explore shot — no overlap across sets. */
export const CAPTURE_FEATURED_SLUGS = {
  hero: ['donald-trump', 'elon-musk', 'berkshire-hathaway'],
  product: ['nancy-pelosi', 'mark-zuckerberg', 'jensen-huang'],
}

/** Investor opened for the product-section dossier shot (best of the product cast). */
export const CAPTURE_DOSSIER_SLUG = 'nancy-pelosi'

/** Most Popular invested boosts so the cast reads as household names. */
export const CAPTURE_INVESTED_USD = {
  hero: {
    'elon-musk': 28_400_000,
    'berkshire-hathaway': 24_600_000,
    'donald-trump': 18_200_000,
    'citadel-advisors': 14_800_000,
    'jamie-dimon': 9_400_000,
    'bridgewater': 8_900_000,
    'renaissance-technologies': 8_100_000,
    'tim-cook': 6_200_000,
  },
  product: {
    'nancy-pelosi': 22_800_000,
    'jensen-huang': 19_600_000,
    'mark-zuckerberg': 16_400_000,
    'lisa-su': 11_200_000,
    'pershing-square': 9_800_000,
    'marjorie-taylor-greene': 7_600_000,
    'satya-nadella': 6_900_000,
    'josh-gottheimer': 5_400_000,
  },
}
