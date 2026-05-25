import { supabase } from './supabaseClient.js'

export function getBackendBase() {
  /* Must use direct `import.meta.env.*` so Vite `define` injects root `.env` values (not only VITE_). */
  const configured = String(
    import.meta.env.API_BASE_URL ||
      import.meta.env.VITE_BACKEND_URL ||
      import.meta.env.VITE_API_BASE_URL ||
      '',
  ).replace(/\/$/, '')
  if (configured) return configured
  /* Vite dev proxy forwards /api → API_BASE_URL from vite.config (see server.proxy). */
  if (import.meta.env.DEV && typeof window !== 'undefined') return ''
  return 'http://localhost:3001'
}

export async function fetchJsonSafe(path, { timeoutMs = 4500, headers: extraHeaders, method = 'GET', body } = {}) {
  const base = getBackendBase()
  const headers = new Headers(extraHeaders ?? undefined)
  if (body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (supabase) {
    try {
      const { data } = await supabase.auth.getSession()
      const tok = data.session?.access_token
      if (tok) headers.set('Authorization', `Bearer ${tok}`)
    } catch {
      /* never block API calls (e.g. /health) if auth client errors */
    }
  }
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${base}${path}`, {
      signal: ctrl.signal,
      headers,
      method,
      body: body != null ? JSON.stringify(body) : undefined,
    })
    let data = null
    try {
      data = await res.json()
    } catch {
      data = null
    }
    if (!res.ok) return { ok: false, status: res.status, data }
    return { ok: true, status: res.status, data }
  } catch (err) {
    return { ok: false, status: 0, data: { error: 'network_error', message: String(err?.message ?? err) } }
  } finally {
    clearTimeout(t)
  }
}
