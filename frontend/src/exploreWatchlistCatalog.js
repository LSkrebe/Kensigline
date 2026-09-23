import { exploreInvestorSlug } from './exploreDirectoryNav.js'

/**
 * Mock Explore universe while live data is off. Politicians, insiders, and
 * active managers only. Index books (BlackRock, Vanguard, State Street,
 * Fidelity, Capital Group, Geode) are not in this list.
 */
export const EXPLORE_WATCHLIST_CATALOG = [
  { name: 'Nancy Pelosi', slug: 'nancy-pelosi', slugAliases: ['hon-nancy-pelosi', 'the-honorable-nancy-pelosi'], mode: 'politicians', chamber: 'house', docType: 'ptr_purchase', matchNames: ['Hon. Nancy Pelosi', 'Nancy Pelosi', 'The Honorable Nancy Pelosi'] },
  { name: 'Josh Gottheimer', slug: 'josh-gottheimer', slugAliases: [], mode: 'politicians', chamber: 'house', docType: 'ptr_purchase', matchNames: ['Josh Gottheimer', 'Joshua Gottheimer'] },
  { name: 'Ro Khanna', slug: 'ro-khanna', slugAliases: [], mode: 'politicians', chamber: 'house', docType: 'ptr_purchase', matchNames: ['Ro Khanna', 'Rohit Khanna'] },
  { name: 'Michael McCaul', slug: 'michael-mccaul', slugAliases: [], mode: 'politicians', chamber: 'house', docType: 'ptr_purchase', matchNames: ['Michael McCaul', 'Michael T. McCaul'] },
  { name: 'Gilbert Cisneros', slug: 'gilbert-cisneros', slugAliases: [], mode: 'politicians', chamber: 'house', docType: 'ptr_purchase', matchNames: ['Gilbert Cisneros', 'Gilbert R. Cisneros'] },
  { name: 'Lisa McClain', slug: 'lisa-mcclain', slugAliases: [], mode: 'politicians', chamber: 'house', docType: 'ptr_purchase', matchNames: ['Lisa McClain'] },
  { name: 'Tommy Tuberville', slug: 'tommy-tuberville', slugAliases: ['mr-thomas-h-tuberville', 'thomas-tuberville'], mode: 'politicians', chamber: 'senate', docType: 'ptr_purchase', matchNames: ['Mr. Thomas H Tuberville', 'Thomas H Tuberville', 'Thomas Tuberville', 'Tommy Tuberville'] },
  { name: 'Dan Crenshaw', slug: 'dan-crenshaw', slugAliases: [], mode: 'politicians', chamber: 'house', docType: 'ptr_purchase', matchNames: ['Dan Crenshaw', 'Daniel Crenshaw'] },
  { name: 'Jefferson Shreve', slug: 'jefferson-shreve', slugAliases: [], mode: 'politicians', chamber: 'house', docType: 'ptr_purchase', matchNames: ['Jefferson Shreve'] },
  { name: 'Richard Blumenthal', slug: 'richard-blumenthal', slugAliases: [], mode: 'politicians', chamber: 'senate', docType: 'ptr_purchase', matchNames: ['Richard Blumenthal'] },
  { name: 'Marjorie Taylor Greene', slug: 'marjorie-taylor-greene', slugAliases: [], mode: 'politicians', chamber: 'house', docType: 'ptr_purchase', matchNames: ['Marjorie Taylor Greene'] },
  { name: 'Markwayne Mullin', slug: 'markwayne-mullin', slugAliases: ['the-honorable-markwayne-mullin'], mode: 'politicians', chamber: 'senate', docType: 'ptr_purchase', matchNames: ['The Honorable Markwayne Mullin', 'Markwayne Mullin'] },
  { name: 'Daniel Goldman', slug: 'daniel-goldman', slugAliases: [], mode: 'politicians', chamber: 'house', docType: 'ptr_purchase', matchNames: ['Daniel Goldman', 'Daniel S. Goldman'] },
  { name: 'Sheldon Whitehouse', slug: 'sheldon-whitehouse', slugAliases: ['the-honorable-sheldon-whitehouse'], mode: 'politicians', chamber: 'senate', docType: 'ptr_purchase', matchNames: ['The Honorable Sheldon Whitehouse', 'Sheldon Whitehouse'] },
  { name: 'Rob Bresnahan', slug: 'rob-bresnahan', slugAliases: [], mode: 'politicians', chamber: 'house', docType: 'ptr_purchase', matchNames: ['Rob Bresnahan', 'Robert Bresnahan', 'Robert P. Bresnahan'] },
  { name: 'Kevin Hern', slug: 'kevin-hern', slugAliases: [], mode: 'politicians', chamber: 'house', docType: 'ptr_purchase', matchNames: ['Kevin Hern'] },
  { name: 'Rick Scott', slug: 'rick-scott', slugAliases: [], mode: 'politicians', chamber: 'senate', docType: 'ptr_purchase', matchNames: ['Rick Scott', 'Richard Scott'] },
  { name: 'John Boozman', slug: 'john-boozman', slugAliases: ['the-honorable-john-boozman'], mode: 'politicians', chamber: 'senate', docType: 'ptr_purchase', matchNames: ['The Honorable John Boozman', 'John Boozman'] },
  { name: 'Byron Donalds', slug: 'byron-donalds', slugAliases: ['hon-byron-donalds'], mode: 'politicians', chamber: 'house', docType: 'ptr_purchase', matchNames: ['Hon. Byron Donalds', 'Byron Donalds'] },
  { name: 'Suzan DelBene', slug: 'suzan-delbene', slugAliases: [], mode: 'politicians', chamber: 'house', docType: 'ptr_purchase', matchNames: ['Suzan DelBene', 'Suzan K. DelBene'] },
  { name: 'Jensen Huang', slug: 'jensen-huang', slugAliases: ['huang-jen-hsun'], mode: 'insiders', docType: 'form4_purchase', matchNames: ['HUANG JEN HSUN', 'Jen-Hsun Huang', 'Jensen Huang'] },
  { name: 'Elon Musk', slug: 'elon-musk', slugAliases: ['musk-elon'], mode: 'insiders', docType: 'form4', matchNames: ['Musk Elon', 'Elon Musk'] },
  { name: 'Tim Cook', slug: 'tim-cook', slugAliases: ['cook-timothy-d'], mode: 'insiders', docType: 'form4', matchNames: ['COOK TIMOTHY D', 'Timothy D Cook', 'Tim Cook'] },
  { name: 'Satya Nadella', slug: 'satya-nadella', slugAliases: ['nadella-satya'], mode: 'insiders', docType: 'form4', matchNames: ['Nadella Satya', 'Satya Nadella'] },
  { name: 'Mark Zuckerberg', slug: 'mark-zuckerberg', slugAliases: [], mode: 'insiders', docType: 'form4', matchNames: ['Mark Zuckerberg', 'Zuckerberg Mark'] },
  { name: 'Larry Ellison', slug: 'larry-ellison', slugAliases: [], mode: 'insiders', docType: 'form4', matchNames: ['Larry Ellison', 'Lawrence J. Ellison', 'Ellison Lawrence'] },
  { name: 'Lisa Su', slug: 'lisa-su', slugAliases: ['su-lisa-t'], mode: 'insiders', docType: 'form4_purchase', matchNames: ['Su Lisa T', 'Lisa Su', 'Lisa T Su'] },
  { name: 'Andy Jassy', slug: 'andy-jassy', slugAliases: [], mode: 'insiders', docType: 'form4', matchNames: ['Andy Jassy', 'Andrew Jassy'] },
  { name: 'Alex Karp', slug: 'alex-karp', slugAliases: [], mode: 'insiders', docType: 'form4', matchNames: ['Alex Karp', 'Alexander Karp'] },
  { name: 'Hock Tan', slug: 'hock-tan', slugAliases: [], mode: 'insiders', docType: 'form4', matchNames: ['Hock Tan', 'Hock E. Tan'] },
  { name: 'Marc Benioff', slug: 'marc-benioff', slugAliases: [], mode: 'insiders', docType: 'form4', matchNames: ['Marc Benioff'] },
  { name: 'Jamie Dimon', slug: 'jamie-dimon', slugAliases: ['dimon-james'], mode: 'insiders', docType: 'form4', matchNames: ['DIMON JAMES', 'Jamie Dimon'] },
  { name: 'Mary Barra', slug: 'mary-barra', slugAliases: [], mode: 'insiders', docType: 'form4', matchNames: ['Mary Barra', 'Mary T. Barra'] },
  { name: 'Reed Hastings', slug: 'reed-hastings', slugAliases: [], mode: 'insiders', docType: 'form4', matchNames: ['Reed Hastings', 'Wilmot Reed Hastings'] },
  { name: 'Colette Kress', slug: 'colette-kress', slugAliases: [], mode: 'insiders', docType: 'form4', matchNames: ['Colette Kress'] },
  { name: 'Berkshire Hathaway', slug: 'berkshire-hathaway', slugAliases: [], mode: 'institutions', docType: '13f', matchNames: ['Berkshire Hathaway'] },
  { name: 'Pershing Square', slug: 'pershing-square', slugAliases: [], mode: 'institutions', docType: '13f', matchNames: ['Pershing Square', 'Pershing Square Capital Management'] },
  { name: 'Duquesne Family Office', slug: 'duquesne-family-office', slugAliases: [], mode: 'institutions', docType: '13f', matchNames: ['Duquesne Family Office'] },
  { name: 'Appaloosa', slug: 'appaloosa', slugAliases: [], mode: 'institutions', docType: '13f', matchNames: ['Appaloosa', 'Appaloosa Management'] },
  { name: 'Citadel Advisors', slug: 'citadel-advisors', slugAliases: [], mode: 'institutions', docType: '13f', matchNames: ['Citadel Advisors', 'Citadel'] },
  { name: 'Renaissance Technologies', slug: 'renaissance-technologies', slugAliases: [], mode: 'institutions', docType: '13f', matchNames: ['Renaissance Technologies'] },
  { name: 'Bridgewater', slug: 'bridgewater', slugAliases: [], mode: 'institutions', docType: '13f', matchNames: ['Bridgewater', 'Bridgewater Associates'] },
  { name: 'Elliott Management', slug: 'elliott-management', slugAliases: [], mode: 'institutions', docType: '13f', matchNames: ['Elliott Management', 'Elliott Investment Management'] },
  { name: 'Third Point', slug: 'third-point', slugAliases: [], mode: 'institutions', docType: '13f', matchNames: ['Third Point', 'Third Point Management'] },
  { name: 'Baupost', slug: 'baupost', slugAliases: [], mode: 'institutions', docType: '13f', matchNames: ['Baupost', 'The Baupost Group'] },
  { name: 'Tiger Global', slug: 'tiger-global', slugAliases: [], mode: 'institutions', docType: '13f', matchNames: ['Tiger Global', 'Tiger Global Management'] },
  { name: 'Coatue', slug: 'coatue', slugAliases: [], mode: 'institutions', docType: '13f', matchNames: ['Coatue', 'Coatue Management'] },
  { name: 'Viking Global', slug: 'viking-global', slugAliases: [], mode: 'institutions', docType: '13f', matchNames: ['Viking Global', 'Viking Global Investors'] },
  { name: 'Lone Pine', slug: 'lone-pine', slugAliases: [], mode: 'institutions', docType: '13f', matchNames: ['Lone Pine', 'Lone Pine Capital'] },
  { name: 'Icahn Capital', slug: 'icahn-capital', slugAliases: [], mode: 'institutions', docType: '13f', matchNames: ['Icahn Capital', 'Carl Icahn'] },
]

export const SENATE_INVESTOR_SLUGS = new Set(
  EXPLORE_WATCHLIST_CATALOG.filter((person) => person.chamber === 'senate').map((person) => person.slug),
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
