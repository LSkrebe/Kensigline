/** Proxy /api/* on mercerline.com → api.mercerline.com (Hetzner). Static assets otherwise. */
const API_ORIGIN = 'https://api.mercerline.com'

export default {
  /**
   * @param {Request} request
   * @param {{ ASSETS: { fetch: (req: Request) => Promise<Response> } }} env
   */
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname.startsWith('/api/')) {
      const target = new URL(url.pathname + url.search, API_ORIGIN)
      const headers = new Headers(request.headers)
      headers.delete('host')
      return fetch(
        new Request(target, {
          method: request.method,
          headers,
          body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
          redirect: 'manual',
        }),
      )
    }

    return env.ASSETS.fetch(request)
  },
}
