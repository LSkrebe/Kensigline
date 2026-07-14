import { useCallback, useEffect, useState } from 'react'
import { exploreActorSlug } from './exploreDirectoryNav.js'
import { normalizeMarketingPath } from './marketingRoute.js'

export const EXPLORE_HOME_PATH = '/explore'
export const EXPLORE_COMPANIES_PATH = '/explore/companies'
export const EXPLORE_ACTORS_PATH = '/explore/actors'

export function readTerminalPath() {
  if (typeof window === 'undefined') return '/'
  return normalizeMarketingPath(window.location.pathname)
}

/** @returns {{ view: string, ticker?: string, actorSlug?: string } | null} */
export function parseExploreRoute(pathname = readTerminalPath()) {
  const path = normalizeMarketingPath(pathname)

  const companyDetail = path.match(/^\/explore\/companies\/([A-Za-z0-9.-]+)$/i)
  if (companyDetail) {
    return {
      view: 'companyDetail',
      ticker: String(companyDetail[1]).trim().toUpperCase(),
    }
  }

  const actorDetail = path.match(/^\/explore\/actors\/([^/]+)$/i)
  if (actorDetail) {
    return {
      view: 'actorDetail',
      actorSlug: decodeURIComponent(actorDetail[1]).trim().toLowerCase(),
    }
  }

  if (path === EXPLORE_COMPANIES_PATH) return { view: 'companies' }
  if (path === EXPLORE_ACTORS_PATH) return { view: 'actors' }
  if (path === EXPLORE_HOME_PATH) return { view: 'home' }
  return null
}

/** @returns {'home' | 'companies' | 'actors' | 'companyDetail' | 'actorDetail' | null} */
export function parseExploreSubview(pathname = readTerminalPath()) {
  return parseExploreRoute(pathname)?.view ?? null
}

export function isExplorePath(pathname = readTerminalPath()) {
  return parseExploreRoute(pathname) != null
}

export function explorePathForSubview(subview) {
  if (subview === 'companies') return EXPLORE_COMPANIES_PATH
  if (subview === 'actors') return EXPLORE_ACTORS_PATH
  return EXPLORE_HOME_PATH
}

export function exploreCompanyDetailPath(ticker) {
  const t = String(ticker ?? '').trim().toUpperCase()
  return t ? `/explore/companies/${t}` : EXPLORE_COMPANIES_PATH
}

export function exploreActorDetailPath(name) {
  const slug = exploreActorSlug(name)
  return slug ? `/explore/actors/${slug}` : EXPLORE_ACTORS_PATH
}

export function navigateTerminal(path) {
  if (typeof window === 'undefined') return
  const next = path.startsWith('/') ? path : `/${path}`
  if (normalizeMarketingPath(window.location.pathname) === normalizeMarketingPath(next)) return
  window.history.pushState(null, '', next)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function navigateExploreHome() {
  navigateTerminal(EXPLORE_HOME_PATH)
}

export function navigateExploreCompanies() {
  navigateTerminal(EXPLORE_COMPANIES_PATH)
}

export function navigateExploreActors() {
  navigateTerminal(EXPLORE_ACTORS_PATH)
}

export function navigateExploreCompanyDetail(ticker) {
  navigateTerminal(exploreCompanyDetailPath(ticker))
}

export function navigateExploreActorDetail(name) {
  navigateTerminal(exploreActorDetailPath(name))
}

export function useExploreRoute() {
  const [route, setRoute] = useState(() => parseExploreRoute(readTerminalPath()) ?? { view: 'home' })

  useEffect(() => {
    const onPop = () => {
      setRoute(parseExploreRoute(readTerminalPath()) ?? { view: 'home' })
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  return route
}

export function useExploreSubview() {
  const route = useExploreRoute()
  return route.view
}

export function useNavigateExplore() {
  return useCallback((target) => {
    if (target === 'companies') navigateExploreCompanies()
    else if (target === 'actors') navigateExploreActors()
    else navigateExploreHome()
  }, [])
}
