import { fetchJsonSafe } from './api.js'

/**
 * @param {string} ticker
 * @returns {Promise<{ ok: boolean; model?: object; revenueOverlay?: { values: number[] }; partial?: boolean; empty?: boolean } | null>}
 */
export async function fetchAnalyseModel(ticker) {
  const t = String(ticker ?? '').trim().toUpperCase()
  if (!t) return null

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const res = await fetchJsonSafe(`/api/analyse/model?ticker=${encodeURIComponent(t)}`, {
      timeoutMs: 16_000,
    })
    if (res.ok && res.data?.ok && res.data.model) return res.data
    // Confirmed empty from a healthy response — don't retry forever.
    if (res.ok && res.data?.ok && (res.data.empty || !res.data.model)) return null
    if (attempt === 0) await new Promise((r) => setTimeout(r, 500))
  }
  return null
}
