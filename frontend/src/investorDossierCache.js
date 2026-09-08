/** Session + memory cache for resolved investor dossiers — instant paint like company explore. */
const TTL_MS = 10 * 60_000
const PREFIX = 'mercerline:investor-dossier:'
const memory = new Map()

function txnRichness(actorRow) {
  const txns = actorRow?.transactions
  if (!Array.isArray(txns) || !txns.length) return 0
  let real = 0
  for (const t of txns) {
    const usd = Number(t?.sheetRow?.amountUsd)
    if (Number.isFinite(usd) && usd > 1) real += 1
    else if (t?.companyRow) real += 1
  }
  return txns.length * 10 + real * 5
}

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
  const nextIsApi = actorRow?.__dossierSource === 'api'
  const prevIsApi = prev?.actorRow?.__dossierSource === 'api'
  // Authoritative API payload always replaces progressive feed/mock caches.
  if (!nextIsApi && prevIsApi) return
  const nextScore = txnRichness(actorRow)
  const prevScore = txnRichness(prev?.actorRow)
  // Never overwrite a richer cache with a thinner stub (unless this is API).
  if (!nextIsApi && prevScore > nextScore) return
  const payload = { at: Date.now(), mode: mode || actorRow.source || 'insider', actorRow }
  memory.set(key, payload)
  writeSession(key, actorRow, payload.mode)
}
