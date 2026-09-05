/** Lightweight client-side diagnostics — persisted in sessionStorage for debugging prod issues. */
const STORAGE_KEY = 'mercerline:client-diag:v1'
const MAX = 100

let buffer = []

function readStored() {
  if (typeof window === 'undefined' || !window.sessionStorage) return []
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    const parsed = JSON.parse(raw ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeStored(entries) {
  if (typeof window === 'undefined' || !window.sessionStorage) return
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX)))
  } catch {
    /* quota */
  }
}

buffer = readStored()

export function logClientDiagnostic(event, detail = {}) {
  const entry = {
    at: new Date().toISOString(),
    event: String(event ?? 'event'),
    ...detail,
  }
  buffer.push(entry)
  if (buffer.length > MAX) buffer = buffer.slice(-MAX)
  writeStored(buffer)
  if (import.meta.env?.DEV) {
    console.warn('[mercerline-diag]', entry.event, entry)
  }
}

export function getClientDiagnostics() {
  return [...buffer]
}

export function clearClientDiagnostics() {
  buffer = []
  writeStored(buffer)
}

export function installClientDiagnostics() {
  if (typeof window === 'undefined' || window.__mercerlineDiagInstalled) return
  window.__mercerlineDiagInstalled = true

  window.addEventListener('error', (ev) => {
    logClientDiagnostic('window.error', {
      message: String(ev.message ?? ''),
      source: String(ev.filename ?? ''),
      line: ev.lineno ?? null,
      col: ev.colno ?? null,
    })
  })

  window.addEventListener('unhandledrejection', (ev) => {
    const reason = ev.reason
    logClientDiagnostic('unhandledrejection', {
      message: reason instanceof Error ? reason.message : String(reason ?? ''),
    })
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      logClientDiagnostic('app.visible', { path: window.location?.pathname ?? '' })
    }
  })
}

if (typeof window !== 'undefined') {
  installClientDiagnostics()
  window.mercerlineDiagnostics = {
    get: getClientDiagnostics,
    clear: clearClientDiagnostics,
    log: logClientDiagnostic,
  }
}
