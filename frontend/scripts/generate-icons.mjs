/**
 * Regenerate favicons, apple-touch icons, maskable PWA icons, and OG image.
 * Source: mercerline_yt.png — black is keyed out, then the transparent mark is
 * composited onto the app background (#030405) so rounded / circle masks look clean.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '..', 'public')
const logoPath = join(publicDir, 'mercerline_yt.png')
const BG = { r: 3, g: 4, b: 5, alpha: 1 }
const BLACK_KEY_THRESHOLD = 28
const TRANSPARENT_MASTER_PX = 1024

async function extractTransparentMark(size = TRANSPARENT_MASTER_PX) {
  const { data, info } = await sharp(logoPath)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    if (r <= BLACK_KEY_THRESHOLD && g <= BLACK_KEY_THRESHOLD && b <= BLACK_KEY_THRESHOLD) {
      data[i + 3] = 0
    }
  }

  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer()
}

async function compositeOnBrandBg(size, markBuffer, logoScale = 0.92) {
  const logoSize = Math.round(size * logoScale)
  const logo = await sharp(markBuffer).resize(logoSize, logoSize, { fit: 'contain' }).png().toBuffer()
  const meta = await sharp(logo).metadata()
  const left = Math.round((size - meta.width) / 2)
  const top = Math.round((size - meta.height) / 2)
  return sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: logo, left, top }])
    .png()
    .toBuffer()
}

/** Maskable safe zone: keep mark inside center ~72% (Android squircle / iOS rounded rect). */
async function maskableIcon(size, markBuffer) {
  const safe = Math.round(size * 0.72)
  const logo = await sharp(markBuffer).resize(safe, safe, { fit: 'contain' }).png().toBuffer()
  const meta = await sharp(logo).metadata()
  const left = Math.round((size - meta.width) / 2)
  const top = Math.round((size - meta.height) / 2)
  return sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: logo, left, top }])
    .png()
    .toBuffer()
}

async function ogImage(markBuffer) {
  const width = 1200
  const height = 630
  const logoHeight = 340
  const logo = await sharp(markBuffer).resize(logoHeight, logoHeight, { fit: 'contain' }).png().toBuffer()
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

  const mark = await extractTransparentMark(TRANSPARENT_MASTER_PX)
  await writeFile(join(publicDir, 'mercerline_logo_transparent.png'), mark)
  console.log('wrote mercerline_logo_transparent.png')

  const sizes = [
    ['favicon-16.png', 16, 0.96],
    ['favicon-32.png', 32, 0.94],
    ['favicon-48.png', 48, 0.92],
    ['apple-touch-icon.png', 180, 0.9],
    ['icon-192.png', 192, 0.9],
    ['icon-512.png', 512, 0.9],
  ]

  for (const [name, size, scale] of sizes) {
    const buf = await compositeOnBrandBg(size, mark, scale)
    await writeFile(join(publicDir, name), buf)
    console.log(`wrote ${name}`)
  }

  const maskable = await maskableIcon(512, mark)
  await writeFile(join(publicDir, 'icon-512-maskable.png'), maskable)
  console.log('wrote icon-512-maskable.png')

  const og = await ogImage(mark)
  await writeFile(join(publicDir, 'og-image.png'), og)
  console.log('wrote og-image.png')

  const ico16 = await compositeOnBrandBg(16, mark, 0.96)
  const ico32 = await compositeOnBrandBg(32, mark, 0.94)
  const ico48 = await compositeOnBrandBg(48, mark, 0.92)
  const ico = await pngToIco([ico16, ico32, ico48])
  await writeFile(join(publicDir, 'favicon.ico'), ico)
  console.log('wrote favicon.ico')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
