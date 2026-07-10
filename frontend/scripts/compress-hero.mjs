/** Compress intro hero screenshot for faster LCP (webp/avif + high-res PNG fallback). */
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const introDir = join(__dirname, '..', 'public', 'intro')
const src = join(introDir, 'hero.png')

/** Display slot is ~1180px; 2400w covers 2x retina without upscaling. */
const widths = [768, 1200, 2400]

async function main() {
  const meta = await sharp(src).metadata()
  console.log(`source hero.png ${meta.width}x${meta.height}`)

  for (const width of widths) {
    const resized = sharp(src).resize(width, null, { fit: 'inside', withoutEnlargement: true })
    const webp = await resized.clone().webp({ quality: 90, effort: 6 }).toBuffer()
    const avif = await resized.clone().avif({ quality: 72, effort: 6 }).toBuffer()
    await writeFile(join(introDir, `hero-${width}.webp`), webp)
    await writeFile(join(introDir, `hero-${width}.avif`), avif)
    console.log(`wrote hero-${width}.webp (${webp.length} bytes)`)
    console.log(`wrote hero-${width}.avif (${avif.length} bytes)`)
  }

  // Keep full capture resolution for PNG fallback — only recompress, do not downscale.
  const png = await sharp(src)
    .png({ compressionLevel: 6, adaptiveFiltering: true })
    .toBuffer()
  await writeFile(src, png)
  console.log(`wrote hero.png fallback (${png.length} bytes, ${meta.width}x${meta.height})`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
