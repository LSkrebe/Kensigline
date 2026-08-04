/** Curated public company SEO routes — keep in sync with sitemap.xml. */
export const PUBLIC_COMPANY_TICKERS = [
  'NVDA',
  'AAPL',
  'MSFT',
  'GOOGL',
  'AMZN',
  'META',
  'TSLA',
  'AVGO',
  'AMD',
  'ASML',
  'TSM',
  'INTC',
  'JPM',
  'XOM',
  'LLY',
]

export function matchPublicCompanyPath(pathname = '/') {
  const raw = String(pathname || '/').replace(/\/$/, '') || '/'
  const m = raw.match(/^\/companies\/([A-Za-z0-9.-]+)$/i)
  if (!m) return null
  return { ticker: String(m[1]).trim().toUpperCase(), path: `/companies/${String(m[1]).trim().toUpperCase()}` }
}

export function publicCompanyPageMeta({ ticker, name }) {
  const t = String(ticker ?? '').trim().toUpperCase()
  const n = String(name ?? '').trim()
  const label = n ? `${n} (${t})` : t
  return {
    title: `${label} - Mercerline`,
    description: n
      ? `${n} (${t}) company overview on Mercerline — price, earnings date, and key fundamentals. Track US equity disclosures when you sign in.`
      : `${t} company overview on Mercerline — price, earnings date, and key fundamentals. Track US equity disclosures when you sign in.`,
    path: `/companies/${t}`,
    ogImage: '/og-image.png',
  }
}
