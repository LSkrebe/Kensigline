/** Session cache for feed list payloads — instant paint on tab return. */
const TTL_MS = 10 * 60_000
const PREFIX = 'mercerline:feed:'

export function readFeedCache(key) {
  if (typeof window === 'undefined' || !window.sessionStorage) return null
  try {
    const raw = window.sessionStorage.getItem(PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.at || Date.now() - parsed.at > TTL_MS) return null
    return parsed
  } catch {
    return null
  }
}

export function writeFeedCache(key, payload) {
  if (typeof window === 'undefined' || !window.sessionStorage) return
  try {
    window.sessionStorage.setItem(
      PREFIX + key,
      JSON.stringify({ at: Date.now(), ...payload }),
    )
  } catch {
    /* quota */
  }
}
