/** Relative mock timestamps — always anchored to when the app loads (screenshot-friendly). */

export function mockAtDaysAgo(days, hour = 10, minute = 0) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

export function mockDateOnlyDaysAgo(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function mockAtHoursAgo(hours) {
  const d = new Date()
  d.setMinutes(d.getMinutes() - hours * 60)
  return d.toISOString()
}

/** Parse mock flow `at` values into local datetimes with realistic filing times (never midnight). */
export function mockFlowAtFromRaw(raw, seed = 0) {
  const s = String(raw ?? '').trim()
  if (!s) return null
  if (s.toLowerCase() === 'today') {
    const d = new Date()
    d.setMinutes(d.getMinutes() - 25 - (seed % 200))
    return d
  }
  const parts = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (parts) {
    const y = Number(parts[1])
    const m = Number(parts[2])
    const day = Number(parts[3])
    const hour = 9 + (seed % 8)
    const minute = 8 + (seed * 11) % 52
    return new Date(y, m - 1, day, hour, minute, 0, 0)
  }
  const d = new Date(s.includes('T') ? s : `${s}T16:30:00`)
  return Number.isFinite(d.getTime()) ? d : null
}
