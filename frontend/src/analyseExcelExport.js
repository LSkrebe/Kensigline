/** Build a formula-linked Mercerline analyse workbook (Shkreli-style single Model sheet). */

import ExcelJS from 'exceljs'

const TAX_RATE = 0.23
const FCF_CASH_RETAIN = 0.35
const DEBT_AMORT = 0.985

const FMT_NUM = '#,##0'
const FMT_PCT = '0.0%'
const FMT_EPS = '0.00'

const LABEL_COL = 2 // B — row labels
const FIRST_Q_COL = 3 // C — first quarter; content starts B2

function columnLetter(col) {
  let n = col
  let s = ''
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function A(col, row) {
  return `${columnLetter(col)}${row}`
}

function findRow(rows, label) {
  return rows?.find((r) => r.label === label) ?? null
}

function numAt(row, colIdx) {
  const raw = row?.values?.[colIdx]
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw ?? '').replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

function pctAt(row, colIdx) {
  const raw = row?.values?.[colIdx]
  if (typeof raw === 'number') return raw > 1 ? raw / 100 : raw
  const n = parseFloat(String(raw ?? '').replace(/%/g, '').trim())
  return Number.isFinite(n) ? n / 100 : null
}

function avgHistYoy(revenueRow, estFrom) {
  const vals = []
  for (let i = 4; i < estFrom; i += 1) {
    const cur = numAt(revenueRow, i)
    const prior = numAt(revenueRow, i - 4)
    if (cur != null && prior != null && prior !== 0) vals.push((cur - prior) / prior)
  }
  if (!vals.length) return 0.06
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

function setCell(sheet, row, col, value, style = {}) {
  const cell = sheet.getCell(row, col)
  if (value && typeof value === 'object' && 'formula' in value) {
    const raw = value.formula.startsWith('=') ? value.formula.slice(1) : value.formula
    cell.value = { formula: raw, result: value.result }
  } else {
    cell.value = value
  }
  if (style.font) cell.font = { ...(cell.font ?? {}), ...style.font }
  if (style.numFmt) cell.numFmt = style.numFmt
  if (style.alignment) cell.alignment = { ...(cell.alignment ?? {}), ...style.alignment }
  if (style.border) cell.border = style.border
  return cell
}

function setFormula(sheet, row, col, formula, style = {}) {
  setCell(sheet, row, col, { formula }, style)
}

function rollupSumFormula(col, rollupRows) {
  if (!rollupRows.length) return null
  return rollupRows.map((row) => A(col, row)).join('+')
}

function cellTextLen(cell) {
  const v = cell.value
  if (v == null || v === '') return 0
  if (typeof v === 'object') {
    if (v.formula) return Math.min(String(v.formula).length, 14)
    if (v.richText) return v.richText.map((t) => t.text).join('').length
  }
  if (typeof v === 'number') {
    const fmt = cell.numFmt
    if (fmt === FMT_PCT) return 7
    if (fmt === FMT_EPS) return 6
    return String(v).length + Math.floor(String(Math.abs(v)).length / 3)
  }
  return String(v).length
}

function autoFitSheet(sheet, minCol, maxCol, minRow, maxRow) {
  for (let c = minCol; c <= maxCol; c += 1) {
    let maxLen = c === 1 ? 6 : c === LABEL_COL ? 12 : 6
    for (let r = minRow; r <= maxRow; r += 1) {
      const cell = sheet.getCell(r, c)
      if (cell.isMerged && cell.master?.address !== cell.address) continue
      maxLen = Math.max(maxLen, cellTextLen(cell))
    }
    const cap = c === 1 ? 14 : c === LABEL_COL ? 36 : 14
    sheet.getColumn(c).width = Math.min(Math.max(maxLen * 1.12 + 2.5, c === 1 ? 10 : 8), cap)
  }
}

function buildModelSheet(workbook, model) {
  const sheet = workbook.addWorksheet('Model', {
    properties: { defaultRowHeight: 16 },
  })

  const estFrom = model.estimateFromIndex
  const qCount = model.quarters.length
  const firstQCol = FIRST_Q_COL
  const lastQCol = firstQCol + qCount - 1
  const estStartCol = firstQCol + estFrom
  const histEndIdx = estFrom - 1
  const histEndCol = firstQCol + histEndIdx
  const assumpCol = lastQCol + 2

  const revenueRow = findRow(model.historicalModel, 'Revenue')
  const grossMarginRow = findRow(model.historicalModel, 'Gross margin')
  const opMarginRow = findRow(model.historicalModel, 'Operating margin')
  const sharesRow = findRow(model.historicalModel, 'Shares outstanding (M)')
  const cashRow = findRow(model.historicalModel, 'Cash & equivalents')
  const debtRow = findRow(model.historicalModel, 'Total debt')
  const fcfRow = findRow(model.historicalModel, 'Free cash flow')

  const anchorGm = pctAt(grossMarginRow, histEndIdx) ?? 0.52
  const anchorOp = pctAt(opMarginRow, histEndIdx) ?? 0.27
  const anchorShares = numAt(sharesRow, histEndIdx) ?? 404
  const anchorRev = numAt(revenueRow, histEndIdx) ?? 1
  const anchorFcfRatio = anchorRev > 0 ? (numAt(fcfRow, histEndIdx) ?? 0) / anchorRev : 0.12
  const yoyRevGrowth = avgHistYoy(revenueRow, estFrom)

  // A1 = ticker only; model content starts column B
  setCell(sheet, 1, 1, model.ticker, { font: { bold: true, size: 12 } })
  setCell(sheet, 2, assumpCol, 'Assumptions', { font: { bold: true, size: 9 } })

  const hdrRow = 2
  model.quarters.forEach((q, i) => {
    setCell(sheet, hdrRow, firstQCol + i, q, {
      font: { bold: true, size: 9 },
      alignment: { horizontal: 'center' },
    })
  })

  const rows = {}
  let r = hdrRow + 1

  const driverLabels = model.valuationConfig?.bridgeDriverLabels ?? []
  const rollupDrivers = (model.businessDrivers ?? []).filter((d) => driverLabels.includes(d.label))
  const otherDrivers = (model.businessDrivers ?? []).filter((d) => !driverLabels.includes(d.label))
  const rollupDriverRows = []

  const driverNumStyle = {
    numFmt: FMT_NUM,
    alignment: { horizontal: 'right' },
    font: { size: 10 },
  }

  for (const driver of rollupDrivers) {
    rows[driver.label] = r
    rollupDriverRows.push(r)
    setCell(sheet, r, LABEL_COL, driver.label, { font: { size: 10 } })
    r += 1
  }

  if (rollupDriverRows.length) {
    rows.driverSubtotal = r
    setCell(sheet, r, LABEL_COL, 'Driver revenue subtotal', { font: { bold: true, size: 10 } })
    r += 1
  }

  for (const driver of otherDrivers) {
    rows[driver.label] = r
    setCell(sheet, r, LABEL_COL, driver.label, { font: { size: 10 } })
    r += 1
  }

  r += 1

  const defineRow = (key, label, opts = {}) => {
    rows[key] = r
    setCell(sheet, r, LABEL_COL, label, {
      font: { bold: Boolean(opts.bold), size: 10 },
    })
    r += 1
    return rows[key]
  }

  defineRow('revenue', 'Revenue', { bold: true })
  defineRow('grossProfit', 'Gross profit', { bold: true })
  defineRow('grossMargin', 'Gross margin')
  defineRow('opex', 'Operating expenses')
  defineRow('opIncome', 'Operating income', { bold: true })
  defineRow('opMargin', 'Operating margin')
  defineRow('netIncome', 'Net income', { bold: true })
  defineRow('eps', 'EPS')
  defineRow('shares', 'Shares outstanding (M)')
  defineRow('cash', 'Cash & equivalents')
  defineRow('debt', 'Total debt')
  defineRow('fcf', 'Free cash flow', { bold: true })

  r += 1
  defineRow('revGrowth', 'Revenue growth (YoY)')
  defineRow('epsGrowth', 'EPS growth (YoY)')

  const assumptions = [
    ['Tax rate', TAX_RATE, FMT_PCT, 'tax'],
    ['Gross margin', anchorGm, FMT_PCT, 'grossMargin'],
    ['Operating margin', anchorOp, FMT_PCT, 'opMargin'],
    ['Shares (M)', anchorShares, FMT_NUM, 'shares'],
    ['FCF / revenue', anchorFcfRatio, FMT_PCT, 'fcfRatio'],
    ['Cash on FCF', FCF_CASH_RETAIN, FMT_PCT, 'cashRetain'],
    ['Debt factor', DEBT_AMORT, '0.000', 'debtFactor'],
    ['YoY revenue growth', yoyRevGrowth, FMT_PCT, 'yoyRevGrowth'],
  ]
  const assumpRefs = {}
  assumptions.forEach((item, i) => {
    const ar = 3 + i
    const key = item[3]
    assumpRefs[key] = A(assumpCol + 1, ar)
    setCell(sheet, ar, assumpCol, item[0], { font: { size: 9, color: { argb: 'FF666666' } } })
    setCell(sheet, ar, assumpCol + 1, item[1], {
      font: { size: 9 },
      numFmt: item[2],
      alignment: { horizontal: 'right' },
    })
  })

  const taxRef = assumpRefs.tax
  const gmInputRef = assumpRefs.grossMargin
  const opInputRef = assumpRefs.opMargin
  const sharesRef = assumpRefs.shares
  const fcfRatioRef = assumpRefs.fcfRatio
  const cashRetainRef = assumpRefs.cashRetain
  const debtFactorRef = assumpRefs.debtFactor
  const yoyRef = assumpRefs.yoyRevGrowth

  const subtotalStyle = {
    numFmt: FMT_NUM,
    alignment: { horizontal: 'right' },
    font: { bold: true, size: 10 },
  }

  rollupDrivers.forEach((driver, i) => {
    const driverRow = rollupDriverRows[i]
    for (let colIdx = 0; colIdx < qCount; colIdx += 1) {
      const col = firstQCol + colIdx
      if (colIdx < estFrom) {
        const v = driver.values[colIdx]
        if (v === '—' || v == null || v === '') {
          setCell(sheet, driverRow, col, null, driverNumStyle)
        } else {
          setCell(
            sheet,
            driverRow,
            col,
            typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, '')) || null,
            driverNumStyle,
          )
        }
      } else {
        setFormula(sheet, driverRow, col, `${A(col - 4, driverRow)}*(1+${yoyRef})`, driverNumStyle)
      }
    }
  })

  for (const driver of otherDrivers) {
    const driverRow = rows[driver.label]
    for (let colIdx = 0; colIdx < estFrom; colIdx += 1) {
      const col = firstQCol + colIdx
      const v = driver.values[colIdx]
      if (v === '—' || v == null || v === '') {
        setCell(sheet, driverRow, col, null, driverNumStyle)
      } else {
        setCell(
          sheet,
          driverRow,
          col,
          typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, '')) || null,
          driverNumStyle,
        )
      }
    }
  }

  if (rows.driverSubtotal) {
    for (let colIdx = 0; colIdx < qCount; colIdx += 1) {
      const col = firstQCol + colIdx
      const parts = rollupSumFormula(col, rollupDriverRows)
      if (parts) setFormula(sheet, rows.driverSubtotal, col, parts, subtotalStyle)
    }
  }

  const numStyle = { numFmt: FMT_NUM, alignment: { horizontal: 'right' }, font: { size: 10 } }
  const boldNum = { ...numStyle, font: { bold: true, size: 10 } }
  const pctStyle = { numFmt: FMT_PCT, alignment: { horizontal: 'right' }, font: { size: 10 } }
  const epsStyle = { numFmt: FMT_EPS, alignment: { horizontal: 'right' }, font: { size: 10 } }

  for (let colIdx = 0; colIdx < qCount; colIdx += 1) {
    const col = firstQCol + colIdx
    const pyCol = col - 4
    const pqCol = col - 1

    const rev = A(col, rows.revenue)
    const gp = A(col, rows.grossProfit)
    const op = A(col, rows.opIncome)
    const ni = A(col, rows.netIncome)
    const eps = A(col, rows.eps)

    if (rows.driverSubtotal) {
      setFormula(sheet, rows.revenue, col, A(col, rows.driverSubtotal), boldNum)
    } else if (colIdx < estFrom) {
      setCell(sheet, rows.revenue, col, numAt(revenueRow, colIdx), boldNum)
    } else {
      setFormula(sheet, rows.revenue, col, `${A(pyCol, rows.revenue)}*(1+${yoyRef})`, boldNum)
    }

    setFormula(sheet, rows.grossProfit, col, `${rev}*${gmInputRef}`, boldNum)
    setFormula(sheet, rows.grossMargin, col, `${gp}/${rev}`, pctStyle)
    setFormula(sheet, rows.opIncome, col, `${rev}*${opInputRef}`, boldNum)
    setFormula(sheet, rows.opMargin, col, `${op}/${rev}`, pctStyle)
    setFormula(sheet, rows.opex, col, `${gp}-${op}`, numStyle)
    setFormula(sheet, rows.netIncome, col, `ROUND(${op}*(1-${taxRef}),0)`, boldNum)
    setFormula(sheet, rows.eps, col, `${ni}/${sharesRef}`, epsStyle)
    setFormula(sheet, rows.shares, col, sharesRef, numStyle)
    setFormula(sheet, rows.fcf, col, `ROUND(${rev}*${fcfRatioRef},0)`, boldNum)

    if (colIdx < estFrom) {
      setCell(sheet, rows.cash, col, numAt(cashRow, colIdx), numStyle)
      setCell(sheet, rows.debt, col, numAt(debtRow, colIdx), numStyle)
    } else {
      setFormula(sheet, rows.cash, col, `${A(pqCol, rows.cash)}+${A(pqCol, rows.fcf)}*${cashRetainRef}`, numStyle)
      setFormula(sheet, rows.debt, col, `${A(pqCol, rows.debt)}*${debtFactorRef}`, numStyle)
    }

    if (colIdx >= 4) {
      setFormula(sheet, rows.revGrowth, col, `(${rev}-${A(pyCol, rows.revenue)})/${A(pyCol, rows.revenue)}`, pctStyle)
      setFormula(sheet, rows.epsGrowth, col, `(${eps}-${A(pyCol, rows.eps)})/${A(pyCol, rows.eps)}`, epsStyle)
    }
  }

  if (estFrom > 0 && estFrom < qCount) {
    for (let row = hdrRow; row <= rows.epsGrowth; row += 1) {
      const cell = sheet.getCell(row, estStartCol)
      cell.border = {
        ...(cell.border ?? {}),
        left: { style: 'medium', color: { argb: 'FF4F81BD' } },
      }
    }
  }

  autoFitSheet(sheet, 1, assumpCol + 1, 1, rows.epsGrowth)
  sheet.views = [{ state: 'normal', showGridLines: true, zoomScale: 100 }]

  return sheet
}

function triggerDownload(buffer, filename) {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function exportAnalyseModelToBuffer({
  ticker,
  companyName,
  model,
  valuation = null,
  liveMarketPrice = null,
}) {
  if (!model) throw new Error('Model unavailable')

  const payload = {
    ...model,
    ticker: String(ticker ?? '').trim().toUpperCase(),
    companyName: companyName ?? ticker,
  }

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Mercerline'
  workbook.created = new Date()
  workbook.modified = new Date()
  workbook.calcProperties.fullCalcOnLoad = true

  buildModelSheet(workbook, payload)

  return workbook.xlsx.writeBuffer()
}

export async function exportAnalyseModelToExcel(opts) {
  const buffer = await exportAnalyseModelToBuffer(opts)
  const stamp = new Date().toISOString().slice(0, 10)
  const fileTicker = String(opts.ticker ?? 'TICKER').trim().toUpperCase() || 'TICKER'
  triggerDownload(buffer, `${fileTicker}_Mercerline_Model_${stamp}.xlsx`)
}
