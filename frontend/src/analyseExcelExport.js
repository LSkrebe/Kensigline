/** Shkreli-style Model sheet: default gridlines, formula totals, slim autofit columns. */

import ExcelJS from 'exceljs'

const FMT_NUM = '0'
const FMT_PCT = '0%'
const FMT_EPS = '0.00'

const FONT = { name: 'Calibri', size: 9 }
const FONT_BOLD = { name: 'Calibri', size: 9, bold: true }

const LABEL_COL = 2 // B — metric names (grid starts B2)
const FIRST_Q_COL = 3 // C — first quarter

const THIN = { style: 'thin', color: { argb: 'FF000000' } }
const BLUE = { style: 'thin', color: { argb: 'FF4F81BD' } }

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

/** Q1'20 / Q1'20E → Q120 / Q120E */
function compactQuarterLabel(label) {
  const s = String(label ?? '').trim()
  const m = s.match(/^Q([1-4])['']?(\d{2})(E)?$/i)
  if (m) return `Q${m[1]}${m[2]}${m[3] ? 'E' : ''}`
  return s.replace(/\s+/g, '')
}

function shortDriverName(label) {
  return (
    String(label ?? '')
      .replace(/\s+revenue$/i, '')
      .replace(/\s+sales$/i, '')
      .trim() || label
  )
}

function setCell(sheet, row, col, value, style = {}) {
  const cell = sheet.getCell(row, col)
  if (value && typeof value === 'object' && 'formula' in value) {
    const raw = value.formula.startsWith('=') ? value.formula.slice(1) : value.formula
    cell.value = {
      formula: raw,
      ...(value.result != null && Number.isFinite(value.result) ? { result: value.result } : {}),
    }
  } else {
    cell.value = value ?? null
  }
  cell.font = { ...FONT, ...(style.font ?? {}) }
  if (style.numFmt) cell.numFmt = style.numFmt
  if (style.alignment) cell.alignment = style.alignment
  if (style.border) cell.border = { ...(cell.border ?? {}), ...style.border }
  return cell
}

function setFormula(sheet, row, col, formula, style = {}, result = null) {
  return setCell(sheet, row, col, { formula, result }, style)
}

function formatDisplay(value, numFmt) {
  if (value == null || !Number.isFinite(Number(value))) return ''
  const n = Number(value)
  if (numFmt === FMT_PCT) return `${Math.round(n * 100)}%`
  if (numFmt === FMT_EPS) return n.toFixed(2)
  return String(Math.round(n))
}

/** Excel-style autofit after values are written (like double-clicking the col edge). */
function autoFitColumns(sheet, labelCol, firstQCol, lastQCol, maxRow) {
  // A: ticker only
  const ticker = sheet.getCell(1, 1).value
  sheet.getColumn(1).width = Math.min(Math.max(String(ticker ?? '').length + 1.25, 6), 14)

  let labelMax = 6
  for (let r = 1; r <= maxRow; r += 1) {
    const v = sheet.getCell(r, labelCol).value
    if (v != null && v !== '') labelMax = Math.max(labelMax, String(v).length)
  }
  sheet.getColumn(labelCol).width = Math.min(Math.max(labelMax + 1.25, 8), 18)

  for (let c = firstQCol; c <= lastQCol; c += 1) {
    let maxLen = 3
    for (let r = 1; r <= maxRow; r += 1) {
      const cell = sheet.getCell(r, c)
      const v = cell.value
      let text = ''
      if (v == null || v === '') {
        // skip
      } else if (typeof v === 'object' && v.formula) {
        text = formatDisplay(v.result, cell.numFmt)
      } else if (typeof v === 'number') {
        text = formatDisplay(v, cell.numFmt)
      } else {
        text = String(v)
      }
      maxLen = Math.max(maxLen, text.length)
    }
    sheet.getColumn(c).width = Math.min(Math.max(maxLen + 1.6, 5), 12)
  }
}

function applyVerticalRule(sheet, col, fromRow, toRow, side, border) {
  for (let r = fromRow; r <= toRow; r += 1) {
    const cell = sheet.getCell(r, col)
    cell.border = { ...(cell.border ?? {}), [side]: border }
  }
}

function buildModelSheet(workbook, model) {
  const sheet = workbook.addWorksheet('Model', {
    properties: { defaultRowHeight: 15 },
    views: [{ state: 'normal', showGridLines: true, zoomScale: 100 }],
  })

  const estFrom = model.estimateFromIndex ?? model.quarters.length
  const qCount = model.quarters.length
  const firstQCol = FIRST_Q_COL
  const lastQCol = firstQCol + qCount - 1
  const estStartCol = firstQCol + estFrom
  const histEndIdx = Math.max(0, estFrom - 1)

  const revenueRow = findRow(model.historicalModel, 'Revenue')
  const grossProfitRow = findRow(model.historicalModel, 'Gross profit')
  const opexRow = findRow(model.historicalModel, 'Operating expenses')
  const opIncomeRow = findRow(model.historicalModel, 'Operating income')
  const netIncomeRow = findRow(model.historicalModel, 'Net income')
  const sharesRow = findRow(model.historicalModel, 'Shares outstanding (M)')
  const fcfRow = findRow(model.historicalModel, 'Free cash flow')

  const anchorShares = numAt(sharesRow, histEndIdx) ?? 404

  const driverLabels = model.valuationConfig?.bridgeDriverLabels ?? []
  const allDrivers = model.businessDrivers ?? []
  const rollupDrivers = allDrivers.filter((d) =>
    driverLabels.length ? driverLabels.includes(d.label) : Boolean(d.rollsUpToRevenue),
  )

  const labelStyle = { font: FONT, alignment: { horizontal: 'left', vertical: 'center' } }
  const boldLabel = { font: FONT_BOLD, alignment: { horizontal: 'left', vertical: 'center' } }
  const numStyle = { font: FONT, numFmt: FMT_NUM, alignment: { horizontal: 'right', vertical: 'center' } }
  const boldNum = { font: FONT_BOLD, numFmt: FMT_NUM, alignment: { horizontal: 'right', vertical: 'center' } }
  const pctStyle = { font: FONT, numFmt: FMT_PCT, alignment: { horizontal: 'right', vertical: 'center' } }
  const boldPct = { font: FONT_BOLD, numFmt: FMT_PCT, alignment: { horizontal: 'right', vertical: 'center' } }
  const epsStyle = { font: FONT, numFmt: FMT_EPS, alignment: { horizontal: 'right', vertical: 'center' } }
  const boldEps = { font: FONT_BOLD, numFmt: FMT_EPS, alignment: { horizontal: 'right', vertical: 'center' } }

  // A1 = ticker; model grid starts at B2
  const ticker = String(model.ticker ?? '').trim().toUpperCase()
  setCell(sheet, 1, 1, ticker, { font: FONT_BOLD, alignment: { horizontal: 'left', vertical: 'center' } })

  const hdrRow = 2
  model.quarters.forEach((q, i) => {
    setCell(sheet, hdrRow, firstQCol + i, compactQuarterLabel(q), {
      font: FONT,
      alignment: { horizontal: 'right', vertical: 'center' },
    })
  })

  const rows = {}
  let r = hdrRow + 1

  const defineRow = (key, label, opts = {}) => {
    rows[key] = r
    setCell(sheet, r, LABEL_COL, label, opts.bold ? boldLabel : labelStyle)
    r += 1
    return rows[key]
  }

  const rollupDriverRows = []
  for (const driver of rollupDrivers) {
    rows[driver.label] = r
    rollupDriverRows.push(r)
    setCell(sheet, r, LABEL_COL, shortDriverName(driver.label), labelStyle)
    r += 1
  }

  defineRow('revenue', 'Revenue', { bold: true })
  defineRow('cogs', 'COGS')
  defineRow('grossProfit', 'Gross Profit')
  defineRow('opex', 'OpEx')
  defineRow('opIncome', 'OpInc')
  defineRow('other', 'Other')
  defineRow('pretax', 'Pretax')
  defineRow('taxes', 'Taxes')
  defineRow('netIncome', 'Net Income')
  defineRow('eps', 'EPS', { bold: true })
  defineRow('shares', 'Shares')

  // Empty spacer (Shkreli)
  r += 1

  defineRow('revGrowth', 'Revenue Growth', { bold: true })
  const segmentGrowthRows = []
  for (const driver of rollupDrivers) {
    const key = `growth:${driver.label}`
    defineRow(key, `${shortDriverName(driver.label)} Growth`)
    segmentGrowthRows.push({ key, label: driver.label, row: rows[key] })
  }
  defineRow('grossMargin', 'Gross Margin')
  const segmentPctRows = []
  for (const driver of rollupDrivers) {
    const key = `pct:${driver.label}`
    defineRow(key, `${shortDriverName(driver.label)} % Rev`)
    segmentPctRows.push({ key, label: driver.label, row: rows[key] })
  }

  // Empty spacer (Shkreli)
  r += 1

  defineRow('cffo', 'CFFO')
  defineRow('capex', 'CapEx')
  defineRow('fcf', 'FCF')

  const lastRow = rows.fcf

  // Historical inputs + formulas; estimate columns blank
  for (let colIdx = 0; colIdx < estFrom; colIdx += 1) {
    const col = firstQCol + colIdx
    const pyCol = col - 4

    const rev = A(col, rows.revenue)
    const cogs = A(col, rows.cogs)
    const gp = A(col, rows.grossProfit)
    const opex = A(col, rows.opex)
    const op = A(col, rows.opIncome)
    const other = A(col, rows.other)
    const pretax = A(col, rows.pretax)
    const taxes = A(col, rows.taxes)
    const ni = A(col, rows.netIncome)
    const shares = A(col, rows.shares)
    const cffo = A(col, rows.cffo)
    const capex = A(col, rows.capex)

    const segmentVals = []
    rollupDrivers.forEach((driver, i) => {
      const driverRow = rollupDriverRows[i]
      const v = driver.values[colIdx]
      if (v === '—' || v == null || v === '') {
        setCell(sheet, driverRow, col, null, numStyle)
        segmentVals.push(null)
      } else {
        const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''))
        const rounded = Number.isFinite(n) ? Math.round(n) : null
        setCell(sheet, driverRow, col, rounded, numStyle)
        segmentVals.push(rounded)
      }
    })

    const revN = rollupDriverRows.length
      ? segmentVals.every((v) => v != null)
        ? segmentVals.reduce((a, b) => a + b, 0)
        : numAt(revenueRow, colIdx)
      : numAt(revenueRow, colIdx)

    if (rollupDriverRows.length) {
      setFormula(
        sheet,
        rows.revenue,
        col,
        rollupDriverRows.map((dr) => A(col, dr)).join('+'),
        boldNum,
        revN,
      )
    } else {
      setCell(sheet, rows.revenue, col, revN, boldNum)
    }

    const gpN = numAt(grossProfitRow, colIdx)
    const cogsN = revN != null && gpN != null ? Math.round(revN - gpN) : null
    setCell(sheet, rows.cogs, col, cogsN, numStyle)
    setFormula(sheet, rows.grossProfit, col, `${rev}-${cogs}`, numStyle, gpN)

    const opexN = numAt(opexRow, colIdx)
    setCell(sheet, rows.opex, col, opexN, numStyle)
    const opN = gpN != null && opexN != null ? gpN - opexN : numAt(opIncomeRow, colIdx)
    setFormula(sheet, rows.opIncome, col, `${gp}-${opex}`, numStyle, opN)

    const niN = numAt(netIncomeRow, colIdx)
    const otherN = 0
    const pretaxN = opN != null ? opN + otherN : null
    const taxesN = pretaxN != null && niN != null ? Math.round(pretaxN - niN) : null
    setCell(sheet, rows.other, col, otherN, numStyle)
    setFormula(sheet, rows.pretax, col, `${op}+${other}`, numStyle, pretaxN)
    setCell(sheet, rows.taxes, col, taxesN, numStyle)
    setFormula(sheet, rows.netIncome, col, `${pretax}-${taxes}`, numStyle, niN)

    const sh = numAt(sharesRow, colIdx) ?? anchorShares
    setCell(sheet, rows.shares, col, sh, numStyle)
    const epsN = niN != null && sh ? niN / sh : null
    setFormula(sheet, rows.eps, col, `${ni}/${shares}`, boldEps, epsN)

    if (colIdx >= 4) {
      const priorRev = numAt(revenueRow, colIdx - 4)
      const revGrowthN =
        priorRev && revN != null ? (revN - priorRev) / priorRev : null
      setFormula(
        sheet,
        rows.revGrowth,
        col,
        `IF(${A(pyCol, rows.revenue)}=0,0,(${rev}-${A(pyCol, rows.revenue)})/${A(pyCol, rows.revenue)})`,
        boldPct,
        revGrowthN,
      )
      for (const g of segmentGrowthRows) {
        const dr = rows[g.label]
        const driver = rollupDrivers.find((d) => d.label === g.label)
        const cur = numAt(driver, colIdx)
        const prior = numAt(driver, colIdx - 4)
        const gN = prior && cur != null ? (cur - prior) / prior : null
        setFormula(
          sheet,
          g.row,
          col,
          `IF(${A(pyCol, dr)}=0,0,(${A(col, dr)}-${A(pyCol, dr)})/${A(pyCol, dr)})`,
          pctStyle,
          gN,
        )
      }
    }

    const gmN = revN ? (gpN ?? 0) / revN : null
    setFormula(sheet, rows.grossMargin, col, `IF(${rev}=0,0,${gp}/${rev})`, pctStyle, gmN)
    for (const p of segmentPctRows) {
      const dr = rows[p.label]
      const driver = rollupDrivers.find((d) => d.label === p.label)
      const cur = numAt(driver, colIdx)
      const pctN = revN && cur != null ? cur / revN : null
      setFormula(sheet, p.row, col, `IF(${rev}=0,0,${A(col, dr)}/${rev})`, pctStyle, pctN)
    }

    const fcfN = numAt(fcfRow, colIdx)
    setCell(sheet, rows.cffo, col, fcfN, numStyle)
    setCell(sheet, rows.capex, col, 0, numStyle)
    setFormula(sheet, rows.fcf, col, `${cffo}-${capex}`, numStyle, fcfN)
  }

  // Only borders Shkreli uses:
  // 1) one horizontal under quarter headers
  // 2) vertical to the right of metric names
  // 3) vertical where forward quarters start
  for (let c = LABEL_COL; c <= lastQCol; c += 1) {
    const cell = sheet.getCell(hdrRow, c)
    cell.border = { ...(cell.border ?? {}), bottom: THIN }
  }
  applyVerticalRule(sheet, LABEL_COL, hdrRow, lastRow, 'right', THIN)
  if (estFrom > 0 && estFrom < qCount) {
    applyVerticalRule(sheet, estStartCol, hdrRow, lastRow, 'left', BLUE)
  }

  for (let row = 1; row <= lastRow; row += 1) {
    sheet.getRow(row).height = 15
  }

  // Write numbers first, then resize like double-clicking the column edge
  autoFitColumns(sheet, LABEL_COL, firstQCol, lastQCol, lastRow)
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

export async function exportAnalyseModelToBuffer({ ticker, companyName, model }) {
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
