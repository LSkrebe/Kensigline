import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { fetchJsonSafe } from './api.js'
import { HERO, INTRO_FOOTER, publicTickerPageMeta } from './marketingContent.js'
import { canonicalPublicTickerPath, navigateMarketing, normalizeMarketingPath } from './marketingRoute.js'
import { applyPageMeta } from './pageMeta.js'
import { markAppReady } from './marketingShell.js'
import { fetchPublicTickerTeaser } from './publicTickerApi.js'
import { publicTickerPreviewMock, publicTickerSparklinePoints } from './publicTickerPreviewMock.js'
import './IntroPage.css'
import './IntroPage.marketing.css'
import './PublicTickerPage.css'

const PublicTickerContent = lazy(() =>
  import('./PublicTickerContent.jsx').then((m) => ({ default: m.PublicTickerContent })),
)

function useBackendHealth() {
  const [backendUp, setBackendUp] = useState(false)
  const [lastOkAt, setLastOkAt] = useState(null)

  useEffect(() => {
    let alive = true
    async function ping() {
      const r = await fetchJsonSafe('/health', { timeoutMs: 3500 })
      if (!alive) return
      if (r.ok && r.data?.ok) {
        setLastOkAt(Date.now())
        setBackendUp(true)
      }
    }
    ping()
    const t = setInterval(ping, 4000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  useEffect(() => {
    if (!lastOkAt) return undefined
    const t = setInterval(() => {
      if (Date.now() - lastOkAt > 15_000) setBackendUp(false)
    }, 1000)
    return () => clearInterval(t)
  }, [lastOkAt])

  return backendUp
}

export function PublicTickerPage({ ticker }) {
  const [payload, setPayload] = useState(null)
  const [spark, setSpark] = useState([])
  const [loading, setLoading] = useState(true)
  const [priceRange, setPriceRange] = useState('6M')
  const backendUp = useBackendHealth()

  const goHome = useCallback((e) => {
    e?.preventDefault()
    navigateMarketing('/')
  }, [])

  const goSignIn = useCallback((e) => {
    e?.preventDefault()
    navigateMarketing('/sign-in')
  }, [])

  useEffect(() => {
    let alive = true
    const t = String(ticker ?? '').trim().toUpperCase()

    async function load() {
      setLoading(true)
      const live = await fetchPublicTickerTeaser(t)
      if (!alive) return

      if (live?.notFound) {
        navigateMarketing('/')
        return
      }

      if (live?.preview) {
        setPayload(live.preview)
        setSpark(live.sparkline.length ? live.sparkline : publicTickerSparklinePoints(t))
        setLoading(false)
        return
      }

      const mock = publicTickerPreviewMock(t)
      if (!mock) {
        navigateMarketing('/')
        return
      }
      setPayload(mock)
      setSpark(publicTickerSparklinePoints(t))
      setLoading(false)
    }

    void load()
    return () => {
      alive = false
    }
  }, [ticker])

  useEffect(() => {
    const canon = canonicalPublicTickerPath(ticker)
    if (normalizeMarketingPath(window.location.pathname) !== canon) {
      window.history.replaceState(null, '', canon)
    }
  }, [ticker])

  useEffect(() => {
    if (!payload) return
    applyPageMeta(publicTickerPageMeta(payload))
    markAppReady()
  }, [payload])

  if (loading || !payload) return null

  return (
    <div className="introPage pubTickerPage introPage--marketingChrome">
      <header className="introNav mktEnterNav">
        <div className="introNavInner">
          <a className="introBrand" href="/" aria-label="Mercerline home" onClick={goHome}>
            <img className="introBrandLogo" src="/mercerline_logo_transparent.png" alt="" width={28} height={28} />
            <span className="introBrandName">MERCERLINE</span>
            <span
              className={backendUp ? 'terminalTopBarHealth isUp' : 'terminalTopBarHealth isDown'}
              title={backendUp ? 'API connected' : 'API offline'}
              aria-label={backendUp ? 'Backend up' : 'Backend down'}
            />
          </a>

          <nav className="introNavLinks mono" aria-label="Preview navigation">
            <a href="/" onClick={goHome}>
              Home
            </a>
          </nav>

          <a className="introNavAction introNavCta" href="/sign-in" onClick={goSignIn}>
            Sign in
          </a>
        </div>
      </header>

      <main className="introMain pubTickerMain">
        <Suspense fallback={null}>
          <PublicTickerContent
            payload={payload}
            spark={spark}
            priceRange={priceRange}
            onChartRangeChange={setPriceRange}
          />
        </Suspense>

        <section className="introSection mktFinalCta" aria-label="Subscribe">
          <div className="mktFinalCtaInner">
            <h2 className="mktFinalCtaTitle">Open the terminal</h2>
            <p className="mktFinalCtaSub mono dim">{HERO.rails}</p>
            <a className="introBtn introBtn--primary introBtn--lg" href="/sign-in" onClick={goSignIn}>
              {HERO.ctaPrimary}
            </a>
          </div>
        </section>
      </main>

      <footer className="introFoot introFoot--bar" role="contentinfo">
        <div className="introFootInner introFootInner--marketing">
          <div className="introFootMeta">
            <span className="introFootNfa mono dim">{INTRO_FOOTER.nfa}</span>
            <p className="introFootTagline">{INTRO_FOOTER.tagline}</p>
          </div>
          <nav className="introFootNav mono" aria-label="Footer">
            <a className="introFootNavLink" href="/" onClick={goHome}>
              Home
            </a>
            <a className="introFootNavLink" href="/sign-in" onClick={goSignIn}>
              Sign in
            </a>
          </nav>
        </div>
      </footer>

      <p className="pubTickerSeoVisuallyHidden">
        Mercerline {payload.company} ({payload.ticker}) research - SEC filings, Form 4, PTR, 13F, and catalyst timeline.
        Public delayed sample; full terminal requires subscription.
      </p>
    </div>
  )
}
