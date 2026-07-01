import { fetchJsonSafe } from './api.js'

/**
 * @param {string} ticker
 * @returns {Promise<{ ok: boolean; model?: object; revenueOverlay?: { values: number[] }; partial?: boolean; empty?: boolean } | null>}
 */
export async function fetchAnalyseModel(ticker) {
  const t = String(ticker ?? '').trim().toUpperCase()
  if (!t) return null
  const res = await fetchJsonSafe(`/api/analyse/model?ticker=${encodeURIComponent(t)}`, {
    timeoutMs: 20_000,
  })
  if (!res.ok || !res.data?.ok) return null
  if (res.data.empty || !res.data.model) return null
  return res.data
}
