#!/usr/bin/env node
/**
 * Save company logos and tracked-investor portraits into public/.
 * Safe to run on every dev/build: files already on disk are left alone.
 * Add a person to exploreWatchlistCatalog.js or a ticker in the app, then
 * start the app again and the missing image is downloaded once.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = path.join(root, 'src')
const logoDir = path.join(root, 'public/intro/company-logos')
const investorDir = path.join(root, 'public/investors')
const logoMapPath = path.join(srcDir, 'exploreLogos.json')
const portraitMapPath = path.join(srcDir, 'explorePortraits.json')
const catalogPath = path.join(srcDir, 'exploreWatchlistCatalog.js')
const UA = 'Mercerline/1.0 (https://mercerline.com; caching public images for the local app)'

fs.mkdirSync(logoDir, { recursive: true })
fs.mkdirSync(investorDir, { recursive: true })

const logos = JSON.parse(fs.readFileSync(logoMapPath, 'utf8'))
const portraits = JSON.parse(fs.readFileSync(portraitMapPath, 'utf8'))

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(js|jsx|mjs)$/.test(entry.name)) out.push(full)
  }
  return out
}

function collectTickers() {
  const tickers = new Set(Object.keys(logos))
  const skip = new Set(['PTR', 'F4', 'F13', '13F', 'SEC', 'USA', 'CEO', 'ETF', 'USD', 'YTD', 'NYSE', 'NASDAQ', 'IPO', 'AUM', 'DXY', 'EURUSD', 'USDJPY', 'P'])
  for (const file of walk(srcDir)) {
    const text = fs.readFileSync(file, 'utf8')
    for (const match of text.matchAll(/ticker:\s*['"]([A-Z][A-Z0-9.-]{0,9})['"]/g)) tickers.add(match[1])
    const listed = text.match(/RESEARCH_TICKERS\s*=\s*\[([\s\S]*?)\]/)
    if (listed) {
      for (const match of listed[1].matchAll(/'([A-Z][A-Z0-9.-]{0,9})'/g)) tickers.add(match[1])
    }
  }
  return [...tickers].filter((ticker) => ticker.length > 1 && !skip.has(ticker)).sort()
}

function collectInvestors() {
  const text = fs.readFileSync(catalogPath, 'utf8')
  const people = []
  for (const block of text.split(/\n  \{/)) {
    const name = block.match(/name: '([^']+)'/)?.[1]
    const slug = block.match(/slug: '([^']+)'/)?.[1]
    const mode = block.match(/mode: '([^']+)'/)?.[1]
    if (name && slug && mode) people.push({ name, slug, mode })
  }
  return people
}

function portraitKey(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, '')
}

function existingInvestorFile(slug) {
  return ['jpg', 'jpeg', 'png', 'svg', 'webp'].map((ext) => path.join(investorDir, `${slug}.${ext}`)).find((file) => fs.existsSync(file)) ?? null
}

async function fetchBytes(url) {
  const response = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'image/*,*/*' }, redirect: 'follow', signal: AbortSignal.timeout(25000) })
  if (!response.ok) throw new Error(`${response.status} ${url}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  const type = response.headers.get('content-type') || ''
  return { bytes, type }
}

function isPng(bytes) {
  return bytes.length > 200 && bytes[0] === 0x89 && bytes[1] === 0x50
}
function isJpeg(bytes) {
  return bytes.length > 200 && bytes[0] === 0xff && bytes[1] === 0xd8
}
function isSvg(bytes) {
  const head = bytes.subarray(0, 400).toString('utf8').toLowerCase()
  return head.includes('<svg')
}

async function savePng(bytes, dest) {
  if (isPng(bytes)) fs.writeFileSync(dest, bytes)
  else if (isJpeg(bytes) || isSvg(bytes)) await sharp(bytes).png().toFile(dest)
  else throw new Error('not an image')
}

async function saveCompany(ticker) {
  const dest = path.join(logoDir, `${ticker}.png`)
  if (fs.existsSync(dest) && fs.statSync(dest).size > 200) {
    logos[ticker] = `/intro/company-logos/${ticker}.png`
    return 'kept'
  }
  const urls = [
    `https://financialmodelingprep.com/image-stock/${ticker}.png`,
    `https://raw.githubusercontent.com/nvstly/icons/main/ticker_icons/${ticker}.png`,
  ]
  let last = 'missing'
  for (const url of urls) {
    try {
      const { bytes } = await fetchBytes(url)
      await savePng(bytes, dest)
      logos[ticker] = `/intro/company-logos/${ticker}.png`
      return 'saved'
    } catch (error) {
      last = error.message
    }
  }
  return `failed ${last}`
}

async function loadLegislators() {
  const people = []
  for (const name of ['legislators-current.json', 'legislators-historical.json']) {
    const { bytes } = await fetchBytes(`https://unitedstates.github.io/congress-legislators/${name}`)
    people.push(...JSON.parse(bytes.toString('utf8')))
  }
  return people
}

function matchLegislator(people, name) {
  const target = name.toLowerCase().replace(/[^a-z]/g, '')
  return people.find((person) => {
    const n = person.name || {}
    const forms = [`${n.first || ''}${n.last || ''}`, `${n.nickname || ''}${n.last || ''}`, n.official_full || ''].map((value) =>
      String(value).toLowerCase().replace(/[^a-z]/g, ''),
    )
    return forms.includes(target)
  })
}

async function wikiThumb(title) {
  const { bytes } = await fetchBytes(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`)
  const page = JSON.parse(bytes.toString('utf8'))
  const src = page?.thumbnail?.source
  if (!src || page.type === 'disambiguation') return null
  return src
}

async function saveInvestor(person, legislators) {
  const have = existingInvestorFile(person.slug)
  if (have) {
    const kind = portraits[portraitKey(person.name)]?.kind
    portraits[portraitKey(person.name)] = {
      src: `/investors/${path.basename(have)}`,
      source: 'local',
      ...(kind === 'logo' ? { kind: 'logo' } : {}),
    }
    return 'kept'
  }
  let url = null
  if (person.mode === 'politicians' && legislators) {
    const hit = matchLegislator(legislators, person.name)
    const bio = hit?.id?.bioguide
    if (bio) url = `https://raw.githubusercontent.com/unitedstates/images/gh-pages/congress/225x275/${bio}.jpg`
  }
  if (!url) url = await wikiThumb(person.name.replace(/ /g, '_'))
  if (!url) return 'no-source'
  const { bytes } = await fetchBytes(url)
  const ext = isPng(bytes) ? 'png' : isJpeg(bytes) ? 'jpg' : isSvg(bytes) ? 'svg' : null
  if (!ext) return 'not-image'
  const filename = `${person.slug}.${ext}`
  fs.writeFileSync(path.join(investorDir, filename), bytes)
  portraits[portraitKey(person.name)] = { src: `/investors/${filename}`, source: 'local' }
  return 'saved'
}

async function pool(items, limit, worker) {
  const queue = [...items]
  const results = []
  async function run() {
    while (queue.length) {
      const item = queue.shift()
      results.push(await worker(item))
    }
  }
  await Promise.all(Array.from({ length: limit }, run))
  return results
}

const tickers = collectTickers()
const investors = collectInvestors()
console.log(`cache-images: ${tickers.length} companies, ${investors.length} investors`)

const companyResults = await pool(tickers, 6, async (ticker) => {
  const status = await saveCompany(ticker)
  if (status !== 'kept') console.log(`  company ${ticker}: ${status}`)
  return status
})

let legislators = null
const missingPoliticians = investors.some((person) => person.mode === 'politicians' && !existingInvestorFile(person.slug))
const missingOthers = investors.some((person) => person.mode !== 'politicians' && !existingInvestorFile(person.slug))
if (missingPoliticians) {
  try {
    legislators = await loadLegislators()
  } catch (error) {
    console.log(`  legislators: ${error.message}`)
  }
}

for (const person of investors) {
  if (existingInvestorFile(person.slug)) {
    await saveInvestor(person, legislators)
    continue
  }
  try {
    const status = await saveInvestor(person, legislators)
    console.log(`  investor ${person.name}: ${status}`)
  } catch (error) {
    console.log(`  investor ${person.name}: failed ${error.message}`)
  }
  if (missingOthers || missingPoliticians) await new Promise((resolve) => setTimeout(resolve, 400))
}

fs.writeFileSync(logoMapPath, `${JSON.stringify(Object.fromEntries(Object.entries(logos).sort(([a], [b]) => a.localeCompare(b))), null, 2)}\n`)
fs.writeFileSync(portraitMapPath, `${JSON.stringify(portraits, null, 2)}\n`)

const saved = companyResults.filter((status) => status === 'saved').length
const failed = companyResults.filter((status) => String(status).startsWith('failed')).length
console.log(`cache-images: ${saved} company logos saved, ${failed} company logos unavailable`)
