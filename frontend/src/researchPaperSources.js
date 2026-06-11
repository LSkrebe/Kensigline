/** Research / Discover document source catalog and normalization. */

function normalizeSecFilingFormKey(raw) {
  let s = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
  if (!s) return null
  s = s.replace(/\/A$/, '')
  if (s.startsWith('424B')) return '424B'
  if (s === 'DEF14A') return 'DEF 14A'
  if (s.startsWith('SC 13D') || s === 'SC13D') return 'SC 13D'
  if (s.startsWith('SC 13G') || s === 'SC13G') return 'SC 13G'
  const known = ['8-K', '10-K', '10-Q', '6-K', '20-F', 'S-1', 'S-3', 'S-4', 'DEF 14A']
  return known.includes(s) ? s : null
}

/** Map document / queue source strings to filter checkbox ids. */
export function normalizeResearchPaperSourceKey(source) {
  const raw = String(source ?? '').trim()
  if (!raw) return 'Other'
  const low = raw.toLowerCase()

  if (/clinicaltrials/i.test(raw)) return 'ClinicalTrials.gov'
  if (low === 'research_press_rss' || /\bpress\s*release\b/i.test(raw)) return 'Press release'
  if (
    low === 'research_transcript_rss' ||
    /\bearnings\s*(call\s*)?transcript\b/i.test(raw) ||
    /\bconference\s*call\s*transcript\b/i.test(raw)
  ) {
    return 'Earnings transcript'
  }
  if (low === 'sec_form4' || /^form\s*4$/i.test(raw)) return 'Form 4'
  if (low === 'sec_13f' || /^form\s*13f$/i.test(raw) || raw === '13F') return '13F'
  if (/^form\s*3$/i.test(raw)) return 'Form 3'
  if (/^form\s*5$/i.test(raw)) return 'Form 5'
  if (low === 'house_ptr' || /^ptr$/i.test(raw) || /\bperiodic\s*transaction\b/i.test(raw)) return 'PTR'
  if (/\binvestor\s*presentation\b/i.test(raw)) return 'Investor presentation'
  if (/\bannual\s*report\b/i.test(raw) && !/\b10-k\b/i.test(raw)) return 'Annual report'
  if (
    /\bgov(ernment)?\s*contract\b/i.test(raw) ||
    /\bfederal\s*award\b/i.test(raw) ||
    /\bsam\.gov\b/i.test(raw) ||
    low === 'research_gov_contract'
  ) {
    return 'Gov contract'
  }
  if (/\bsec\s*filing\b/i.test(raw)) return '8-K'
  if (/\bfda\s*calendar\b/i.test(raw)) return 'Press release'

  const secDirect = normalizeSecFilingFormKey(raw)
  if (secDirect) return secDirect

  const secInText = raw.match(/\b(8-K|10-K|10-Q|6-K|20-F|S-1|S-3|S-4|DEF\s*14A|424B\d*|SC\s*13[DG])\b/i)
  if (secInText) {
    const mapped = normalizeSecFilingFormKey(secInText[1])
    if (mapped) return mapped
  }

  return raw
}

/** Filter catalog — ids match `normalizeResearchPaperSourceKey`; `code` is the compact right column. */
export const RESEARCH_PAPER_SOURCE_CATALOG = [
  { id: '8-K', label: 'Current report', code: '8-K', modes: ['market', 'clinical'] },
  { id: '10-Q', label: 'Quarterly report', code: '10-Q', modes: ['market', 'clinical'] },
  { id: '10-K', label: 'Annual filing', code: '10-K', modes: ['market', 'clinical'] },
  { id: '6-K', label: 'Foreign current', code: '6-K', modes: ['market', 'clinical'] },
  { id: '20-F', label: 'Foreign annual', code: '20-F', modes: ['market', 'clinical'] },
  { id: 'S-1', label: 'Registration', code: 'S-1', modes: ['market', 'clinical'] },
  { id: 'S-3', label: 'Shelf registration', code: 'S-3', modes: ['market', 'clinical'] },
  { id: 'S-4', label: 'Business combination', code: 'S-4', modes: ['market', 'clinical'] },
  { id: 'DEF 14A', label: 'Proxy statement', code: '14A', modes: ['market', 'clinical'] },
  { id: '424B', label: 'Prospectus supplement', code: '424B', modes: ['market', 'clinical'] },
  { id: 'SC 13D', label: 'Active ownership', code: '13D', modes: ['market', 'clinical'] },
  { id: 'SC 13G', label: 'Passive ownership', code: '13G', modes: ['market', 'clinical'] },
  { id: 'Press release', label: 'Company release', code: 'PR', modes: ['market', 'clinical'] },
  { id: 'Earnings transcript', label: 'Earnings call', code: 'Call', modes: ['market', 'clinical'] },
  { id: 'Investor presentation', label: 'Investor deck', code: 'Deck', modes: ['market'] },
  { id: 'Annual report', label: 'IR annual report', code: 'AR', modes: ['market'] },
  { id: 'Gov contract', label: 'Federal award', code: 'SAM', modes: ['market'] },
  { id: 'ClinicalTrials.gov', label: 'Trial registry', code: 'CT.gov', modes: ['clinical'] },
  { id: 'Form 4', label: 'Insider transaction', code: 'F4', modes: ['market', 'clinical'] },
  { id: 'Form 3', label: 'Initial insider holding', code: 'F3', modes: ['market', 'clinical'] },
  { id: 'Form 5', label: 'Annual insider change', code: 'F5', modes: ['market', 'clinical'] },
  { id: '13F', label: 'Institutional holdings', code: '13F', modes: ['market', 'clinical'] },
  { id: 'PTR', label: 'Politician trade', code: 'PTR', modes: ['market', 'clinical'] },
  { id: 'Other', label: 'Other filing', code: 'Other', modes: ['market', 'clinical'] },
]

export function researchPaperSourceTypesForIntel(intelMode) {
  const mode = intelMode === 'clinical' ? 'clinical' : 'market'
  return RESEARCH_PAPER_SOURCE_CATALOG.filter((t) => t.modes.includes(mode))
}

export function researchPaperSourceIdsForIntel(intelMode) {
  return researchPaperSourceTypesForIntel(intelMode).map((t) => t.id)
}

/** Document-type filters aligned with the Research tab (market + clinical scopes merged). */
export function discoverResearchDocumentFilterTypes() {
  const seen = new Set()
  const out = []
  for (const mode of ['market', 'clinical']) {
    for (const t of researchPaperSourceTypesForIntel(mode)) {
      if (seen.has(t.id)) continue
      seen.add(t.id)
      out.push({ id: t.id, label: t.label, code: t.code })
    }
  }
  return out
}

export const DISCOVER_RESEARCH_DOCUMENT_FILTER_DEFAULT = new Set(
  discoverResearchDocumentFilterTypes().map((t) => t.id),
)

/** Watchlist catalysts — company events only (no insider / politician / institutional feeds). */
const DISCOVER_WATCHLIST_EXCLUDED_SOURCE_IDS = new Set([
  'Form 4',
  'Form 3',
  'Form 5',
  '13F',
  'PTR',
  'SC 13D',
  'SC 13G',
])

export function discoverWatchlistFilterTypes() {
  return discoverResearchDocumentFilterTypes().filter((t) => !DISCOVER_WATCHLIST_EXCLUDED_SOURCE_IDS.has(t.id))
}

export const DISCOVER_WATCHLIST_FILTER_TYPES = discoverWatchlistFilterTypes()

export const DISCOVER_MARKET_MOVE_FILTER_TYPES = discoverResearchDocumentFilterTypes()

export const DISCOVER_WATCHLIST_FILTER_DEFAULT = new Set(DISCOVER_WATCHLIST_FILTER_TYPES.map((t) => t.id))

/** @deprecated Use DISCOVER_WATCHLIST_FILTER_TYPES. */
export const DISCOVER_DOCUMENT_FILTER_TYPES = DISCOVER_WATCHLIST_FILTER_TYPES

/** @deprecated Use DISCOVER_WATCHLIST_FILTER_DEFAULT. */
export const DISCOVER_FILTER_DEFAULT = DISCOVER_WATCHLIST_FILTER_DEFAULT
