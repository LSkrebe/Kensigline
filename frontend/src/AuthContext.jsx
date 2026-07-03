import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { completeAuthFromUrl } from './authCallback.js'
import { attachStoredReferralToUser } from './referral.js'
import { supabase } from './supabaseClient.js'

const AuthContext = createContext(undefined)

export function AuthProvider({ children }) {
  const configured = Boolean(supabase)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const referralAttachUserRef = useRef(null)

  useEffect(() => {
    const userId = session?.user?.id ?? null
    if (!userId || referralAttachUserRef.current === userId) return
    referralAttachUserRef.current = userId
    void attachStoredReferralToUser().catch((e) => {
      console.warn('[referral] attach failed', e)
    })
  }, [session?.user?.id])

  useEffect(() => {
    if (!supabase) {
      setSession(null)
      setLoading(false)
      return
    }
    let cancelled = false
    const bootTimeoutMs = 6000
    const timeoutId = window.setTimeout(() => {
      if (!cancelled) setLoading(false)
    }, bootTimeoutMs)

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!cancelled) setSession(next ?? null)
      setLoading(false)
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
    return supabase.auth.signInWithPassword({ email: email.trim(), password })
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
    return supabase.auth.signOut()
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
