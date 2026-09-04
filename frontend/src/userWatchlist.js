import { exploreInvestorSlug } from './exploreDirectoryNav.js'
import {
  EXPLORE_WATCHLIST_CATALOG,
  watchlistPersonSlugs,
} from './exploreWatchlistCatalog.js'

const PEOPLE_KEY_PREFIX = 'mercerline:watchlist:people:'
const COMPANIES_KEY_PREFIX = 'mercerline:watchlist:companies:'

function storageKey(prefix, userId) {
  return `${prefix}${userId ?? 'anon'}`
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore quota */
  }
}

export function defaultWatchlistPeopleEntries() {
  return EXPLORE_WATCHLIST_CATALOG.map((person) => ({
    slug: watchlistPersonSlugs(person)[0],
    name: person.name,
  }))
}

export function normalizeWatchlistPersonSlug(slug, name) {
  const s = String(slug ?? '').trim().toLowerCase()
  if (s) return s
  return exploreInvestorSlug(name)
}

export function normalizeWatchlistCompanyTicker(ticker) {
  return String(ticker ?? '').trim().toUpperCase()
}

export function resolveWatchlistCatalogPerson(slug, name) {
  const needle = normalizeWatchlistPersonSlug(slug, name)
  const fromCatalog = EXPLORE_WATCHLIST_CATALOG.find(
    (person) =>
      watchlistPersonSlugs(person).includes(needle) ||
      exploreInvestorSlug(person.name) === exploreInvestorSlug(name),
  )
  if (fromCatalog) return fromCatalog
  return {
    name: String(name ?? '').trim() || needle,
    slug: needle,
    slugAliases: [needle],
    mode: 'politicians',
    docType: 'ptr',
  }
}

export function loadUserWatchlistPeople(userId) {
  const key = storageKey(PEOPLE_KEY_PREFIX, userId)
  const stored = readJson(key, null)
  if (Array.isArray(stored) && stored.length) return stored
  const defaults = defaultWatchlistPeopleEntries()
  writeJson(key, defaults)
  return defaults
}

export function saveUserWatchlistPeople(userId, entries) {
  writeJson(storageKey(PEOPLE_KEY_PREFIX, userId), entries)
}

export function loadUserWatchlistCompanies(userId) {
  return readJson(storageKey(COMPANIES_KEY_PREFIX, userId), [])
}

export function saveUserWatchlistCompanies(userId, tickers) {
  writeJson(storageKey(COMPANIES_KEY_PREFIX, userId), tickers)
}

export function watchlistPeopleToCatalog(entries) {
  return entries.map((entry) => resolveWatchlistCatalogPerson(entry.slug, entry.name))
}

export function investorRowWatchlistSlug(row) {
  return normalizeWatchlistPersonSlug(row?.actorSlug, row?.name)
}
