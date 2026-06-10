// Cropped detail screenshots for visual inspection.
import puppeteer from 'puppeteer-core'

const URL = process.env.SMOKE_URL ?? 'http://localhost:5173'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--window-size=1720,980', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1720, height: 980 },
})
const page = await browser.newPage()
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 })
await sleep(7000)

await page.evaluate(() => {
  const s = window.__store.getState()
  s.setTime(Date.parse('2026-06-11T03:30:00Z'))
  s.setSelection({ kind: 'planet', name: 'Saturn' })
})
await sleep(1500)

// Sky panel center (night stars + constellation lines)
await page.screenshot({ path: '.cache/detail-sky.png', clip: { x: 60, y: 120, width: 720, height: 620 } })
// Info card
await page.screenshot({ path: '.cache/detail-card.png', clip: { x: 1380, y: 50, width: 340, height: 460 } })
// Earth region in space view
await page.screenshot({ path: '.cache/detail-earth.png', clip: { x: 1090, y: 330, width: 520, height: 420 } })
await browser.close()
console.log('done')
