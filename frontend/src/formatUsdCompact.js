/**
 * Compact USD labels for filings, explore, and metrics.
 * Rolls K → M at 1000K so ~$1M never renders as "$1000K".
 */

/**
 * Strip trailing `.0` from a fixed decimal string.
 * @param {number} n
 * @param {number} digits
 */
function trimFixed(n, digits = 1) {
  const s = n.toFixed(digits)
  return s.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1')
}

/**
 * Value in millions for range legs (e.g. 500_000 → `0.5`, 1_000_000 → `1`).
 * @param {number} abs
 */
function millionsLeg(abs) {
  const m = abs / 1e6
  if (m >= 10) return String(Math.round(m))
  if (Math.abs(m - Math.round(m)) < 1e-9) return String(Math.round(m))
  return trimFixed(Math.round(m * 10) / 10, 1)
}

/**
 * @param {number | null | undefined} n
 * @param {{ signed?: boolean }} [opts]
 * @returns {string | null}
 */
export function formatUsdCompact(n, opts = {}) {
  if (n == null || !Number.isFinite(Number(n))) return null
  const v = Number(n)
  const abs = Math.abs(v)

  let prefix = ''
  if (opts.signed) {
    if (v > 0) prefix = '+'
    else if (v < 0) prefix = '−'
  } else if (v < 0) {
    prefix = '-'
  }

  if (abs >= 1e9) return `${prefix}$${trimFixed(abs / 1e9, 1)}B`
  if (abs >= 1e6) return `${prefix}$${trimFixed(abs / 1e6, 1)}M`
  if (abs >= 1e3) {
    const k = Math.round(abs / 1e3)
    if (k >= 1000) return `${prefix}$${trimFixed(abs / 1e6, 1)}M`
    return `${prefix}$${k}K`
  }
  return `${prefix}$${Math.round(abs)}`
}

/**
 * PTR / disclosed USD band → short form with one `$`.
 * Examples: `+$1-5M`, `$100-250K`, `+$0.5-1M`
 *
 * @param {number} low
 * @param {number} high
 * @param {{ signed?: boolean, sign?: '+' | '−' | '' }} [opts]
 * @returns {string | null}
 */
export function formatUsdRangeCompact(low, high, opts = {}) {
  const a0 = Number(low)
  const b0 = Number(high)
  if (!Number.isFinite(a0) || !Number.isFinite(b0) || a0 <= 0 || b0 <= 0) return null

  const lo = Math.min(a0, b0)
  const hi = Math.max(a0, b0)

  let sign = ''
  if (opts.sign === '+' || opts.sign === '−' || opts.sign === '-') {
    sign = opts.sign === '-' ? '−' : opts.sign
  } else if (opts.signed) {
    sign = '+'
  }

  // Cross into millions (incl. 500K–1M → 0.5-1M).
  if (hi >= 1e6 || lo >= 500_000) {
    return `${sign}$${millionsLeg(lo)}-${millionsLeg(hi)}M`
  }

  if (hi >= 1e3) {
    const a = Math.max(1, Math.round(lo / 1e3))
    const b = Math.max(a, Math.round(hi / 1e3))
    if (b >= 1000) return `${sign}$${millionsLeg(lo)}-${millionsLeg(hi)}M`
    return `${sign}$${a}-${b}K`
  }

  return `${sign}$${Math.round(lo)}-${Math.round(hi)}`
}

/**
 * Parse `$1,001 - $15,000` (or en/em dash) into endpoints.
 * @param {string | null | undefined} raw
 * @returns {{ low: number | null, high: number | null }}
 */
export function parseUsdRangeEndpoints(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return { low: null, high: null }
  const m = s.match(/^\$?\s*([\d,]+(?:\.\d+)?)\s*[-–—]\s*\$?\s*([\d,]+(?:\.\d+)?)\s*$/)
  if (!m) return { low: null, high: null }
  const low = Number(String(m[1]).replace(/,/g, ''))
  const high = Number(String(m[2]).replace(/,/g, ''))
  return {
    low: Number.isFinite(low) && low > 0 ? low : null,
    high: Number.isFinite(high) && high > 0 ? high : null,
  }
}

/**
 * @param {string | null | undefined} raw
 * @param {{ signed?: boolean, sign?: '+' | '−' | '' }} [opts]
 * @returns {string}
 */
export function compactUsdRangeLabel(raw, opts = {}) {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  const { low, high } = parseUsdRangeEndpoints(s)
  if (low != null && high != null) {
    return formatUsdRangeCompact(low, high, opts) || s
  }
  const pick = high ?? low
  if (pick != null) return formatUsdCompact(pick, { signed: Boolean(opts.signed) }) ?? s
  return s
}
