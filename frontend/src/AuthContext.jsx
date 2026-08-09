import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { clearAuthTokenCache, setAuthTokenCache } from './api.js'
import { completeAuthFromUrl } from './authCallback.js'
import { supabase } from './supabaseClient.js'

const AuthContext = createContext(undefined)

function syncTokenFromSession(session) {
  const tok = session?.access_token
  if (tok) setAuthTokenCache(tok)
  else clearAuthTokenCache()
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function isRetryableAuthError(error) {
  const msg = String(error?.message ?? error ?? '').toLowerCase()
  if (!msg) return false
  return (
    msg.includes('timed out') ||
    msg.includes('timeout') ||
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('504') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('upstream') ||
    msg.includes('failed to fetch')
  )
}

/**
 * Race a sign-in attempt against a per-attempt budget.
 * Supabase Auth can occasionally 504 under project load; we retry instead of
 * failing the first blip (same path for every user).
 */
async function attemptSignIn(email, password, timeoutMs) {
  return Promise.race([
    supabase.auth.signInWithPassword({ email, password }),
    new Promise((resolve) =>
      setTimeout(
        () =>
          resolve({
            data: { user: null, session: null },
            error: new Error('Sign-in timed out. Check your connection and try again.'),
          }),
        timeoutMs,
      ),
    ),
  ])
}

export function AuthProvider({ children }) {
  const configured = Boolean(supabase)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) {
      setSession(null)
      setLoading(false)
      clearAuthTokenCache()
      return
    }
    let cancelled = false
    const bootTimeoutMs = 6000
    const timeoutId = window.setTimeout(() => {
      if (!cancelled) setLoading(false)
    }, bootTimeoutMs)

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (cancelled) return
      /* Always realign bearer cache to this event’s session (SIGNED_OUT → clear). */
      syncTokenFromSession(next)
      setSession(next ?? null)
      setLoading(false)
      if (event === 'SIGNED_OUT') clearAuthTokenCache()
    })

    ;(async () => {
      try {
        await completeAuthFromUrl(supabase)
      } catch (e) {
        console.warn('[auth] redirect handling failed', e)
      }
      try {
        const { data } = await supabase.auth.getSession()
        if (!cancelled) {
          syncTokenFromSession(data.session)
          setSession(data.session ?? null)
          setLoading(false)
        }
      } catch (e) {
        console.warn('[auth] getSession failed', e)
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
      sub.subscription.unsubscribe()
    }
  }, [])

  const signInWithPassword = useCallback(async (email, password) => {
    if (!supabase) return { data: null, error: new Error('supabase_not_configured') }
    clearAuthTokenCache()
    const trimmed = email.trim()
    const attempts = 3
    const perAttemptMs = 20_000
    let last = null

    for (let i = 0; i < attempts; i++) {
      const result = await attemptSignIn(trimmed, password, perAttemptMs)
      last = result
      if (result?.data?.session) {
        syncTokenFromSession(result.data.session)
        return result
      }
      const err = result?.error
      if (!err || !isRetryableAuthError(err) || i === attempts - 1) {
        return result
      }
      await sleep(400 * (i + 1))
    }

    return last ?? { data: { user: null, session: null }, error: new Error('Sign-in failed') }
  }, [])

  const signUpWithPassword = useCallback(async (email, password) => {
    if (!supabase) return { data: null, error: new Error('supabase_not_configured') }
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/` : undefined
    return supabase.auth.signUp({
      email: email.trim(),
      password,
      options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
    })
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return { error: new Error('supabase_not_configured') }
    clearAuthTokenCache()
    /* Unlock UI immediately — never wait on a hung network revoke. */
    setSession(null)
    setLoading(false)
    try {
      const local = await Promise.race([
        supabase.auth.signOut({ scope: 'local' }),
        new Promise((resolve) => setTimeout(() => resolve({ error: null }), 1500)),
      ])
      clearAuthTokenCache()
      /* Best-effort server revoke; do not block the UI. */
      void supabase.auth.signOut({ scope: 'global' }).catch(() => {})
      return local ?? { error: null }
    } catch (error) {
      clearAuthTokenCache()
      return { error: error instanceof Error ? error : new Error(String(error)) }
    }
  }, [])

  const value = useMemo(
    () => ({
      configured,
      loading,
      session,
      user: session?.user ?? null,
      signInWithPassword,
      signUpWithPassword,
      signOut,
    }),
    [configured, loading, session, signInWithPassword, signUpWithPassword, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (ctx === undefined) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
