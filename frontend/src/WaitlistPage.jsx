import { useEffect, useState } from 'react'
import { WAITLIST, WAITLIST_PAGE_META } from './marketingContent.js'
import { navigateMarketing } from './marketingRoute.js'
import { applyPageMeta } from './pageMeta.js'
import { markAppReady } from './marketingShell.js'
import { fetchJsonSafe } from './api.js'
import './IntroPage.css'
import './IntroPage.marketing.css'
import './SignInPage.css'
import './WaitlistPage.css'

export function WaitlistPage() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    applyPageMeta(WAITLIST_PAGE_META)
    markAppReady()
  }, [])

  const onSubmit = async (e) => {
    e.preventDefault()
    if (busy || done) return
    setError(null)
    const trimmed = String(email ?? '').trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Enter a valid email address.')
      return
    }
    setBusy(true)
    try {
      const r = await fetchJsonSafe('/api/waitlist', {
        method: 'POST',
        body: { email: trimmed },
        timeoutMs: 8000,
      })
      if (!r?.ok) {
        setError('Could not join right now. Try again in a moment.')
        setBusy(false)
        return
      }
      setDone(true)
    } catch {
      setError('Could not join right now. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="lp authPage waitlistPage">
      <header className="lpNav">
        <div className="lpNavInner">
          <a
            className="lpBrand"
            href="/"
            aria-label="Mercerline home"
            onClick={(e) => {
              e.preventDefault()
              navigateMarketing('/')
            }}
          >
            <span className="lpBrandLogoClip">
              <img className="lpBrandLogo" src="/mercerline_mark.png" alt="" width={44} height={32} decoding="async" />
            </span>
            <span className="lpBrandName">MERCERLINE</span>
          </a>
          <a
            className="lpNavCta"
            href="/"
            onClick={(e) => {
              e.preventDefault()
              navigateMarketing('/')
            }}
          >
            Back to home
          </a>
        </div>
      </header>

      <main className="authMain">
        <section className="authCard" aria-labelledby="waitlist-title">
          <p className="lpEyebrow lpEyebrow--waitlist">{WAITLIST.eyebrow}</p>
          <h1 id="waitlist-title" className="authTitle">
            {WAITLIST.headline}
          </h1>
          <p className="authLead">{WAITLIST.lead}</p>

          {done ? (
            <p className="waitlistSuccess" role="status">
              {WAITLIST.success}
            </p>
          ) : (
            <form className="waitlistForm" onSubmit={onSubmit}>
              <label className="waitlistLabel" htmlFor="waitlist-email">
                Email
              </label>
              <input
                id="waitlist-email"
                className="waitlistInput"
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                required
                placeholder={WAITLIST.placeholder}
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                disabled={busy}
              />
              {error ? (
                <p className="waitlistError" role="alert">
                  {error}
                </p>
              ) : null}
              <button className="lpBtn lpBtn--waitlist waitlistSubmit" type="submit" disabled={busy}>
                {busy ? 'Joining…' : WAITLIST.submit}
              </button>
            </form>
          )}
        </section>
      </main>
    </div>
  )
}
