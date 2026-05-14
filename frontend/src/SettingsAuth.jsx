import { useCallback, useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import { fetchJsonSafe } from './api.js'

export function SettingsAuth() {
  const { configured, loading, user, signInWithPassword, signUpWithPassword, signInWithOtp, signOut } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [apiUser, setApiUser] = useState(null)

  const probeApi = useCallback(async () => {
    setMsg('')
    const r = await fetchJsonSafe('/api/auth/me', { timeoutMs: 8000 })
    if (!r.ok) {
      setApiUser(null)
      if (r.status === 401) setMsg('API: not signed in or token rejected.')
      else if (r.status === 503) setMsg('API: set SUPABASE_URL in the repo root .env for JWT verification.')
      else setMsg(`API: error (${r.status}).`)
      return
    }
    if (r.data?.ok && r.data?.user) setApiUser(r.data.user)
    else setMsg('API: unexpected response.')
  }, [])

  if (!configured) {
    return (
      <div className="settingsAuthNote mono dim">
        Supabase auth is not configured. Add <span className="mono">SUPABASE_URL</span> and{' '}
        <span className="mono">SUPABASE_ANON_KEY</span> to the repository root <span className="mono">.env</span> (see root{' '}
        <span className="mono">.env.example</span>), then restart <span className="mono">npm run dev</span>. Keys: Project
        Settings → API.
      </div>
    )
  }

  if (loading) {
    return (
      <div className="settingsAuthNote mono dim" aria-live="polite">
        Loading session…
      </div>
    )
  }

  return (
    <div className="settingsAuthBlock">
      <div className="settingsKv">
        <div className="settingsKvRow">
          <div className="settingsKvK">Signed in</div>
          <div className="settingsKvV mono">{user?.email ?? '—'}</div>
        </div>
        {apiUser ? (
          <div className="settingsKvRow">
            <div className="settingsKvK">API user</div>
            <div className="settingsKvV mono dim">{apiUser.sub}</div>
          </div>
        ) : null}
      </div>

      {user ? (
        <div className="settingsAuthActions">
          <button type="button" className="settingsBtn" disabled={busy} onClick={() => void probeApi()}>
            Verify API session
          </button>
          <button
            type="button"
            className="settingsBtn"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              setMsg('')
              await signOut()
              setApiUser(null)
              setBusy(false)
            }}
          >
            Sign out
          </button>
        </div>
      ) : (
        <form
          className="settingsAuthForm"
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            setMsg('')
            const { error } = await signInWithPassword(email, password)
            setBusy(false)
            if (error) setMsg(error.message || String(error))
            else void probeApi()
          }}
        >
          <label className="settingsAuthLabel">
            <span className="mono dim">Email</span>
            <input
              className="settingsAuthInput mono"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="settingsAuthLabel">
            <span className="mono dim">Password</span>
            <input
              className="settingsAuthInput mono"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <div className="settingsAuthActions">
            <button type="submit" className="settingsBtn settingsBtn--primary" disabled={busy}>
              Sign in
            </button>
            <button
              type="button"
              className="settingsBtn"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                setMsg('')
                const { error } = await signUpWithPassword(email, password)
                setBusy(false)
                if (error) setMsg(error.message || String(error))
                else setMsg('Check your email to confirm the account if required, then sign in.')
              }}
            >
              Create account
            </button>
            <button
              type="button"
              className="settingsBtn"
              disabled={busy || !email.trim()}
              onClick={async () => {
                setBusy(true)
                setMsg('')
                const { error } = await signInWithOtp(email)
                setBusy(false)
                if (error) setMsg(error.message || String(error))
                else setMsg('Magic link sent — check your inbox.')
              }}
            >
              Email magic link
            </button>
          </div>
        </form>
      )}

      {msg ? (
        <p className="settingsAuthMsg mono dim" role="status">
          {msg}
        </p>
      ) : null}
    </div>
  )
}
