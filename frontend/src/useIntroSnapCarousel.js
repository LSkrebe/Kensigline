import { useCallback, useEffect, useState } from 'react'

const NARROW = '(max-width: 899px)'

/**
 * Snap-carousel active index + scrollTo for a horizontal track.
 * `itemSelector` should match direct slide children inside the track.
 */
export function useIntroSnapCarousel(trackRef, itemSelector, deps = []) {
  const [active, setActive] = useState(0)
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(NARROW).matches : false,
  )

  useEffect(() => {
    const query = window.matchMedia(NARROW)
    const sync = () => setNarrow(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  const scrollTo = useCallback(
    (index, behavior = 'smooth') => {
      const track = trackRef.current
      if (!track) return
      const slides = [...track.querySelectorAll(itemSelector)]
      const slide = slides[index]
      if (!slide) return
      if (!window.matchMedia(NARROW).matches) {
        setActive(index)
        return
      }
      const pad = parseFloat(getComputedStyle(track).paddingLeft) || 0
      // Center-snapped slides (pricing) vs start-snapped (product / together)
      const snapAlign = getComputedStyle(slide).scrollSnapAlign
      let left = slide.offsetLeft - pad
      if (snapAlign === 'center') {
        left = slide.offsetLeft - (track.clientWidth - slide.offsetWidth) / 2
      }
      track.scrollTo({ left: Math.max(0, left), behavior })
      setActive(index)
    },
    [trackRef, itemSelector],
  )

  useEffect(() => {
    const track = trackRef.current
    if (!track) return undefined

    const sync = () => {
      if (!window.matchMedia(NARROW).matches) {
        setActive(0)
        return
      }
      const slides = [...track.querySelectorAll(itemSelector)]
      if (!slides.length) return
      const pad = parseFloat(getComputedStyle(track).paddingLeft) || 0
      const x = track.scrollLeft + track.clientWidth / 2
      let best = 0
      let bestDist = Infinity
      slides.forEach((slide, index) => {
        const mid = slide.offsetLeft + slide.offsetWidth / 2
        const dist = Math.abs(mid - (track.scrollLeft + pad + (track.clientWidth - pad * 2) / 2))
        // Prefer midpoint vs viewport center
        const distCenter = Math.abs(mid - x)
        const d = Math.min(dist, distCenter)
        if (d < bestDist) {
          bestDist = d
          best = index
        }
      })
      setActive(best)
    }

    track.addEventListener('scroll', sync, { passive: true })
    sync()
    return () => track.removeEventListener('scroll', sync)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackRef, itemSelector, ...deps])

  return { active, setActive, scrollTo, narrow }
}
