import { useEffect, useRef, useState } from 'react'

/** Persists across StrictMode remounts so reveal animations do not replay. */
const revealedKeys = new Set()

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function isInScrollView(el, root, eager) {
  if (!el) return false
  const rect = el.getBoundingClientRect()
  const rootRect = root?.getBoundingClientRect() ?? {
    top: 0,
    left: 0,
    bottom: window.innerHeight,
    right: window.innerWidth,
  }
  const margin = eager ? 80 : 48
  return rect.bottom > rootRect.top + margin && rect.top < rootRect.bottom - margin
}

/**
 * Fade/slide sections in on scroll - improves scanability vs one long wall of text.
 * Pass a stable `revealKey` when the section can remount (avoids StrictMode double-fade).
 */
export function IntroReveal({
  as: Tag = 'div',
  children,
  className = '',
  delay = 0,
  eager = false,
  revealKey,
  ...rest
}) {
  const ref = useRef(null)
  const wasRevealed = useRef(Boolean(revealKey && revealedKeys.has(revealKey)))
  const [visible, setVisible] = useState(
    () => eager || wasRevealed.current || prefersReducedMotion(),
  )

  useEffect(() => {
    const el = ref.current
    if (!el) return

    if (prefersReducedMotion()) {
      setVisible(true)
      if (revealKey) revealedKeys.add(revealKey)
      return
    }

    if (revealKey && revealedKeys.has(revealKey)) {
      setVisible(true)
      return
    }

    const scrollRoot = el.closest('.introPage') ?? el.closest('.subscribePage')

    if (isInScrollView(el, scrollRoot, eager)) {
      if (revealKey) revealedKeys.add(revealKey)
      setVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        if (revealKey) revealedKeys.add(revealKey)
        setVisible(true)
        observer.disconnect()
      },
      {
        root: scrollRoot,
        threshold: 0.05,
        rootMargin: '0px 0px 8% 0px',
      },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [eager, revealKey])

  const classes = [
    'introReveal',
    visible ? 'introReveal--in' : '',
    wasRevealed.current ? 'introReveal--instant' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <Tag ref={ref} className={classes} style={{ '--reveal-delay': `${delay}ms` }} {...rest}>
      {children}
    </Tag>
  )
}
