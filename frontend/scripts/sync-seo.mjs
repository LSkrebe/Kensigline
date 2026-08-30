#!/usr/bin/env node
/** Sync crawler-facing assets from marketingSeo.js before/after production build. */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderLlmsTxt, renderSeoBootHtml, SITE_DESCRIPTION, NICHE_TAGLINE, SITE_URL } from '../src/marketingSeo.js'
import { DEFAULT_PRICING } from '../src/billingPlans.js'
import { RESEARCH_TICKERS } from '../src/publicRoutes.js'
import { LEARN_LESSONS } from '../src/learn/learnContent.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(__dirname, '..')
const publicDir = path.join(frontendRoot, 'public')
const distDir = path.join(frontendRoot, 'dist')

const pricing = DEFAULT_PRICING
const distOnly = process.argv.includes('--dist')

if (!distOnly) {
  syncPublicAssets()
}

if (distOnly || process.argv.includes('--all')) {
  patchDistIndex()
}

function syncPublicAssets() {
  fs.writeFileSync(path.join(publicDir, 'llms.txt'), renderLlmsTxt(pricing), 'utf8')

  const lastmod = new Date().toISOString().slice(0, 10)
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}/</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${SITE_URL}/sign-in</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>${SITE_URL}/learn</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>${SITE_URL}/research</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.85</priority>
  </url>
${LEARN_LESSONS.map(
  (l) => `  <url>
    <loc>${SITE_URL}/learn/${l.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.65</priority>
  </url>`,
).join('\n')}
${RESEARCH_TICKERS.map(
  (t) => `  <url>
    <loc>${SITE_URL}/research/ticker/${t}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.75</priority>
  </url>`,
).join('\n')}
</urlset>
`
  fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), sitemap, 'utf8')
  console.log('[sync-seo] Updated public/llms.txt and public/sitemap.xml')
}

function patchDistIndex() {
  const indexPath = path.join(distDir, 'index.html')
  if (!fs.existsSync(indexPath)) {
    console.error('[sync-seo] dist/index.html not found — run vite build first')
    process.exit(1)
  }

  let index = fs.readFileSync(indexPath, 'utf8')
  const bootHtml = renderSeoBootHtml(pricing)

  const bootStart = '      <!-- SEO_BOOT_START -->'
  const bootEnd = '      <!-- SEO_BOOT_END -->'
  const startIdx = index.indexOf(bootStart)
  const endIdx = index.indexOf(bootEnd)

  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    console.error('[sync-seo] Missing SEO_BOOT markers in dist/index.html')
    process.exit(1)
  }

  index =
    index.slice(0, startIdx + bootStart.length) +
    '\n' +
    bootHtml +
    '\n      ' +
    index.slice(endIdx)

  index = index.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/>/,
    `<meta name="description" content="${escapeAttr(SITE_DESCRIPTION)}" />`,
  )
  index = index.replace(
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/>/,
    `<meta property="og:description" content="${escapeAttr(SITE_DESCRIPTION)}" />`,
  )
  index = index.replace(
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/>/,
    `<meta name="twitter:description" content="${escapeAttr(SITE_DESCRIPTION)}" />`,
  )
  index = index.replace(/<title>[^<]*<\/title>/, `<title>Mercerline - ${escapeAttr(NICHE_TAGLINE)}</title>`)

  if (!index.includes('rel="alternate" type="text/plain" href="/llms.txt"')) {
    index = index.replace(
      /<link rel="canonical" href="[^"]+" \/>/,
      `<link rel="canonical" href="${SITE_URL}/" />\n    <link rel="alternate" type="text/plain" href="/llms.txt" title="LLM site summary" />`,
    )
  }

  fs.writeFileSync(indexPath, index, 'utf8')
  console.log('[sync-seo] Patched dist/index.html crawler markup')
}

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}
