// Close-up verification of the observer pin + view cone.
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
  s.setSkyCam({ az: 180, alt: 14, fov: 60 })
  s.setSelection(null)
})
await sleep(800)

// Zoom the space view toward Earth
await page.mouse.move(1300, 420)
for (let i = 0; i < 14; i++) {
  await page.mouse.wheel({ deltaY: -480 })
  await sleep(120)
}
await sleep(1200)
await page.screenshot({ path: '.cache/cone-close.png', clip: { x: 880, y: 80, width: 830, height: 820 } })
await browser.close()
console.log('done')
