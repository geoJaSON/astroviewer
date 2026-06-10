// Verifies satellites, comets, asteroids, Tonight panel, angular size.
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
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`))

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 })
await sleep(8000)

const counts = await page.evaluate(async () => {
  // catalog isn't on window; poke the store-driven UI instead via search index side effects.
  return null
})
void counts

await page.evaluate(() => window.__store.getState().setTime(Date.parse('2026-06-11T03:30:00Z')))
await sleep(800)

// --- ISS ---
await page.evaluate(() => window.__store.getState().setSelection({ kind: 'sat', index: 0 }))
await sleep(2500) // allow the 48h pass scan
const issInfo = await page.evaluate(() => document.querySelector('.info-card')?.innerText ?? 'NO CARD')
console.log('--- ISS card ---')
console.log(issInfo)
await page.screenshot({ path: '.cache/small-1-iss.png' })

// --- comet 0 ---
await page.evaluate(() => window.__store.getState().setSelection({ kind: 'comet', index: 0 }))
await sleep(1200)
const cometInfo = await page.evaluate(() => document.querySelector('.info-card')?.innerText ?? 'NO CARD')
console.log('--- comet card ---')
console.log(cometInfo)
await page.screenshot({ path: '.cache/small-2-comet.png' })

// --- Vesta ---
await page.evaluate(() => window.__store.getState().setSelection({ kind: 'asteroid', index: 3 }))
await sleep(800)
const vestaInfo = await page.evaluate(() => document.querySelector('.info-card')?.innerText ?? 'NO CARD')
console.log('--- Vesta card ---')
console.log(vestaInfo)

// --- Saturn angular size ---
await page.evaluate(() => window.__store.getState().setSelection({ kind: 'planet', name: 'Saturn' }))
await sleep(800)
const saturnInfo = await page.evaluate(() => document.querySelector('.info-card')?.innerText ?? 'NO CARD')
console.log('--- Saturn card ---')
console.log(saturnInfo.split('\n').filter((l) => l.includes('ANG') || l.includes('SIZE')).join(' ') || 'NO ANG SIZE')

// --- Tonight panel ---
await page.click('.tonight-button')
await sleep(1500)
const tonight = await page.evaluate(() => document.querySelector('.tonight-popover')?.innerText ?? 'NO PANEL')
console.log('--- Tonight ---')
console.log(tonight)
await page.screenshot({ path: '.cache/small-3-tonight.png', clip: { x: 240, y: 40, width: 560, height: 520 } })

await browser.close()
if (errors.length) {
  console.log('CONSOLE ERRORS:')
  errors.slice(0, 20).forEach((e) => console.log(' -', e))
  process.exit(1)
}
console.log('small-bodies smoke OK')
