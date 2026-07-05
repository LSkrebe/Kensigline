import { fetchJsonSafe } from './api.js'

/**
 * @param {string} ticker
 * @returns {Promise<{ ok: true, preview: import('./publicTickerPreviewMock.js').PublicTickerPreview, sparkline: number[] } | { notFound: true } | null>}
 */
export async function fetchPublicTickerTeaser(ticker) {
  const t = String(ticker ?? '').trim().toUpperCase()
  if (!t) return { notFound: true }

  const r = await fetchJsonSafe(`/api/public/teaser/${encodeURIComponent(t)}`, { timeoutMs: 10_000 })
  if (!r.ok) {
    if (r.status === 404) return { notFound: true }
    return null
  }
  const data = r.data
  if (!data?.ok || !data.preview) return null
  return {
    ok: true,
    preview: data.preview,
    sparkline: Array.isArray(data.sparkline) ? data.sparkline : [],
  }
}
