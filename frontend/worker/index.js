/** Proxy /api/* on mercerline.com → api.mercerline.com (Hetzner). Static assets otherwise. */
import { isRetiredProductPath } from '../src/retiredProductPaths.js'

const API_ORIGIN = 'https://api.mercerline.com'

/**
 * Hermes and similar tools often cannot set Authorization headers.
 * Accept ?key= or ?content_api_key= on internal content routes, forward as headers,
 * and strip from the upstream URL so keys are less likely to appear in origin logs.
 */
function prepareInternalContentProxy(url, headers) {
  if (!url.pathname.startsWith('/api/internal/content')) {
    return url.pathname + url.search
  }

  const key = url.searchParams.get('key') ?? url.searchParams.get('content_api_key')
  if (!key) return url.pathname + url.search

  const upstream = new URL(url.pathname + url.search, API_ORIGIN)
  upstream.searchParams.delete('key')
  upstream.searchParams.delete('content_api_key')

  headers.set('Authorization', `Bearer ${key}`)
  headers.set('X-Content-Api-Key', key)

  return upstream.pathname + upstream.search
}

export default {
  /**
   * @param {Request} request
   * @param {{ ASSETS: { fetch: (req: Request) => Promise<Response> } }} env
   */
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname.startsWith('/api/') || url.pathname === '/health' || url.pathname.startsWith('/health/')) {
      const headers = new Headers(request.headers)
      headers.delete('host')
      const targetPath = prepareInternalContentProxy(url, headers)
      const target = new URL(targetPath, API_ORIGIN)
      return fetch(
        new Request(target, {
          method: request.method,
          headers,
          body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
          redirect: 'manual',
        }),
      )
    }

    const aliases = {'/watchlist':'/explore/watchlist','/account':'/settings','/pricing':'/#pricing','/methodology':'/learn/form-4-insider-filings'};
    const cleanPath = url.pathname.replace(/\/$/,'') || '/';
    if (isRetiredProductPath(cleanPath)) {
      return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } })
    }
    if (aliases[cleanPath]) return Response.redirect(new URL(aliases[cleanPath],url.origin),302);
    const response = await env.ASSETS.fetch(request)
    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.includes('text/html')) {
      const headers = new Headers(response.headers)
      headers.set('Cache-Control', 'no-cache, must-revalidate')
      headers.set('CDN-Cache-Control', 'no-cache')
      if (/^\/(activity|people|watchlist|account|explore|sign-in|settings|subscribe)(\/|$)/.test(url.pathname)) headers.set('X-Robots-Tag', 'noindex, follow')
      return new Response(response.body, { status: response.status, headers })
    }

    return response
  },
}
