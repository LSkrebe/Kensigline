import { useCallback, useEffect, useState } from 'react'

export function normalizeMarketingPath(pathname = '/') {
  const raw = String(pathname || '/').replace(/\/$/, '')
  return raw || '/'
}

export function readMarketingPath() {
  if (typeof window === 'undefined') return '/'
  return normalizeMarketingPath(window.location.pathname)
}

/** Client-side path for intro / sign-in / subscribe preview without react-router. */
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
  if (normalizeMarketingPath(window.location.pathname) === normalizeMarketingPath(next)) return
  window.history.pushState(null, '', next)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

/** After auth sign-out from marketing pages - drop dev preview query and return to intro. */
export function returnToIntroAfterSignOut() {
  if (typeof window === 'undefined') return
  window.history.replaceState(null, '', '/')
  window.dispatchEvent(new PopStateEvent('popstate'))
}

/** Canonical public ticker URL — uppercase symbol; any casing in the path is accepted then normalized here. */
export function canonicalPublicTickerPath(ticker) {
  const t = String(ticker ?? '').trim().toUpperCase()
  return t ? `/ticker/${t}` : '/'
}

export function parsePublicTickerPath(pathname = '/') {
  const m = normalizeMarketingPath(pathname).match(/^\/(?:ticker|research|t)\/([A-Za-z0-9.-]+)$/i)
  return m ? String(m[1]).trim().toUpperCase() : null
}

export function useNavigateMarketing() {
  return useCallback((path) => navigateMarketing(path), [])
}
