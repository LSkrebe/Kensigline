import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  analyseCellOverrideModified,
  analyseGridCellTone,
  analyseMockModelForTicker,
  analyseRevenueOverlayMeta,
  applyForecastOverrides,
  computeValuationView,
  formatAnalyseGridValue,
  isForecastEditablePnlRow,
  isValidAnalyseCellInput,
  parseAnalyseCellInput,
  parseAnalyseGridInput,
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

function AnalyseModelGridCell({
  row,
  value,
  estimate,
  estimateStart = false,
  colIndex,
  editable,
  modified,
  onEstimateEdit,
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef(null)
  const tone = analyseGridCellTone(value, row.kind)

  const startEdit = useCallback(() => {
    if (!editable) return
    const n =
      typeof value === 'number'
        ? value
        : row.kind === 'pct'
          ? parseAnalyseCellInput(row, value)
          : parseAnalyseGridInput(value)
    setDraft(n != null ? String(n) : '')
    setEditing(true)
  }, [editable, row, value])

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const commit = useCallback(() => {
    const n = parseAnalyseCellInput(row, draft)
    if (isValidAnalyseCellInput(row, n)) onEstimateEdit?.(row.label, colIndex, n)
    setEditing(false)
  }, [colIndex, draft, onEstimateEdit, row])

    const className = [
    'analyseModelGridCell',
    'mono',
    estimate ? 'analyseModelGridCell--estimate' : '',
    estimateStart ? 'analyseModelGridCell--estimateStart' : '',
    editable ? 'analyseModelGridCell--editable' : '',
    row.readOnly ? 'analyseModelGridCell--readonly' : '',
    modified ? 'analyseModelGridCell--modified' : '',
    tone === 'pos' ? 'analyseModelGridCell--pos' : '',
    tone === 'neg' ? 'analyseModelGridCell--neg' : '',
    value === '—' ? 'analyseModelGridCell--empty' : '',
  ]
    .filter(Boolean)
    .join(' ')

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="analyseModelGridCellInput mono"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            setEditing(false)
          }
        }}
        aria-label={`Edit ${row.label}`}
      />
    )
  }

  if (editable) {
    return (
      <span
        className={className}
        role="button"
        tabIndex={0}
        title={modified ? 'Edited — click to change' : 'Click to edit forecast'}
        onClick={startEdit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            startEdit()
          }
        }}
      >
        {formatAnalyseGridValue(value, row)}
      </span>
    )
  }

  return (
    <span className={className} role="cell">
      {formatAnalyseGridValue(value, row)}
    </span>
  )
}

function AnalyseModelGridCells({
  row,
  values,
  estimate = false,
  estimateFromIndex = 0,
  editableRowFn,
  forecastOverrides,
  baseRowValues,
  onEstimateEdit,
}) {
  return values.map((cell, i) => {
    const colIndex = estimate ? estimateFromIndex + i : i
    const editable = estimate && onEstimateEdit && editableRowFn?.(row)
    const override = forecastOverrides?.[row.label]?.[colIndex]
    const modified =
      editable &&
      override != null &&
      !analyseCellOverrideModified(row, baseRowValues?.[colIndex], override)

    return (
      <AnalyseModelGridCell
        key={`${row.label}-${estimate ? 'e' : 'h'}-${i}`}
        row={row}
        value={cell}
        estimate={estimate}
        estimateStart={estimate && i === 0}
        colIndex={colIndex}
        editable={editable}
        modified={modified}
        onEstimateEdit={onEstimateEdit}
      />
    )
  })
}

function AnalyseModelGrid({
  rows,
  quarters,
  estimateFromIndex,
  showEstimates = true,
  editableRowFn,
  forecastOverrides,
  baseRowsByLabel,
  onEstimateEdit,
}) {
  const histQuarters = quarters.slice(0, estimateFromIndex)
  const estQuarters = showEstimates ? quarters.slice(estimateFromIndex) : []
  const histCount = histQuarters.length
  const estCount = estQuarters.length

  return (
    <div
      className={[
        'analyseModelTable',
        showEstimates ? '' : 'analyseModelTable--historicalOnly',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        '--analyse-hist-cols': histCount,
        '--analyse-est-cols': estCount,
      }}
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
        {estQuarters.map((q, i) => (
          <span
            key={q}
            className={[
              'analyseModelGridHead',
              'analyseModelGridHead--estimate',
              'mono',
              i === 0 ? 'analyseModelGridHead--estimateStart' : '',
            ]
              .filter(Boolean)
              .join(' ')}
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
          <AnalyseModelGridCells
            row={row}
            values={row.values.slice(0, estimateFromIndex)}
            estimateFromIndex={estimateFromIndex}
            editableRowFn={editableRowFn}
            forecastOverrides={forecastOverrides}
            baseRowValues={baseRowsByLabel?.[row.label]}
          />
          {showEstimates ? (
            <AnalyseModelGridCells
              row={row}
              values={row.values.slice(estimateFromIndex)}
              estimate
              estimateFromIndex={estimateFromIndex}
              editableRowFn={editableRowFn}
              forecastOverrides={forecastOverrides}
              baseRowValues={baseRowsByLabel?.[row.label]}
              onEstimateEdit={onEstimateEdit}
            />
          ) : null}
        </div>
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

  const revenueOverlayMeta = useMemo(
    () => analyseRevenueOverlayMeta(quarterlyRevenueOverlay, chartRange),
    [quarterlyRevenueOverlay, chartRange],
  )

  const displayName = String(companyName ?? '').trim() || t || '—'
  const metaLine = [sector, domicile].filter(Boolean).join(' · ')
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
                  {metaLine ? (
                    <div className="contextCompanyMeta contextCompanyMeta--domicile">{metaLine}</div>
                  ) : null}
                  {mcap ? <div className="contextCompanyMeta analyseCompanyMcap">{mcap}</div> : null}
                </div>
              </div>
            </div>

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

              {!modelReady ? (
                <div className="analyseSection analyseSection--loading mono dim">
                  {modelLoading ? 'Loading financial model…' : 'Financial model unavailable.'}
                </div>
              ) : (
                <>
              <section className="analyseSection" aria-label={driverSectionTitle}>
                <AnalyseSectionTitle title={driverSectionTitle} hintLines={[unitHint]} />
                <div className="analyseModelScroll scrollThin">
                  <AnalyseModelGrid
                    rows={model.businessDrivers}
                    quarters={model.quarters}
                    estimateFromIndex={model.estimateFromIndex}
                    showEstimates={false}
                  />
                </div>
              </section>

              <section className="analyseSection" aria-label="Financial model">
                <div className="analyseSectionHead">
                  <AnalyseSectionTitle
                    title="Financial model"
                    hintLines={[perShareHint, 'Click forward revenue or gross margin to edit']}
                  />
                  {forecastEdited ? (
                    <button
                      type="button"
                      className="analyseForecastReset mono"
                      onClick={onForecastReset}
                    >
                      Reset forecast
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

              <section className="analyseSection" aria-label="Price vs your model">
                <AnalyseSectionTitle title="Price vs your model" hintLines={[perShareHint]} />
                <AnalyseValuationSummary
                  valuation={valuation}
                  forecastQuarterOptions={forecastQuarterOptions}
                  selectedColIndex={selectedValuationCol}
                  onForecastQuarterChange={onForecastQuarterChange}
                />
              </section>
                </>
              )}
          </div>
        </div>
      </div>
    </section>
  )
}
