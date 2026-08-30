import { useEffect, useState } from 'react'
import { fetchJsonSafe } from './api.js'
import { PublicContentCta, PublicContentLayout } from './PublicContentLayout.jsx'
import { researchTickerPageMeta } from './publicRoutes.js'
import { navigateMarketing } from './marketingRoute.js'
import { applyPageMeta } from './pageMeta.js'
import { markAppReady } from './marketingShell.js'
import { buildResearchTickerJsonLd } from './marketingSeo.js'

function formatDateLabel(iso) {
  const s = String(iso ?? '').trim()
  if (!s) return null
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return s
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function ResearchTickerPage({ ticker: tickerProp = null }) {
  const ticker = String(tickerProp ?? '').trim().toUpperCase()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)

  useEffect(() => {
    markAppReady()
  }, [])

  useEffect(() => {
    if (!ticker) return
    applyPageMeta(researchTickerPageMeta({ ticker, name: null }))
    let cancelled = false
    setLoading(true)
    void fetchJsonSafe(`/api/public/research?ticker=${encodeURIComponent(ticker)}`, { timeoutMs: 20_000 }).then(
      (res) => {
        if (cancelled) return
        setLoading(false)
        if (res.ok && res.data?.ok) {
          setData(res.data)
          applyPageMeta(researchTickerPageMeta({ ticker: res.data.ticker || ticker, name: res.data.name }))
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [ticker])

  useEffect(() => {
    if (!data?.ticker) return
    const schema = buildResearchTickerJsonLd(data)
    let el = document.head.querySelector('script[data-research-ticker-schema]')
    if (!el) {
      el = document.createElement('script')
      el.setAttribute('type', 'application/ld+json')
      el.setAttribute('data-research-ticker-schema', 'true')
      document.head.appendChild(el)
    }
    el.textContent = JSON.stringify(schema)
    return () => {
      el?.remove()
    }
  }, [data])

  const name = String(data?.name ?? '').trim()
  const latest = data?.latestEvent ?? null

  return (
    <PublicContentLayout
      backgroundKey="publicCompany"
      trail={
        <>
          <a href="/research" onClick={(e) => { e.preventDefault(); navigateMarketing('/research') }}>Research</a>
          {' / '}
          {ticker}
        </>
      }
    >
      <header className="pubContentHero">
        <p className="lpEyebrow">Ticker research</p>
        <div className="pubContentTickerRow">
          <span className="pubContentTicker">{ticker || '—'}</span>
          {name && name !== ticker ? <span className="pubContentTickerName">{name}</span> : null}
        </div>
        <p className="pubContentLead">
          Public disclosure context for {ticker}. Mercerline tracks Form 4, PTR, and 13F filings as they clear —
          the full dossier stays inside the product.
        </p>
      </header>

      {loading ? <p className="pubContentStatus">Loading…</p> : null}

      {!loading && data ? (
        <>
          <section className="pubContentCard">
            <h2>Snapshot</h2>
            <p>
              {[
                data.industry ? `Sector: ${data.industry}` : null,
                data.country ? `Domicile: ${data.country}` : null,
                data.earnings_date ? `Next earnings: ${formatDateLabel(data.earnings_date)}` : null,
                data.latest_close != null ? `Last close: $${Number(data.latest_close).toFixed(2)}` : null,
              ]
                .filter(Boolean)
                .join(' · ') || 'Basic issuer metadata only on public pages.'}
            </p>
          </section>

          {latest ? (
            <section className="pubContentCard">
              <h2>Latest public filing story</h2>
              <p>{latest.summary}</p>
              <p style={{ marginTop: 12 }}>
                <a
                  href={`/research/${latest.dayKey}`}
                  onClick={(e) => {
                    e.preventDefault()
                    navigateMarketing(`/research/${latest.dayKey}`)
                  }}
                >
                  Read the daily highlight →
                </a>
              </p>
            </section>
          ) : (
            <section className="pubContentCard">
              <h2>Latest public filing story</h2>
              <p>No recent public headline involves {ticker} in the current window. Sign in for the live recap.</p>
            </section>
          )}

          <PublicContentCta
            title={`Full ${ticker} dossier in Mercerline`}
            body="Price history, filings archive, financial model, and tracked investor flow — the same deep company view used inside the app."
            primaryLabel="Sign in"
            secondaryLabel="View pricing"
          />
        </>
      ) : null}
    </PublicContentLayout>
  )
}
