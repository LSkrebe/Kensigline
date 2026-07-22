/** Capture marketing terminal screenshots (1440×900 @2x → 2880×1800), same as intro hero. */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = dirname(fileURLToPath(import.meta.url))
const introDir = join(__dirname, '..', 'public', 'intro')
const base = process.env.HERO_PREVIEW_URL?.replace(/\/$/, '') ?? 'http://127.0.0.1:5173'

const VIEWPORT_CSS = { width: 1440, height: 900 }
const DEVICE_SCALE = 2

const SHOTS = [
  {
    name: 'deep-company',
    path: '/explore/companies/ASML?capture=1',
    waitFor: '.drpt-sectionTitle',
    settleMs: 900,
    /** Select chart range before capture (e.g. '1Y'). */
    chartRange: '1Y',
  },
  {
    name: 'investors-directory',
    path: '/explore/investors?capture=1',
    waitFor: '.exploreDirectoryPage, .exploreDirectoryList, .explorePage',
    settleMs: 900,
  },
]

async function selectChartRange(page, range) {
  const btn = page.locator('.drpt-chartRange .researchPriceRangeBtn', { hasText: range }).first()
  await btn.waitFor({ state: 'visible', timeout: 15_000 })
  await btn.click()
  await page.waitForSelector(
    `.drpt-chartRange .researchPriceRangeBtn.isActive:text-is("${range}")`,
    { timeout: 10_000 },
  )
  // Let the chart re-render after range change
  await page.waitForTimeout(400)
}

async function captureOne(page, shot) {
  const url = `${base}${shot.path}`
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.waitForSelector('.terminalShell', { timeout: 30_000 })
  await page.waitForSelector(shot.waitFor, { timeout: 30_000 })
  if (shot.chartRange) await selectChartRange(page, shot.chartRange)
  // Expanded deep header / directory list — start at top
  await page.evaluate(() => {
    const scroller =
      document.querySelector('.drpt-scroll') ||
      document.querySelector('.explorePage') ||
      document.querySelector('.terminalShell')
    if (scroller) scroller.scrollTop = 0
  })
  await page.waitForTimeout(shot.settleMs)

  const shell = page.locator('.terminalShell')
  const png = await shell.screenshot({ type: 'png' })
  const outPath = join(introDir, `${shot.name}.png`)
  await writeFile(outPath, png)
  console.log(`wrote ${outPath} (${png.length} bytes)`)
  return outPath
}

async function main() {
  await mkdir(introDir, { recursive: true })
  const browser = await chromium.launch()
  const page = await browser.newPage({
    viewport: VIEWPORT_CSS,
    deviceScaleFactor: DEVICE_SCALE,
  })

  const only = process.env.SHOT
  const list = only ? SHOTS.filter((s) => s.name === only) : SHOTS
  if (!list.length) throw new Error(`Unknown SHOT=${only}`)

  for (const shot of list) {
    await captureOne(page, shot)
  }

  await browser.close()
  const pxW = VIEWPORT_CSS.width * DEVICE_SCALE
  const pxH = VIEWPORT_CSS.height * DEVICE_SCALE
  console.log(`viewport ~${pxW}x${pxH}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
