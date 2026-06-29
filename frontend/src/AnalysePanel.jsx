import { useMemo } from 'react'
import {
  analyseGridCellTone,
  analyseMockModelForTicker,
  formatAnalyseGridValue,
} from './analyseMockData.js'

function AnalyseSectionTitle({ title, hint }) {
  return (
    <h2 className="analyseSectionTitle">
      <span className="analyseSectionLabel">{title}</span>
      {hint ? <span className="analyseSectionHint mono dim">{hint}</span> : null}
    </h2>
  )
}

function AnalyseModelGridCells({ row, values, estimate = false }) {
  return values.map((cell, i) => {
    const tone = analyseGridCellTone(cell, row.kind)
    return (
      <span
        key={`${row.label}-${estimate ? 'e' : 'h'}-${i}`}
        className={[
          'analyseModelGridCell',
          'mono',
          estimate ? 'analyseModelGridCell--estimate' : '',
          tone === 'pos' ? 'analyseModelGridCell--pos' : '',
          tone === 'neg' ? 'analyseModelGridCell--neg' : '',
          cell === '—' ? 'analyseModelGridCell--empty' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        role="cell"
      >
        {formatAnalyseGridValue(cell)}
      </span>
    )
  })
}

function AnalyseModelGrid({ rows, quarters, estimateFromIndex }) {
  const histQuarters = quarters.slice(0, estimateFromIndex)
  const estQuarters = quarters.slice(estimateFromIndex)
  const histCount = histQuarters.length
  const estCount = estQuarters.length

  return (
    <div
      className="analyseModelTable"
      style={{ '--analyse-hist-cols': histCount, '--analyse-est-cols': estCount }}
      role="table"
      aria-label="Financial model"
    >
      <div className="analyseModelRow analyseModelRow--head" role="row">
        <span className="analyseModelGridLabel analyseModelGridLabel--head" role="columnheader">
          Metric
        </span>
        {histQuarters.map((q) => (
          <span key={q} className="analyseModelGridHead mono" role="columnheader">
            {q}
          </span>
        ))}
        {estQuarters.map((q) => (
          <span
            key={q}
            className="analyseModelGridHead analyseModelGridHead--estimate mono"
            role="columnheader"
          >
            {q}
          </span>
        ))}
      </div>
      {rows.map((row, index) => (
        <div
          key={row.label}
          className={[
            'analyseModelRow',
            index === rows.length - 1 ? 'analyseModelRow--last' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          role="row"
        >
          <span className="analyseModelGridLabel" role="rowheader">
            {row.label}
          </span>
          <AnalyseModelGridCells row={row} values={row.values.slice(0, estimateFromIndex)} />
          <AnalyseModelGridCells
            row={row}
            values={row.values.slice(estimateFromIndex)}
            estimate
          />
        </div>
      ))}
      {estCount ? <div className="analyseModelEstFrame" aria-hidden="true" /> : null}
    </div>
  )
}

function AnalyseAssumptionsTable({ rows }) {
  return (
    <div className="analyseAssumptionsTable" role="table" aria-label="Forecast assumptions">
      <div className="analyseAssumptionsRow analyseAssumptionsRow--head" role="row">
        <span role="columnheader">Assumption</span>
        <span className="mono" role="columnheader">
          Value
        </span>
        <span className="mono" role="columnheader">
          Change vs prior
        </span>
      </div>
      {rows.map((row) => {
        const changeUp = String(row.change ?? '').startsWith('+') && row.change !== '+0.0%' && row.change !== '+0'
        return (
          <div key={row.label} className="analyseAssumptionsRow" role="row">
            <span role="rowheader">{row.label}</span>
            <span className="mono analyseAssumptionsValue">{row.value}</span>
            <span
              className={['mono', 'analyseAssumptionsChange', changeUp ? 'analyseAssumptionsChange--up' : '']
                .filter(Boolean)
                .join(' ')}
            >
              {row.change}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function AnalyseValuationSummary({ valuation }) {
  return (
    <div className="analyseValuationBlock" aria-label="Valuation summary">
      <div className="analyseValuationMethod mono dim">Method: {valuation.method}</div>
      <div className="analyseValuationLayout">
        <div className="analyseValuationTableWrap">
          <div className="analyseValuationTable" role="table">
            <div className="analyseValuationRow analyseValuationRow--head" role="row">
              <span role="columnheader">Metric</span>
              <span className="mono" role="columnheader">
                Current
              </span>
              <span className="mono" role="columnheader">
                Implied
              </span>
            </div>
            {valuation.rows.map((row) => (
              <div key={row.label} className="analyseValuationRow" role="row">
                <span role="rowheader">{row.label}</span>
                <span className="mono">{row.current}</span>
                <span className="mono">{row.implied}</span>
              </div>
            ))}
          </div>
          <div className="analyseFairValueCard">
            <div className="analyseFairValueK">Estimated fair value / share</div>
            <div className="analyseFairValueV mono">{valuation.fairValuePerShare}</div>
          </div>
        </div>
        <div className="analyseValuationStats">
          {valuation.stats.map((s) => (
            <div key={s.label} className="analyseValuationStat">
              <span className="analyseValuationStatK">{s.label}</span>
              <span className="analyseValuationStatV mono">{s.value}</span>
            </div>
          ))}
          <div className="analyseValuationUpside mono">{valuation.upsidePct} vs current price</div>
        </div>
      </div>
    </div>
  )
}

export function AnalysePanel({
  panelClassName = '',
  ticker,
  companyName = null,
  price = null,
  priceChange = null,
  priceChangePct = null,
  sector,
  domicile = null,
  mcap,
  earnings = null,
  children = null,
}) {
  const t = String(ticker ?? '').trim().toUpperCase()
  const showPrice = price != null && Number.isFinite(Number(price))
  const model = useMemo(() => analyseMockModelForTicker(t), [t])
  const displayName = String(companyName ?? '').trim() || t || '—'
  const metaLine = [sector, domicile].filter(Boolean).join(' · ')
  const ch = priceChange != null && Number.isFinite(Number(priceChange)) ? Number(priceChange) : null
  const chPct =
    priceChangePct != null && Number.isFinite(Number(priceChangePct)) ? Number(priceChangePct) : null
  const up = ch != null ? ch >= 0 : true
  const lastUpdated = useMemo(() => {
    const d = new Date()
    return d.toLocaleString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }, [t])

  return (
    <section
      className={['panel', 'discoverCol', 'feed', 'feedCompact', 'analyseMainPanel', panelClassName]
        .filter(Boolean)
        .join(' ')}
      aria-label="Analyse"
    >
      <header className="feedCompactHeader">
        <div className="panelTitle feedCompactTitle">ANALYSE</div>
      </header>
      <div className="feedCompactBody discoverColBody">
        <div className="feedCompactMain">
          <div className="analyseMainPanelBody discoverColScroll scrollThin">
            <div className="analyseCompanyBlock">
              <div className="contextCompanyCard analyseCompanyCard" aria-label="Company snapshot">
                <div
                  className={[
                    'contextCompanyTopRow',
                    showPrice ? '' : 'contextCompanyTopRow--tickerOnly',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <div className="contextCompanyTicker">{t || '—'}</div>
                  {showPrice ? (
                    <div className="contextCompanyPrice">${Number(price).toFixed(2)}</div>
                  ) : null}
                </div>
                {showPrice && ch != null && chPct != null ? (
                  <div
                    className={['analysePriceChange', 'mono', up ? 'isUp' : 'isDown'].filter(Boolean).join(' ')}
                  >
                    {up ? '+' : ''}
                    {ch.toFixed(2)} ({up ? '+' : ''}
                    {chPct.toFixed(2)}%)
                  </div>
                ) : null}
                <div className="contextCompanyMeta analyseCompanyName">{displayName}</div>
                {metaLine ? <div className="contextCompanyMeta contextCompanyMeta--domicile">{metaLine}</div> : null}
                {mcap || earnings ? (
                  <div className="analyseCompanyFacts">
                    {mcap ? <span className="analyseCompanyFact">{mcap}</span> : null}
                    {mcap && earnings ? <span className="analyseCompanyFactSep" aria-hidden="true" /> : null}
                    {earnings ? (
                      <span
                        className={[
                          'analyseCompanyFact analyseCompanyFact--earnings',
                          earnings.soon ? 'analyseCompanyFact--soon' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <span className="analyseCompanyFactK">Earnings</span>
                        <span className="analyseCompanyFactV mono">{earnings.label}</span>
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <section className="analyseSection" aria-label="Price and earnings chart">
                <AnalyseSectionTitle title="Price & earnings" />
                <div className="analysePriceChart contextCompanyChart">
                  {children}
                </div>
                <div className="analyseChartLegend mono" aria-hidden="true">
                  <span className="analyseChartLegendItem">
                    <span className="analyseChartLegendSwatch analyseChartLegendSwatch--price" />
                    Share price
                  </span>
                  <span className="analyseChartLegendItem">
                    <span className="analyseChartLegendSwatch analyseChartLegendSwatch--earnings" />
                    Quarterly revenue growth (YoY %)
                  </span>
                </div>
              </section>

              <section className="analyseSection" aria-label="Historical financial model">
                <AnalyseSectionTitle
                  title="Historical financial model"
                  hint={`(${model.currency} millions except per share)`}
                />
                <div className="analyseModelScroll scrollThin">
                  <AnalyseModelGrid
                    rows={model.historicalModel}
                    quarters={model.quarters}
                    estimateFromIndex={model.estimateFromIndex}
                  />
                </div>
              </section>

              <section className="analyseSection" aria-label="Business drivers">
                <AnalyseSectionTitle title="Business drivers" hint={`(${model.currency} millions)`} />
                <div className="analyseModelScroll scrollThin">
                  <AnalyseModelGrid
                    rows={model.businessDrivers}
                    quarters={model.quarters}
                    estimateFromIndex={model.estimateFromIndex}
                  />
                </div>
              </section>

              <section className="analyseSection" aria-label="Forecast assumptions">
                <AnalyseSectionTitle title="Forecast assumptions" />
                <AnalyseAssumptionsTable rows={model.assumptions} />
              </section>

              <section className="analyseSection" aria-label="Valuation summary">
                <AnalyseSectionTitle title="Valuation summary" />
                <AnalyseValuationSummary valuation={model.valuation} />
              </section>

              <footer className="analysePanelFooter mono dim">
                <span>{model.currency}</span>
                <span>Last updated {lastUpdated}</span>
              </footer>
              <p className="analysePanelNote mono dim">{model.unitNote}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
