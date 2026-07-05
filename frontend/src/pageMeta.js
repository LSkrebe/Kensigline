const DEFAULT_SITE_URL = 'https://mercerline.com'
const DEFAULT_OG_IMAGE = '/og-image.png'

function siteOrigin() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/$/, '')
  }
  const fromEnv = String(import.meta.env.VITE_SITE_URL ?? '').trim()
  return (fromEnv || DEFAULT_SITE_URL).replace(/\/$/, '')
}

function upsertMeta(attr, key, content) {
  if (!content || typeof document === 'undefined') return
  let el = document.head.querySelector(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertLink(rel, href) {
  if (!href || typeof document === 'undefined') return
  let el = document.head.querySelector(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

/** Per-route SEO: title, description, canonical, Open Graph, Twitter. */
export function applyPageMeta({
  title,
  description,
  path = '/',
  ogImage = DEFAULT_OG_IMAGE,
  ogType = 'website',
}) {
  if (typeof document === 'undefined') return

  const origin = siteOrigin()
  const canonicalPath = path.startsWith('/') ? path : `/${path}`
  const url = `${origin}${canonicalPath}`
  const imageUrl = ogImage.startsWith('http') ? ogImage : `${origin}${ogImage}`

  document.title = title
  upsertMeta('name', 'description', description)
  upsertMeta('name', 'robots', 'index,follow')
  upsertMeta('name', 'theme-color', '#030405')
  upsertMeta('property', 'og:title', title)
  upsertMeta('property', 'og:description', description)
  upsertMeta('property', 'og:type', ogType)
  upsertMeta('property', 'og:url', url)
  upsertMeta('property', 'og:image', imageUrl)
  upsertMeta('property', 'og:image:alt', 'Mercerline logo')
  if (ogImage.includes('og-image')) {
    upsertMeta('property', 'og:image:width', '1200')
    upsertMeta('property', 'og:image:height', '630')
  }
  upsertMeta('property', 'og:site_name', 'Mercerline')
  upsertMeta('name', 'twitter:card', 'summary_large_image')
  upsertMeta('name', 'twitter:title', title)
  upsertMeta('name', 'twitter:description', description)
  upsertMeta('name', 'twitter:image', imageUrl)
  upsertLink('canonical', url)
}
