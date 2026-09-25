/** Shared intro scroll - sections live inside `.lp`, not window. */
const NAV_OFFSET = 64

export function scrollIntroToSection(sectionId, e) {
  e?.preventDefault?.()
  const scroller = document.querySelector('.lp')
  const target = document.getElementById(sectionId)
  if (!scroller || !target) return
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const top =
    target.getBoundingClientRect().top -
    scroller.getBoundingClientRect().top +
    scroller.scrollTop -
    NAV_OFFSET
  scroller.scrollTo({ top: Math.max(0, top), behavior: reduced ? 'instant' : 'smooth' })
  if (window.history?.pushState) window.history.pushState(null, '', `#${sectionId}`)
}

export function scrollIntroToPricing(e) {
  scrollIntroToSection('pricing', e)
}
