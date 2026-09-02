import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const SCROLL_ROOT_MARGIN_PX = 160

function isSentinelNearRoot(root, sentinel, marginPx = SCROLL_ROOT_MARGIN_PX) {
  if (!root || !sentinel) return false
  const rootRect = root.getBoundingClientRect()
  const sentinelRect = sentinel.getBoundingClientRect()
  return sentinelRect.top <= rootRect.bottom + marginPx
}

/**
 * Slice rows for progressive reveal with optional infinite scroll on wide layouts.
 */
export function useExploreScrollList({
  rows,
  pageSize,
  compact = false,
  scrollRootRef,
  loadStep = null,
  resetKey = '',
}) {
  const step = loadStep ?? pageSize
  const [visibleCount, setVisibleCount] = useState(pageSize)
  const sentinelRef = useRef(null)
  const rowsLengthRef = useRef(rows.length)
  rowsLengthRef.current = rows.length

  useEffect(() => {
    setVisibleCount(pageSize)
  }, [rows, pageSize, resetKey])

  const visibleRows = useMemo(() => rows.slice(0, visibleCount), [rows, visibleCount])
  const hasMore = visibleCount < rows.length
  const remaining = Math.max(0, rows.length - visibleCount)

  const loadMore = useCallback(
    (amount = step) => {
      setVisibleCount((n) => Math.min(rowsLengthRef.current, n + amount))
    },
    [step],
  )

  useEffect(() => {
    if (compact) return undefined
    const root = scrollRootRef?.current
    const sentinel = sentinelRef.current
    if (!root || !sentinel || !hasMore) return undefined

    const tryLoad = () => {
      if (!hasMore) return
      if (isSentinelNearRoot(root, sentinel)) loadMore(step)
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) tryLoad()
      },
      { root, rootMargin: `${SCROLL_ROOT_MARGIN_PX}px 0px`, threshold: 0 },
    )

    io.observe(sentinel)
    root.addEventListener('scroll', tryLoad, { passive: true })

    // IntersectionObserver only fires when visibility changes. After a batch
    // loads, the sentinel can stay in view — re-check once rows have painted.
    const raf = requestAnimationFrame(tryLoad)

    return () => {
      cancelAnimationFrame(raf)
      root.removeEventListener('scroll', tryLoad)
      io.disconnect()
    }
  }, [compact, hasMore, loadMore, scrollRootRef, step, visibleCount])

  return { visibleRows, hasMore, remaining, loadMore, sentinelRef }
}
