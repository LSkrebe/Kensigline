/** Compress intro marketing screenshots to webp (+ recompress PNG). */
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const introDir = join(__dirname, '..', 'public', 'intro')
const widths = [768, 1200, 2400]

const names = (process.env.SHOT ? [process.env.SHOT] : ['deep-company', 'investors-directory']).filter(
  Boolean,
)

async function compressOne(name) {
  const src = join(introDir, `${name}.png`)
  const meta = await sharp(src).metadata()
  console.log(`${name}.png ${meta.width}x${meta.height}`)

  for (const width of widths) {
    const resized = sharp(src).resize(width, null, { fit: 'inside', withoutEnlargement: true })
    const webp = await resized.clone().webp({ quality: 90, effort: 6 }).toBuffer()
    await writeFile(join(introDir, `${name}-${width}.webp`), webp)
    console.log(`wrote ${name}-${width}.webp (${webp.length} bytes)`)
  }

  const png = await sharp(src).png({ compressionLevel: 6, adaptiveFiltering: true }).toBuffer()
  await writeFile(src, png)
  console.log(`wrote ${name}.png (${png.length} bytes)`)
}

async function main() {
  for (const name of names) await compressOne(name)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
