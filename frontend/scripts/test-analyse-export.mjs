import { writeFileSync } from 'node:fs'
import { analyseMockModelForTicker } from '../src/analyseMockData.js'
import { exportAnalyseModelToBuffer } from '../src/analyseExcelExport.js'

const model = analyseMockModelForTicker('ASML')
const buffer = await exportAnalyseModelToBuffer({
  ticker: 'ASML',
  companyName: 'ASML Holding N.V.',
  model,
  valuation: null,
  liveMarketPrice: 748.5,
})

const out = new URL('../tmp/test-analyse-export.xlsx', import.meta.url)
writeFileSync(out, Buffer.from(buffer))
console.log('Wrote', out.pathname, buffer.byteLength, 'bytes')
