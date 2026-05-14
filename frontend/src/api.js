import { supabase } from './supabaseClient.js'

export function getBackendBase() {
  const env = typeof import.meta !== 'undefined' ? import.meta.env : {}
  return String(
    env?.API_BASE_URL || env?.VITE_BACKEND_URL || env?.VITE_API_BASE_URL || 'http://localhost:3001',
  ).replace(/\/$/, '')
}

export async function fetchJsonSafe(path, { timeoutMs = 4500, headers: extraHeaders } = {}) {
  const base = getBackendBase()
  const headers = new Headers(extraHeaders ?? undefined)
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
    const res = await fetch(`${base}${path}`, { signal: ctrl.signal, headers })
    if (!res.ok) return { ok: false, status: res.status, data: null }
    const data = await res.json()
    return { ok: true, status: res.status, data }
  } catch {
    return { ok: false, status: 0, data: null }
  } finally {
    clearTimeout(t)
  }
}
