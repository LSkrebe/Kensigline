/** Generic event labels — no document content, no middle-dot separators. */

const COMPANY_EVENT_LABELS = {
  '8k': '8-K current report',
  '8k_earnings': '8-K earnings release',
  '10q': '10-Q quarterly filing',
  '10k': '10-K annual filing',
  earnings: 'Earnings report',
  transcript: 'Earnings call transcript',
  guidance: 'Guidance update',
  proxy: 'Proxy statement',
  press: 'Press release',
}

const ACTOR_EVENT_LABELS = {
  form4_purchase: 'Form 4 insider purchase',
  form4_sale: 'Form 4 insider sale',
  form4: 'Form 4 insider filing',
  ptr_purchase: 'PTR politician purchase',
  ptr_sale: 'PTR politician sale',
  ptr: 'PTR politician disclosure',
  '13f_add': '13F position increase',
  '13f_trim': '13F position decrease',
  '13f': '13F institution filing',
}

export function exploreCompanyEventLabel(docType) {
  return COMPANY_EVENT_LABELS[String(docType ?? '').trim()] ?? 'Company filing'
}

export function exploreActorEventLabel(docType) {
  return ACTOR_EVENT_LABELS[String(docType ?? '').trim()] ?? 'Investor filing'
}

export function exploreActorDocCode(docType) {
  const d = String(docType ?? '').trim().toLowerCase()
  if (d.startsWith('ptr')) return 'PTR'
  if (d.startsWith('13f')) return '13F'
  if (d.startsWith('form4') || d === 'form4') return 'F4'
  return 'F4'
}

export function exploreCompanyDocCode(docType) {
  const d = String(docType ?? '').trim().toLowerCase()
  if (d === '8k_earnings') return '8-K'
  if (d === '8k') return '8-K'
  if (d === '10q') return '10-Q'
  if (d === '10k') return '10-K'
  if (d === 'earnings') return 'ER'
  if (d === 'transcript') return 'CALL'
  if (d === 'guidance') return 'GUIDE'
  if (d === 'proxy') return 'PX'
  if (d === 'press') return 'PR'
  return 'FILING'
}

function withEventLabel(row, labelFn) {
  return { ...row, event: labelFn(row.docType) }
}

export function mapCompanyEventRows(rows) {
  return rows.map((row) => withEventLabel(row, exploreCompanyEventLabel))
}

export function mapActorEventRows(rows) {
  return rows.map((row) => withEventLabel(row, exploreActorEventLabel))
}
