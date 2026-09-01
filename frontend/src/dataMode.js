/**
 * Strict live vs mock — never mix. `backendUp` is tri-state:
 *   true  → live API data only
 *   false → offline mock/demo data only
 *   null  → pending (health probe); show loading, not mock
 */

export function isLiveDataMode(backendUp) {
  return backendUp === true
}

export function isMockDataMode(backendUp) {
  return backendUp === false
}

export function isDataModePending(backendUp) {
  return backendUp !== true && backendUp !== false
}

/** Signed-in network path — includes optimistic prefetch before /health confirms backend. */
export function isExploreNetworkMode(backendUp) {
  return backendUp !== false
}

export const EMPTY_EXPLORE_RECAP = Object.freeze({ slides: [] })

export const EMPTY_EXPLORE_DIRECTORY = Object.freeze({
  homePreview: { companies: [], investors: [] },
  homeLatest: { companies: [], investors: [] },
  fullCompanies: [],
  fullInvestors: [],
})
