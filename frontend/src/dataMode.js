/**
 * Strict live vs mock — never mix. `backendUp` is tri-state:
 *   true  → live API data only
 *   false → offline mock/demo data only
 *   null  → pending (health probe); show loading, not mock
 *
 * Temporary while the Explore redesign is being tested. Live reads stay off
 * until curated ingest + cohort performance are verified in production.
 * Keep true for this ship — UI still uses mock tape returns while backend
 * catch-up runs (catalog-gated ingest, cohort scoped to tracked universe).
 */
export const FORCE_MOCK_DATA = true

export function isLiveDataMode(backendUp) {
  if (FORCE_MOCK_DATA) return false
  return backendUp === true
}

export function isMockDataMode(backendUp) {
  if (FORCE_MOCK_DATA) return true
  return backendUp === false
}

export function isDataModePending(backendUp) {
  if (FORCE_MOCK_DATA) return false
  return backendUp !== true && backendUp !== false
}

/** Signed-in network path — includes optimistic prefetch before /health confirms backend. */
export function isExploreNetworkMode(backendUp) {
  if (FORCE_MOCK_DATA) return false
  return backendUp !== false
}

export const EMPTY_EXPLORE_RECAP = Object.freeze({ slides: [] })

export const EMPTY_EXPLORE_DIRECTORY = Object.freeze({
  homePreview: { companies: [], investors: [] },
  homeLatest: { companies: [], investors: [] },
  fullCompanies: [],
  fullInvestors: [],
})
