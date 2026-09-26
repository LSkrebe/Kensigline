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

export function isInvestorExploreSlug(segment) {
  const slug = segmentOf(segment)
  if (!slug) return false
  return isKnownInvestorSlug(slug)
}

/**
 * Company dossier segments: ticker-like paths that are not curated investor slugs.
 * Examples: /explore/nvda, /explore/brk.b, /explore/brk-b
 */
export function isCompanyExploreTicker(segment) {
  const ticker = segmentOf(segment)
  if (!ticker) return false
  if (isInvestorExploreSlug(ticker)) return false
  if (['events', 'watchlist', 'companies', 'investors', 'actors', 'settings'].includes(ticker)) {
    return false
  }
  return /^[a-z][a-z0-9.-]{0,9}$/i.test(ticker)
}

/**
 * Removed product URLs. They are not pages and must not bounce to Explore.
 * Live routes: /explore, /explore/:investor|/explore/:ticker, /settings.
 * /explore/events and /explore/events/:id rewrite to Explore home (or investor when derivable).
 * Personal /explore/watchlist is retired — curated universe is the only list.
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
  if (isInvestorExploreSlug(segment) || isCompanyExploreTicker(segment)) return false
  return true
}
