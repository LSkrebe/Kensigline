import { lazy } from 'react'

const CHUNK_ERR =
  /Failed to fetch dynamically imported module|Loading chunk \d+ failed|Importing a module script failed/i

/**
 * Lazy import with retries + one auto-reload on deploy chunk mismatch.
 */
export function lazyWithRetry(importFn, retries = 2) {
  return lazy(async () => {
    let lastErr
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await importFn()
      } catch (err) {
        lastErr = err
        const msg = String(err?.message ?? err)
        if (!CHUNK_ERR.test(msg) || attempt === retries) break
        await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)))
      }
    }

    const reloadKey = 'mercerline:chunk-reload'
    if (typeof sessionStorage !== 'undefined' && !sessionStorage.getItem(reloadKey)) {
      sessionStorage.setItem(reloadKey, '1')
      window.location.reload()
      return new Promise(() => {})
    }
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(reloadKey)
    throw lastErr
  })
}
