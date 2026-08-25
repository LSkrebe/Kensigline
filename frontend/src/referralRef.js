const REF_KEY = 'ml.ref'

/** Capture ?r= from URL (e.g. ig47, yt12) and persist for checkout metadata. */
export function captureReferralRef() {
  if (typeof window === 'undefined') return null
  try {
    const params = new URLSearchParams(window.location.search)
    const fromUrl = params.get('r')?.trim().slice(0, 32)
    if (fromUrl) {
      sessionStorage.setItem(REF_KEY, fromUrl)
      return fromUrl
    }
    return sessionStorage.getItem(REF_KEY)
  } catch {
    return null
  }
}

export function peekReferralRef() {
  if (typeof window === 'undefined') return null
  try {
    return sessionStorage.getItem(REF_KEY)
  } catch {
    return null
  }
}
