/**
 * Regenerate favicons, apple-touch icons, maskable PWA icons, and OG image.
 * Source: mercerline_logo.png (solid black bg, full-contrast white mark).
 */
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '..', 'public')
const logoPath = join(publicDir, 'mercerline_logo.png')
const BG = { r: 3, g: 4, b: 5, alpha: 1 }

async function squareIcon(size, logoScale = 0.92) {
  const logoSize = Math.round(size * logoScale)
  const logo = await sharp(logoPath).resize(logoSize, logoSize, { fit: 'contain' }).png().toBuffer()
  const offset = Math.round((size - logoSize) / 2)
  return sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: logo, left: offset, top: offset }])
    .png()
    .toBuffer()
}

/** Maskable safe zone: keep logo inside center 80% (Android / Safari PWA). */
async function maskableIcon(size) {
  const safe = Math.round(size * 0.72)
  const logo = await sharp(logoPath).resize(safe, safe, { fit: 'contain' }).png().toBuffer()
  const offset = Math.round((size - safe) / 2)
  return sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: logo, left: offset, top: offset }])
    .png()
    .toBuffer()
}

async function ogImage() {
  const width = 1200
  const height = 630
  const logoHeight = 340
  const logo = await sharp(logoPath)
    .resize(logoHeight, logoHeight, { fit: 'contain' })
    .png()
    .toBuffer()
  const meta = await sharp(logo).metadata()
  const left = Math.round((width - meta.width) / 2)
  const top = Math.round((height - meta.height) / 2)
  return sharp({
    create: { width, height, channels: 4, background: BG },
  })
    .composite([{ input: logo, left, top }])
    .png()
    .toBuffer()
}

async function pngToIco(pngBuffers) {
  const count = pngBuffers.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(count, 4)

  const entries = []
  let dataOffset = 6 + count * 16

  for (const buf of pngBuffers) {
    const meta = await sharp(buf).metadata()
    entries.push({ buf, meta, dataOffset })
    dataOffset += buf.length
  }

  const entryBufs = entries.map((e) => {
    const m = e.meta
    const entry = Buffer.alloc(16)
    entry[0] = m.width >= 256 ? 0 : m.width
    entry[1] = m.height >= 256 ? 0 : m.height
    entry[2] = 0
    entry[3] = 0
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(e.buf.length, 8)
    entry.writeUInt32LE(e.dataOffset, 12)
    return entry
  })
  return Buffer.concat([header, ...entryBufs, ...entries.map((e) => e.buf)])
}

async function main() {
  await mkdir(publicDir, { recursive: true })

  const sizes = [
    ['favicon-16.png', 16, 0.96],
    ['favicon-32.png', 32, 0.94],
    ['favicon-48.png', 48, 0.92],
    ['apple-touch-icon.png', 180, 0.9],
    ['icon-192.png', 192, 0.9],
    ['icon-512.png', 512, 0.9],
  ]

  for (const [name, size, scale] of sizes) {
    const buf = await squareIcon(size, scale)
    await writeFile(join(publicDir, name), buf)
    console.log(`wrote ${name}`)
  }

  const maskable = await maskableIcon(512)
  await writeFile(join(publicDir, 'icon-512-maskable.png'), maskable)
  console.log('wrote icon-512-maskable.png')

  const og = await ogImage()
  await writeFile(join(publicDir, 'og-image.png'), og)
  console.log('wrote og-image.png')

  const ico16 = await squareIcon(16, 0.96)
  const ico32 = await squareIcon(32, 0.94)
  const ico48 = await squareIcon(48, 0.92)
  const ico = await pngToIco([ico16, ico32, ico48])
  await writeFile(join(publicDir, 'favicon.ico'), ico)
  console.log('wrote favicon.ico')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
