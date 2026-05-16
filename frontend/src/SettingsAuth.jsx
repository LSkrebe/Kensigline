import { useCallback, useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import { AuthSignIn } from './AuthSignIn.jsx'
import { fetchJsonSafe } from './api.js'

export function SettingsAuth() {
  const { configured, loading, user, signOut } = useAuth()
  const [apiUser, setApiUser] = useState(null)
  const [msg, setMsg] = useState('')

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
    return <AuthSignIn variant="settings" />
  }

  if (loading) {
    return (
      <div className="settingsAuthNote mono dim" aria-live="polite">
        Loading session…
      </div>
    )
  }

  if (!user) {
    return <AuthSignIn variant="settings" onSuccess={probeApi} />
  }

  return (
    <div className="settingsAuthBlock">
      <div className="settingsKv">
        <div className="settingsKvRow">
          <div className="settingsKvK">Signed in</div>
          <div className="settingsKvV mono">{user.email ?? '—'}</div>
        </div>
        {apiUser ? (
          <div className="settingsKvRow">
            <div className="settingsKvK">API user</div>
            <div className="settingsKvV mono dim">{apiUser.sub}</div>
          </div>
        ) : null}
      </div>
      <div className="settingsAuthActions">
        <button type="button" className="settingsBtn" onClick={() => void probeApi()}>
          Verify API session
        </button>
        <button
          type="button"
          className="settingsBtn"
          onClick={async () => {
            setMsg('')
            await signOut()
            setApiUser(null)
          }}
        >
          Sign out
        </button>
      </div>
      {msg ? (
        <p className="settingsAuthMsg mono dim" role="status">
          {msg}
        </p>
      ) : null}
    </div>
  )
}
