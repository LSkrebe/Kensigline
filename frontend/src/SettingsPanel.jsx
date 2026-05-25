import { useCallback, useState } from 'react'
import { fetchJsonSafe } from './api.js'
import { useAuth } from './AuthContext.jsx'
import { AuthSignIn } from './AuthSignIn.jsx'

const MOCK_SUBSCRIPTION = {
  status: 'Trialing',
  renews: '22 May 2026',
  payment: 'Visa ···· 4242',
}

const MOCK_INVOICES = [
  { id: 'inv_001', date: '17 Apr 2026', amount: '$0.00', status: 'Paid', note: 'Trial start' },
  { id: 'inv_000', date: '17 Mar 2026', amount: '$0.00', status: 'Paid', note: 'Account opened' },
]

function SettingsPanelHeader({ title, children }) {
  return (
    <header className="feedCompactHeader">
      <div className="panelTitle feedCompactTitle">{title}</div>
      {children ?? null}
    </header>
  )
}

function SettingsRow({ label, children, valueClassName = 'kvV mono' }) {
  return (
    <div className="kvLine settingsKvRow">
      <span className="kvK dim">{label}</span>
      <span className={valueClassName}>{children}</span>
    </div>
  )
}

function SettingsKvBody({ children }) {
  return <div className="settingsKvBody">{children}</div>
}

function SettingsLogoPanel() {
  return (
    <section className="panel feed feedCompact isFocused settingsLogoPanel" aria-label="Mercerline">
      <header className="feedCompactHeader">
        <div className="panelTitle feedCompactTitle">MERCERLINE</div>
      </header>
      <div className="settingsLogoPanelInner">
        <div className="settingsLogoPanelBrand">
          <img
            className="settingsLogoPanelImg"
            src="/mercerline_logo_transparent.png"
            alt="Mercerline"
            decoding="async"
          />
        </div>
      </div>
    </section>
  )
}

export function SettingsPanel() {
  const { configured, loading, user, signOut } = useAuth()
  const [portalBusy, setPortalBusy] = useState(false)

  const onManageBilling = useCallback(async () => {
    setPortalBusy(true)
    const res = await fetchJsonSafe('/api/billing/portal', { method: 'POST', timeoutMs: 20000 })
    setPortalBusy(false)
    if (res.ok && res.data?.url) {
      window.location.href = res.data.url
      return
    }
  }, [])

  if (!configured || loading || !user) {
    return (
      <section className="panel settingsSignInPanel" aria-label="Settings">
        <SettingsPanelHeader title={loading ? 'SETTINGS' : 'SIGN IN'} />
        <div className="settingsPanelBody">
          {loading ? (
            <p className="settingsLoading mono dim" aria-live="polite">
              Loading session…
            </p>
          ) : (
            <AuthSignIn variant="settings" />
          )}
        </div>
      </section>
    )
  }

  const email = user.email ?? '—'

  return (
    <>
      <div className="settingsTopRow">
        <SettingsLogoPanel />

        <section className="panel settingsAccountPanel" aria-label="Account">
        <SettingsPanelHeader title="ACCOUNT" />
        <div className="settingsPanelBody">
          <SettingsKvBody>
            <SettingsRow label="EMAIL" valueClassName="kvV mono">
              <span title={email}>{email}</span>
            </SettingsRow>
            <SettingsRow label="SESSION" valueClassName="kvV mono settingsSessionV">
              <span className="settingsStatusDot" aria-hidden="true" />
              Active
            </SettingsRow>
          </SettingsKvBody>
        </div>
        <footer className="settingsPanelFooter">
          <button type="button" className="settingsBtn settingsBtn--danger" onClick={() => void signOut()}>
            Sign out
          </button>
        </footer>
      </section>

      <section className="panel settingsSubscriptionPanel" aria-label="Subscription">
        <SettingsPanelHeader title="SUBSCRIPTION" />
        <div className="settingsPanelBody">
          <SettingsKvBody>
            <SettingsRow label="STATUS" valueClassName="kvV mono settingsValue--trial">
              {MOCK_SUBSCRIPTION.status}
            </SettingsRow>
            <SettingsRow label="RENEWS">{MOCK_SUBSCRIPTION.renews}</SettingsRow>
            <SettingsRow label="PAYMENT">{MOCK_SUBSCRIPTION.payment}</SettingsRow>
          </SettingsKvBody>
        </div>
        <footer className="settingsPanelFooter">
          <button
            type="button"
            className="settingsBtn settingsBtn--accent"
            disabled={portalBusy}
            onClick={() => void onManageBilling()}
          >
            {portalBusy ? 'Opening…' : 'Manage billing'}
          </button>
        </footer>
        </section>
      </div>

      <section className="panel settingsInvoicesPanel" aria-label="Invoices">
        <SettingsPanelHeader title="INVOICES" />
        <div className="settingsPanelBody settingsPanelBody--invoices">
          <div className="settingsInvoiceList">
            <div className="settingsInvoiceRow settingsInvoiceRow--head mono" aria-hidden="true">
              <span className="settingsInvoiceCell settingsInvoiceCol--date">Date</span>
              <span className="settingsInvoiceCell settingsInvoiceCol--amount">Amount</span>
              <span className="settingsInvoiceCell settingsInvoiceCol--status">Status</span>
              <span className="settingsInvoiceCell settingsInvoiceCol--note">Note</span>
              <span className="settingsInvoiceCell settingsInvoiceCol--action">PDF</span>
            </div>
            {MOCK_INVOICES.map((inv) => (
              <div key={inv.id} className="settingsInvoiceRow">
                <span className="settingsInvoiceCell settingsInvoiceCol--date mono">{inv.date}</span>
                <span className="settingsInvoiceCell settingsInvoiceCol--amount mono">{inv.amount}</span>
                <span className="settingsInvoiceCell settingsInvoiceCol--status mono settingsInvoiceStatus--paid">
                  {inv.status}
                </span>
                <span className="settingsInvoiceCell settingsInvoiceCol--note settingsInvoiceNote">{inv.note}</span>
                <span className="settingsInvoiceCell settingsInvoiceCol--action">
                  <button
                    type="button"
                    className="settingsInvoiceDownload"
                    disabled
                    title="Download PDF — coming soon"
                    aria-label={`Download invoice ${inv.date}`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M12 4v10M8 14l4 4 4-4M5 20h14"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="square"
                      />
                    </svg>
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
