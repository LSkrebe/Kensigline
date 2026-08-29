import { useEffect, useRef, useState } from 'react'

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

function revealWhenReady(el, eager, setVisible) {
  const scrollRoot =
    el.closest('.lp') ?? el.closest('.introPage') ?? el.closest('.subscribePage')

  if (isInScrollView(el, scrollRoot, eager)) {
    setVisible(true)
    return undefined
  }

  const observer = new IntersectionObserver(
    ([entry]) => {
      if (!entry?.isIntersecting) return
      setVisible(true)
      observer.disconnect()
    },
    {
      root: scrollRoot,
      threshold: 0.12,
      rootMargin: '0px 0px -4% 0px',
    },
  )

  observer.observe(el)
  return () => observer.disconnect()
}

/** No-op kept for IntroPage reload hook (animations always replay on refresh). */
export function clearIntroRevealMemory() {}

/**
 * Fade/slide sections in on scroll - improves scanability vs one long wall of text.
 */
export function IntroReveal({
  as: Tag = 'div',
  children,
  className = '',
  delay = 0,
  eager = false,
  revealKey: _revealKey,
  ...rest
}) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined

    if (prefersReducedMotion()) {
      setVisible(true)
      return undefined
    }

    let cancelled = false
    let disconnectObserver = undefined
    let frame = 0

    const start = () => {
      if (cancelled) return
      disconnectObserver = revealWhenReady(el, eager, setVisible)
    }

    // Wait for intro scroll restore / layout before first reveal check.
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(start)
    })

    return () => {
      cancelled = true
      if (frame) cancelAnimationFrame(frame)
      disconnectObserver?.()
    }
  }, [eager])

  const classes = ['introReveal', visible ? 'introReveal--in' : '', className].filter(Boolean).join(' ')

  return (
    <Tag ref={ref} className={classes} style={{ '--reveal-delay': `${delay}ms` }} {...rest}>
      {children}
    </Tag>
  )
}
