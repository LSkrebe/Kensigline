import { exploreInvestorSlug } from './exploreDirectoryNav.js'

/**
 * Default watchlist — politicians, insiders, and institutions with live DB coverage.
 * slugAliases / matchNames align with production filer display_name + slug.
 */
export const EXPLORE_WATCHLIST_CATALOG = [
  {
    name: 'Nancy Pelosi',
    slug: 'nancy-pelosi',
    slugAliases: ['hon-nancy-pelosi', 'the-honorable-nancy-pelosi'],
    mode: 'politicians',
    docType: 'ptr_purchase',
    matchNames: ['Hon. Nancy Pelosi', 'Nancy Pelosi', 'The Honorable Nancy Pelosi'],
  },
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
    matchNames: ['The Honorable Markwayne Mullin', 'Markwayne Mullin'],
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
    name: 'Byron Donalds',
    slug: 'byron-donalds',
    slugAliases: ['hon-byron-donalds'],
    mode: 'politicians',
    docType: 'ptr_purchase',
    matchNames: ['Hon. Byron Donalds', 'Byron Donalds'],
  },
  {
    name: 'Jensen Huang',
    slug: 'jensen-huang',
    slugAliases: ['huang-jen-hsun'],
    mode: 'insiders',
    docType: 'form4_purchase',
    matchNames: ['HUANG JEN HSUN', 'Jen-Hsun Huang', 'Jensen Huang'],
  },
  {
    name: 'Tim Cook',
    slug: 'tim-cook',
    slugAliases: ['cook-timothy-d'],
    mode: 'insiders',
    docType: 'form4',
    matchNames: ['COOK TIMOTHY D', 'Timothy D Cook', 'Tim Cook'],
  },
  {
    name: 'Lisa Su',
    slug: 'lisa-su',
    slugAliases: ['su-lisa-t'],
    mode: 'insiders',
    docType: 'form4_purchase',
    matchNames: ['Su Lisa T', 'Lisa Su', 'Lisa T Su'],
  },
  {
    name: 'Vanguard Group',
    slug: 'vanguard-group',
    slugAliases: [
      'vanguard',
      'vanguard-capital-management',
      'vanguard-asset-management',
      'vanguard-global-advisers-llc',
      'vanguard-portfolio-management',
    ],
    mode: 'institutions',
    docType: '13f_add',
    matchNames: [
      'Vanguard Group',
      'Vanguard Capital Management',
      'Vanguard Asset Management',
      'Vanguard Global Advisers, LLC',
    ],
  },
  {
    name: 'BlackRock',
    slug: 'blackrock',
    slugAliases: ['cik-2012383'],
    mode: 'institutions',
    docType: '13f_trim',
    matchNames: ['BlackRock, Inc.', 'BlackRock Inc'],
  },
  {
    name: 'Renaissance Technologies',
    slug: 'renaissance-technologies',
    mode: 'institutions',
    docType: '13f_trim',
    matchNames: ['Renaissance Technologies LLC'],
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
