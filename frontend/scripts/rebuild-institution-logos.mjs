/**
 * Rebuild curated institution portraits as logos (contain, upscaled) and
 * ensure explorePortraits.json marks them kind:logo with LLC aliases.
 *
 *   node scripts/rebuild-institution-logos.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const investorDir = path.join(root, 'public/investors')
const thumbDir = path.join(investorDir, 'thumbs')
const portraitMapPath = path.join(root, 'src/explorePortraits.json')
const catalogPath = path.join(root, 'src/exploreWatchlistCatalog.js')
const tmpDir = '/tmp/inst-logos'

const DOMAINS = {
  'berkshire-hathaway': ['berkshirehathaway.com', 'brk.com'],
  'pershing-square': ['pershingsquareholdings.com'],
  'duquesne-family-office': ['duquesne.com'],
  'appaloosa': ['appaloosa.com'],
  'citadel-advisors': ['citadel.com'],
  'renaissance-technologies': ['rentec.com'],
  'bridgewater': ['bridgewater.com'],
  'elliott-management': ['elliottmgmt.com'],
  'third-point': ['thirdpoint.com'],
  'baupost': ['baupost.com'],
  'tiger-global': ['tigerglobal.com'],
  'coatue': ['coatue.com'],
  'viking-global': ['vikingglobal.com'],
  'lone-pine': ['lonepinecapital.com'],
  'icahn-capital': ['icahnenterprises.com'],
}

function portraitKey(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function collectInstitutions() {
  const text = fs.readFileSync(catalogPath, 'utf8')
  const people = []
  for (const block of text.split(/\n  \{/)) {
    const name = block.match(/name: '([^']+)'/)?.[1]
    const slug = block.match(/slug: '([^']+)'/)?.[1]
    const mode = block.match(/mode: '([^']+)'/)?.[1]
    const aliases = [...(block.match(/slugAliases: \[([^\]]*)\]/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1])
    const matchNames = [...(block.match(/matchNames: \[([^\]]*)\]/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1])
    if (name && slug && mode === 'institutions') people.push({ name, slug, aliases, matchNames })
  }
  return people
}

async function fetchBytes(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mercerline/1.0', Accept: 'image/*,*/*' },
    redirect: 'follow',
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) throw new Error(String(response.status))
  return Buffer.from(await response.arrayBuffer())
}

function wordmarkSvg(label, hero = '#2a2a2e') {
  const text = String(label ?? 'LOGO')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .slice(0, 28)
  const size = text.length > 14 ? 72 : text.length > 8 ? 96 : 120
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="${hero}"/>
  <text x="512" y="560" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${size}" font-weight="700" fill="#ffffff">${text}</text>
</svg>`)
}

async function resolveSource(slug, name, hero) {
  const candidates = []
  for (const ext of ['png', 'jpg', 'webp', 'svg']) {
    for (const base of [`${slug}-hq`, slug]) {
      const p = path.join(tmpDir, `${base}.${ext}`)
      if (fs.existsSync(p) && fs.statSync(p).size >= 800) candidates.push(fs.readFileSync(p))
    }
  }
  for (const domain of DOMAINS[slug] ?? []) {
    try {
      const bytes = await fetchBytes(`https://www.google.com/s2/favicons?domain=${domain}&sz=256`)
      if (bytes.length >= 800) candidates.push(bytes)
    } catch {
      /* try next */
    }
  }
  const local = ['webp', 'png', 'jpg', 'jpeg', 'svg']
    .map((ext) => path.join(investorDir, `${slug}.${ext}`))
    .find((file) => fs.existsSync(file))
  if (local && fs.statSync(local).size < 80_000) candidates.push(fs.readFileSync(local))

  for (const bytes of candidates) {
    try {
      await sharp(bytes, { failOn: 'none' }).metadata()
      return bytes
    } catch {
      /* try next candidate */
    }
  }
  return wordmarkSvg(name, hero)
}

async function writeLogo(slug, bytes, hero) {
  fs.mkdirSync(thumbDir, { recursive: true })
  const cardPath = path.join(investorDir, `${slug}.webp`)
  const thumbPath = path.join(thumbDir, `${slug}.webp`)
  const bg = hero && /^#[0-9a-f]{3,8}$/i.test(hero) ? hero : '#1a1a1c'
  const h = bg.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6)
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  let input
  try {
    input = await sharp(bytes, { density: 300, failOn: 'none' }).ensureAlpha().toBuffer()
  } catch {
    input = await sharp(wordmarkSvg(slug.replace(/-/g, ' '), bg), { density: 300 }).ensureAlpha().toBuffer()
  }
  await sharp(input)
    .resize(1024, 1024, {
      fit: 'contain',
      background: { r, g, b, alpha: 1 },
      kernel: sharp.kernel.lanczos3,
    })
    .webp({ quality: 90, effort: 4 })
    .toFile(cardPath)
  await sharp(input)
    .resize(256, 256, {
      fit: 'contain',
      background: { r, g, b, alpha: 1 },
    })
    .webp({ quality: 85, effort: 4 })
    .toFile(thumbPath)
}

function upsertPortrait(portraits, key, slug, hero) {
  if (!key) return
  const prev = portraits[key] || {}
  portraits[key] = {
    src: `/investors/${slug}.webp`,
    thumb: `/investors/thumbs/${slug}.webp`,
    source: 'local',
    hero: prev.hero || hero || '#2a2a2e',
    kind: 'logo',
  }
}

async function main() {
  const portraits = JSON.parse(fs.readFileSync(portraitMapPath, 'utf8'))
  const people = collectInstitutions()
  console.log(`institutions=${people.length}`)
  for (const person of people) {
    const key = portraitKey(person.name)
    const hero = portraits[key]?.hero || portraits[portraitKey(person.slug)]?.hero || '#2a2a2e'
    const bytes = await resolveSource(person.slug, person.name, hero)
    await writeLogo(person.slug, bytes, hero)
    upsertPortrait(portraits, key, person.slug, hero)
    upsertPortrait(portraits, portraitKey(person.slug), person.slug, hero)
    for (const alias of person.aliases ?? []) upsertPortrait(portraits, portraitKey(alias), person.slug, hero)
    for (const n of person.matchNames ?? []) upsertPortrait(portraits, portraitKey(n), person.slug, hero)
    // LLC / LP forms of the display name
    for (const suf of [' LLC', ' L.P.', ' LP', ' Inc', ' Ltd']) {
      upsertPortrait(portraits, portraitKey(person.name + suf), person.slug, hero)
    }
    console.log(`ok ${person.slug}`)
  }
  fs.writeFileSync(portraitMapPath, `${JSON.stringify(portraits, null, 2)}\n`)
  console.log('wrote explorePortraits.json')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
