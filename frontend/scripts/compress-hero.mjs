/** Compress intro hero screenshot for faster LCP (webp/avif + smaller PNG fallback). */
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const introDir = join(__dirname, '..', 'public', 'intro')
const src = join(introDir, 'hero.png')

const widths = [768, 1200]

async function main() {
  for (const width of widths) {
    const resized = sharp(src).resize(width, null, { fit: 'inside', withoutEnlargement: true })
    const webp = await resized.clone().webp({ quality: 82, effort: 6 }).toBuffer()
    const avif = await resized.clone().avif({ quality: 62, effort: 6 }).toBuffer()
    await writeFile(join(introDir, `hero-${width}.webp`), webp)
    await writeFile(join(introDir, `hero-${width}.avif`), avif)
    console.log(`wrote hero-${width}.webp (${webp.length} bytes)`)
    console.log(`wrote hero-${width}.avif (${avif.length} bytes)`)
  }

  const png = await sharp(src)
    .resize(1440, null, { fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer()
  await writeFile(src, png)
  console.log(`wrote hero.png fallback (${png.length} bytes)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
