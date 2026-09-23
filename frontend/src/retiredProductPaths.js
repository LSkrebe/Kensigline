import { EXPLORE_WATCHLIST_CATALOG, watchlistPersonSlugs } from './exploreWatchlistCatalog.js'

function cleanPath(pathname) {
  const raw = String(pathname || '/').split('?')[0].replace(/\/$/, '')
  return raw || '/'
}

function segmentOf(value) {
  try {
    return decodeURIComponent(String(value ?? '')).trim().toLowerCase()
  } catch {
    return String(value ?? '').trim().toLowerCase()
  }
}

function isKnownInvestorSlug(segment) {
  return EXPLORE_WATCHLIST_CATALOG.some((person) => watchlistPersonSlugs(person).includes(segment))
}

/** Sample investors shown on Explore beyond the catalog. Their dossier URLs stay. */
const EXTRA_INVESTOR_SLUGS = new Set([
  'dan-crenshaw',
  'josh-gottheimer',
  'ro-khanna',
  'maria-cantwell',
  'amy-klobuchar',
  'bernie-sanders',
  'john-barrasso',
  'mitch-mcconnell',
  'chuck-schumer',
  'elizabeth-warren',
  'ted-cruz',
  'jeff-bezos',
])

export function isInvestorExploreSlug(segment) {
  const slug = segmentOf(segment)
  if (!slug) return false
  return isKnownInvestorSlug(slug) || EXTRA_INVESTOR_SLUGS.has(slug)
}

/**
 * Removed product URLs. They are not pages and must not bounce to Explore.
 * Live routes stay: /explore, /explore/:investor, /explore/events/:id, /explore/watchlist, /settings.
 */
export function isRetiredProductPath(pathname = '/') {
  const path = cleanPath(pathname)
  if (path === '/macro' || path.startsWith('/macro/')) return true
  if (path === '/people' || path.startsWith('/people/')) return true
  if (path === '/activity' || path.startsWith('/activity/')) return true
  if (path === '/explore/companies' || path.startsWith('/explore/companies/')) return true
  if (path === '/explore/investors' || path.startsWith('/explore/investors/')) return true
  if (path === '/explore/actors' || path.startsWith('/explore/actors/')) return true
  const one = path.match(/^\/explore\/([^/]+)$/i)
  if (!one) return false
  const segment = segmentOf(one[1])
  if (!segment || segment === 'events' || segment === 'watchlist') return false
  return !isInvestorExploreSlug(segment)
}
