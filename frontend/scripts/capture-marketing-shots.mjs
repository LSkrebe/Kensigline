/** Capture intro marketing shots → public/intro/current-*.webp (+ optional PNGs). */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const introDir = join(__dirname, '..', 'public', 'intro')
const base = process.env.HERO_PREVIEW_URL?.replace(/\/$/, '') ?? 'http://127.0.0.1:5173'

const VIEWPORT_CSS = { width: 1440, height: 900 }
const DEVICE_SCALE = 2

/**
 * IntroTerminalPreview mapping:
 *   hero          → current-explore.webp
 *   watchlist     → current-watchlist.webp  (second Explore cast)
 *   deepInvestor  → current-investor.webp   (best of product cast)
 */
const SHOTS = [
  {
    name: 'hero',
    current: 'explore',
    path: '/explore?capture=hero',
    waitFor: '.exploreFeaturedCard, .exploreTapeSection',
    forbidText: 'No recent events',
    settleMs: 1800,
  },
  {
    name: 'explore-product',
    current: 'watchlist',
    path: '/explore?capture=product',
    waitFor: '.exploreFeaturedCard, .exploreTapeSection',
    forbidText: 'No recent events',
    settleMs: 1800,
  },
  {
    name: 'deep-investor',
    current: 'investor',
    path: '/explore/nancy-pelosi?capture=product',
    waitFor: '.drpt-heroMedia--flat, .drpt-sectionTitle',
    forbidText: 'No trades in the selected window',
    settleMs: 2200,
    chartRange: '1Y',
    waitFlatHero: true,
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
  // Featured cards should show real names, not skeleton-only.
  if (shot.path.includes('/explore?')) {
    await page.waitForFunction(
      () => {
        const cards = [...document.querySelectorAll('.exploreFeaturedTitle')]
        return cards.length >= 3 && cards.every((el) => (el.textContent || '').trim().length > 2)
      },
      { timeout: 60_000 },
    )
  }
  if (shot.waitFlatHero) {
    await page.waitForSelector('.drpt-heroMedia--flat', { timeout: 30_000 })
    await page.waitForFunction(
      () => Boolean(document.querySelector('.drpt-heroReturn')?.textContent?.trim()),
      { timeout: 30_000 },
    )
  }
  if (shot.waitHeroImage) {
    await page.waitForFunction(
      () => {
        const img = document.querySelector('.drpt-heroPhoto img')
        return Boolean(img && img.complete && img.naturalWidth > 20)
      },
      { timeout: 60_000 },
    )
  }
}

async function writeOutputs(png, shot) {
  const pngPath = join(introDir, `${shot.name}.png`)
  await writeFile(pngPath, png)
  console.log(`wrote ${pngPath} (${png.length} bytes)`)

  if (shot.current) {
    const webp = await sharp(png).webp({ quality: 90, effort: 6 }).toBuffer()
    const webpPath = join(introDir, `current-${shot.current}.webp`)
    await writeFile(webpPath, webp)
    console.log(`wrote ${webpPath} (${webp.length} bytes)`)
  }
}

async function captureOne(page, shot) {
  const url = `${base}${shot.path}`
  console.log(`capturing ${shot.name} ← ${url}`)
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90_000 })
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

  // Hide toasts / paywalls that can flash over marketing shots.
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('.toast, .paywall, .authGate, [data-capture-hide]')) {
      el.style.visibility = 'hidden'
    }
  })

  const shell = page.locator('.terminalShell')
  const png = await shell.screenshot({ type: 'png' })
  await writeOutputs(png, shot)
}

async function main() {
  await mkdir(introDir, { recursive: true })
  const browser = await chromium.launch()
  const page = await browser.newPage({
    viewport: VIEWPORT_CSS,
    deviceScaleFactor: DEVICE_SCALE,
  })

  const only = process.env.SHOT
  const list = only
    ? SHOTS.filter((s) => s.name === only || s.current === only)
    : SHOTS
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
