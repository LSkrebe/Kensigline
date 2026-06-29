import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  analyseGridCellTone,
  analyseMockModelForTicker,
  applyForecastOverrides,
  formatAnalyseGridValue,
  isForecastEditableDriver,
  parseAnalyseGridInput,
} from './analyseMockData.js'

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
    const n = typeof value === 'number' ? value : parseAnalyseGridInput(value)
    setDraft(n != null ? String(n) : '')
    setEditing(true)
  }, [editable, value])

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const commit = useCallback(() => {
    const n = parseAnalyseGridInput(draft)
    if (n != null && n > 0) onEstimateEdit?.(row.label, colIndex, n)
    setEditing(false)
  }, [colIndex, draft, onEstimateEdit, row.label])

  const className = [
    'analyseModelGridCell',
    'mono',
    estimate ? 'analyseModelGridCell--estimate' : '',
    editable ? 'analyseModelGridCell--editable' : '',
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
        title="Click to edit forecast"
        onClick={startEdit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            startEdit()
          }
        }}
      >
        {formatAnalyseGridValue(value)}
      </span>
    )
  }

  return (
    <span className={className} role="cell">
      {formatAnalyseGridValue(value)}
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
      editable && override != null && baseRowValues?.[colIndex] !== override

    return (
      <AnalyseModelGridCell
        key={`${row.label}-${estimate ? 'e' : 'h'}-${i}`}
        row={row}
        value={cell}
        estimate={estimate}
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
  editableRowFn,
  forecastOverrides,
  baseRowsByLabel,
  onEstimateEdit,
}) {
  const histQuarters = quarters.slice(0, estimateFromIndex)
  const estQuarters = quarters.slice(estimateFromIndex)
  const histCount = histQuarters.length
  const estCount = estQuarters.length
  const tableRef = useRef(null)
  const estStartRef = useRef(null)
  const estEndRef = useRef(null)
  const [estFrame, setEstFrame] = useState(null)

  const syncEstFrame = useCallback(() => {
    const table = tableRef.current
    const start = estStartRef.current
    const end = estEndRef.current
    if (!table || !start || !end) return
    const tableRect = table.getBoundingClientRect()
    const padLeft = table.clientLeft
    const startRect = start.getBoundingClientRect()
    const endRect = end.getBoundingClientRect()
    setEstFrame({
      left: startRect.left - tableRect.left - padLeft,
      width: endRect.right - startRect.left,
    })
  }, [])

  useEffect(() => {
    if (!estCount) return undefined
    syncEstFrame()
    const table = tableRef.current
    if (!table) return undefined
    const ro = new ResizeObserver(syncEstFrame)
    ro.observe(table)
    window.addEventListener('resize', syncEstFrame)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', syncEstFrame)
    }
  }, [estCount, syncEstFrame, histCount, rows.length, quarters.join('|')])

  return (
    <div
      ref={tableRef}
      className="analyseModelTable"
      style={{
        '--analyse-hist-cols': histCount,
        '--analyse-est-cols': estCount,
        ...(estFrame
          ? {
              '--analyse-est-left': `${estFrame.left}px`,
              '--analyse-est-width': `${estFrame.width}px`,
            }
          : {}),
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
            ref={i === 0 ? estStartRef : i === estQuarters.length - 1 ? estEndRef : undefined}
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
          <AnalyseModelGridCells
            row={row}
            values={row.values.slice(0, estimateFromIndex)}
            estimateFromIndex={estimateFromIndex}
            editableRowFn={editableRowFn}
            forecastOverrides={forecastOverrides}
            baseRowValues={baseRowsByLabel?.[row.label]}
          />
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
        </div>
      ))}
      {estCount ? <div className="analyseModelEstFrame" aria-hidden="true" /> : null}
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
  const baseModel = useMemo(() => analyseMockModelForTicker(t), [t])
  const [forecastOverrides, setForecastOverrides] = useState({})

  useEffect(() => {
    setForecastOverrides({})
  }, [baseModel])

  const model = useMemo(
    () => applyForecastOverrides(baseModel, forecastOverrides),
    [baseModel, forecastOverrides],
  )

  const forecastEdited = Object.values(forecastOverrides).some(
    (byCol) => byCol && Object.keys(byCol).length > 0,
  )

  const baseRowsByLabel = useMemo(() => {
    const map = {}
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

              <section className="analyseSection" aria-label="Business drivers">
                <div className="analyseSectionHead">
                  <AnalyseSectionTitle
                    title="Business drivers"
                    hintLines={[
                      `${model.currency} millions`,
                      'Click green cells to edit forecast inputs',
                    ]}
                  />
                  {forecastEdited ? (
                    <button
                      type="button"
                      className="analyseForecastReset mono"
                      onClick={onForecastReset}
                    >
                      Reset forecast
                    </button>
                  ) : null}
                </div>
                <div className="analyseModelScroll scrollThin">
                  <AnalyseModelGrid
                    rows={model.businessDrivers}
                    quarters={model.quarters}
                    estimateFromIndex={model.estimateFromIndex}
                    editableRowFn={isForecastEditableDriver}
                    forecastOverrides={forecastOverrides}
                    baseRowsByLabel={baseRowsByLabel}
                    onEstimateEdit={onEstimateEdit}
                  />
                </div>
              </section>

              <section className="analyseSection" aria-label="Historical financial model">
                <AnalyseSectionTitle
                  title="Historical financial model"
                  hintLines={[
                    `${model.currency} millions except per share`,
                    'Forecast derived from drivers',
                  ]}
                />
                <div className="analyseModelScroll scrollThin">
                  <AnalyseModelGrid
                    rows={model.historicalModel}
                    quarters={model.quarters}
                    estimateFromIndex={model.estimateFromIndex}
                    forecastOverrides={forecastOverrides}
                    baseRowsByLabel={baseRowsByLabel}
                  />
                </div>
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
