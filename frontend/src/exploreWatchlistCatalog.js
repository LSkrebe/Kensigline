import { exploreInvestorSlug } from './exploreDirectoryNav.js'

/**
 * Curated watchlist — matchNames / slugAliases must align with production filer display_name + slug.
 * People without live directory events are omitted from the watchlist (no synthetic rows).
 */
export const EXPLORE_WATCHLIST_CATALOG = [
  {
    name: 'Tommy Tuberville',
    slug: 'tommy-tuberville',
    slugAliases: ['mr-thomas-h-tuberville', 'thomas-tuberville'],
    mode: 'politicians',
    docType: 'ptr_purchase',
    matchNames: ['Mr. Thomas H Tuberville', 'Thomas H Tuberville', 'Thomas Tuberville'],
  },
  {
    name: 'Markwayne Mullin',
    slug: 'markwayne-mullin',
    slugAliases: ['the-honorable-markwayne-mullin'],
    mode: 'politicians',
    docType: 'ptr_purchase',
    matchNames: ['The Honorable Markwayne Mullin'],
  },
  {
    name: 'Sheldon Whitehouse',
    slug: 'sheldon-whitehouse',
    slugAliases: ['the-honorable-sheldon-whitehouse'],
    mode: 'politicians',
    docType: 'ptr_purchase',
    matchNames: ['The Honorable Sheldon Whitehouse'],
  },
  {
    name: 'John Boozman',
    slug: 'john-boozman',
    slugAliases: ['the-honorable-john-boozman'],
    mode: 'politicians',
    docType: 'ptr_purchase',
    matchNames: ['The Honorable John Boozman'],
  },
  {
    name: 'Shelley Capito',
    slug: 'shelley-capito',
    slugAliases: ['the-honorable-shelley-m-capito'],
    mode: 'politicians',
    docType: 'ptr_purchase',
    matchNames: ['The Honorable Shelley M Capito'],
  },
  {
    name: 'Sean McMaster',
    slug: 'sean-mcmaster',
    mode: 'politicians',
    docType: 'ptr_purchase',
    matchNames: ['Sean McMaster'],
  },
  {
    name: 'BlackRock',
    slug: 'blackrock',
    slugAliases: ['cik-2012383'],
    mode: 'institutions',
    docType: '13f_add',
    defaultTicker: 'AVGO',
    matchNames: ['BlackRock, Inc.', 'BlackRock Inc'],
  },
  {
    name: 'Renaissance Technologies',
    slug: 'renaissance-technologies',
    mode: 'institutions',
    docType: '13f_trim',
    defaultTicker: 'MCHP',
    matchNames: ['Renaissance Technologies LLC'],
  },
  {
    name: 'Vanguard',
    slug: 'vanguard',
    slugAliases: [
      'vanguard-capital-management',
      'vanguard-asset-management',
      'vanguard-global-advisers-llc',
      'vanguard-group',
    ],
    mode: 'institutions',
    docType: '13f_add',
    defaultTicker: 'NVDA',
    matchNames: [
      'Vanguard Group',
      'Vanguard Capital Management',
      'Vanguard Asset Management',
      'Vanguard Global Advisers, LLC',
    ],
  },
]

export const WATCHLIST_TXNS_PER_PERSON = 3

export function watchlistPersonSlug(person) {
  return (
    String(person?.slug ?? '')
      .trim()
      .toLowerCase() || exploreInvestorSlug(person?.name)
  )
}

export function watchlistPersonSlugs(person) {
  const base = watchlistPersonSlug(person)
  const aliases = Array.isArray(person?.slugAliases) ? person.slugAliases : []
  return [...new Set([base, ...aliases.map((s) => String(s).trim().toLowerCase()).filter(Boolean)])]
}
