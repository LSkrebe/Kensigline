import { useEffect, useRef, useState } from 'react'

/**
 * Fade/slide sections in on scroll — improves scanability vs one long wall of text.
 */
export function IntroReveal({ as: Tag = 'div', children, className = '', delay = 0, eager = false, ...rest }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true)
      return
    }

    const scrollRoot = el.closest('.introPage') ?? el.closest('.subscribePage')
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      {
        root: scrollRoot,
        threshold: eager ? 0.02 : 0.08,
        rootMargin: eager ? '0px 0px 20% 0px' : '0px 0px -6% 0px',
      },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const classes = ['introReveal', visible ? 'introReveal--in' : '', className].filter(Boolean).join(' ')

  return (
    <Tag ref={ref} className={classes} style={{ '--reveal-delay': `${delay}ms` }} {...rest}>
      {children}
    </Tag>
  )
}
