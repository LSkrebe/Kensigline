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
    const result = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (result.data?.session) syncTokenFromSession(result.data.session)
    return result
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
    const result = await supabase.auth.signOut()
    clearAuthTokenCache()
    return result
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
