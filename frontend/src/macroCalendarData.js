/** Macro calendar mock payloads — frontend-only when API is offline. */

/** @typedef {'high' | 'medium' | 'low'} MacroImpact */

/**
 * @typedef {Object} MacroCalendarEvent
 * @property {string} id
 * @property {string} time ET release time label
 * @property {string} title
 * @property {string} region US | EU | CN | UK
 * @property {MacroImpact} impact
 */

/**
 * @typedef {Object} MacroCalendarDay
 * @property {string} date ISO date
 * @property {MacroCalendarEvent[]} events
 */

export const MACRO_IMPACT_FILTER_TYPES = [
  { id: 'high', label: 'High impact', code: 'HIGH' },
  { id: 'medium', label: 'Medium impact', code: 'MED' },
  { id: 'low', label: 'Low impact', code: 'LOW' },
]

export const MACRO_IMPACT_FILTER_DEFAULT = new Set(MACRO_IMPACT_FILTER_TYPES.map((t) => t.id))

export const MACRO_WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function parseLocalDay(dateStr) {
  const raw = String(dateStr ?? '').trim()
  const parts = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!parts) return null
  return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]), 12, 0, 0, 0)
}

function todayLocalStart() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function isWeekday(d) {
  const day = d.getDay()
  return day >= 1 && day <= 5
}

/** Weekday templates (Mon=0 … Fri=4) — dates are generated from the real calendar. */
const MACRO_DAY_TEMPLATES = /** @type {MacroCalendarEvent[][]} */ ([
  [
    { id: 'mon-dallas', time: '10:30', title: 'Dallas Fed manufacturing activity', region: 'US', impact: 'low' },
    { id: 'mon-eu-sent', time: '10:00', title: 'Eurozone economic sentiment', region: 'EU', impact: 'medium' },
  ],
  [
    { id: 'tue-durables', time: '08:30', title: 'Durable goods orders', region: 'US', impact: 'medium' },
    { id: 'tue-eu-conf', time: '10:00', title: 'Eurozone consumer confidence', region: 'EU', impact: 'low' },
  ],
  [
    { id: 'wed-us-conf', time: '10:00', title: 'US consumer confidence', region: 'US', impact: 'medium' },
    { id: 'wed-waller', time: '14:00', title: 'Fed Governor Waller - remarks', region: 'US', impact: 'medium' },
    { id: 'wed-de-ifo', time: '04:00', title: 'Germany Ifo business climate', region: 'EU', impact: 'low' },
  ],
  [
    { id: 'thu-gdp', time: '08:30', title: 'GDP - Q1 2nd estimate', region: 'US', impact: 'high' },
    { id: 'thu-fomc-min', time: '14:00', title: 'FOMC meeting minutes', region: 'US', impact: 'high' },
  ],
  [
    { id: 'fri-claims', time: '08:30', title: 'Initial jobless claims', region: 'US', impact: 'medium' },
    { id: 'fri-pce', time: '08:30', title: 'PCE price index', region: 'US', impact: 'high' },
    { id: 'fri-ecb', time: '07:45', title: 'ECB monetary policy account', region: 'EU', impact: 'medium' },
  ],
])

function isoLocalDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Filter events inside each day; keeps every calendar day in the payload. */
export function applyMacroEventFilters(days, { regions, impacts }) {
  if (!regions?.size || !impacts?.size) {
    return (days ?? []).map((day) => ({ ...day, events: [] }))
  }
  return (days ?? []).map((day) => ({
    ...day,
    events: (Array.isArray(day?.events) ? day.events : []).filter(
      (event) => regions.has(event.region) && impacts.has(event.impact),
    ),
  }))
}

/** @deprecated Use applyMacroEventFilters for month view. */
export function filterMacroCalendarDays(days, { regions, impacts }) {
  if (!regions?.size || !impacts?.size) return []
  return days
    .map((day) => ({
      ...day,
      events: (Array.isArray(day?.events) ? day.events : []).filter(
        (event) => regions.has(event.region) && impacts.has(event.impact),
      ),
    }))
    .filter((day) => day.events.length > 0)
}

export function currentMonthKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function parseMonthKey(raw) {
  const m = String(raw ?? '').trim().match(/^(\d{4})-(\d{2})$/)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  if (!Number.isFinite(year) || month < 1 || month > 12) return null
  return { year, month }
}

export function shiftMonthKey(key, delta) {
  const parsed = parseMonthKey(key) ?? parseMonthKey(currentMonthKey())
  if (!parsed) return currentMonthKey()
  const d = new Date(parsed.year, parsed.month - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function formatMacroMonthTitle(key) {
  const parsed = parseMonthKey(key)
  if (!parsed) return '—'
  const d = new Date(parsed.year, parsed.month - 1, 1, 12, 0, 0, 0)
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

function allDaysInMonth(year, month) {
  const last = new Date(year, month, 0).getDate()
  const out = []
  for (let d = 1; d <= last; d++) {
    out.push(isoLocalDate(new Date(year, month - 1, d)))
  }
  return out
}

export function getMacroMonthDays(year, month) {
  return allDaysInMonth(year, month).map((date) => {
    const d = parseLocalDay(date)
    if (!d || !isWeekday(d)) return { date, events: [] }
    const dow = d.getDay() - 1
    const templates = MACRO_DAY_TEMPLATES[dow] ?? MACRO_DAY_TEMPLATES[0] ?? []
    return {
      date,
      events: templates.map((event, idx) => ({
        ...event,
        id: `${date}-${event.id ?? idx}`,
      })),
    }
  })
}

/**
 * Build a Sun–Sat month grid with leading/trailing outside-month padding cells.
 * @param {Map<string, { events?: MacroCalendarEvent[] }>} daysByDate
 */
export function buildMacroMonthGrid(year, month, daysByDate) {
  const first = new Date(year, month - 1, 1)
  const lastDate = new Date(year, month, 0).getDate()
  const leadPad = first.getDay()
  const cells = []

  const prevMonth = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
  const prevLast = new Date(prevMonth.year, prevMonth.month, 0).getDate()
  for (let i = leadPad - 1; i >= 0; i--) {
    const dayNum = prevLast - i
    const date = isoLocalDate(new Date(prevMonth.year, prevMonth.month - 1, dayNum))
    const dow = new Date(prevMonth.year, prevMonth.month - 1, dayNum).getDay()
    cells.push({
      kind: 'outside',
      date,
      dayNum,
      weekdayLabel: MACRO_WEEKDAY_LABELS[dow],
      events: [],
      isWeekend: dow === 0 || dow === 6,
      isToday: false,
    })
  }

  for (let dayNum = 1; dayNum <= lastDate; dayNum++) {
    const date = isoLocalDate(new Date(year, month - 1, dayNum))
    const dow = new Date(year, month - 1, dayNum).getDay()
    const bucket = daysByDate?.get?.(date)
    cells.push({
      kind: 'in-month',
      date,
      dayNum,
      weekdayLabel: MACRO_WEEKDAY_LABELS[dow],
      isWeekend: dow === 0 || dow === 6,
      isToday: isMacroCalendarToday(date),
      events: Array.isArray(bucket?.events) ? bucket.events : [],
    })
  }

  const nextMonth = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
  let nextDay = 1
  while (cells.length % 7 !== 0) {
    const date = isoLocalDate(new Date(nextMonth.year, nextMonth.month - 1, nextDay))
    const dow = new Date(nextMonth.year, nextMonth.month - 1, nextDay).getDay()
    cells.push({
      kind: 'outside',
      date,
      dayNum: nextDay,
      weekdayLabel: MACRO_WEEKDAY_LABELS[dow],
      events: [],
      isWeekend: dow === 0 || dow === 6,
      isToday: false,
    })
    nextDay += 1
  }

  return cells
}

/** Next N business days from today (Mon–Fri only, today included). */
export function getUpcomingMacroDays(limit = 7) {
  const out = /** @type {MacroCalendarDay[]} */ ([])
  const cursor = todayLocalStart()

  while (!isWeekday(cursor)) {
    cursor.setDate(cursor.getDate() + 1)
  }

  while (out.length < limit) {
    if (isWeekday(cursor)) {
      const dow = cursor.getDay() - 1
      const date = isoLocalDate(cursor)
      const templates = MACRO_DAY_TEMPLATES[dow] ?? MACRO_DAY_TEMPLATES[0] ?? []
      out.push({
        date,
        events: templates.map((event, idx) => ({
          ...event,
          id: `${date}-${event.id ?? idx}`,
        })),
      })
    }
    cursor.setDate(cursor.getDate() + 1)
  }

  return out
}

export function isMacroCalendarToday(date) {
  const d = parseLocalDay(String(date ?? '').slice(0, 10))
  if (!d) return false
  return d.getTime() === todayLocalStart().getTime()
}

export function formatMacroDayHeader(date) {
  const raw = String(date ?? '').trim()
  const parts = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!parts) return { weekday: '—', label: '—', isToday: false }
  const y = Number(parts[1])
  const mo = Number(parts[2]) - 1
  const day = Number(parts[3])
  const d = new Date(y, mo, day, 12, 0, 0, 0)
  if (Number.isNaN(d.getTime())) return { weekday: '—', label: '—', isToday: false }
  const weekday = d.toLocaleDateString(undefined, { weekday: 'short' })
  const month = d.toLocaleDateString(undefined, { month: 'short' })
  return {
    weekday,
    label: `${month} ${d.getDate()}`,
    isToday: isMacroCalendarToday(raw),
  }
}
