import { fetchJsonSafe } from './api.js'
import { currentMonthKey } from './macroCalendarData.js'

const CACHE_MS = 10 * 60_000

/** @type {{ at: number; key: string; data: unknown } | null} */
let cached = null
/** @type {Promise<unknown> | null} */
let inflight = null
/** @type {string} */
let inflightKey = ''

export const MACRO_CALENDAR_DEFAULTS = {
  month: currentMonthKey(),
}

function calendarCacheKey(opts = {}) {
  return JSON.stringify({
    month: opts.month ?? currentMonthKey(),
  })
}

/**
 * @param {typeof MACRO_CALENDAR_DEFAULTS} [opts]
 */
export function peekMacroCalendarCache(opts = {}) {
  if (!cached) return null
  if (Date.now() - cached.at > CACHE_MS) return null
  if (cached.key !== calendarCacheKey(opts)) return null
  return cached.data
}

/**
 * @param {{ month?: string }} [opts]
 */
export async function fetchMacroCalendar(opts = {}) {
  const key = calendarCacheKey(opts)
  const hit = peekMacroCalendarCache(opts)
  if (hit) return hit

  if (inflight && inflightKey === key) return inflight

  const params = new URLSearchParams()
  params.set('month', opts.month ?? currentMonthKey())

  const path = `/api/macro/calendar?${params.toString()}`

  inflightKey = key
  inflight = (async () => {
    const res = await fetchJsonSafe(path, { timeoutMs: 20_000 })
    if (!res.ok || !res.data?.ok) {
      const empty = { ok: true, month: opts.month ?? currentMonthKey(), macro: [], market_holidays: [] }
      cached = { at: Date.now(), key, data: empty }
      return empty
    }
    cached = { at: Date.now(), key, data: res.data }
    return res.data
  })().finally(() => {
    inflight = null
  })

  return inflight
}

/** Warm the client cache as soon as the API is up. */
export function prefetchMacroCalendar(opts = {}) {
  void fetchMacroCalendar({ ...MACRO_CALENDAR_DEFAULTS, ...opts })
}
