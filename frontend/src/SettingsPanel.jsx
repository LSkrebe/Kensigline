import { useCallback, useEffect, useState } from 'react'
import { fetchJsonSafe } from './api.js'
import { useAuth } from './AuthContext.jsx'
import { isDataModePending, isLiveDataMode } from './dataMode.js'
import { AuthSignIn } from './AuthSignIn.jsx'
import { TerminalTopBarChrome } from './TerminalTopBarChrome.jsx'
import './ExplorePage.css'
import './SettingsPage.css'

const SUPPORT_EMAIL = 'research@mercerline.com'

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
  'Download invoices and update your payment method in Stripe via Manage billing.'

function SettingsStrip({ backendUp, onSettingsClick, onBrandClick = null }) {
  return (
    <div className="stgDock">
      <div className="exploreRecapCompactBg" aria-hidden="true" />
      <TerminalTopBarChrome
        className="exploreRecapChrome"
        logoSrc="/mercerline_mark.png"
        backendUp={backendUp}
        settingsActive
        onSettingsClick={onSettingsClick}
        onBrandClick={onBrandClick}
        hideDate
        hideMacro
      />
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

function SettingsSection({ label, title, headAside = null, children, footer, panelClassName = '' }) {
  const hasBody = children != null && children !== false
  const flushTable = panelClassName.includes('flushTable')
  return (
    <section className="stgSection">
      {label ? <p className="stgSectionLabel">{label}</p> : null}
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

function SettingsField({ label, sublabel, children, valueTone }) {
  return (
    <div className="stgField">
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

export function SettingsPanel({
  backendUp = false,
  onSettingsClick,
  onBrandClick = null,
}) {
  const { configured, loading, user, signOut } = useAuth()
  const [portalBusy, setPortalBusy] = useState(false)
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
        <SettingsSection label="Access" title="Sign in" panelClassName="stgSignInPanel">
          {loading ? (
            <p className="stgMuted mono" aria-live="polite">
              Loading session…
            </p>
          ) : (
            <AuthSignIn variant="settings" />
          )}
        </SettingsSection>
      </SettingsPageShell>
    )
  }

  const email = user.email ?? '—'

  return (
    <SettingsPageShell backendUp={backendUp} onSettingsClick={onSettingsClick} onBrandClick={onBrandClick}>
      <div className="stgRow">
        <SettingsSection
          label="Profile"
          title="Account"
          footer={
            <button type="button" className="stgBtn stgBtn--danger" onClick={() => void signOut()}>
              Sign out
            </button>
          }
        >
          <SettingsField label="Email">
            <span className="mono" title={email}>
              {email}
            </span>
          </SettingsField>
          <SettingsField
            label="Session"
            valueTone={isLiveDataMode(backendUp) ? 'good' : 'neutral'}
          >
            <span className="stgSessionPill">
              <span
                className={
                  isLiveDataMode(backendUp)
                    ? 'stgStatusDot stgStatusDot--good'
                    : 'stgStatusDot stgStatusDot--offline'
                }
                aria-hidden="true"
              />
              {isLiveDataMode(backendUp)
                ? 'Live'
                : isDataModePending(backendUp)
                  ? 'Connecting…'
                  : 'Offline'}
            </span>
          </SettingsField>
        </SettingsSection>

        <SettingsSection
          label="Billing"
          title="Subscription"
          footer={
            <button
              type="button"
              className="stgBtn"
              disabled={portalBusy}
              onClick={() => void onManageBilling()}
            >
              {portalBusy ? 'Opening…' : 'Manage billing'}
            </button>
          }
        >
          <SettingsField
            label="Status"
            valueTone={billing?.active ? 'good' : settingsStatusTone(billing?.status)}
          >
            {billingLoading ? 'Loading…' : formatBillingStatus(billing?.status)}
          </SettingsField>
          <SettingsField label="Plan">{billingLoading ? '…' : formatPlan(billing?.plan)}</SettingsField>
          <SettingsField label="Renews">
            {billingLoading ? '…' : formatPeriodEnd(billing?.current_period_end)}
          </SettingsField>
        </SettingsSection>
      </div>

      <SettingsSection label="Billing" title="Invoices">
        <p className="stgEmpty">{INVOICES_EMPTY_HINT}</p>
      </SettingsSection>

      <SettingsSection label="Support" title="Talk to the founders">
        <p className="stgEmpty">
          Questions, bugs, or ideas — email{' '}
          <a className="stgSupportLink mono" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </SettingsSection>
    </SettingsPageShell>
  )
}
