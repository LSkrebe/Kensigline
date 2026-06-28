const PREFIX = 'mercerline:ui:'

export const UI_PREF_KEYS = {
  activeTab: `${PREFIX}active-tab`,
  intelMode: `${PREFIX}intel-mode`,
  investigateMode: `${PREFIX}investigate-mode`,
  researchFilters: (intelMode) => `${PREFIX}research-filters:${intelMode === 'clinical' ? 'clinical' : 'market'}`,
  investigateTxnFilters: (mode) => `${PREFIX}investigate-txn:${mode}`,
  discoverMacroRegionFilters: `${PREFIX}discover:macro-region-filters`,
  discoverMacroImpactFilters: `${PREFIX}discover:macro-impact-filters`,
  discoverMovesFilters: `${PREFIX}discover:moves-filters:v2`,
  chartRange: (lane) => `${PREFIX}chart-range:${lane}`,
}

const ACTIVE_TABS = new Set(['analyse', 'discover', 'main', 'investigate', 'settings'])
const INTEL_MODES = new Set(['market', 'clinical'])
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
  return readChoice(UI_PREF_KEYS.activeTab, ACTIVE_TABS, 'discover')
}

export function writeActiveTab(tab) {
  writeChoice(UI_PREF_KEYS.activeTab, tab)
}

export function readIntelMode() {
  return readChoice(UI_PREF_KEYS.intelMode, INTEL_MODES, 'market')
}

export function writeIntelMode(mode) {
  writeChoice(UI_PREF_KEYS.intelMode, mode)
}

export function readInvestigateMode() {
  return readChoice(UI_PREF_KEYS.investigateMode, INVESTIGATE_MODES, 'insider')
}

export function writeInvestigateMode(mode) {
  writeChoice(UI_PREF_KEYS.investigateMode, mode)
}

export function readChartRange(lane, allowedRanges, fallback) {
  const allowed = new Set(allowedRanges)
  return readChoice(UI_PREF_KEYS.chartRange(lane), allowed, fallback)
}

export function writeChartRange(lane, range) {
  writeChoice(UI_PREF_KEYS.chartRange(lane), range)
}
