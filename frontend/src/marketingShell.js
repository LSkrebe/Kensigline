/** Flip on once the first route shell is ready to paint (avoids static → unstyled → styled flashes). */
export function markAppReady() {
  if (typeof document === 'undefined') return
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.documentElement.classList.add('app-ready')
    })
  })
}
