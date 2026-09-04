import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import { exploreInvestorModeFromDocType } from './exploreDirectoryNav.js'
import {
  investorRowWatchlistSlug,
  loadUserWatchlistCompanies,
  loadUserWatchlistPeople,
  normalizeWatchlistCompanyTicker,
  normalizeWatchlistPersonSlug,
  normalizeWatchlistMode,
  resolveWatchlistCatalogPerson,
  saveUserWatchlistCompanies,
  saveUserWatchlistPeople,
  watchlistPeopleToCatalog,
} from './userWatchlist.js'

const UserWatchlistContext = createContext(null)

export function UserWatchlistProvider({ children }) {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [peopleEntries, setPeopleEntries] = useState(() => loadUserWatchlistPeople(userId))
  const [companyTickers, setCompanyTickers] = useState(() => loadUserWatchlistCompanies(userId))

  useEffect(() => {
    setPeopleEntries(loadUserWatchlistPeople(userId))
    setCompanyTickers(loadUserWatchlistCompanies(userId))
  }, [userId])

  const peopleSlugSet = useMemo(
    () => new Set(peopleEntries.map((entry) => normalizeWatchlistPersonSlug(entry.slug, entry.name))),
    [peopleEntries],
  )

  const companyTickerSet = useMemo(
    () => new Set(companyTickers.map((ticker) => normalizeWatchlistCompanyTicker(ticker))),
    [companyTickers],
  )

  const watchlistPeople = useMemo(() => watchlistPeopleToCatalog(peopleEntries), [peopleEntries])

  const hasPerson = useCallback(
    (slug, name) => peopleSlugSet.has(normalizeWatchlistPersonSlug(slug, name)),
    [peopleSlugSet],
  )

  const hasCompany = useCallback(
    (ticker) => companyTickerSet.has(normalizeWatchlistCompanyTicker(ticker)),
    [companyTickerSet],
  )

  const addPerson = useCallback(
    (slug, name, meta = {}) => {
      const normalized = normalizeWatchlistPersonSlug(slug, name)
      if (!normalized) return
      setPeopleEntries((prev) => {
        if (prev.some((entry) => normalizeWatchlistPersonSlug(entry.slug, entry.name) === normalized)) {
          return prev
        }
        const label = String(name ?? '').trim() || resolveWatchlistCatalogPerson(normalized, name).name
        const actorSlug = String(meta.actorSlug ?? slug ?? '').trim().toLowerCase()
        const slugAliases = [...new Set([...(Array.isArray(meta.slugAliases) ? meta.slugAliases : []), actorSlug].filter(Boolean))]
        const next = [
          ...prev,
          {
            slug: normalized,
            name: label,
            mode: meta.mode ? normalizeWatchlistMode(meta.mode) : undefined,
            docType: meta.docType,
            slugAliases: slugAliases.length ? slugAliases : undefined,
          },
        ]
        saveUserWatchlistPeople(userId, next)
        return next
      })
    },
    [userId],
  )

  const removePerson = useCallback(
    (slug, name) => {
      const normalized = normalizeWatchlistPersonSlug(slug, name)
      setPeopleEntries((prev) => {
        const next = prev.filter((entry) => normalizeWatchlistPersonSlug(entry.slug, entry.name) !== normalized)
        saveUserWatchlistPeople(userId, next)
        return next
      })
    },
    [userId],
  )

  const addPersonFromRow = useCallback(
    (row) => {
      const slug = investorRowWatchlistSlug(row)
      const actorSlug = String(row?.actorSlug ?? '').trim().toLowerCase()
      addPerson(slug, row?.name, {
        mode: exploreInvestorModeFromDocType(row?.docType),
        docType: row?.docType,
        actorSlug: actorSlug || slug,
        slugAliases: actorSlug && actorSlug !== slug ? [actorSlug] : [],
      })
    },
    [addPerson],
  )

  const addCompany = useCallback(
    (ticker, name) => {
      const normalized = normalizeWatchlistCompanyTicker(ticker)
      if (!normalized) return
      setCompanyTickers((prev) => {
        if (prev.includes(normalized)) return prev
        const next = [...prev, normalized]
        saveUserWatchlistCompanies(userId, next)
        return next
      })
    },
    [userId],
  )

  const removeCompany = useCallback(
    (ticker) => {
      const normalized = normalizeWatchlistCompanyTicker(ticker)
      setCompanyTickers((prev) => {
        const next = prev.filter((t) => t !== normalized)
        saveUserWatchlistCompanies(userId, next)
        return next
      })
    },
    [userId],
  )

  const value = useMemo(
    () => ({
      watchlistPeople,
      peopleEntries,
      companyTickers,
      hasPerson,
      hasCompany,
      addPerson,
      removePerson,
      addPersonFromRow,
      addCompany,
      removeCompany,
    }),
    [
      watchlistPeople,
      peopleEntries,
      companyTickers,
      hasPerson,
      hasCompany,
      addPerson,
      removePerson,
      addPersonFromRow,
      addCompany,
      removeCompany,
    ],
  )

  return <UserWatchlistContext.Provider value={value}>{children}</UserWatchlistContext.Provider>
}

export function useUserWatchlist() {
  const ctx = useContext(UserWatchlistContext)
  if (!ctx) {
    throw new Error('useUserWatchlist must be used within UserWatchlistProvider')
  }
  return ctx
}
