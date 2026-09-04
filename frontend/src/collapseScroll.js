import { useEffect, useLayoutEffect, useRef } from 'react'

export function applyCollapseProgress({ page, dock, spacer, progressVars, rangeFallback = 1 }) {
  if (!page || !dock) return
  const range = spacer?.offsetHeight || rangeFallback
  const progress = Math.min(1, Math.max(0, page.scrollTop / range))
  for (const [key, value] of Object.entries(progressVars(progress))) {
    dock.style.setProperty(key, value)
  }
}

export function resetCollapseScroller({ page, dock, spacer, progressVars, rangeFallback = 1 }) {
  if (!page) return
  page.scrollTop = 0
  applyCollapseProgress({ page, dock, spacer, progressVars, rangeFallback })
}

/**
 * Inner scroll + sticky collapse header. Resets scrollTop when resetKey changes
 * (route/subview) and when the page is restored from bfcache.
 */
export function useCollapseScroll({ progressVars, resetKey, rangeFallback = 1 }) {
  const pageRef = useRef(null)
  const dockRef = useRef(null)
  const spacerRef = useRef(null)
  const progressVarsRef = useRef(progressVars)
  progressVarsRef.current = progressVars

  useLayoutEffect(() => {
    const page = pageRef.current
    const dock = dockRef.current
    const spacer = spacerRef.current
    if (!page) return
    page.scrollTop = 0
    const sync = () =>
      applyCollapseProgress({
        page,
        dock,
        spacer,
        progressVars: progressVarsRef.current,
        rangeFallback,
      })
    requestAnimationFrame(() => {
      requestAnimationFrame(sync)
    })
  }, [resetKey, rangeFallback])

  useEffect(() => {
    const page = pageRef.current
    const dock = dockRef.current
    const spacer = spacerRef.current
    if (!page || !dock) return undefined

    let raf = 0

    const syncCollapse = () => {
      raf = 0
      applyCollapseProgress({
        page,
        dock,
        spacer,
        progressVars: progressVarsRef.current,
        rangeFallback,
      })
    }

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(syncCollapse)
    }

    const onResize = () => {
      if (!raf) raf = requestAnimationFrame(syncCollapse)
    }

    const onPageShow = (event) => {
      if (!event.persisted) return
      resetCollapseScroller({
        page,
        dock,
        spacer,
        progressVars: progressVarsRef.current,
        rangeFallback,
      })
    }

    page.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    window.addEventListener('pageshow', onPageShow)
    syncCollapse()

    return () => {
      page.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pageshow', onPageShow)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [resetKey, rangeFallback])

  return { pageRef, dockRef, spacerRef }
}

export function installManualScrollRestoration() {
  if (typeof window === 'undefined') return
  if ('scrollRestoration' in window.history) {
    window.history.scrollRestoration = 'manual'
  }
}
