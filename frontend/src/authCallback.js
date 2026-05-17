/**
 * Complete Supabase auth redirects (email confirm, PKCE code, legacy hash tokens).
 * Returns true when URL auth params were present (even if exchange failed).
 */
export async function completeAuthFromUrl(sb) {
  if (!sb || typeof window === 'undefined') return false

  const url = new URL(window.location.href)
  const code = url.searchParams.get('code')
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type')
  const hash = url.hash.replace(/^#/, '')

  let handled = false

  if (code) {
    handled = true
    const { error } = await sb.auth.exchangeCodeForSession(code)
    if (error) console.warn('[auth] code exchange failed:', error.message)
    stripAuthParamsFromUrl(url)
  }

  if (tokenHash && type) {
    handled = true
    const { error } = await sb.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    })
    if (error) console.warn('[auth] verifyOtp failed:', error.message)
    stripAuthParamsFromUrl(url)
  }

  if (!handled && hash && (hash.includes('access_token=') || hash.includes('error='))) {
    handled = true
    // detectSessionInUrl (implicit / magic-link hash) — refresh session from URL
    await sb.auth.getSession()
    stripAuthParamsFromUrl(url)
  }

  return handled
}

function stripAuthParamsFromUrl(url) {
  const clean = new URL(url.href)
  for (const key of ['code', 'token_hash', 'type', 'error', 'error_description', 'error_code']) {
    clean.searchParams.delete(key)
  }
  if (clean.hash && /access_token=|refresh_token=|error=/.test(clean.hash)) {
    clean.hash = ''
  }
  const next = `${clean.pathname}${clean.search}${clean.hash}`
  window.history.replaceState({}, document.title, next)
}
