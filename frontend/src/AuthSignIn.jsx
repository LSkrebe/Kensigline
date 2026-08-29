import { useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import './IntroPage.css'

function GoogleMark() {
  return (
    <svg className="authOAuthIcon" width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303C33.654 32.657 29.223 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  )
}

/**
 * Settings: email + password (+ create account).
 * Intro / sign-in page: Google OAuth first, password optional for legacy accounts.
 */
export function AuthSignIn({ variant = 'settings', onSuccess }) {
  const { configured, signInWithPassword, signUpWithPassword, signInWithOAuth } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const isIntro = variant === 'intro'
  const rootClass = ['authSignIn', isIntro ? 'authSignIn--intro' : 'authSignIn--settings']
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

  if (isIntro) {
    return (
      <div className={rootClass}>
        <button
          type="button"
          className="authOAuthBtn authOAuthBtn--google"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setMsg('')
            const { error } = await signInWithOAuth('google')
            setBusy(false)
            if (error) setMsg(error.message || String(error))
          }}
        >
          <GoogleMark />
          {busy ? 'Opening Google…' : 'Continue with Google'}
        </button>

        <div className="authSignInDivider" role="presentation">
          <span>or</span>
        </div>

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
            <button type="submit" className="authSignInBtn authSignInBtn--primary authSignInBtn--full" disabled={busy}>
              Sign in with email
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
          if (error) {
            const m = error.message || String(error)
            setMsg(/not confirmed/i.test(m) ? `${m} — open the latest confirmation link, then try again.` : m)
          } else onSuccess?.()
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
