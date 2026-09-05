import { useEffect, useLayoutEffect, useRef } from 'react'

export function applyCollapseProgress({ page, dock, spacer, progressVars, rangeFallback = 1 }) {
  if (!page || !dock) return
  const range = spacer?.offsetHeight || rangeFallback
  let progress = range > 0 ? page.scrollTop / range : 0
  if (page.scrollTop <= 1) progress = 0
  progress = Math.min(1, Math.max(0, progress))
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
    resetCollapseScroller({
      page,
      dock,
      spacer,
      progressVars: progressVarsRef.current,
      rangeFallback,
    })
    requestAnimationFrame(() => {
      resetCollapseScroller({
        page,
        dock,
        spacer,
        progressVars: progressVarsRef.current,
        rangeFallback,
      })
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
      const range = spacer?.offsetHeight || rangeFallback
      if (range > 0 && page.scrollTop > range) {
        page.scrollTop = range
      }
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

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (page.scrollTop <= 1) {
        resetCollapseScroller({
          page,
          dock,
          spacer,
          progressVars: progressVarsRef.current,
          rangeFallback,
        })
      } else {
        applyCollapseProgress({
          page,
          dock,
          spacer,
          progressVars: progressVarsRef.current,
          rangeFallback,
        })
      }
    }

    page.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    window.addEventListener('pageshow', onPageShow)
    document.addEventListener('visibilitychange', onVisible)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', onResize)
      window.visualViewport.addEventListener('scroll', onResize)
    }

    let resizeObserver = null
    if (typeof ResizeObserver !== 'undefined' && spacer) {
      resizeObserver = new ResizeObserver(onResize)
      resizeObserver.observe(spacer)
    }

    syncCollapse()

    return () => {
      page.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pageshow', onPageShow)
      document.removeEventListener('visibilitychange', onVisible)
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', onResize)
        window.visualViewport.removeEventListener('scroll', onResize)
      }
      resizeObserver?.disconnect()
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
