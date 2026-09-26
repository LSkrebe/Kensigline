import portraits from './explorePortraits.json'

/** Same keying as ImageOrInitials / explorePortraits.json primary keys. */
export function normalizeInvestorName(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/^(hon\.?|mr\.?|mrs\.?|ms\.?|dr\.?)\s+/, '')
    .replace(/[^a-z0-9]/g, '')
}

const CORP_SUFFIXES = [
  'llc',
  'llp',
  'lp',
  'inc',
  'ltd',
  'corp',
  'co',
  'plc',
  'nv',
  'sa',
  'ag',
  'gmbh',
]

/** Candidate portrait map keys for a display name / catalog slug. */
export function explorePortraitKeys(name, slug = null) {
  const keys = []
  const push = (value) => {
    const key = normalizeInvestorName(value)
    if (key && !keys.includes(key)) keys.push(key)
  }
  push(name)
  let stripped = normalizeInvestorName(name)
  for (let i = 0; i < 3 && stripped; i++) {
    let next = stripped
    for (const suf of CORP_SUFFIXES) {
      if (next.endsWith(suf) && next.length > suf.length + 2) {
        next = next.slice(0, -suf.length)
        break
      }
    }
    if (next === stripped) break
    stripped = next
    push(stripped)
  }
  if (slug) push(String(slug).replace(/-/g, ''))
  return keys
}

export function lookupExplorePortrait(name, slug = null, map = portraits) {
  for (const key of explorePortraitKeys(name, slug)) {
    const hit = map?.[key]
    if (hit) return hit
  }
  return null
}

export function investorTypeLabel(mode) {
  const value = String(mode ?? '').toLowerCase()
  if (value === 'politicians' || value === 'politician') return 'Politician'
  if (value === 'institutions' || value === 'institution') return 'Institution'
  if (value === 'insiders' || value === 'insider') return 'Insider'
  return 'Investor'
}
