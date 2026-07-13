import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchJsonSafe } from './api.js'
import { useActorAlertWatchlist } from './alertsActorWatchlist.js'
import { useAlertWatchlist, WATCHLIST_MAX_DEFAULT } from './alertsWatchlist.js'
import { useDigestPreference } from './alertsPreferences.js'
import { useAuth } from './AuthContext.jsx'
import { AuthSignIn } from './AuthSignIn.jsx'
import { actorModeLabel } from './investigateActorKey.js'
import { TerminalTopBarChrome } from './TerminalTopBarChrome.jsx'
import './ExplorePage.css'
import './SettingsPage.css'

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

function SettingsStrip({ backendUp, onSettingsClick }) {
  return (
    <div className="stgDock">
      <div className="exploreRecapCompactBg" aria-hidden="true" />
      <TerminalTopBarChrome
        className="exploreRecapChrome"
        logoSrc="/mercerline_mark.png"
        backendUp={backendUp}
        settingsActive
        onSettingsClick={onSettingsClick}
        hideDate
        hideMacro
      />
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

function SettingsDigestToggle({ enabled, busy, onChange }) {
  return (
    <div className="stgField">
      <div className="stgFieldLabelGroup">
        <span className="stgFieldLabel">Idea digest</span>
        <span className="stgFieldSublabel">Twice-daily email summary</span>
      </div>
      <span
        className={['stgFieldValue', 'stgFieldValue--control', enabled ? 'isOn' : '']
          .filter(Boolean)
          .join(' ')}
      >
        <span className="stgDigestState" aria-hidden="true">
          {enabled ? 'On' : 'Off'}
        </span>
        <label className="stgSwitch">
          <input
            type="checkbox"
            className="stgSwitchInput"
            checked={enabled}
            disabled={busy}
            aria-label={enabled ? 'Idea digest on' : 'Idea digest off'}
            onChange={(e) => onChange(Boolean(e.target.checked))}
          />
          <span className="stgSwitchTrack" aria-hidden="true">
            <span className="stgSwitchThumb" />
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
    <table className="stgTable">
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

export function SettingsPanel({
  backendUp = true,
  onSettingsClick,
}) {
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
      className: 'stgTableCol--primary',
      render: (row) => (
        <span className={row.kind === 'ticker' ? 'mono' : ''}>{row.label}</span>
      ),
    },
    {
      key: 'type',
      label: 'Type',
      render: (row) => <span className="stgTableType mono">{row.typeLabel}</span>,
    },
    {
      key: 'action',
      label: '',
      className: 'stgTableCol--action',
      render: (row) => (
        <button
          type="button"
          className="stgTableRemove"
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
      <div className="stgShell">
        <SettingsStrip backendUp={backendUp} onSettingsClick={onSettingsClick} />
        <div className="stgScroll scrollThin">
          <div className="stgPaper">
            <header className="stgHero">
              <p className="stgKicker">Workspace</p>
              <h1 className="stgTitle">Settings</h1>
            </header>
            <SettingsSection label="Access" title="Sign in" panelClassName="stgSignInPanel">
              {loading ? (
                <p className="stgMuted mono" aria-live="polite">
                  Loading session…
                </p>
              ) : (
                <AuthSignIn variant="settings" />
              )}
            </SettingsSection>
          </div>
        </div>
      </div>
    )
  }

  const email = user.email ?? '—'

  return (
    <div className="stgShell">
      <SettingsStrip backendUp={backendUp} onSettingsClick={onSettingsClick} />
      <div className="stgScroll scrollThin">
        <div className="stgPaper">
          <header className="stgHero">
            <p className="stgKicker">Workspace</p>
            <h1 className="stgTitle">Settings</h1>
          </header>

          <div className="stgRow">
            <SettingsSection label="Profile" title="Account" footer={
              <button type="button" className="stgBtn stgBtn--danger" onClick={() => void signOut()}>
                Sign out
              </button>
            }>
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
                <span className="stgSessionPill">
                  <span className="stgStatusDot stgStatusDot--good" aria-hidden="true" />
                  Active
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

          <SettingsSection
            label="Notifications"
            title="Alerts"
            headAside={
              <span className="stgSectionMeta mono">
                {alertsLoaded ? `${alertsCount} / ${alertMax}` : `— / ${alertMax}`}
              </span>
            }
            panelClassName={alertsEmpty || !alertsLoaded ? '' : 'stgPanel--flushTable'}
          >
            {!alertsLoaded ? (
              <p className="stgEmpty">Loading…</p>
            ) : alertsEmpty ? (
              <p className="stgEmpty">{ALERTS_EMPTY_HINT}</p>
            ) : (
              <SettingsAlertTable columns={alertColumns} rows={alertRows} />
            )}
          </SettingsSection>

          <SettingsSection label="Billing" title="Invoices">
            <p className="stgEmpty">{INVOICES_EMPTY_HINT}</p>
          </SettingsSection>
        </div>
      </div>
    </div>
  )
}
