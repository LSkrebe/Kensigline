/**
 * Resolve a browser-openable filing URL.
 * Prefer a stored document URL; rewrite SEC index.json to the human index page;
 * fall back to chamber portals / company EDGAR browse — never a bare ticker search
 * when we can do better.
 */

const EDGAR_SEARCH = 'https://www.sec.gov/edgar/search/'
const HOUSE_PTR = 'https://disclosures-clerk.house.gov/FinancialDisclosure/ViewSearch'
const SENATE_PTR = 'https://efdsearch.senate.gov/search/home/'
const OGE_PTR = 'https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index?OpenView'

function trimUrl(raw) {
  return String(raw ?? '').trim()
}

/** SEC Archives `…/index.json` → human `…/{accession}-index.htm` when possible. */
export function humanizeSecDocumentUrl(raw) {
  const u = trimUrl(raw)
  if (!u) return null

  const indexJson = u.match(
    /^(https?:\/\/www\.sec\.gov\/Archives\/edgar\/data\/\d+\/(\d{18}))\/index\.json\/?$/i,
  )
  if (indexJson) {
    const base = indexJson[1]
    const nodash = indexJson[2]
    const accession = `${nodash.slice(0, 10)}-${nodash.slice(10, 12)}-${nodash.slice(12)}`
    return `${base}/${accession}-index.htm`
  }

  if (/\/index\.json\/?$/i.test(u)) {
    return u.replace(/\/index\.json\/?$/i, '/')
  }

  return u
}

function edgarCompanyBrowse(ticker) {
  const t = String(ticker ?? '').trim().toUpperCase()
  if (!t) return EDGAR_SEARCH
  return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${encodeURIComponent(t)}&owner=include&count=40`
}

function ptrPortalFallback(chamber) {
  const ch = String(chamber ?? '').trim().toLowerCase()
  if (ch === 'senate') return SENATE_PTR
  if (ch === 'executive' || ch === 'oge') return OGE_PTR
  return HOUSE_PTR
}

/**
 * @param {object} opts
 * @param {string|null|undefined} [opts.url]
 * @param {string|null|undefined} [opts.ticker]
 * @param {string|null|undefined} [opts.kind] - 'insider' | 'politician' | 'institution' | 'document' | …
 * @param {string|null|undefined} [opts.source]
 * @param {string|null|undefined} [opts.chamber]
 * @param {string|null|undefined} [opts.accession]
 * @param {string|null|undefined} [opts.cik]
 */
export function resolveDocumentOpenUrl(opts = {}) {
  const direct = humanizeSecDocumentUrl(opts.url)
  if (direct) return direct

  const kind = String(opts.kind ?? '').trim().toLowerCase()
  const source = String(opts.source ?? '').toLowerCase()
  const isPtr =
    kind === 'politician' ||
    kind === 'politicians' ||
    source.includes('ptr') ||
    source.includes('278')

  if (isPtr) return ptrPortalFallback(opts.chamber)

  const cik = String(opts.cik ?? '').replace(/\D/g, '')
  const accession = String(opts.accession ?? '')
    .trim()
    .replace(/[^0-9-]/g, '')
  if (cik && accession) {
    const nodash = accession.replace(/-/g, '')
    if (nodash.length >= 18) {
      const acc =
        accession.includes('-')
          ? accession
          : `${nodash.slice(0, 10)}-${nodash.slice(10, 12)}-${nodash.slice(12, 18)}`
      return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${nodash}/${acc}-index.htm`
    }
  }

  const ticker = String(opts.ticker ?? '').trim().toUpperCase()
  if (ticker) return edgarCompanyBrowse(ticker)
  return EDGAR_SEARCH
}
