const PREFIX = 'mercerline:ui:'

export const UI_PREF_KEYS = {
  activeTab: `${PREFIX}active-tab`,
  investigateMode: `${PREFIX}investigate-mode`,
  researchFilters: `${PREFIX}research-filters:market`,
  investigateTxnFilters: (mode) => `${PREFIX}investigate-txn:${mode}`,
  macroRegionFilters: `${PREFIX}macro:region-filters`,
  macroImpactFilters: `${PREFIX}macro:impact-filters`,
  macroShowMarketHolidays: `${PREFIX}macro:show-market-holidays`,
  discoverMacroRegionFilters: `${PREFIX}discover:macro-region-filters`,
  discoverMacroImpactFilters: `${PREFIX}discover:macro-impact-filters`,
  chartRange: (lane) => `${PREFIX}chart-range:${lane}`,
}

/** Shell surfaces: Explore tree plus Settings and Macro pages. */
const ACTIVE_TABS = new Set(['explore', 'macro', 'settings'])
const INVESTIGATE_MODES = new Set(['insider', 'politicians', 'institutions'])

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

/** @param {Iterable<string>} allowedIds */
export function readFilterSet(storageKey, allowedIds) {
  const allowed = new Set(allowedIds)
  if (!allowed.size) return new Set()

  if (!canUseStorage()) return new Set(allowed)

  try {
    const raw = window.localStorage.getItem(storageKey)
    if (raw == null) return new Set(allowed)
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set(allowed)
    const next = new Set()
    for (const id of parsed) {
      const s = String(id ?? '').trim()
      if (s && allowed.has(s)) next.add(s)
    }
    return next.size ? next : new Set(allowed)
  } catch {
    return new Set(allowed)
  }
}

export function writeFilterSet(storageKey, enabledSet) {
  if (!canUseStorage()) return
  try {
    const ids = [...(enabledSet ?? new Set())].map((id) => String(id)).sort()
    window.localStorage.setItem(storageKey, JSON.stringify(ids))
  } catch {
    /* ignore quota */
  }
}

function readChoice(storageKey, allowed, fallback) {
  if (!canUseStorage()) return fallback
  try {
    const raw = window.localStorage.getItem(storageKey)
    return allowed.has(raw) ? raw : fallback
  } catch {
    return fallback
  }
}

function writeChoice(storageKey, value) {
  if (!canUseStorage()) return
  try {
    window.localStorage.setItem(storageKey, String(value))
  } catch {
    /* ignore quota */
  }
}

export function readActiveTab() {
  return readChoice(UI_PREF_KEYS.activeTab, ACTIVE_TABS, 'explore')
}

export function writeActiveTab(tab) {
  writeChoice(UI_PREF_KEYS.activeTab, tab)
}

export function readInvestigateMode() {
  if (!canUseStorage()) return 'insider'
  try {
    const raw = window.localStorage.getItem(UI_PREF_KEYS.investigateMode)
    if (raw === 'all') return 'insider'
    return INVESTIGATE_MODES.has(raw) ? raw : 'insider'
  } catch {
    return 'insider'
  }
}

export function writeInvestigateMode(mode) {
  const next = mode === 'all' ? 'insider' : mode
  writeChoice(UI_PREF_KEYS.investigateMode, next)
}

export function readChartRange(lane, allowedRanges, fallback) {
  const allowed = new Set(allowedRanges)
  return readChoice(UI_PREF_KEYS.chartRange(lane), allowed, fallback)
}

export function writeChartRange(lane, range) {
  writeChoice(UI_PREF_KEYS.chartRange(lane), range)
}

export function readBoolPref(storageKey, fallback = true) {
  if (!canUseStorage()) return fallback
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (raw == null) return fallback
    if (raw === '1' || raw === 'true') return true
    if (raw === '0' || raw === 'false') return false
    return fallback
  } catch {
    return fallback
  }
}

export function writeBoolPref(storageKey, value) {
  writeChoice(storageKey, value ? '1' : '0')
}
