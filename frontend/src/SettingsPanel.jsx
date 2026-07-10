import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchJsonSafe } from './api.js'
import { useActorAlertWatchlist } from './alertsActorWatchlist.js'
import { useAlertWatchlist, WATCHLIST_MAX_DEFAULT } from './alertsWatchlist.js'
import { useDigestPreference } from './alertsPreferences.js'
import { useAuth } from './AuthContext.jsx'
import { AuthSignIn } from './AuthSignIn.jsx'
import { actorModeLabel } from './investigateActorKey.js'

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

const ALERTS_EMPTY_HINT = 'Email alerts for watched tickers and actors.'
const INVOICES_EMPTY_HINT =
  'Download invoices and update your payment method in Stripe via Manage billing.'

function SettingsCardEmptyHint({ children }) {
  return <p className="settingsCardEmptyHint">{children}</p>
}

function SettingsCard({ title, className = '', children, footer, headAside = null }) {
  const hasBody = children != null && children !== false
  return (
    <section className={['settingsCard', className].filter(Boolean).join(' ')}>
      <header
        className={['settingsCardHead', headAside ? 'settingsCardHead--split' : '']
          .filter(Boolean)
          .join(' ')}
      >
        <h2 className="settingsCardTitle">{title}</h2>
        {headAside}
      </header>
      {hasBody ? <div className="settingsCardBody">{children}</div> : null}
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

function SettingsAlertTable({ columns, rows, loading = false }) {
  if (loading) return null
  if (!rows.length) return null
  return (
    <table className="settingsAlertTable">
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.key} className={col.className ?? ''} scope="col">
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            {columns.map((col) => (
              <td key={col.key} className={col.className ?? ''}>
                {col.render(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function SettingsPanel() {
  const { configured, loading, user, signOut } = useAuth()
  const [portalBusy, setPortalBusy] = useState(false)
  const [billing, setBilling] = useState(null)
  const [billingLoading, setBillingLoading] = useState(false)
  const signedIn = Boolean(configured && !loading && user)
  const {
    tickers,
    maxTickers,
    loaded: watchlistLoaded,
    busyTicker,
    remove,
  } = useAlertWatchlist({ enabled: signedIn })
  const {
    actors,
    loaded: actorWatchlistLoaded,
    busyKey: busyActorKey,
    remove: removeActor,
  } = useActorAlertWatchlist({ enabled: signedIn })
  const { digestEnabled, busy: digestBusy, setEnabled: setDigestEnabled } = useDigestPreference({
    enabled: signedIn,
  })

  const alertsLoaded = watchlistLoaded && actorWatchlistLoaded
  const alertMax = maxTickers || WATCHLIST_MAX_DEFAULT

  const alertRows = useMemo(() => {
    const rows = []
    for (const ticker of tickers) {
      rows.push({
        id: `ticker:${ticker}`,
        kind: 'ticker',
        label: ticker,
        typeLabel: 'Company',
        busy: busyTicker === ticker,
        onRemove: () => void remove(ticker),
      })
    }
    for (const actor of actors) {
      rows.push({
        id: `actor:${actor.actor_key}`,
        kind: 'actor',
        label: actor.display_name,
        typeLabel: actorModeLabel(actor.mode),
        busy: busyActorKey === actor.actor_key,
        onRemove: () => void removeActor(actor.actor_key),
      })
    }
    return rows
  }, [tickers, actors, busyTicker, busyActorKey, remove, removeActor])

  const alertsEmpty = alertsLoaded && alertRows.length === 0
  const alertsCount = alertRows.length

  const alertColumns = [
    {
      key: 'label',
      label: 'Alert',
      className: 'settingsAlertTableCol--primary',
      render: (row) => (
        <span className={row.kind === 'ticker' ? 'mono' : ''}>{row.label}</span>
      ),
    },
    {
      key: 'type',
      label: 'Type',
      render: (row) => <span className="settingsAlertTableType mono">{row.typeLabel}</span>,
    },
    {
      key: 'action',
      label: '',
      className: 'settingsAlertTableCol--action',
      render: (row) => (
        <button
          type="button"
          className="settingsAlertTableRemove"
          aria-label={`Remove ${row.label} alerts`}
          disabled={row.busy}
          onClick={row.onRemove}
        >
          Remove
        </button>
      ),
    },
  ]

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

          <SettingsCard
            title="ALERTS"
            className={[
              'settingsCard--alerts',
              'settingsCard--wide',
              alertsEmpty || !alertsLoaded ? 'settingsCard--emptyBody' : 'settingsCard--tableBody',
            ]
              .filter(Boolean)
              .join(' ')}
            headAside={
              <span className="settingsWatchlistQuota mono">
                {alertsLoaded ? `${alertsCount} / ${alertMax}` : `— / ${alertMax}`}
              </span>
            }
          >
            {!alertsLoaded ? (
              <SettingsCardEmptyHint key="loading">Loading…</SettingsCardEmptyHint>
            ) : alertsEmpty ? (
              <SettingsCardEmptyHint key="empty">{ALERTS_EMPTY_HINT}</SettingsCardEmptyHint>
            ) : (
              <SettingsAlertTable key="table" columns={alertColumns} rows={alertRows} />
            )}
          </SettingsCard>

          <SettingsCard
            title="INVOICES"
            className="settingsCard--invoices settingsCard--wide settingsCard--emptyBody"
          >
            <SettingsCardEmptyHint>{INVOICES_EMPTY_HINT}</SettingsCardEmptyHint>
          </SettingsCard>
        </div>
      </div>
    </div>
  )
}
