// Headless smoke test: loads the dev server, collects console errors,
// jumps to a night-time scene, selects objects, and saves screenshots to .cache/.
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
const errors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text())
})
page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`))

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 })
await sleep(7000) // catalogs + textures + first frames

await page.screenshot({ path: '.cache/smoke-1-initial.png' })

// Night time in New York (03:30 UT = 23:30 EDT previous evening)
await page.evaluate(() => {
  window.__store.getState().setTime(Date.parse('2026-06-11T03:30:00Z'))
})
await sleep(1200)
await page.screenshot({ path: '.cache/smoke-2-night.png' })

// Select Saturn — info panel + sight line + sky highlight
await page.evaluate(() => {
  window.__store.getState().setSelection({ kind: 'planet', name: 'Saturn' })
})
await sleep(1000)
await page.screenshot({ path: '.cache/smoke-3-saturn.png' })

// Select M31 (index 30 in the m-sorted Messier list)
await page.evaluate(() => {
  window.__store.getState().setSelection({ kind: 'messier', index: 30 })
})
await sleep(1000)
await page.screenshot({ path: '.cache/smoke-4-m31.png' })

// Run time at 1 day/s — retrograde-style motion + clock advance
await page.evaluate(() => {
  window.__store.getState().setSpeed(86400)
})
await sleep(2500)
await page.screenshot({ path: '.cache/smoke-5-fast-time.png' })

await browser.close()

if (errors.length) {
  console.log('CONSOLE ERRORS:')
  for (const e of errors.slice(0, 30)) console.log(' -', e)
  process.exit(1)
}
console.log('smoke OK — no console errors')
