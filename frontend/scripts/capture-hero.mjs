/** Capture intro hero from offline terminal preview (no backend). */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = dirname(fileURLToPath(import.meta.url))
const introDir = join(__dirname, '..', 'public', 'intro')
const outPath = join(introDir, 'hero.png')
const previewUrl =
  process.env.HERO_PREVIEW_URL ?? 'http://127.0.0.1:5173/?preview=terminal&tab=analyse&ticker=ASML'

const VIEWPORT_CSS = { width: 1440, height: 900 }
const DEVICE_SCALE = 2

async function main() {
  await mkdir(introDir, { recursive: true })
  const browser = await chromium.launch()
  const page = await browser.newPage({
    viewport: VIEWPORT_CSS,
    deviceScaleFactor: DEVICE_SCALE,
  })
  await page.goto(previewUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.waitForSelector('.terminalShell', { timeout: 30_000 })
  await page.waitForSelector('.contextCompanyPrice', { timeout: 30_000 })

  const asmlRow = page.locator('.feedRowCompact').filter({ hasText: /^ASML\b/ })
  if (await asmlRow.count()) {
    await asmlRow.first().scrollIntoViewIfNeeded()
    await asmlRow.first().click()
  }

  const allRangeBtn = page.locator('.analyseSectionChartRange button', { hasText: /^ALL$/ })
  if (await allRangeBtn.count()) {
    await allRangeBtn.click()
    await page.waitForTimeout(600)
  }

  const shell = page.locator('.terminalShell')
  const png = await shell.screenshot({ type: 'png' })
  await writeFile(outPath, png)
  await browser.close()
  const pxW = VIEWPORT_CSS.width * DEVICE_SCALE
  const pxH = VIEWPORT_CSS.height * DEVICE_SCALE
  console.log(`wrote ${outPath} (${png.length} bytes, ~${pxW}x${pxH})`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
