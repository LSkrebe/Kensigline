import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

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

  useEffect(() => {
    setVisibleCount(pageSize)
  }, [rows, pageSize, resetKey])

  const visibleRows = useMemo(() => rows.slice(0, visibleCount), [rows, visibleCount])
  const hasMore = visibleCount < rows.length
  const remaining = Math.max(0, rows.length - visibleCount)

  const loadMore = useCallback(
    (amount = step) => {
      setVisibleCount((n) => Math.min(rows.length, n + amount))
    },
    [rows.length, step],
  )

  useEffect(() => {
    if (compact) return undefined
    const root = scrollRootRef?.current
    const sentinel = sentinelRef.current
    if (!root || !sentinel || !hasMore) return undefined

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore(step)
      },
      { root, rootMargin: '160px 0px', threshold: 0 },
    )

    io.observe(sentinel)
    return () => io.disconnect()
  }, [compact, hasMore, loadMore, scrollRootRef, step, visibleCount])

  return { visibleRows, hasMore, remaining, loadMore, sentinelRef }
}
