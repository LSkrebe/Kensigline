import { EventBriefDocCard, formatEventCardDate } from './EventBrief.jsx'
import { MiniPriceChart } from './MiniPriceChart.jsx'

function outcomeValueTone(value) {
  const v = String(value ?? '')
  if (/^\+|positive/i.test(v)) return 'contextSignalV--pos'
  if (/^−|^-|negative/i.test(v)) return 'contextSignalV--neg'
  return ''
}

export function PublicTickerContent({ payload, spark, priceRange, onChartRangeChange }) {
  const up = payload.change >= 0
  const macroImpact =
    payload.macro?.impact === 'medium' || payload.macro?.impact === 'low'
      ? payload.macro.impact
      : 'high'

  return (
    <>
      <section className="pubTickerHero" aria-label={payload.company}>
        {payload.mode === 'delayed' && payload.delayLabel ? (
          <p className="pubTickerDelayBadge mono mktEnterSeq mktEnterSeq--1" title={payload.delayNote}>
            {payload.delayLabel} · public sample
          </p>
        ) : (
          <p className="introEyebrow mono mktEnterSeq mktEnterSeq--1">
            {payload.ticker} · {payload.sector}
          </p>
        )}
        <div className="pubTickerHeroRow mktEnterSeq mktEnterSeq--2">
          <div className="pubTickerHeroCopy">
            <h1 className="pubTickerHeroTitle">{payload.company}</h1>
            <p className="pubTickerHeroMeta mono dim">
              {payload.ticker} · {payload.sector} · {payload.country} · {payload.mcap}
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

      <div className="pubTickerShell mktEnterSeq mktEnterSeq--3" aria-label="Research workspace">
        <div className="pubTickerShellGrid">
          <div className="pubTickerStream scrollThin">
            <header className="pubTickerColHead">
              <p className="introSectionKicker mono">Paper timeline</p>
              <h2 className="pubTickerColTitle">Recent events</h2>
            </header>

            <div className="pubTickerEvents" aria-label="Filings and catalysts">
              {payload.events.map((event, idx) => (
                <div key={event.id} className="pubTickerEventSlot">
                  {idx > 0 ? (
                    <div className="researchPaperDocConnector pubTickerEventConnector" aria-hidden="true" />
                  ) : null}
                  <EventBriefDocCard
                    captureId={event.id}
                    ticker={payload.ticker}
                    source={event.source}
                    dateTime={event.atIso}
                    dateLabel={formatEventCardDate(event.atIso)}
                    analysis={event.summary}
                    url={event.url}
                    className={event.ideaBest ? 'ideaHighlight--A' : ''}
                  />
                </div>
              ))}

              <div className="pubTickerEventSlot pubTickerEventSlot--lock">
                <div className="researchPaperDocConnector pubTickerEventConnector" aria-hidden="true" />
                <div className="pubTickerLock" aria-label="Additional events locked">
                  <p className="pubTickerLockLine mono">More events in live terminal</p>
                  <div className="pubTickerLockCount mono" aria-hidden="true">
                    <span className="pubTickerLockCountN">+{payload.lockedCount}</span>
                    <span className="pubTickerLockCountLabel">events</span>
                  </div>
                  <p className="pubTickerLockDetail mono dim">
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
                  onChartRangeChange={onChartRangeChange}
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
                    className={['contextSignalRow', idx === 0 ? 'contextSignalRow--accent' : '']
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <span className="contextSignalK mono dim">{s.label}</span>
                    <span
                      className={['contextSignalV', 'mono', outcomeValueTone(s.value)].filter(Boolean).join(' ')}
                    >
                      {s.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </>
  )
}
