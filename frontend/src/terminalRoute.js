import { useCallback, useEffect, useState } from 'react'
import { exploreInvestorSlug } from './exploreDirectoryNav.js'
import { normalizeMarketingPath } from './marketingRoute.js'
import { isInvestorExploreSlug, isRetiredProductPath } from './retiredProductPaths.js'

export const EXPLORE_HOME_PATH = '/explore'
export const EXPLORE_COMPANIES_PATH = '/explore/companies'
export const EXPLORE_INVESTORS_PATH = '/explore/investors'
export const EXPLORE_WATCHLIST_PATH = '/explore/watchlist'
export const EXPLORE_EVENTS_PATH = '/explore/events'
export const SETTINGS_PATH = '/settings'
export const MACRO_PATH = '/macro'
/** @deprecated Use EXPLORE_INVESTORS_PATH */
export const EXPLORE_ACTORS_PATH = EXPLORE_INVESTORS_PATH

function dossierSegment(value) {
  return decodeURIComponent(String(value ?? ''))
    .trim()
    .toLowerCase()
}

export function readTerminalPath() {
  if (typeof window === 'undefined') return '/'
  return normalizeMarketingPath(window.location.pathname)
}

/** @returns {{ view: string, ticker?: string, investorSlug?: string, eventId?: string } | null} */
export function parseExploreRoute(pathname = readTerminalPath()) {
  const path = normalizeMarketingPath(pathname)
  if (isRetiredProductPath(path)) return null

  const eventDetail = path.match(/^\/explore\/events\/([^/]+)$/i)
  if (eventDetail) {
    return {
      view: 'eventDetail',
      eventId: decodeURIComponent(eventDetail[1]).trim(),
    }
  }

  if (path === EXPLORE_WATCHLIST_PATH) return { view: 'watchlist' }
  if (path === EXPLORE_HOME_PATH) return { view: 'home' }

  const dossier = path.match(/^\/explore\/([^/]+)$/i)
  if (dossier) {
    const segment = dossierSegment(dossier[1])
    if (!segment || segment === 'events' || !isInvestorExploreSlug(segment)) return null
    return { view: 'investorDetail', investorSlug: segment }
  }
  return null
}

/**
 * App shell route: Explore tree or Settings.
 * Retired company, directory, macro, and people URLs are not routes.
 * @returns {{ shell: 'explore' | 'settings', view?: string, ticker?: string, investorSlug?: string } | null}
 */
export function parseTerminalRoute(pathname = readTerminalPath()) {
  const path = normalizeMarketingPath(pathname)
  if (isRetiredProductPath(path)) return null
  if (path === SETTINGS_PATH) return { shell: 'settings', view: 'settings' }
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
  if (subview === 'investors' || subview === 'actors') return EXPLORE_HOME_PATH
  if (subview === 'watchlist') return EXPLORE_WATCHLIST_PATH
  return EXPLORE_HOME_PATH
}

export function exploreCompanyDetailPath(ticker) {
  const t = String(ticker ?? '').trim().toLowerCase()
  return t ? `/explore/${encodeURIComponent(t)}` : EXPLORE_HOME_PATH
}

export function exploreInvestorDetailPath(name, slugHint = null) {
  const slug =
    String(slugHint ?? '')
      .trim()
      .toLowerCase() || exploreInvestorSlug(name)
  return slug ? `/explore/${encodeURIComponent(slug)}` : EXPLORE_HOME_PATH
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

export function navigateExploreCompanies() {}

export function navigateExploreInvestors() {}

export function navigateExploreWatchlist() {
  navigateTerminal(EXPLORE_WATCHLIST_PATH)
}

/** @deprecated Use navigateExploreInvestors */
export const navigateExploreActors = navigateExploreInvestors

export function navigateExploreCompanyDetail() {}

export function navigateExploreInvestorDetail(name, slugHint = null) {
  const path = exploreInvestorDetailPath(name, slugHint)
  if (isRetiredProductPath(path)) return
  navigateTerminal(path)
}

/** @deprecated Use navigateExploreInvestorDetail */
export const navigateExploreActorDetail = navigateExploreInvestorDetail

export function navigateExploreEventDetail(eventId) {
  navigateTerminal(exploreEventDetailPath(eventId))
}

export function navigateSettings({ replace = false } = {}) {
  navigateTerminal(SETTINGS_PATH, { replace })
}

export function navigateMacro() {}

export function navigateExploreBack() {
  if (typeof window === 'undefined') return
  window.history.back()
}

function resolveTerminalRoute(pathname = readTerminalPath()) {
  if (isRetiredProductPath(pathname)) return { shell: 'retired' }
  return parseTerminalRoute(pathname) ?? { shell: 'explore', view: 'home' }
}

export function useTerminalRoute() {
  const [route, setRoute] = useState(() => resolveTerminalRoute())

  useEffect(() => {
    const sync = () => setRoute(resolveTerminalRoute())
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
