// Close-up of Earth with the ISS selected: dot + orbit ring + sight line.
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
await sleep(8000)

await page.evaluate(() => {
  const s = window.__store.getState()
  s.setTime(Date.parse('2026-06-11T03:30:00Z'))
  s.setSelection({ kind: 'sat', index: 0 })
  s.toggleShow('dome') // less clutter up close
})
await sleep(1000)

await page.mouse.move(1300, 420)
for (let i = 0; i < 60; i++) {
  await page.mouse.wheel({ deltaY: -480 })
  await sleep(60)
}
await sleep(1500)
await page.screenshot({ path: '.cache/iss-close.png', clip: { x: 1000, y: 150, width: 640, height: 640 } })
await browser.close()
console.log('done')
