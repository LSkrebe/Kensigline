import { exploreInvestorSlug } from './exploreDirectoryNav.js'

/** Default tracked names — politicians, high-profile insiders, and top institutions. */
export const EXPLORE_WATCHLIST_CATALOG = [
  {
    name: 'Nancy Pelosi',
    slug: 'nancy-pelosi',
    mode: 'politicians',
    docType: 'ptr_purchase',
    defaultTicker: 'NVDA',
    matchNames: ['PELOSI, NANCY'],
  },
  {
    name: 'Tommy Tuberville',
    slug: 'tommy-tuberville',
    mode: 'politicians',
    docType: 'ptr_purchase',
    defaultTicker: 'LRCX',
  },
  {
    name: 'Dan Crenshaw',
    slug: 'dan-crenshaw',
    mode: 'politicians',
    docType: 'ptr_purchase',
    defaultTicker: 'LRCX',
  },
  {
    name: 'Josh Gottheimer',
    slug: 'josh-gottheimer',
    mode: 'politicians',
    docType: 'ptr_sale',
    defaultTicker: 'MSFT',
  },
  {
    name: 'Michael McCaul',
    slug: 'michael-mccaul',
    mode: 'politicians',
    docType: 'ptr_purchase',
    defaultTicker: 'AVGO',
  },
  {
    name: 'Ro Khanna',
    slug: 'ro-khanna',
    mode: 'politicians',
    docType: 'ptr_purchase',
    defaultTicker: 'AMD',
  },
  {
    name: 'Jensen Huang',
    slug: 'jensen-huang',
    mode: 'insider',
    docType: 'form4_purchase',
    defaultTicker: 'NVDA',
  },
  {
    name: 'Tim Cook',
    slug: 'tim-cook',
    mode: 'insider',
    docType: 'form4',
    defaultTicker: 'AAPL',
  },
  {
    name: 'Lisa Su',
    slug: 'lisa-su',
    mode: 'insider',
    docType: 'form4_purchase',
    defaultTicker: 'AMD',
  },
  {
    name: 'Vanguard Group',
    slug: 'vanguard-group',
    mode: 'institutions',
    docType: '13f_add',
    defaultTicker: 'NVDA',
    matchNames: ['Vanguard Group Inc', 'The Vanguard Group'],
  },
  {
    name: 'BlackRock',
    slug: 'blackrock',
    mode: 'institutions',
    docType: '13f_trim',
    defaultTicker: 'AVGO',
    matchNames: ['BlackRock Inc', 'BlackRock, Inc.'],
  },
  {
    name: 'Renaissance Technologies',
    slug: 'renaissance-technologies',
    mode: 'institutions',
    docType: '13f_trim',
    defaultTicker: 'MCHP',
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
