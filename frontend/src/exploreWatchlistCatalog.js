import { exploreInvestorSlug } from './exploreDirectoryNav.js'

/**
 * Curated Explore universe — keep aligned with backend watchlist-catalog.ts.
 */
export const EXPLORE_WATCHLIST_CATALOG = [
  { name: 'Nancy Pelosi', slug: 'nancy-pelosi', slugAliases: ['hon-nancy-pelosi', 'the-honorable-nancy-pelosi'], mode: 'politicians', chamber: 'house', docType: 'ptr_purchase', matchNames: ['Hon. Nancy Pelosi', 'Nancy Pelosi', 'The Honorable Nancy Pelosi'] },
  { name: 'Josh Gottheimer', slug: 'josh-gottheimer', slugAliases: ['hon-josh-gottheimer'], mode: 'politicians', chamber: 'house', docType: 'ptr_purchase', matchNames: ['Josh Gottheimer', 'Joshua Gottheimer'] },
  { name: 'Donald Trump', slug: 'donald-trump', slugAliases: ['donald-j-trump', 'trump'], mode: 'politicians', chamber: 'executive', docType: 'ptr_purchase', matchNames: ['Donald Trump', 'Donald J Trump', 'Donald J. Trump'] },
  { name: 'April McClain Delaney', slug: 'april-mcclain-delaney', slugAliases: ['hon-april-mcclain-delaney'], mode: 'politicians', chamber: 'house', docType: 'ptr_purchase', matchNames: ['April McClain Delaney', 'Hon. April McClain Delaney'] },
  { name: 'Gilbert Cisneros', slug: 'gilbert-cisneros', slugAliases: ['hon-gilbert-cisneros'], mode: 'politicians', chamber: 'house', docType: 'ptr_purchase', matchNames: ['Gilbert Cisneros', 'Gilbert R. Cisneros'] },
  { name: 'Lisa McClain', slug: 'lisa-mcclain', slugAliases: ['hon-lisa-mcclain'], mode: 'politicians', chamber: 'house', docType: 'ptr_purchase', matchNames: ['Lisa McClain', 'Hon. Lisa McClain'] },
  { name: 'Tommy Tuberville', slug: 'tommy-tuberville', slugAliases: ['mr-thomas-h-tuberville', 'thomas-tuberville'], mode: 'politicians', chamber: 'senate', docType: 'ptr_purchase', matchNames: ['Mr. Thomas H Tuberville', 'Thomas H Tuberville', 'Thomas Tuberville', 'Tommy Tuberville'] },
  { name: 'Dan Crenshaw', slug: 'dan-crenshaw', slugAliases: ['hon-daniel-crenshaw', 'daniel-crenshaw'], mode: 'politicians', chamber: 'house', docType: 'ptr_purchase', matchNames: ['Dan Crenshaw', 'Daniel Crenshaw', 'Hon. Daniel Crenshaw'] },
  { name: 'Jefferson Shreve', slug: 'jefferson-shreve', slugAliases: ['hon-jefferson-shreve'], mode: 'politicians', chamber: 'house', docType: 'ptr_purchase', matchNames: ['Jefferson Shreve', 'Hon. Jefferson Shreve'] },
  { name: 'Jared Moskowitz', slug: 'jared-moskowitz', slugAliases: ['hon-jared-moskowitz'], mode: 'politicians', chamber: 'house', docType: 'ptr_purchase', matchNames: ['Jared Moskowitz', 'Hon. Jared Moskowitz'] },
  { name: 'Marjorie Taylor Greene', slug: 'marjorie-taylor-greene', slugAliases: ['hon-marjorie-taylor-greene', 'greene-marjorie-taylor'], mode: 'politicians', chamber: 'house', docType: 'ptr_purchase', matchNames: ['Marjorie Taylor Greene', 'Hon. Marjorie Taylor Greene'] },
  { name: 'Markwayne Mullin', slug: 'markwayne-mullin', slugAliases: ['the-honorable-markwayne-mullin'], mode: 'politicians', chamber: 'senate', docType: 'ptr_purchase', matchNames: ['The Honorable Markwayne Mullin', 'Markwayne Mullin'] },
  { name: 'Daniel Goldman', slug: 'daniel-goldman', slugAliases: ['hon-daniel-goldman', 'hon-daniel-s-goldman'], mode: 'politicians', chamber: 'house', docType: 'ptr_purchase', matchNames: ['Daniel Goldman', 'Daniel S. Goldman', 'Hon. Daniel Goldman'] },
  { name: 'Sheldon Whitehouse', slug: 'sheldon-whitehouse', slugAliases: ['the-honorable-sheldon-whitehouse'], mode: 'politicians', chamber: 'senate', docType: 'ptr_purchase', matchNames: ['The Honorable Sheldon Whitehouse', 'Sheldon Whitehouse'] },
  { name: 'Rob Bresnahan', slug: 'rob-bresnahan', slugAliases: ['hon-rob-bresnahan'], mode: 'politicians', chamber: 'house', docType: 'ptr_purchase', matchNames: ['Rob Bresnahan', 'Robert Bresnahan', 'Robert P. Bresnahan'] },
  { name: 'Kevin Hern', slug: 'kevin-hern', slugAliases: ['hon-kevin-hern'], mode: 'politicians', chamber: 'house', docType: 'ptr_purchase', matchNames: ['Kevin Hern'] },
  { name: 'Julia Letlow', slug: 'julia-letlow', slugAliases: ['hon-julia-letlow'], mode: 'politicians', chamber: 'house', docType: 'ptr_purchase', matchNames: ['Julia Letlow', 'Hon. Julia Letlow'] },
  { name: 'John Boozman', slug: 'john-boozman', slugAliases: ['the-honorable-john-boozman'], mode: 'politicians', chamber: 'senate', docType: 'ptr_purchase', matchNames: ['The Honorable John Boozman', 'John Boozman'] },
  { name: 'Byron Donalds', slug: 'byron-donalds', slugAliases: ['hon-byron-donalds'], mode: 'politicians', chamber: 'house', docType: 'ptr_purchase', matchNames: ['Hon. Byron Donalds', 'Byron Donalds'] },
  { name: 'Suzan DelBene', slug: 'suzan-delbene', slugAliases: ['hon-suzan-k-delbene'], mode: 'politicians', chamber: 'house', docType: 'ptr_purchase', matchNames: ['Suzan DelBene', 'Suzan K. DelBene', 'Hon. Suzan K. DelBene'] },
  { name: 'Jensen Huang', slug: 'jensen-huang', slugAliases: ['huang-jen-hsun'], mode: 'insiders', docType: 'form4_purchase', matchNames: ['HUANG JEN HSUN', 'Jen-Hsun Huang', 'Jensen Huang'] },
  { name: 'Elon Musk', slug: 'elon-musk', slugAliases: ['musk-elon'], mode: 'insiders', docType: 'form4', matchNames: ['Musk Elon', 'Elon Musk'] },
  { name: 'Tim Cook', slug: 'tim-cook', slugAliases: ['cook-timothy-d'], mode: 'insiders', docType: 'form4', matchNames: ['COOK TIMOTHY D', 'Timothy D Cook', 'Tim Cook'] },
  { name: 'Satya Nadella', slug: 'satya-nadella', slugAliases: ['nadella-satya'], mode: 'insiders', docType: 'form4', matchNames: ['Nadella Satya', 'Satya Nadella'] },
  { name: 'Mark Zuckerberg', slug: 'mark-zuckerberg', slugAliases: ['zuckerberg-mark'], mode: 'insiders', docType: 'form4', matchNames: ['Mark Zuckerberg', 'Zuckerberg Mark'] },
  { name: 'Larry Ellison', slug: 'larry-ellison', slugAliases: ['ellison-lawrence-joseph'], mode: 'insiders', docType: 'form4', matchNames: ['Larry Ellison', 'Lawrence J. Ellison', 'Ellison Lawrence'] },
  { name: 'Lisa Su', slug: 'lisa-su', slugAliases: ['su-lisa-t'], mode: 'insiders', docType: 'form4_purchase', matchNames: ['Su Lisa T', 'Lisa Su', 'Lisa T Su'] },
  { name: 'Andy Jassy', slug: 'andy-jassy', slugAliases: ['jassy-andrew-r', 'andrew-jassy'], mode: 'insiders', docType: 'form4', matchNames: ['Andy Jassy', 'Andrew Jassy', 'Jassy Andrew R'] },
  { name: 'Alex Karp', slug: 'alex-karp', slugAliases: ['karp-alexander-c', 'alexander-karp'], mode: 'insiders', docType: 'form4', matchNames: ['Alex Karp', 'Alexander Karp', 'Karp Alexander C'] },
  { name: 'Jamie Dimon', slug: 'jamie-dimon', slugAliases: ['dimon-james'], mode: 'insiders', docType: 'form4', matchNames: ['DIMON JAMES', 'Jamie Dimon'] },
  { name: 'Mary Barra', slug: 'mary-barra', slugAliases: ['barra-mary-t'], mode: 'insiders', docType: 'form4', matchNames: ['Mary Barra', 'Mary T. Barra', 'Barra Mary T'] },
  { name: 'Colette Kress', slug: 'colette-kress', slugAliases: ['kress-colette'], mode: 'insiders', docType: 'form4', matchNames: ['Colette Kress', 'Kress Colette'] },
  { name: 'Berkshire Hathaway', slug: 'berkshire-hathaway', slugAliases: ['berkshire-hathaway-inc', 'berkshire-hathaway-inc-institution-813696'], mode: 'institutions', docType: '13f', matchNames: ['Berkshire Hathaway', 'Berkshire Hathaway Inc'] },
  { name: 'Pershing Square', slug: 'pershing-square', slugAliases: ['pershing-square-capital-management-l-p-institution-dde950', 'pershing-square-capital-management'], mode: 'institutions', docType: '13f', matchNames: ['Pershing Square', 'Pershing Square Capital Management'] },
  { name: 'Duquesne Family Office', slug: 'duquesne-family-office', slugAliases: ['duquesne-family-office-llc'], mode: 'institutions', docType: '13f', matchNames: ['Duquesne Family Office'] },
  { name: 'Appaloosa', slug: 'appaloosa', slugAliases: ['appaloosa-lp'], mode: 'institutions', docType: '13f', matchNames: ['Appaloosa', 'Appaloosa Management'] },
  { name: 'Elliott Management', slug: 'elliott-management', slugAliases: ['elliott-management-corp', 'elliott-investment-management-l-p'], mode: 'institutions', docType: '13f', matchNames: ['Elliott Management', 'Elliott Investment Management'] },
  { name: 'Baupost', slug: 'baupost', slugAliases: ['baupost-group-llc-ma', 'the-baupost-group'], mode: 'institutions', docType: '13f', matchNames: ['Baupost', 'The Baupost Group', 'Baupost Group LLC MA'] },
  { name: 'Viking Global', slug: 'viking-global', slugAliases: ['viking-global-investors-lp', 'viking-global-investors-lp-institution-d70de6'], mode: 'institutions', docType: '13f', matchNames: ['Viking Global', 'Viking Global Investors'] },
  { name: 'Icahn Capital', slug: 'icahn-capital', slugAliases: ['icahn-carl-c-institution-1589ad', 'icahn-carl-c'], mode: 'institutions', docType: '13f', matchNames: ['Icahn Capital', 'Carl Icahn', 'Icahn Carl C'] },
]

export const SENATE_INVESTOR_SLUGS = new Set(
  EXPLORE_WATCHLIST_CATALOG.filter((person) => person.chamber === 'senate').map((person) => person.slug),
)

export const EXECUTIVE_INVESTOR_SLUGS = new Set(
  EXPLORE_WATCHLIST_CATALOG.filter((person) => person.chamber === 'executive').map((person) => person.slug),
)

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

/** Resolve curated catalog entry by any known slug / alias. */
export function lookupWatchlistPerson(slugOrName) {
  const raw = String(slugOrName ?? '').trim()
  if (!raw) return null
  const slug = raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  const nameKey = raw.toLowerCase()
  for (const person of EXPLORE_WATCHLIST_CATALOG) {
    if (watchlistPersonSlugs(person).includes(slug)) return person
    if (String(person.name).trim().toLowerCase() === nameKey) return person
    const matches = Array.isArray(person.matchNames) ? person.matchNames : []
    if (matches.some((n) => String(n).trim().toLowerCase() === nameKey)) return person
  }
  return null
}
