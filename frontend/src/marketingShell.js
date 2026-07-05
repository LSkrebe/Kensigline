/** Flip on once the first route shell is ready to paint (avoids static → unstyled → styled flashes). */
export function markAppReady() {
  if (typeof document === 'undefined') return
  document.documentElement.classList.add('app-ready')
}
