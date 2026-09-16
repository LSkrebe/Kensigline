import { useCallback, useEffect, useState } from 'react'
import { exploreInvestorSlug } from './exploreDirectoryNav.js'
import { normalizeMarketingPath } from './marketingRoute.js'

export const EXPLORE_HOME_PATH = '/explore'
export const EXPLORE_COMPANIES_PATH = '/explore/companies'
export const EXPLORE_INVESTORS_PATH = '/explore/investors'
export const EXPLORE_WATCHLIST_PATH = '/explore/watchlist'
export const EXPLORE_EVENTS_PATH = '/explore/events'
export const SETTINGS_PATH = '/settings'
export const MACRO_PATH = '/macro'
/** @deprecated Use EXPLORE_INVESTORS_PATH */
export const EXPLORE_ACTORS_PATH = EXPLORE_INVESTORS_PATH

function rewriteLegacyExploreActorsPath(pathname) {
  const path = normalizeMarketingPath(pathname)
  const detail = path.match(/^\/explore\/actors\/([^/]+)$/i)
  if (detail) {
    return `/explore/investors/${detail[1]}`
  }
  if (path === '/explore/actors') return EXPLORE_INVESTORS_PATH
  return null
}

export function readTerminalPath() {
  if (typeof window === 'undefined') return '/'
  return normalizeMarketingPath(window.location.pathname)
}

/** @returns {{ view: string, ticker?: string, investorSlug?: string, eventId?: string } | null} */
export function parseExploreRoute(pathname = readTerminalPath()) {
  const path = normalizeMarketingPath(pathname)

  const companyDetail = path.match(/^\/explore\/companies\/([A-Za-z0-9.-]+)$/i)
  if (companyDetail) {
    return {
      view: 'companyDetail',
      ticker: String(companyDetail[1]).trim().toUpperCase(),
    }
  }

  const investorDetail = path.match(/^\/explore\/(?:investors|actors)\/([^/]+)$/i)
  if (investorDetail) {
    return {
      view: 'investorDetail',
      investorSlug: decodeURIComponent(investorDetail[1]).trim().toLowerCase(),
    }
  }

  const eventDetail = path.match(/^\/explore\/events\/([^/]+)$/i)
  if (eventDetail) {
    return {
      view: 'eventDetail',
      eventId: decodeURIComponent(eventDetail[1]).trim(),
    }
  }

  if (path === EXPLORE_COMPANIES_PATH) return { view: 'home' }
  if (path === EXPLORE_INVESTORS_PATH || path === '/explore/actors') return { view: 'investors' }
  if (path === EXPLORE_WATCHLIST_PATH) return { view: 'watchlist' }
  if (path === EXPLORE_HOME_PATH) return { view: 'home' }
  return null
}

/**
 * App shell route: Explore tree, Settings, or Macro.
 * @returns {{ shell: 'explore' | 'settings' | 'macro', view?: string, ticker?: string, investorSlug?: string } | null}
 */
export function parseTerminalRoute(pathname = readTerminalPath()) {
  const path = normalizeMarketingPath(pathname)
  if (path === SETTINGS_PATH) return { shell: 'settings', view: 'settings' }
  if (path === MACRO_PATH) return { shell: 'macro', view: 'macro' }
  const explore = parseExploreRoute(path)
  if (explore) return { shell: 'explore', ...explore }
  return null
}

/** @returns {'home' | 'companies' | 'investors' | 'companyDetail' | 'investorDetail' | 'eventDetail' | null} */
export function parseExploreSubview(pathname = readTerminalPath()) {
  return parseExploreRoute(pathname)?.view ?? null
}

export function isExplorePath(pathname = readTerminalPath()) {
  return parseExploreRoute(pathname) != null
}

export function isTerminalAppPath(pathname = readTerminalPath()) {
  return parseTerminalRoute(pathname) != null
}

export function explorePathForSubview(subview) {
  if (subview === 'companies') return EXPLORE_HOME_PATH
  if (subview === 'investors' || subview === 'actors') return EXPLORE_INVESTORS_PATH
  if (subview === 'watchlist') return EXPLORE_WATCHLIST_PATH
  return EXPLORE_HOME_PATH
}

export function exploreCompanyDetailPath(ticker) {
  const t = String(ticker ?? '').trim().toUpperCase()
  return t ? `/explore/companies/${t}` : EXPLORE_COMPANIES_PATH
}

export function exploreInvestorDetailPath(name, slugHint = null) {
  const slug =
    String(slugHint ?? '')
      .trim()
      .toLowerCase() || exploreInvestorSlug(name)
  return slug ? `/explore/investors/${slug}` : EXPLORE_INVESTORS_PATH
}

/** @deprecated Use exploreInvestorDetailPath */
export const exploreActorDetailPath = exploreInvestorDetailPath

export function exploreEventDetailPath(eventId) {
  const id = String(eventId ?? '').trim()
  if (!id) return EXPLORE_HOME_PATH
  return `${EXPLORE_EVENTS_PATH}/${encodeURIComponent(id)}`
}

export function navigateTerminal(path, { replace = false } = {}) {
  if (typeof window === 'undefined') return
  const next = path.startsWith('/') ? path : `/${path}`
  if (normalizeMarketingPath(window.location.pathname) === normalizeMarketingPath(next)) return
  if (replace) window.history.replaceState(null, '', next)
  else window.history.pushState(null, '', next)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function navigateExploreHome({ replace = false } = {}) {
  navigateTerminal(EXPLORE_HOME_PATH, { replace })
}

export function navigateExploreCompanies() {
  navigateTerminal(EXPLORE_HOME_PATH)
}

export function navigateExploreInvestors() {
  navigateTerminal(EXPLORE_INVESTORS_PATH)
}

export function navigateExploreWatchlist() {
  navigateTerminal(EXPLORE_WATCHLIST_PATH)
}

/** @deprecated Use navigateExploreInvestors */
export const navigateExploreActors = navigateExploreInvestors

export function navigateExploreCompanyDetail(ticker) {
  navigateTerminal(exploreCompanyDetailPath(ticker))
}

export function navigateExploreInvestorDetail(name, slugHint = null) {
  navigateTerminal(exploreInvestorDetailPath(name, slugHint))
}

/** @deprecated Use navigateExploreInvestorDetail */
export const navigateExploreActorDetail = navigateExploreInvestorDetail

export function navigateExploreEventDetail(eventId) {
  navigateTerminal(exploreEventDetailPath(eventId))
}

export function navigateSettings({ replace = false } = {}) {
  navigateTerminal(SETTINGS_PATH, { replace })
}

export function navigateMacro({ replace = false } = {}) {
  navigateTerminal(MACRO_PATH, { replace })
}

export function navigateExploreBack() {
  if (typeof window === 'undefined') return
  window.history.back()
}

export function useTerminalRoute() {
  const [route, setRoute] = useState(
    () => parseTerminalRoute(readTerminalPath()) ?? { shell: 'explore', view: 'home' },
  )

  useEffect(() => {
    const sync = () => {
      const path = readTerminalPath()
      const rewritten = rewriteLegacyExploreActorsPath(path)
      if (rewritten && typeof window !== 'undefined') {
        window.history.replaceState(null, '', rewritten)
      }
      setRoute(parseTerminalRoute(readTerminalPath()) ?? { shell: 'explore', view: 'home' })
    }
    sync()
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  return route
}

export function useExploreRoute() {
  const route = useTerminalRoute()
  if (route.shell !== 'explore') return { view: 'home' }
  return {
    view: route.view ?? 'home',
    ticker: route.ticker,
    investorSlug: route.investorSlug,
    eventId: route.eventId,
  }
}

export function useExploreSubview() {
  const route = useExploreRoute()
  return route.view
}

export function useNavigateExplore() {
  return useCallback((target) => {
    if (target === 'companies') navigateExploreCompanies()
    else if (target === 'investors' || target === 'actors') navigateExploreInvestors()
    else if (target === 'watchlist') navigateExploreWatchlist()
    else navigateExploreHome()
  }, [])
}
