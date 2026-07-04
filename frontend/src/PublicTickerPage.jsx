import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchJsonSafe } from './api.js'
import { HERO, INTRO_FOOTER, publicTickerPageMeta } from './marketingContent.js'
import { navigateMarketing } from './marketingRoute.js'
import { applyPageMeta } from './pageMeta.js'
import { EventBriefDocCard, formatEventCardDate } from './EventBrief.jsx'
import { MiniPriceChart } from './MiniPriceChart.jsx'
import {
  publicTickerPreviewMock,
  publicTickerSparklinePoints,
} from './publicTickerPreviewMock.js'
import './App.css'
import './IntroPage.css'
import './IntroPage.marketing.css'
import './PublicTickerPage.css'

function outcomeValueTone(value) {
  const v = String(value ?? '')
  if (/^\+|positive/i.test(v)) return 'contextSignalV--pos'
  if (/^−|^-|negative/i.test(v)) return 'contextSignalV--neg'
  return ''
}

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
  const payload = publicTickerPreviewMock(ticker)
  const spark = useMemo(() => publicTickerSparklinePoints(ticker), [ticker])
  const backendUp = useBackendHealth()
  const [priceRange, setPriceRange] = useState('6M')

  const goHome = useCallback((e) => {
    e?.preventDefault()
    navigateMarketing('/')
  }, [])

  const goSignIn = useCallback((e) => {
    e?.preventDefault()
    navigateMarketing('/sign-in')
  }, [])

  useEffect(() => {
    if (!payload) {
      navigateMarketing('/')
      return
    }
    applyPageMeta(publicTickerPageMeta(payload))
  }, [payload])

  if (!payload) return null

  const up = payload.change >= 0
  const macroImpact =
    payload.macro?.impact === 'medium' || payload.macro?.impact === 'low'
      ? payload.macro.impact
      : 'high'

  return (
    <div className="introPage pubTickerPage introPage--marketingChrome">
      <header className="introNav">
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
        <section className="pubTickerHero introHero--enter" aria-label={payload.company}>
          <p className="introEyebrow mono">
            {payload.ticker} · {payload.sector}
          </p>
          <div className="pubTickerHeroRow">
            <div className="pubTickerHeroCopy">
              <h1 className="pubTickerHeroTitle">{payload.company}</h1>
              <p className="pubTickerHeroMeta mono dim">
                {payload.sector} · {payload.country} · {payload.mcap}
              </p>
            </div>
            <div className="pubTickerHeroQuote" aria-label="Quote snapshot">
              <div className="pubTickerHeroPrice mono">${payload.price.toFixed(2)}</div>
              <div className={['pubTickerHeroChange', 'mono', up ? 'isUp' : 'isDown'].filter(Boolean).join(' ')}>
                {up ? '+' : ''}
                {payload.change.toFixed(2)} ({up ? '+' : ''}
                {payload.changePct.toFixed(2)}%)
              </div>
              <div className="pubTickerHeroAsOf mono dim">As of {payload.asOfLabel}</div>
            </div>
          </div>
        </section>

        <div className="pubTickerShell" aria-label="Research workspace">
          <div className="pubTickerShellGrid">
            <div className="pubTickerStream scrollThin">
              <header className="pubTickerColHead">
                <p className="introSectionKicker mono">Paper timeline</p>
                <h2 className="pubTickerColTitle">Recent events</h2>
              </header>

              <div className="pubTickerEvents" aria-label="Filings and catalysts">
                {payload.events.map((event, idx) => (
                  <div key={event.id} className="pubTickerEventSlot">
                    {idx > 0 ? <div className="researchPaperDocConnector pubTickerEventConnector" aria-hidden="true" /> : null}
                    <EventBriefDocCard
                      captureId={event.id}
                      ticker={payload.ticker}
                      source={event.source}
                      dateTime={event.atIso}
                      dateLabel={formatEventCardDate(event.atIso)}
                      analysis={event.summary}
                      className={event.ideaBest ? 'ideaHighlight--A' : ''}
                    />
                  </div>
                ))}

                <div className="pubTickerEventSlot pubTickerEventSlot--lock">
                  <div className="researchPaperDocConnector pubTickerEventConnector" aria-hidden="true" />
                  <div className="pubTickerLock" aria-label="Additional events locked">
                    <p className="pubTickerLockCount mono">
                      +{payload.lockedCount}{' '}
                      <span className="pubTickerLockCountLabel">events</span>
                    </p>
                    <p className="pubTickerLockLine mono dim">More events in live terminal</p>
                    <p className="researchPaperDocCardAnalysis pubTickerLockDetail">
                      Analyse, Investigate, entity map, and export unlock with subscription.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <aside className="pubTickerIntel pubTickerAppContext scrollThin" aria-label="Market context">
              <section className="pubTickerGlass pubTickerChartBlock contextCompanyCard">
                <div className="pubTickerChart contextCompanyChart" aria-label="Price chart">
                  <MiniPriceChart
                    series={spark}
                    label={payload.ticker}
                    showMeta={false}
                    showRangeSelector
                    rangeHeaderLabel={payload.ticker}
                    chartRange={priceRange}
                    onChartRangeChange={setPriceRange}
                    chartAlign="context"
                    trimLeadingPlateau
                  />
                </div>
                {payload.earnings ? (
                  <div
                    className={[
                      'pubTickerEarnings',
                      'contextCompanyEarnings',
                      payload.earnings.soon ? 'contextCompanyEarnings--soon' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <span className="contextCompanyEarningsK">EARNINGS</span>
                    <span className="contextCompanyEarningsV">{payload.earnings.label}</span>
                  </div>
                ) : null}
              </section>

              {payload.macro ? (
                <div className="contextSection pubTickerMacroSection" aria-label="Macro">
                  <div className="contextSectionHeader">
                    <div className="contextSectionTitle">MACRO</div>
                  </div>
                  <article className={['discoverMacroEvent', `discoverMacroEvent--${macroImpact}`].join(' ')}>
                    <div className="discoverMacroEventLayout">
                      <p className="discoverMacroEventTitle">{payload.macro.title}</p>
                      <div className="discoverMacroEventAside">
                        <span className="discoverMacroEventTime mono">{payload.macro.time}</span>
                        <span className="discoverMacroEventRegion mono dim">{payload.macro.region}</span>
                      </div>
                    </div>
                  </article>
                </div>
              ) : null}

              <div className="contextSection pubTickerOutcomesSection" aria-label="Historical outcomes">
                <div className="contextSectionHeader">
                  <div className="contextSectionTitle">OUTCOMES</div>
                </div>
                <div className="contextSignalCard">
                  {payload.stats.map((s, idx) => (
                    <div
                      key={s.label}
                      className={[
                        'contextSignalRow',
                        idx === 0 ? 'contextSignalRow--accent' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <span className="contextSignalK mono dim">{s.label}</span>
                      <span className={['contextSignalV', 'mono', outcomeValueTone(s.value)].filter(Boolean).join(' ')}>
                        {s.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </div>

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
        Mercerline {payload.company} ({payload.ticker}) research — SEC filings, Form 4, PTR, 13F, and catalyst timeline.
        Public delayed sample; full terminal requires subscription.
      </p>
    </div>
  )
}
