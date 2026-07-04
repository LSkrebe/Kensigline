import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MONTHLY_PRICE_USD, formatUsd } from './billingPlans.js'
import { publicTickerPageMeta } from './marketingContent.js'
import { navigateMarketing } from './marketingRoute.js'
import { applyPageMeta } from './pageMeta.js'
import { EventBriefDocCard, formatEventCardDate } from './EventBrief.jsx'
import {
  publicTickerPreviewMock,
  publicTickerSparklinePoints,
} from './publicTickerPreviewMock.js'
import './App.css'
import './PublicTickerPage.css'

function PublicTickerPriceChart({ series, label }) {
  const wrapRef = useRef(null)
  const [size, setSize] = useState({ w: 320, h: 120 })

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    function measure() {
      const rect = wrap.getBoundingClientRect()
      const w = Math.max(180, rect.width)
      const h = Math.max(72, rect.height)
      setSize((prev) => (prev.w !== w || prev.h !== h ? { w, h } : prev))
    }
    const ro = new ResizeObserver(() => requestAnimationFrame(measure))
    ro.observe(wrap)
    measure()
    return () => ro.disconnect()
  }, [])

  const vals = Array.isArray(series) ? series : []
  const min = vals.length ? Math.min(...vals) : 0
  const max = vals.length ? Math.max(...vals) : 1
  const span = max - min || 1
  const margin = { l: 36, r: 0, t: 8, b: 16 }
  const w = size.w
  const h = size.h
  const plotTop = margin.t
  const axisY = h - margin.b
  const innerW = Math.max(1, w - margin.l - margin.r)
  const innerH = Math.max(1, axisY - plotTop)

  const path = useMemo(() => {
    if (vals.length < 2) return ''
    return vals
      .map((v, i) => {
        const x = margin.l + (i / (vals.length - 1)) * innerW
        const y = plotTop + innerH * (1 - (v - min) / span)
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')
  }, [vals, min, span, innerW, innerH, plotTop, margin.l])

  const areaPath = useMemo(() => {
    if (!path || vals.length < 2) return ''
    const lastX = margin.l + innerW
    return `${path} L ${lastX.toFixed(1)} ${axisY.toFixed(1)} L ${margin.l} ${axisY.toFixed(1)} Z`
  }, [path, vals.length, innerW, axisY, margin.l])

  return (
    <div className="researchMiniPrice researchMiniPrice--chartOnly" aria-label="Price chart">
      <div ref={wrapRef} className="researchMiniPriceWrap" role="img" aria-label={`${label} price chart`}>
        {!vals.length ? (
          <div className="graphEmpty mono dim" role="status">
            No price data.
          </div>
        ) : (
          <svg className="graphSvg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" role="img">
            <defs>
              <linearGradient id="pubTickerChartGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(255, 255, 255, 0.14)" stopOpacity="1" />
                <stop offset="100%" stopColor="rgba(255, 255, 255, 0)" stopOpacity="1" />
              </linearGradient>
            </defs>
            {areaPath ? <path className="graphArea" d={areaPath} fill="url(#pubTickerChartGrad)" /> : null}
            <path
              className="graphAxis"
              d={`M ${margin.l} ${plotTop} L ${margin.l} ${axisY} L ${w - margin.r} ${axisY}`}
            />
            {path ? <path className="graphPath" d={path} fill="none" /> : null}
          </svg>
        )}
      </div>
    </div>
  )
}

export function PublicTickerPage({ ticker }) {
  const payload = publicTickerPreviewMock(ticker)
  const spark = useMemo(() => publicTickerSparklinePoints(ticker), [ticker])

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

  const eventCount = payload.events.length + payload.lockedCount

  return (
    <div className="terminalShell pubTickerShell">
      <header className="terminalTopBar pubTickerTopBar" aria-label="Mercerline public preview">
        <div className="terminalTopBarStart">
          <a className="terminalTopBarBrand pubTickerBrand" href="/" aria-label="Mercerline home" onClick={goHome}>
            <img
              className="terminalTopBarLogo"
              src="/mercerline_logo_transparent.png"
              alt=""
              width={22}
              height={22}
              decoding="async"
            />
            <span className="terminalTopBarName">MERCERLINE</span>
          </a>
        </div>

        <div className="terminalTopBarCenter pubTickerTopBarCenter mono">
          {payload.ticker} · {payload.company}
        </div>

        <div className="terminalTopBarEnd pubTickerTopBarEnd">
          <span className="pubTickerDelay mono dim">{payload.delayLabel}</span>
          <a className="pubTickerUnlockBtn" href="/sign-in" onClick={goSignIn}>
            Unlock · {formatUsd(MONTHLY_PRICE_USD)}/mo
          </a>
          <a className="pubTickerSignIn mono dim" href="/sign-in" onClick={goSignIn}>
            Sign in
          </a>
        </div>
      </header>

      <div className="terminalWorkspace">
        <main
          className="terminal terminal--main terminal--researchFeed pubTickerTerminal"
          aria-label={`${payload.ticker} research preview`}
        >
          <section
            className="panel feed feedCompact feed--left researchTicker researchFeedSlot pubTickerFeedPanel"
            aria-label="Feed"
          >
            <header className="feedCompactHeader">
              <div className="panelTitle feedCompactTitle">FEED</div>
            </header>
            <div className="feedCompactBody">
              <div className="feedCompactMain">
                <div className="feedCompactList feedCompactList--scroll scrollThin" role="list">
                  <button
                    type="button"
                    role="listitem"
                    className="feedRowCompact feedRowCompact--company isActive ideaHighlight--A"
                    aria-current="true"
                  >
                    <span className="feedCell feedCellSymbol mono kvFeedDim">{payload.ticker}</span>
                    <span className="feedCell feedCellCompany kvFeedMain">{payload.company}</span>
                    <span className="feedCell feedCellCount mono kvFeedDim">
                      <span className="feedCountTag">{eventCount}</span>
                    </span>
                    <span className="feedCell feedCellWhen mono kvFeedDim">{payload.asOfLabel}</span>
                  </button>
                </div>
                <p className="pubTickerLockNote mono dim">+{payload.lockedCount} events in live terminal</p>
              </div>
            </div>
          </section>

          <section className="panel researchPaper researchPaperPanel mainMainBlank pubTickerPaperPanel" aria-label={payload.company}>
            <header className="feedCompactHeader">
              <div className="panelTitle feedCompactTitle researchPaperPanelName">{payload.company}</div>
            </header>
            <div className="researchPaperBody scrollThin">
              <div className="researchPaperDoc">
                <div className="researchPaperTimeline researchPaperTimeline--documentsOnly">
                  <div className="researchPaperDocuments" aria-label="Filings and catalysts">
                    {payload.events.map((event, idx) => (
                      <div key={event.id}>
                        {idx > 0 ? <div className="researchPaperDocConnector" aria-hidden="true" /> : null}
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
                  </div>
                </div>
                <p className="pubTickerLockNote mono dim pubTickerLockNote--paper">
                  Full timeline, entity map, and export in the subscribed terminal.
                </p>
              </div>
            </div>
          </section>

          <section
            className="panel feed feedCompact mainContextPanel mainContextPanel--market pubTickerContextPanel"
            aria-label="Context"
          >
            <header className="feedCompactHeader researchContextHeader">
              <div className="panelTitle feedCompactTitle">CONTEXT</div>
            </header>
            <div className="mainContextPanelBody scrollThin">
              <div className="contextCompanyCard" aria-label="Company snapshot">
                <div className="contextCompanyTopRow">
                  <div className="contextCompanyTicker">{payload.ticker}</div>
                  <div className="contextCompanyPrice">${payload.price.toFixed(2)}</div>
                </div>
                <div className="contextCompanyMeta">{payload.sector}</div>
                <div className="contextCompanyMeta contextCompanyMeta--domicile">{payload.country}</div>
                <div className="contextCompanyMeta">{payload.mcap}</div>
                <div className="contextCompanyChart" aria-label="Price chart">
                  <PublicTickerPriceChart series={spark} label={payload.ticker} />
                </div>
              </div>

              {payload.macro ? (
                <div className="contextSection" aria-label="Macro">
                  <div className="contextSectionHeader">
                    <div className="contextSectionTitle">MACRO</div>
                  </div>
                  <div className="contextCatalystCard">
                    <div className="contextCatalystCardHeader">
                      <span className="contextCatalystCardTitle">{payload.macro.title}</span>
                    </div>
                    <p className="contextCatalystCardMeta mono dim">
                      {payload.macro.region} · {payload.macro.dateLabel}
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="contextSection" aria-label="Historical outcomes">
                <div className="contextSectionHeader">
                  <div className="contextSectionTitle">OUTCOMES</div>
                </div>
                <div className="contextOutcomesKvCard">
                  <div className="contextOutcomesKvStack" role="list">
                    {payload.stats.map((s) => (
                      <div key={s.label} className="contextCardOutcomeRow contextOutcomesKvRow" role="listitem">
                        <span className="contextCardOutcomeK contextOutcomesK mono dim">{s.label}</span>
                        <span className="contextCardOutcomeV contextOutcomesV mono">{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>

      <p className="pubTickerSeoVisuallyHidden">
        Mercerline {payload.company} ({payload.ticker}) research — SEC filings, Form 4, PTR, 13F, and catalyst timeline.
        Public delayed sample; full terminal requires subscription.
      </p>
    </div>
  )
}
