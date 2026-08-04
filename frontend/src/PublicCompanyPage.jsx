import { useEffect, useMemo, useState } from 'react'
import { fetchJsonSafe } from './api.js'
import { navigateMarketing } from './marketingRoute.js'
import { applyPageMeta } from './pageMeta.js'
import { matchPublicCompanyPath, publicCompanyPageMeta } from './publicCompany.js'
import { markAppReady } from './marketingShell.js'
import './DeepReport.css'
import './PublicCompanyPage.css'

function formatPct(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return '—'
  return `${x >= 0 ? '+' : ''}${x.toFixed(1)}%`
}

function formatDateLabel(iso) {
  const s = String(iso ?? '').trim()
  if (!s) return '—'
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return s
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function latestSeriesValue(fundamentals, key) {
  const seq = fundamentals?.[key]
  if (!Array.isArray(seq) || !seq.length) return null
  const labels = Array.isArray(fundamentals?.periodLabels) ? fundamentals.periodLabels : []
  for (let i = seq.length - 1; i >= 0; i -= 1) {
    const v = seq[i]
    if (v == null || v === '') continue
    return { value: v, period: labels[i] ?? null }
  }
  return null
}

function PublicSection({ label, title, children, headExtra = null }) {
  return (
    <section className="drpt-section">
      {label ? <p className="drpt-sectionLabel">{label}</p> : null}
      {title || headExtra ? (
        <div className="drpt-sectionHead">
          {title ? <h2 className="drpt-sectionTitle">{title}</h2> : null}
          {headExtra}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export function PublicCompanyPage({ ticker: tickerProp = null }) {
  const matched = useMemo(() => {
    if (tickerProp) {
      const t = String(tickerProp).trim().toUpperCase()
      return { ticker: t, path: `/companies/${t}` }
    }
    return matchPublicCompanyPath(typeof window !== 'undefined' ? window.location.pathname : '/')
  }, [tickerProp])

  const ticker = matched?.ticker ?? ''
  const [loading, setLoading] = useState(true)
  const [company, setCompany] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    markAppReady()
  }, [])

  useEffect(() => {
    if (!ticker) return
    let cancelled = false
    setLoading(true)
    setError('')

    void fetchJsonSafe(`/api/public/company?ticker=${encodeURIComponent(ticker)}`, {
      timeoutMs: 20000,
    }).then((res) => {
      if (cancelled) return
      setLoading(false)
      if (!res.ok || !res.data) {
        setCompany(null)
        setError('Company data is unavailable right now.')
        applyPageMeta(publicCompanyPageMeta({ ticker, name: null }))
        return
      }
      setCompany(res.data)
      applyPageMeta(
        publicCompanyPageMeta({
          ticker: res.data.ticker || ticker,
          name: res.data.name,
        }),
      )
    })
    return () => {
      cancelled = true
    }
  }, [ticker])

  const fundamentals = company?.fundamentals ?? null
  const metricRows = useMemo(() => {
    if (!fundamentals) return []
    const rows = [
      { key: 'forwardRevenueGrowth', label: 'Fwd rev growth', format: 'pct', single: true },
      { key: 'revenueGrowth', label: 'Rev growth', format: 'pct' },
      { key: 'grossMargin', label: 'Gross margin', format: 'pct' },
      { key: 'netMargin', label: 'Net margin', format: 'pct' },
      { key: 'fcfMargin', label: 'FCF margin', format: 'pct' },
    ]
    return rows
      .map((row) => {
        if (row.single) {
          const v = fundamentals[row.key]
          if (v == null) return null
          return {
            key: row.key,
            label: row.label,
            value: row.format === 'pct' ? formatPct(v) : String(v),
            period: 'Forward',
          }
        }
        const latest = latestSeriesValue(fundamentals, row.key)
        if (!latest) return null
        return {
          key: row.key,
          label: row.label,
          value: row.format === 'pct' ? formatPct(latest.value) : String(latest.value),
          period: latest.period || 'Latest',
        }
      })
      .filter(Boolean)
  }, [fundamentals])

  const name = String(company?.name ?? '').trim() || ticker || 'Company'
  const price = company?.latest_close != null && Number.isFinite(Number(company.latest_close))
    ? Number(company.latest_close)
    : null
  const priceChange =
    company?.price_change != null && Number.isFinite(Number(company.price_change))
      ? Number(company.price_change)
      : null
  const priceChangePct =
    company?.price_change_pct != null && Number.isFinite(Number(company.price_change_pct))
      ? Number(company.price_change_pct)
      : null
  const priceUp = priceChange != null ? priceChange >= 0 : true
  const earningsLabel = company?.earnings_date ? formatDateLabel(company.earnings_date) : null
  const overviewCards = [
    company?.mcap ? { key: 'mcap', label: 'Market cap', value: company.mcap } : null,
    earningsLabel ? { key: 'earnings', label: 'Next earnings', value: earningsLabel } : null,
    company?.industry ? { key: 'sector', label: 'Sector', value: company.industry } : null,
    company?.country ? { key: 'domicile', label: 'Domicile', value: company.country } : null,
  ].filter(Boolean)

  const goHome = (e) => {
    e.preventDefault()
    navigateMarketing('/')
  }
  const goSignIn = (e) => {
    e.preventDefault()
    navigateMarketing('/sign-in')
  }

  const showName = Boolean(name && name !== ticker)

  return (
    <article className="drpt pubCo">
      <div className="pubCoChromeBar">
        <div className="pubCoChromeBg" aria-hidden="true" />
        <div className="pubCoChrome">
          <a className="pubCoBrand" href="/" aria-label="Mercerline home" onClick={goHome}>
            <span className="pubCoBrandLogoClip">
              <img className="pubCoBrandMark" src="/mercerline_mark.png" alt="" width={28} height={20} decoding="async" />
            </span>
            <span className="pubCoBrandName">MERCERLINE</span>
          </a>

          <div className="pubCoChromeTrail">
            <h1 className="pubCoChromeTicker">{ticker || '—'}</h1>
            {showName ? <span className="pubCoChromeName">{name}</span> : null}
            {price != null ? (
              <span className="pubCoChromePrice">${price.toFixed(2)}</span>
            ) : null}
            {price != null && priceChange != null && priceChangePct != null ? (
              <span className={['pubCoChromeChange', priceUp ? 'isUp' : 'isDown'].join(' ')}>
                {priceUp ? '+' : ''}
                {priceChange.toFixed(2)} ({priceUp ? '+' : ''}
                {priceChangePct.toFixed(2)}%)
              </span>
            ) : null}
          </div>

          <a className="pubCoSignIn" href="/sign-in" onClick={goSignIn}>
            Sign in
          </a>
        </div>
      </div>

      <div className="drpt-paper pubCoPaper">
        {loading ? <p className="drpt-empty drpt-loading">Loading…</p> : null}
        {error ? (
          <p className="drpt-empty pubCoBanner--err" role="alert">
            {error}
          </p>
        ) : null}

        {!loading && company ? (
          <>
            <div className="drpt-row drpt-row--market">
              {overviewCards.length ? (
                <PublicSection label="Snapshot" title="Company facts">
                  <div className="drpt-metricGrid">
                    {overviewCards.map((card) => (
                      <div className="drpt-metricCard" key={card.key}>
                        <span className="drpt-metricLabel">{card.label}</span>
                        <span className="drpt-metricValue">{card.value}</span>
                      </div>
                    ))}
                  </div>
                </PublicSection>
              ) : null}

              {metricRows.length ? (
                <PublicSection label="Fundamentals" title="Key metrics">
                  <div className="drpt-metricGrid">
                    {metricRows.map((row) => (
                      <div className="drpt-metricCard" key={row.key}>
                        <span className="drpt-metricLabel">{row.label}</span>
                        <span className="drpt-metricValue">{row.value}</span>
                        {row.period ? <span className="drpt-metricPeriod">{row.period}</span> : null}
                      </div>
                    ))}
                  </div>
                </PublicSection>
              ) : null}
            </div>

            <PublicSection label="Access" title="Full company dossier">
              <div className="pubCoGate">
                <p className="pubCoGateCopy">
                  Sign in for price history, filings archive, financial model, and tracked investor flow —
                  the same deep company view used inside Mercerline.
                </p>
                <a className="pubCoGateBtn" href="/" onClick={goHome}>
                  Explore Mercerline
                </a>
              </div>
            </PublicSection>
          </>
        ) : null}
      </div>
    </article>
  )
}
