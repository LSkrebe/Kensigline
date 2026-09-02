/** Capture marketing terminal screenshots (1440×900 @2x → 2880×1800). */
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
    name: 'hero',
    path: '/explore?capture=1',
    waitFor: '.exploreRecapEventLayout, .exploreDirectoryRow',
    forbidText: 'No notable filings today',
    settleMs: 1500,
  },
  {
    name: 'deep-event',
    path: '/explore/events/single-ptr-buy-ptr-pelosi-nvda?capture=1',
    waitFor: '.exploreEventBody .exploreDirectoryRow',
    forbidText: 'No filings yet',
    settleMs: 1500,
  },
  {
    name: 'deep-investor',
    path: '/explore/investors/nancy-pelosi?capture=1',
    waitFor: '.drpt-docRow--flow, .drpt-sectionTitle',
    forbidText: 'No trades in the selected window',
    settleMs: 1500,
    chartRange: '1Y',
  },
  {
    name: 'deep-company',
    path: '/explore/companies/ASML?capture=1',
    waitFor: '.drpt-sectionTitle, .drpt-docRow',
    forbidText: 'No filings yet',
    settleMs: 1200,
    chartRange: '1Y',
  },
  {
    name: 'investors-directory',
    path: '/explore/investors?capture=1',
    waitFor: '.exploreDirShell .exploreDirectoryRow',
    forbidText: 'No rows',
    settleMs: 1200,
  },
]

async function selectChartRange(page, range) {
  const btn = page.locator('.drpt-chartRange .researchPriceRangeBtn', { hasText: range }).first()
  try {
    await btn.waitFor({ state: 'visible', timeout: 15_000 })
    await btn.click()
    await page.waitForSelector(
      `.drpt-chartRange .researchPriceRangeBtn.isActive:text-is("${range}")`,
      { timeout: 10_000 },
    )
    await page.waitForTimeout(400)
  } catch {
    console.warn(`chart range "${range}" not available — continuing without it`)
  }
}

async function waitForCaptureReady(page, shot) {
  await page.waitForSelector(shot.waitFor, { timeout: 60_000 })
  if (shot.forbidText) {
    await page.waitForFunction(
      (text) => !document.body?.innerText?.includes(text),
      shot.forbidText,
      { timeout: 60_000 },
    )
  }
}

async function captureOne(page, shot) {
  const url = `${base}${shot.path}`
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.waitForSelector('.terminalShell', { timeout: 30_000 })
  await waitForCaptureReady(page, shot)
  if (shot.chartRange) await selectChartRange(page, shot.chartRange)
  await page.evaluate(() => {
    const scroller =
      document.querySelector('.drpt-scroll') ||
      document.querySelector('.exploreDirShell') ||
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
