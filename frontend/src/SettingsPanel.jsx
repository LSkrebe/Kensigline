import { useCallback, useEffect, useState } from 'react'
import { fetchJsonSafe } from './api.js'
import { useAlertWatchlist } from './alertsWatchlist.js'
import { useDigestPreference } from './alertsPreferences.js'
import { useAuth } from './AuthContext.jsx'
import { AuthSignIn } from './AuthSignIn.jsx'

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

function SettingsCard({ title, className = '', children, footer }) {
  return (
    <section className={['settingsCard', className].filter(Boolean).join(' ')}>
      <header className="settingsCardHead">
        <h2 className="settingsCardTitle">{title}</h2>
      </header>
      <div className="settingsCardBody">{children}</div>
      {footer ? <footer className="settingsCardFoot">{footer}</footer> : null}
    </section>
  )
}

function SettingsField({ label, children, valueTone }) {
  return (
    <div className="settingsField">
      <span className="settingsFieldLabel">{label}</span>
      <span className={['settingsFieldValue', valueTone ? `settingsFieldValue--${valueTone}` : ''].filter(Boolean).join(' ')}>
        {children}
      </span>
    </div>
  )
}

function SettingsDigestToggle({ enabled, busy, onChange }) {
  return (
    <div className="settingsField settingsField--digest">
      <div className="settingsFieldLabelGroup">
        <span className="settingsFieldLabel">Idea digest</span>
        <span className="settingsFieldSublabel">Twice-daily email summary</span>
      </div>
      <span
        className={['settingsFieldValue', 'settingsFieldValue--control', enabled ? 'isOn' : ''].filter(Boolean).join(' ')}
      >
        <span className="settingsDigestState" aria-hidden="true">
          {enabled ? 'On' : 'Off'}
        </span>
        <label className="settingsSwitch">
          <input
            type="checkbox"
            className="settingsSwitchInput"
            checked={enabled}
            disabled={busy}
            aria-label={enabled ? 'Idea digest on' : 'Idea digest off'}
            onChange={(e) => onChange(Boolean(e.target.checked))}
          />
          <span className="settingsSwitchTrack" aria-hidden="true">
            <span className="settingsSwitchThumb" />
          </span>
        </label>
      </span>
    </div>
  )
}

export function SettingsPanel() {
  const { configured, loading, user, signOut } = useAuth()
  const [portalBusy, setPortalBusy] = useState(false)
  const [billing, setBilling] = useState(null)
  const [billingLoading, setBillingLoading] = useState(false)
  const signedIn = Boolean(configured && !loading && user)
  const { tickers, maxTickers, atLimit, loaded: watchlistLoaded, busyTicker, remove } = useAlertWatchlist({
    enabled: signedIn,
  })
  const { digestEnabled, busy: digestBusy, setEnabled: setDigestEnabled } = useDigestPreference({
    enabled: signedIn,
  })

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
      <div className="settingsPage scrollThin">
        <div className="settingsPageInner">
          <SettingsCard title={loading ? 'SETTINGS' : 'SIGN IN'} className="settingsCard--signIn">
            {loading ? (
              <p className="settingsMuted mono" aria-live="polite">
                Loading session…
              </p>
            ) : (
              <AuthSignIn variant="settings" />
            )}
          </SettingsCard>
        </div>
      </div>
    )
  }

  const email = user.email ?? '—'

  return (
    <div className="settingsPage scrollThin">
      <div className="settingsPageInner">
        <div className="settingsPageGrid">
          <SettingsCard
            title="ACCOUNT"
            className="settingsCard--account"
            footer={
              <button type="button" className="settingsLinkBtn settingsLinkBtn--danger" onClick={() => void signOut()}>
                Sign out
              </button>
            }
          >
            <SettingsField label="Email">
              <span className="mono" title={email}>
                {email}
              </span>
            </SettingsField>
            <SettingsDigestToggle
              enabled={digestEnabled}
              busy={digestBusy}
              onChange={(next) => void setDigestEnabled(next)}
            />
            <SettingsField label="Session" valueTone="good">
              <span className="settingsSessionPill">
                <span className="settingsStatusDot settingsStatusDot--good" aria-hidden="true" />
                Active
              </span>
            </SettingsField>
          </SettingsCard>

          <SettingsCard
            title="SUBSCRIPTION"
            className="settingsCard--billing"
            footer={
              <button
                type="button"
                className="settingsLinkBtn"
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
          </SettingsCard>

          <SettingsCard title="TICKER ALERTS" className="settingsCard--alerts settingsCard--wide">
            <p className="settingsCardHint">
              Receive document analysis by email when new filings are processed for your watched tickers.
              {' '}
              <span className="settingsWatchlistQuota">
                {watchlistLoaded ? `${tickers.length} / ${maxTickers} on your plan` : `Up to ${maxTickers} tickers`}
              </span>
            </p>
            {atLimit ? (
              <p className="settingsWatchlistLimitNote mono">Watchlist full - remove a ticker to add another.</p>
            ) : null}
            {!watchlistLoaded ? (
              <p className="settingsMuted mono">Loading…</p>
            ) : !tickers.length ? (
              <p className="settingsMuted mono">No tickers - add from Research → Context using the bell icon.</p>
            ) : (
              <div className="settingsWatchlistChips" role="list">
                {tickers.map((ticker) => (
                  <div key={ticker} className="settingsWatchlistChip" role="listitem">
                    <span className="settingsWatchlistChipTicker mono">{ticker}</span>
                    <button
                      type="button"
                      className="settingsWatchlistChipRemove"
                      aria-label={`Remove ${ticker} alerts`}
                      disabled={busyTicker === ticker}
                      onClick={() => void remove(ticker)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </SettingsCard>

          <SettingsCard title="INVOICES" className="settingsCard--invoices settingsCard--wide">
            <p className="settingsMuted mono">
              Download invoices and update your payment method in Stripe via Manage billing.
            </p>
          </SettingsCard>
        </div>
      </div>
    </div>
  )
}
