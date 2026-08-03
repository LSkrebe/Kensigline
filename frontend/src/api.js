import { supabase } from './supabaseClient.js'

let cachedAuthToken = null
let cachedAuthTokenAt = 0
const AUTH_TOKEN_TTL_MS = 90_000

/** Drop cached bearer — call on sign-out / account switch. */
export function clearAuthTokenCache() {
  cachedAuthToken = null
  cachedAuthTokenAt = 0
}

/** Prefer the live session token so billing checks never use another user’s JWT. */
export function setAuthTokenCache(token) {
  const tok = String(token ?? '').trim()
  if (!tok) {
    clearAuthTokenCache()
    return
  }
  cachedAuthToken = tok
  cachedAuthTokenAt = Date.now()
}

function supabaseTokenFromLocalStorage() {
  if (typeof window === 'undefined' || !window.localStorage) return null
  try {
    const keys = Object.keys(window.localStorage)
    const key = keys.find((k) => k.startsWith('sb-') && k.toLowerCase().includes('auth-token'))
    if (!key) return null
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw)
      return parsed?.access_token ?? parsed?.session?.access_token ?? parsed?.token ?? null
    } catch {
      return raw
    }
  } catch {
    return null
  }
}

async function resolveAuthToken(timeoutMs) {
  const now = Date.now()
  const fromStorage = supabaseTokenFromLocalStorage()

  /* Storage is source of truth — never return a cached token that no longer matches. */
  if (fromStorage) {
    if (
      cachedAuthToken === fromStorage &&
      now - cachedAuthTokenAt < AUTH_TOKEN_TTL_MS
    ) {
      return cachedAuthToken
    }
    setAuthTokenCache(fromStorage)
    return fromStorage
  }

  /* Signed out (or storage cleared) — do not reuse a previous user’s token. */
  if (cachedAuthToken) clearAuthTokenCache()

  if (!supabase) return null

  let sessionRes = null
  try {
    const sessionTimeoutMs = Math.max(300, Math.min(timeoutMs, 1500))
    sessionRes = await Promise.race([
      supabase.auth.getSession(),
      new Promise((resolve) => setTimeout(() => resolve(null), sessionTimeoutMs)),
    ])
  } catch {
    sessionRes = null
  }

  const tok = sessionRes?.data?.session?.access_token ?? supabaseTokenFromLocalStorage()
  if (tok) setAuthTokenCache(tok)
  return tok
}

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

  const tok = await resolveAuthToken(timeoutMs)
  if (tok) headers.set('Authorization', `Bearer ${tok}`)

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
