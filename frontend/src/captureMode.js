/** Local screenshot / marketing capture: `?capture=1` (dev only). */

export function isCaptureMode() {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).has('capture')
}
