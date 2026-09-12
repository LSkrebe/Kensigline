import { useCallback, useEffect, useRef, useState } from 'react'
import {
  analyseCellOverrideModified,
  analyseGridCellTone,
  formatAnalyseGridValue,
  isValidAnalyseCellInput,
  parseAnalyseCellInput,
  parseAnalyseGridInput,
} from './analyseMockData.js'

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
  const display = formatAnalyseGridValue(value, row)
  const tone = analyseGridCellTone(value, row.kind)
  const empty = !display || /^[-–—−]+$/.test(String(display).trim())

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
    empty ? 'analyseModelGridCell--empty' : '',
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
        {display}
      </span>
    )
  }

  return (
    <span className={className} role="cell">
      {display}
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

export function AnalyseModelGrid({
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
