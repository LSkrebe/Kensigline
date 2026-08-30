/** Curated tickers with public research landing pages — keep in sync with sitemap. */
export const RESEARCH_TICKERS = [
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

/** @deprecated Use RESEARCH_TICKERS */
export const PUBLIC_COMPANY_TICKERS = RESEARCH_TICKERS

export function matchLegacyCompanyPath(pathname = '/') {
  const raw = String(pathname || '/').replace(/\/$/, '') || '/'
  const m = raw.match(/^\/companies\/([A-Za-z0-9.-]+)$/i)
  if (!m) return null
  return { ticker: String(m[1]).trim().toUpperCase(), path: `/companies/${String(m[1]).trim().toUpperCase()}` }
}

export function matchResearchTickerPath(pathname = '/') {
  const raw = String(pathname || '/').replace(/\/$/, '') || '/'
  const m = raw.match(/^\/research\/ticker\/([A-Za-z0-9.-]+)$/i)
  if (!m) return null
  return { ticker: String(m[1]).trim().toUpperCase(), path: `/research/ticker/${String(m[1]).trim().toUpperCase()}` }
}

export function matchResearchEventPath(pathname = '/') {
  const raw = String(pathname || '/').replace(/\/$/, '') || '/'
  const m = raw.match(/^\/research\/(\d{4}-\d{2}-\d{2})$/i)
  if (!m) return null
  return { dayKey: m[1], path: `/research/${m[1]}` }
}

export function matchLearnLessonPath(pathname = '/') {
  const raw = String(pathname || '/').replace(/\/$/, '') || '/'
  const m = raw.match(/^\/learn\/([a-z0-9-]+)$/i)
  if (!m) return null
  return { slug: m[1], path: `/learn/${m[1]}` }
}

export function isLearnIndexPath(pathname = '/') {
  return String(pathname || '/').replace(/\/$/, '') === '/learn'
}

export function isResearchIndexPath(pathname = '/') {
  return String(pathname || '/').replace(/\/$/, '') === '/research'
}

export function researchTickerPageMeta({ ticker, name }) {
  const t = String(ticker ?? '').trim().toUpperCase()
  const n = String(name ?? '').trim()
  const label = n ? `${n} (${t})` : t
  return {
    title: `${label} disclosures - Mercerline Research`,
    description: `${label} on Mercerline — public disclosure context for Form 4, PTR, and 13F filings. Sign in for the full dossier rail.`,
    path: `/research/ticker/${t}`,
    ogImage: '/og-image.png',
  }
}

export function researchEventPageMeta(event) {
  const headline = String(event?.headline ?? 'Daily disclosure').trim()
  const day = String(event?.dayKey ?? '').trim()
  return {
    title: `${headline} - Mercerline Research`,
    description: String(event?.summary ?? headline).slice(0, 160),
    path: day ? `/research/${day}` : '/research',
    ogImage: '/og-image.png',
  }
}

export function learnLessonPageMeta(lesson) {
  return {
    title: `${lesson.title} - Mercerline Learn`,
    description: lesson.description,
    path: `/learn/${lesson.slug}`,
    ogImage: '/og-image.png',
  }
}

export const LEARN_INDEX_META = {
  title: 'Learn - Mercerline',
  description:
    'Guides on US equity disclosures — Form 4, PTR, 13F — and how to research filings with Mercerline before the headline.',
  path: '/learn',
  ogImage: '/og-image.png',
}

export const RESEARCH_INDEX_META = {
  title: 'Research - Mercerline',
  description:
    'Daily US equity disclosure highlights — one public filing story per day from Mercerline’s recap, with full dossiers inside the product.',
  path: '/research',
  ogImage: '/og-image.png',
}
