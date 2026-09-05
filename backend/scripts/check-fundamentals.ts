import { quarterlyPnlFromCompanyFacts } from '../src/analyse/quarterly-pnl.js'

const res = await fetch('https://data.sec.gov/api/xbrl/companyfacts/CIK0000059478.json', {
  headers: { 'User-Agent': 'Mercerline research contact@mercerline.com' },
})
const facts = await res.json()
const points = quarterlyPnlFromCompanyFacts(facts, { quarters: 2 })
for (const p of points) {
  const netCash =
    p.cashUsd != null && p.debtUsd != null ? (p.cashUsd - p.debtUsd) / 1e9 : null
  const grossMargin =
    p.revenueUsd && p.grossProfitUsd ? (p.grossProfitUsd / p.revenueUsd) * 100 : null
  const netMargin =
    p.revenueUsd && p.netIncomeUsd ? (p.netIncomeUsd / p.revenueUsd) * 100 : null
  const fcfMargin = p.revenueUsd && p.fcfUsd ? (p.fcfUsd / p.revenueUsd) * 100 : null
  console.log(p.label, {
    revenueB: p.revenueUsd ? (p.revenueUsd / 1e9).toFixed(2) : null,
    cashB: p.cashUsd ? (p.cashUsd / 1e9).toFixed(2) : null,
    debtB: p.debtUsd ? (p.debtUsd / 1e9).toFixed(2) : null,
    netCashB: netCash != null ? netCash.toFixed(1) : null,
    grossMargin: grossMargin != null ? grossMargin.toFixed(1) + '%' : null,
    netMargin: netMargin != null ? netMargin.toFixed(1) + '%' : null,
    fcfMargin: fcfMargin != null ? fcfMargin.toFixed(1) + '%' : null,
  })
}
