import { useCallback, useEffect, useState } from 'react'

export function normalizeMarketingPath(pathname = '/') {
  const raw = String(pathname || '/').replace(/\/$/, '')
  return raw || '/'
}

export function readMarketingPath() {
  if (typeof window === 'undefined') return '/'
  return normalizeMarketingPath(window.location.pathname)
}

/** Client-side path for intro / sign-in without react-router. */
export function useMarketingPath() {
  const [path, setPath] = useState(readMarketingPath)

  useEffect(() => {
    const onPop = () => setPath(readMarketingPath())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  return path
}

export function navigateMarketing(path) {
  if (typeof window === 'undefined') return
  const next = path.startsWith('/') ? path : `/${path}`
  const url = new URL(next, window.location.origin)
  const samePath = normalizeMarketingPath(window.location.pathname) === normalizeMarketingPath(url.pathname)
  const sameHash = window.location.hash === url.hash
  if (samePath && sameHash) return
  window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

/** After auth sign-out from marketing pages — return to intro. */
export function returnToIntroAfterSignOut() {
  if (typeof window === 'undefined') return
  window.history.replaceState(null, '', '/')
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function useNavigateMarketing() {
  return useCallback((path) => navigateMarketing(path), [])
}
