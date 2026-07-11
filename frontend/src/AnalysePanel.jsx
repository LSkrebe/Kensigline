import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnalyseModelGrid } from './AnalyseModelGrid.jsx'
import {
  analyseMockModelForTicker,
  analyseRevenueOverlayMeta,
  applyForecastOverrides,
  computeValuationView,
  isForecastEditablePnlRow,
} from './analyseMockData.js'

const ANALYSE_PRICE_RANGE_OPTS = ['1M', '3M', '6M', '1Y', 'ALL']

function preventScrollChurnFocus(e) {
  e.preventDefault()
}

function AnalyseSectionTitle({ title, hintLines }) {
  const lines = hintLines?.filter(Boolean) ?? []
  return (
    <div className="analyseSectionTitle">
      <h2 className="analyseSectionLabel">{title}</h2>
      {lines.map((line) => (
        <span key={line} className="analyseSectionHint mono dim">
          {line}
        </span>
      ))}
    </div>
  )
}

function AnalyseValuationSummary({
  valuation,
  forecastQuarterOptions,
  selectedColIndex,
  onForecastQuarterChange,
}) {
  if (!valuation) return null

  const { headline, bridge, details } = valuation

  return (
    <div className="analyseValuationBlock" aria-label="Price vs your model">
      <div
        className={[
          'analyseValuationVerdict',
          headline.upsideUp ? 'isUp' : 'isDown',
        ].join(' ')}
      >
        <div className="analyseValuationVerdictMain">
          <div className="analyseValuationVerdictLead">
            <div className="analyseValuationVerdictPrice mono">{headline.priceTargetFmt}</div>
            <div
              className={[
                'analyseValuationVerdictUpside',
                'mono',
                headline.upsideUp ? 'isUp' : 'isDown',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {headline.upsidePct}
            </div>
          </div>
          {forecastQuarterOptions?.length ? (
            <div
              className="analyseValuationQuarterRange researchPriceRange"
              role="group"
              aria-label="Forecast quarter"
            >
              {forecastQuarterOptions.map((opt) => (
                <button
                  key={opt.colIndex}
                  type="button"
                  className={[
                    'analyseValuationQuarterBtn',
                    'researchPriceRangeBtn',
                    'mono',
                    selectedColIndex === opt.colIndex ? 'isActive' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => onForecastQuarterChange?.(opt.colIndex)}
                  onMouseDown={preventScrollChurnFocus}
                  aria-pressed={selectedColIndex === opt.colIndex}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="analyseValuationVerdictQuarter mono">{headline.forecastPeriod}</div>
          )}
        </div>
        <div className="analyseValuationBridge mono" aria-label="Forecast to price target">
          <div className="analyseValuationBridgeValues">{bridge.valuesLine}</div>
          <div className="analyseValuationBridgeFormula">{bridge.formulaLine}</div>
        </div>
      </div>

      <div className="analyseValuationTable" role="table">
        <div className="analyseValuationRow analyseValuationRow--head" role="row">
          <span role="columnheader">Metric</span>
          <span className="mono" role="columnheader">
            Your model
          </span>
          <span className="mono" role="columnheader">
            Market today
          </span>
        </div>
        {details.rows.map((row) => (
          <div key={row.label} className="analyseValuationRow" role="row">
            <span role="rowheader">{row.label}</span>
            <span className="mono">{row.model}</span>
            <span className="mono analyseValuationRowMarket">{row.market}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function AnalysePanel({
  panelClassName = '',
  embedded = false,
  omitSections = {},
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
  quarterlyRevenueOverlay = null,
  chartRange = '6M',
  onChartRangeChange,
  backendUp = false,
  liveModel = null,
  modelLoading = false,
}) {
  const t = String(ticker ?? '').trim().toUpperCase()
  const showPrice = price != null && Number.isFinite(Number(price))
  const baseModel = useMemo(() => {
    if (backendUp && liveModel) return liveModel
    if (backendUp && modelLoading) return null
    return analyseMockModelForTicker(t)
  }, [backendUp, liveModel, modelLoading, t])
  const [forecastOverrides, setForecastOverrides] = useState({})
  const [exportBusy, setExportBusy] = useState(false)
  const [valuationQuarterIndex, setValuationQuarterIndex] = useState(null)
  const scrollRef = useRef(null)
  const scrollSnapRef = useRef(null)

  const captureScrollSnap = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 8
    scrollSnapRef.current = { scrollTop: el.scrollTop, pinBottom: atBottom }
  }, [])

  const onForecastQuarterChange = useCallback((colIndex) => {
    captureScrollSnap()
    setValuationQuarterIndex(colIndex)
  }, [captureScrollSnap])

  useEffect(() => {
    setForecastOverrides({})
    setValuationQuarterIndex(null)
  }, [t, liveModel])

  const model = useMemo(
    () => (baseModel ? applyForecastOverrides(baseModel, forecastOverrides) : null),
    [baseModel, forecastOverrides],
  )

  const forecastQuarterOptions = useMemo(() => {
    if (!model) return []
    const from = model.estimateFromIndex
    const opts = []
    for (let i = 0; i < 4 && from + i < model.quarters.length; i++) {
      opts.push({
        label: model.quarters[from + i],
        colIndex: from + i,
      })
    }
    return opts
  }, [model])

  const defaultValuationCol =
    model?.valuationConfig?.defaultColumnIndex ?? model?.estimateFromIndex ?? 0
  const selectedValuationCol = valuationQuarterIndex ?? defaultValuationCol

  const valuation = useMemo(
    () =>
      model ? computeValuationView(model, showPrice ? Number(price) : null, selectedValuationCol) : null,
    [model, showPrice, price, selectedValuationCol],
  )

  useLayoutEffect(() => {
    const el = scrollRef.current
    const snap = scrollSnapRef.current
    if (!el || !snap) return
    scrollSnapRef.current = null
    if (snap.pinBottom) {
      el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight)
    } else {
      el.scrollTop = snap.scrollTop
    }
  }, [selectedValuationCol, valuation])

  const forecastEdited = Object.values(forecastOverrides).some(
    (byCol) => byCol && Object.keys(byCol).length > 0,
  )

  const baseRowsByLabel = useMemo(() => {
    const map = {}
    if (!baseModel) return map
    for (const row of [...baseModel.historicalModel, ...baseModel.businessDrivers]) {
      map[row.label] = row.values
    }
    return map
  }, [baseModel])

  const onEstimateEdit = useCallback((rowLabel, colIndex, value) => {
    setForecastOverrides((prev) => ({
      ...prev,
      [rowLabel]: { ...prev[rowLabel], [colIndex]: value },
    }))
  }, [])

  const onForecastReset = useCallback(() => {
    setForecastOverrides({})
  }, [])

  const displayName = String(companyName ?? '').trim() || t || '—'

  const onExportExcel = useCallback(async () => {
    if (!model || exportBusy) return
    setExportBusy(true)
    try {
      const { exportAnalyseModelToExcel } = await import('./analyseExcelExport.js')
      await exportAnalyseModelToExcel({
        ticker: t,
        companyName: displayName,
        model,
        valuation,
        liveMarketPrice: showPrice ? Number(price) : null,
      })
    } catch (err) {
      console.error('Analyse Excel export failed', err)
    } finally {
      setExportBusy(false)
    }
  }, [model, exportBusy, t, displayName, valuation, showPrice, price])

  const revenueOverlayMeta = useMemo(
    () => analyseRevenueOverlayMeta(quarterlyRevenueOverlay, chartRange),
    [quarterlyRevenueOverlay, chartRange],
  )

  const ch = priceChange != null && Number.isFinite(Number(priceChange)) ? Number(priceChange) : null
  const chPct =
    priceChangePct != null && Number.isFinite(Number(priceChangePct)) ? Number(priceChangePct) : null
  const up = ch != null ? ch >= 0 : true
  const lastUpdated = useMemo(() => {
    const d = new Date()
    return d.toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
    })
  }, [t])

  const driverSectionTitle = model?.driverSectionTitle ?? 'Business drivers'
  const unitHint = model?.driverUnitHint ?? `${model?.currency ?? 'USD'} millions`
  const perShareHint = model?.projectionNote ?? `${model?.currency ?? 'USD'} millions except per share`
  const modelReady = Boolean(model)
  const showSection = (key) => omitSections[key] !== true
  const showModelBlock =
    showSection('drivers') || showSection('model') || showSection('valuation')

  const body = (
    <>
            {showSection('hero') ? (
            <div className="analyseCompanyHero">
              <div className="contextCompanyCard analyseCompanyCard" aria-label="Company snapshot">
                <div
                  className={[
                    'contextCompanyTopRow',
                    showPrice ? '' : 'contextCompanyTopRow--tickerOnly',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <div className="analyseCompanyTickerCol">
                    <div className="contextCompanyTicker">{t || '—'}</div>
                    {earnings ? (
                      <div
                        className={[
                          'analyseCompanyEarnings',
                          'mono',
                          earnings.soon ? 'isSoon' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        Earnings {earnings.label}
                      </div>
                    ) : null}
                  </div>
                  {showPrice ? (
                    <div className="analyseCompanyPriceCol">
                      <div className="contextCompanyPrice">${Number(price).toFixed(2)}</div>
                      {ch != null && chPct != null ? (
                        <div
                          className={['analysePriceChange', 'mono', up ? 'isUp' : 'isDown']
                            .filter(Boolean)
                            .join(' ')}
                        >
                          {up ? '+' : ''}
                          {ch.toFixed(2)} ({up ? '+' : ''}
                          {chPct.toFixed(2)}%)
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="analyseCompanyMetaStack">
                  <div className="contextCompanyMeta analyseCompanyName">{displayName}</div>
                  {sector ? (
                    <div className="contextCompanyMeta analyseCompanySector">{sector}</div>
                  ) : null}
                  {domicile ? (
                    <div className="contextCompanyMeta contextCompanyMeta--domicile">{domicile}</div>
                  ) : null}
                  {mcap ? <div className="contextCompanyMeta analyseCompanyMcap">{mcap}</div> : null}
                </div>
              </div>
            </div>
            ) : null}

            {showSection('chart') ? (
            <section className="analyseSection" aria-label="Price and earnings chart">
              <div className="analyseSectionHead">
                <AnalyseSectionTitle
                  title="Price & earnings"
                  hintLines={[`Last updated ${lastUpdated}`]}
                />
                <div className="researchPriceRange analyseSectionChartRange" role="group" aria-label="Chart range">
                  {ANALYSE_PRICE_RANGE_OPTS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={['researchPriceRangeBtn', chartRange === r ? 'isActive' : '']
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => onChartRangeChange?.(r)}
                      aria-pressed={chartRange === r}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <div className="analysePriceChart contextCompanyChart">{children}</div>
                <div className="analyseChartLegend mono" aria-hidden="true">
                  <span className="analyseChartLegendItem">
                    <span className="analyseChartLegendSwatch analyseChartLegendSwatch--price" />
                    Share price
                  </span>
                  <span className="analyseChartLegendItem">
                    <span className="analyseChartLegendSwatch analyseChartLegendSwatch--earnings" />
                    Revenue growth YoY
                    {revenueOverlayMeta.latestPct ? (
                      <span
                        className={[
                          'analyseChartLegendValue',
                          revenueOverlayMeta.tone === 'down' ? 'isDown' : 'isUp',
                        ].join(' ')}
                      >
                        {revenueOverlayMeta.latestPct}
                      </span>
                    ) : null}
                  </span>
                </div>
              </section>
            ) : null}

              {showModelBlock ? (
              !modelReady ? (
                <div className="analyseSection analyseSection--loading mono dim">
                  {modelLoading ? 'Loading financial model…' : 'Financial model unavailable.'}
                </div>
              ) : (
                <>
              {showSection('drivers') ? (
              <section className="analyseSection" aria-label={driverSectionTitle}>
                <div className="analyseSectionHead analyseSectionHead--drivers">
                  <AnalyseSectionTitle title={driverSectionTitle} hintLines={[unitHint]} />
                  {modelReady ? (
                    <button
                      type="button"
                      className="analyseForecastExport mono"
                      aria-label="Export analyse model to Excel"
                      disabled={exportBusy}
                      onClick={() => void onExportExcel()}
                    >
                      EXPORT
                    </button>
                  ) : null}
                </div>
                <div className="analyseModelScroll scrollThin">
                  <AnalyseModelGrid
                    rows={model.businessDrivers}
                    quarters={model.quarters}
                    estimateFromIndex={model.estimateFromIndex}
                    showEstimates={false}
                  />
                </div>
              </section>
              ) : null}

              {showSection('model') ? (
              <section className="analyseSection" aria-label="Financial model">
                <div className="analyseSectionHead analyseSectionHead--forecast">
                  <AnalyseSectionTitle
                    title="Financial model"
                    hintLines={[perShareHint]}
                  />
                  {forecastEdited ? (
                    <button
                      type="button"
                      className="analyseForecastReset mono"
                      aria-label="Reset forecast"
                      onClick={onForecastReset}
                    >
                      RESET
                    </button>
                  ) : (
                    <span className="analyseForecastEditable mono">Editable</span>
                  )}
                </div>
                <div className="analyseModelScroll scrollThin">
                  <AnalyseModelGrid
                    rows={model.historicalModel}
                    quarters={model.quarters}
                    estimateFromIndex={model.estimateFromIndex}
                    editableRowFn={isForecastEditablePnlRow}
                    forecastOverrides={forecastOverrides}
                    baseRowsByLabel={baseRowsByLabel}
                    onEstimateEdit={onEstimateEdit}
                  />
                </div>
              </section>
              ) : null}

              {showSection('valuation') ? (
              <section className="analyseSection" aria-label="Price vs your model">
                <AnalyseSectionTitle title="Price vs your model" hintLines={[perShareHint]} />
                <AnalyseValuationSummary
                  valuation={valuation}
                  forecastQuarterOptions={forecastQuarterOptions}
                  selectedColIndex={selectedValuationCol}
                  onForecastQuarterChange={onForecastQuarterChange}
                />
              </section>
              ) : null}
                </>
              )
              ) : null}
    </>
  )

  if (embedded) {
    return (
      <div
        className={['analyseMainPanelBody', 'analyseMainPanelBody--embedded', panelClassName]
          .filter(Boolean)
          .join(' ')}
      >
        {body}
      </div>
    )
  }

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
          <div ref={scrollRef} className="analyseMainPanelBody discoverColScroll scrollThin">
            {body}
          </div>
        </div>
      </div>
    </section>
  )
}
