import { useEffect, useState } from 'react'
import { WAITLIST, WAITLIST_PAGE_META } from './marketingContent.js'
import { navigateMarketing } from './marketingRoute.js'
import { pageBackgroundStyle } from './pageBackgrounds.js'
import { applyPageMeta } from './pageMeta.js'
import { markAppReady } from './marketingShell.js'
import './IntroPage.css'
import './IntroPage.marketing.css'
import './SignInPage.css'
import './WaitlistPage.css'

/** Where waitlist pings land (FormSubmit from the browser — avoids Hetzner/Brevo). */
const WAITLIST_NOTIFY_TO = 'lm.skrebe@gmail.com'

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
      // Browser → FormSubmit (datacenter IPs get CF-challenged; browsers usually work).
      const r = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(WAITLIST_NOTIFY_TO)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          email: trimmed,
          _subject: `Mercerline waitlist: ${trimmed}`,
          _template: 'table',
          message: `New waitlist signup: ${trimmed}`,
          source: 'mercerline.com/waitlist',
        }),
      })
      const data = await r.json().catch(() => null)
      const msg = String(data?.message ?? '').toLowerCase()
      const activatedPending = msg.includes('activate') || data?.success === 'false' || data?.success === false
      if (r.ok || activatedPending) {
        setDone(true)
        return
      }
      setError('Could not join right now. Try again in a moment.')
    } catch {
      setError('Could not join right now. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="lp authPage waitlistPage" style={pageBackgroundStyle('waitlist')}>
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
