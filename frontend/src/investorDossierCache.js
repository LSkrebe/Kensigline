/** Session + memory cache for resolved investor dossiers — instant paint like company explore. */
const TTL_MS = 10 * 60_000
const PREFIX = 'mercerline:investor-dossier:'
const memory = new Map()

function readSession(slug) {
  if (typeof window === 'undefined' || !window.sessionStorage) return null
  try {
    const raw = window.sessionStorage.getItem(PREFIX + slug)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.at || Date.now() - parsed.at > TTL_MS) return null
    if (!parsed?.actorRow?.transactions?.length) return null
    return parsed
  } catch {
    return null
  }
}

function writeSession(slug, actorRow, mode) {
  if (typeof window === 'undefined' || !window.sessionStorage) return
  try {
    window.sessionStorage.setItem(
      PREFIX + slug,
      JSON.stringify({ at: Date.now(), mode, actorRow }),
    )
  } catch {
    /* quota */
  }
}

export function readInvestorDossierCache(slug) {
  const key = String(slug ?? '')
    .trim()
    .toLowerCase()
  if (!key) return null
  const mem = memory.get(key)
  if (mem?.actorRow?.transactions?.length) return mem
  const hit = readSession(key)
  if (hit) {
    memory.set(key, hit)
    return hit
  }
  return null
}

export function writeInvestorDossierCache(slug, actorRow, mode) {
  const key = String(slug ?? '')
    .trim()
    .toLowerCase()
  if (!key || !(actorRow?.transactions?.length > 0)) return
  const prev = memory.get(key)
  const nextN = actorRow.transactions.length
  const prevN = prev?.actorRow?.transactions?.length ?? 0
  // Never overwrite a richer cache with a thinner stub.
  if (prevN > nextN) return
  const payload = { at: Date.now(), mode: mode || actorRow.source || 'insider', actorRow }
  memory.set(key, payload)
  writeSession(key, actorRow, payload.mode)
}

