import { useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import './IntroPage.css'

/**
 * Shared email/password sign-in. Used on the intro page and in Settings.
 */
export function AuthSignIn({ variant = 'settings', onSuccess }) {
  const { configured, signInWithPassword, signUpWithPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const rootClass = ['authSignIn', variant === 'intro' ? 'authSignIn--intro' : 'authSignIn--settings']
    .filter(Boolean)
    .join(' ')

  if (!configured) {
    return (
      <div className="authSignInNote mono dim">
        Auth is not configured. Add <span className="mono">SUPABASE_URL</span> and{' '}
        <span className="mono">SUPABASE_ANON_KEY</span> to the repository root <span className="mono">.env</span>, then
        restart <span className="mono">npm run dev</span>.
      </div>
    )
  }

  return (
    <div className={rootClass}>
      <form
        className="authSignInForm"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setMsg('')
          const { error } = await signInWithPassword(email, password)
          setBusy(false)
          if (error) setMsg(error.message || String(error))
          else onSuccess?.()
        }}
      >
        <label className="authSignInLabel">
          <span className="authSignInLabelText">Email</span>
          <input
            className="authSignInInput mono"
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="authSignInLabel">
          <span className="authSignInLabelText">Password</span>
          <input
            className="authSignInInput mono"
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <div className="authSignInActions">
          <button type="submit" className="authSignInBtn authSignInBtn--primary" disabled={busy}>
            Sign in
          </button>
          <button
            type="button"
            className="authSignInBtn"
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
        </div>
      </form>
      {msg ? (
        <p className="authSignInMsg mono" role="status">
          {msg}
        </p>
      ) : null}
    </div>
  )
}
