// Verifies QoL features: search + slew, track, keyboard shortcuts, persistence.
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
await sleep(7000)

await page.evaluate(() => window.__store.getState().setTime(Date.parse('2026-06-11T03:30:00Z')))
await sleep(500)

// Search "vega" via the / shortcut, pick first result
await page.keyboard.press('/')
await page.keyboard.type('vega', { delay: 40 })
await sleep(400)
await page.screenshot({ path: '.cache/qol-1-search.png', clip: { x: 380, y: 0, width: 560, height: 320 } })
await page.keyboard.press('Enter')
await sleep(800)

const afterSearch = await page.evaluate(() => {
  const s = window.__store.getState()
  return { selection: s.selection, skyCam: s.skyCam }
})
console.log('after search:', JSON.stringify(afterSearch))
await page.screenshot({ path: '.cache/qol-2-vega.png' })

// Track toggle via T, then run time fast — camera should follow
await page.keyboard.press('t')
await page.evaluate(() => window.__store.getState().setSpeed(3600))
await sleep(2000)
const tracked = await page.evaluate(() => {
  const s = window.__store.getState()
  return { track: s.track, skyCam: s.skyCam }
})
console.log('tracking:', JSON.stringify(tracked))

// Help overlay
await page.keyboard.press('?')
await sleep(400)
await page.screenshot({ path: '.cache/qol-3-help.png', clip: { x: 640, y: 220, width: 460, height: 540 } })

// Persistence: change location, reload, check it stuck
await page.evaluate(() => window.__store.getState().setLocation({ lat: 35.6762, lon: 139.6503, name: 'Tokyo' }))
await sleep(700)
await page.reload({ waitUntil: 'networkidle2' })
await sleep(5000)
const loc = await page.evaluate(() => window.__store.getState().location.name)
console.log('location after reload:', loc)

await browser.close()
if (errors.length) {
  console.log('CONSOLE ERRORS:')
  errors.slice(0, 20).forEach((e) => console.log(' -', e))
  process.exit(1)
}
console.log('qol smoke OK')
