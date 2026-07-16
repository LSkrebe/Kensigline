/** Format a count with correct singular/plural noun, e.g. `1 company` / `3 companies`. */
export function formatCountLabel(count, singular, plural = `${singular}s`) {
  const n = Number(count)
  const safe = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0
  return `${safe} ${safe === 1 ? singular : plural}`
}
