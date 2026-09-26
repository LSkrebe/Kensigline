import { useCallback, useEffect, useState } from 'react'
import { fetchJsonSafe } from './api.js'
import { useAuth } from './AuthContext.jsx'
import { isDataModePending, isLiveDataMode } from './dataMode.js'
import { AuthSignIn } from './AuthSignIn.jsx'
import { DeepCompactChrome } from './DeepCompactChrome.jsx'
import { SkeletonField, SkeletonStatus } from './AppSkeleton.jsx'
import './ExplorePage.css'
import './SettingsPage.css'

const SUPPORT_EMAIL = 'research@mercerline.com'
/** FormSubmit inbox — same path as waitlist; lands in founders Gmail (no Brevo/Hetzner). */
const SUPPORT_NOTIFY_TO = 'lm.skrebe@gmail.com'

function formatBillingStatus(status) {
  const s = String(status ?? 'none').trim()
  if (!s || s === 'none') return 'Not subscribed'
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatPeriodEnd(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return '—'
  }
}

function formatPlan(plan) {
  if (!plan) return '—'
  return plan === 'yearly' ? 'Yearly' : plan === 'monthly' ? 'Monthly' : String(plan)
}

/** @returns {'good' | 'bad' | 'neutral'} */
function settingsStatusTone(status) {
  const s = String(status ?? '').trim().toLowerCase()
  if (!s) return 'neutral'
  const good = new Set(['paid', 'succeeded', 'complete', 'completed', 'active', 'trialing', 'trial'])
  const bad = new Set([
    'failed',
    'unpaid',
    'overdue',
    'void',
    'declined',
    'past_due',
    'past due',
    'canceled',
    'cancelled',
    'open',
    'uncollectible',
    'inactive',
    'expired',
  ])
  if (good.has(s)) return 'good'
  if (bad.has(s)) return 'bad'
  return 'neutral'
}

const INVOICES_EMPTY_HINT =
  'Download invoices and update your payment method in Whop via Manage billing.'

function SettingsStrip({ backendUp, onSettingsClick, onBrandClick = null }) {
  return (
    <div className="stgDock">
      <DeepCompactChrome
        backendUp={backendUp}
        onBrandClick={onBrandClick}
        onCloseClick={onSettingsClick}
        hideTrail
        showShare={false}
        closeAriaLabel="Close"
      />
      <p className="stgCollapsedName">Settings</p>
    </div>
  )
}

function SettingsPageShell({ backendUp, onSettingsClick, onBrandClick = null, children }) {
  return (
    <div className="stgShell">
      <SettingsStrip backendUp={backendUp} onSettingsClick={onSettingsClick} onBrandClick={onBrandClick} />
      <div className="stgScroll scrollThin">
        <div className="stgPaper">{children}</div>
      </div>
    </div>
  )
}

function SettingsSection({ title, headAside = null, children, footer, panelClassName = '' }) {
  const hasBody = children != null && children !== false
  const flushTable = panelClassName.includes('flushTable')
  return (
    <section className="stgSection">
      {title || headAside ? (
        <header className="stgSectionHead">
          {title ? <h2 className="stgSectionTitle">{title}</h2> : null}
          {headAside}
        </header>
      ) : null}
      {hasBody ? (
        <div className={['stgPanel', panelClassName].filter(Boolean).join(' ')}>
          {flushTable ? children : <div className="stgPanelBody">{children}</div>}
          {footer ? <footer className="stgPanelFoot">{footer}</footer> : null}
        </div>
      ) : null}
    </section>
  )
}

function SettingsField({ label, sublabel, children, valueTone, className = '' }) {
  return (
    <div className={['stgField', className].filter(Boolean).join(' ')}>
      {sublabel ? (
        <div className="stgFieldLabelGroup">
          <span className="stgFieldLabel">{label}</span>
          <span className="stgFieldSublabel">{sublabel}</span>
        </div>
      ) : (
        <span className="stgFieldLabel">{label}</span>
      )}
      <span
        className={['stgFieldValue', valueTone ? `stgFieldValue--${valueTone}` : '']
          .filter(Boolean)
          .join(' ')}
      >
        {children}
      </span>
    </div>
  )
}



function DigestPreferencesSection({ email, signedIn }) {
  const [prefs, setPrefs] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(null)

  const timezone =
    typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      : 'UTC'

  useEffect(() => {
    if (!signedIn) {
      setPrefs(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    void fetchJsonSafe(`/api/alerts/preferences?timezone=${encodeURIComponent(timezone)}`).then((res) => {
      if (cancelled) return
      setPrefs(res.ok ? res.data?.preferences ?? null : null)
      setStatus(res.ok ? null : { ok: false, text: 'Could not load email preferences. Reload to try again.' })
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [signedIn, email, timezone])

  const savePrefs = useCallback(
    async (patch) => {
      if (saving) return
      setSaving(true)
      setStatus(null)
      const res = await fetchJsonSafe('/api/alerts/preferences', {
        method: 'PUT',
        timeoutMs: 12_000,
        body: {
          timezone,
          ...(email && email !== '—' ? { email } : {}),
          ...patch,
        },
      })
      setSaving(false)
      if (res.ok) {
        setPrefs(res.data?.preferences ?? prefs)
        setStatus({
          ok: true,
          text: patch.enabled === false ? 'Filing brief turned off.' : 'Filing brief enabled.',
        })
        return
      }
      const code = String(res.data?.error ?? '')
      const detail =
        code === 'email_required'
          ? 'Sign in again so we can attach your email.'
          : code === 'unauthorized'
            ? 'Session expired — sign in again.'
            : code
              ? `Could not update email preferences (${code}).`
              : 'Could not update email preferences.'
      setStatus({ ok: false, text: detail })
    },
    [email, prefs, saving, timezone],
  )

  const enabled = prefs?.enabled === true

  return (
    <section className="stgCard">
      <p className="stgCardLabel">Filing brief</p>
      <p className="stgCardValue">{loading ? <SkeletonField /> : 'Email digest'}</p>
      <p className="stgCardMeta" title={email}>{email}</p>
      <p className="stgCardMeta">{timezone}</p>
      {status ? (
        <p
          className={['stgSupportHint', status.ok === true ? 'isOk' : '', status.ok === false ? 'isBad' : '']
            .filter(Boolean)
            .join(' ')}
          role="status"
        >
          {status.text}
        </p>
      ) : null}
      <div className="stgCardAction">
        <label className="stgSwitch" aria-label="Filing email brief">
          <input
            type="checkbox"
            className="stgSwitchInput"
            checked={enabled}
            disabled={loading || saving || !prefs}
            onChange={(e) => void savePrefs({ enabled: e.target.checked })}
          />
          <span className="stgSwitchTrack" aria-hidden="true">
            <span className="stgSwitchThumb" />
          </span>
        </label>
      </div>
    </section>
  )
}

export function SettingsPanel({
  backendUp = false,
  onSettingsClick,
  onBrandClick = null,
}) {
  const { configured, loading, user, signOut } = useAuth()
  const [portalBusy, setPortalBusy] = useState(false)
  const [supportMessage, setSupportMessage] = useState('')
  const [supportBusy, setSupportBusy] = useState(false)
  const [supportStatus, setSupportStatus] = useState(null)
  const [billing, setBilling] = useState(null)
  const [billingLoading, setBillingLoading] = useState(false)
  const signedIn = Boolean(configured && !loading && user)

  const onManageBilling = useCallback(async () => {
    setPortalBusy(true)
    const res = await fetchJsonSafe('/api/billing/portal', { method: 'POST', timeoutMs: 20000 })
    setPortalBusy(false)
    if (res.ok && res.data?.url) {
      window.location.href = res.data.url
    }
  }, [])

  const onSendSupport = useCallback(async () => {
    const message = supportMessage.trim()
    if (!message || supportBusy) return
    setSupportBusy(true)
    setSupportStatus(null)
    const fromEmail = String(user?.email ?? '').trim()
    try {
      const r = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(SUPPORT_NOTIFY_TO)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          email: fromEmail || 'unknown',
          _replyto: fromEmail || undefined,
          _subject: `Mercerline support${fromEmail ? `: ${fromEmail}` : ''}`,
          _template: 'table',
          message,
          source: 'mercerline.com/settings',
          billing_status: billing?.status ?? 'unknown',
          billing_plan: billing?.plan ?? 'unknown',
        }),
      })
      const data = await r.json().catch(() => null)
      const msg = String(data?.message ?? '').toLowerCase()
      const activatedPending = msg.includes('activate') || data?.success === 'false' || data?.success === false
      if (r.ok || activatedPending) {
        setSupportMessage('')
        setSupportStatus({ ok: true, text: 'Sent — we reply by email.' })
        return
      }
      setSupportStatus({ ok: false, text: 'Could not send right now. Try again or email us directly.' })
    } catch {
      setSupportStatus({ ok: false, text: 'Could not send right now. Try again or email us directly.' })
    } finally {
      setSupportBusy(false)
    }
  }, [billing?.plan, billing?.status, supportBusy, supportMessage, user?.email])

  useEffect(() => {
    if (!signedIn) {
      setBilling(null)
      return
    }
    let cancelled = false
    setBillingLoading(true)
    void fetchJsonSafe('/api/billing/status').then((res) => {
      if (cancelled) return
      setBilling(res.ok ? res.data : null)
      setBillingLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [signedIn])

  if (!signedIn) {
    return (
      <SettingsPageShell backendUp={backendUp} onSettingsClick={onSettingsClick} onBrandClick={onBrandClick}>
        <SettingsSection title="Sign in" panelClassName="stgSignInPanel">
          {loading ? (
            <SkeletonStatus label="Loading session" className="appSkelReturn">
              <span className="appSkel appSkel--title" />
              <span className="appSkel appSkel--sub" />
            </SkeletonStatus>
          ) : (
            <AuthSignIn variant="settings" />
          )}
        </SettingsSection>
      </SettingsPageShell>
    )
  }

  const email = user.email ?? '—'

  const sessionLive = isLiveDataMode(backendUp)
  const billingTone = billing?.active ? 'good' : settingsStatusTone(billing?.status)

  return (
    <SettingsPageShell backendUp={backendUp} onSettingsClick={onSettingsClick} onBrandClick={onBrandClick}>
      <div className="stgCards">
        <section className="stgCard">
          <p className="stgCardLabel">Account</p>
          <h2 className="stgCardTitle" title={email}>{email}</h2>
          <p className={['stgCardMeta', sessionLive ? 'isLive' : ''].filter(Boolean).join(' ')}>
            {sessionLive ? 'Live' : isDataModePending(backendUp) ? 'Connecting…' : 'Offline'}
          </p>
          <div className="stgCardAction">
            <button type="button" className="stgBtn" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        </section>

        <section className="stgCard">
          <p className="stgCardLabel">Subscription</p>
          <p className={['stgCardValue', billingLoading ? '' : `is-${billingTone}`].filter(Boolean).join(' ')}>
            {billingLoading ? <SkeletonField /> : formatBillingStatus(billing?.status)}
          </p>
          <p className="stgCardMeta">{billingLoading ? <SkeletonField /> : formatPlan(billing?.plan)}</p>
          <p className="stgCardMeta">
            {billingLoading ? <SkeletonField /> : `Renews ${formatPeriodEnd(billing?.current_period_end)}`}
          </p>
          <div className="stgCardAction">
            <button
              type="button"
              className="stgBtn"
              disabled={portalBusy}
              onClick={() => void onManageBilling()}
            >
              {portalBusy ? 'Opening…' : 'Manage billing'}
            </button>
          </div>
        </section>

        <DigestPreferencesSection email={email} signedIn={signedIn} />

        <section className="stgCard stgCard--wide">
          <p className="stgCardLabel">Invoices</p>
          <p className="stgCardMeta">{INVOICES_EMPTY_HINT}</p>
        </section>

        <section className="stgCard stgCard--wide stgComposer">
          <p className="stgCardLabel">Talk to the founders</p>
        <textarea
          className="stgSupportTextarea"
          rows={4}
          maxLength={4000}
          placeholder="Bug, billing, or idea…"
          value={supportMessage}
          onChange={(e) => {
            setSupportMessage(e.target.value)
            if (supportStatus) setSupportStatus(null)
          }}
          aria-label="Message to founders"
        />
        <div className="stgSupportActions">
          <p
            className={[
              'stgSupportHint',
              supportStatus?.ok === true ? 'isOk' : '',
              supportStatus?.ok === false ? 'isBad' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            role={supportStatus ? 'status' : undefined}
          >
            {supportStatus ? supportStatus.text : SUPPORT_EMAIL}
          </p>
          <button
            type="button"
            className="stgBtn"
            disabled={supportBusy || !supportMessage.trim()}
            onClick={() => void onSendSupport()}
          >
            {supportBusy ? 'Sending…' : 'Send'}
          </button>
        </div>
      </section>
      </div>
    </SettingsPageShell>
  )
}
