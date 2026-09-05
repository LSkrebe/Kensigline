/**
 * Compact USD labels for filings, explore, and metrics.
 * Rolls K → M at 1000K so ~$1M never renders as "$1000K".
 */

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

  if (abs >= 1e9) return `${prefix}$${(abs / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `${prefix}$${(abs / 1e6).toFixed(1)}M`
  if (abs >= 1e3) {
    const k = Math.round(abs / 1e3)
    if (k >= 1000) return `${prefix}$${(abs / 1e6).toFixed(1)}M`
    return `${prefix}$${k}K`
  }
  return `${prefix}$${Math.round(abs)}`
}
