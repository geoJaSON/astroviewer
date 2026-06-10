// Downloads and preprocesses astronomy datasets into compact JSON under public/data.
// Sources:
//   - HYG v4.1 star database (astronexus/HYG-Database, CC BY-SA 4.0)
//   - Constellation lines from d3-celestial (ofrohn/d3-celestial, BSD)
//   - Messier objects from OpenNGC (mattiaverga/OpenNGC, CC BY-SA 4.0)
//   - Earth textures from three-globe examples (NASA Blue Marble imagery, public domain)
// Raw downloads are cached in .cache/ so re-runs are cheap.

import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { gunzipSync } from 'node:zlib'
import path from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const CACHE = path.join(ROOT, '.cache')
const DATA = path.join(ROOT, 'public', 'data')
const TEX = path.join(ROOT, 'public', 'textures')

const SOURCES = {
  hyg: 'https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv',
  lines: 'https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/constellations.lines.json',
  ngc: 'https://raw.githubusercontent.com/mattiaverga/OpenNGC/master/database_files/NGC.csv',
  earthDay: 'https://raw.githubusercontent.com/vasturiano/three-globe/master/example/img/earth-blue-marble.jpg',
  earthNight: 'https://raw.githubusercontent.com/vasturiano/three-globe/master/example/img/earth-night.jpg',
}

async function exists(p) {
  try { await access(p); return true } catch { return false }
}

async function download(url, dest) {
  if (await exists(dest)) {
    console.log(`cached   ${path.basename(dest)}`)
    return
  }
  console.log(`fetching ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest))
  console.log(`saved    ${path.basename(dest)}`)
}

// Minimal CSV line parser that respects double quotes.
function parseCsvLine(line, delim = ',') {
  const out = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else inQ = false
      } else cur += c
    } else if (c === '"') inQ = true
    else if (c === delim) { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out
}

async function buildStars() {
  const raw = path.join(CACHE, 'hygdata_v41.csv')
  await download(SOURCES.hyg, raw)
  const text = await readFile(raw, 'utf8')
  const lines = text.split('\n')
  const header = parseCsvLine(lines[0].trim())
  const col = Object.fromEntries(header.map((h, i) => [h, i]))

  const stars = []   // [ra_hours, dec_deg, mag, ci, dist_pc] (dist 0 = unknown)
  const names = {}   // star index -> proper name
  const cons = {}    // star index -> constellation abbreviation
  const MAG_LIMIT = 6.5

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line || !line.trim()) continue
    const f = parseCsvLine(line)
    const id = f[col.id]
    if (id === '0') continue // the Sun
    const mag = parseFloat(f[col.mag])
    const proper = (f[col.proper] || '').trim()
    if (!(mag <= MAG_LIMIT) && !proper) continue
    if (proper && mag > 8) continue // skip dim named stars; keep payload lean
    const ra = parseFloat(f[col.ra])
    const dec = parseFloat(f[col.dec])
    if (!isFinite(ra) || !isFinite(dec) || !isFinite(mag)) continue
    let dist = parseFloat(f[col.dist])
    if (!isFinite(dist) || dist >= 99999) dist = 0
    let ci = parseFloat(f[col.ci])
    if (!isFinite(ci)) ci = 0.5
    const idx = stars.length
    stars.push([
      +ra.toFixed(5), +dec.toFixed(4), +mag.toFixed(2), +ci.toFixed(2), +dist.toFixed(1),
    ])
    if (proper) names[idx] = proper
    const con = (f[col.con] || '').trim()
    if (con && (proper || mag <= 3)) cons[idx] = con
  }

  await writeFile(path.join(DATA, 'stars.json'), JSON.stringify({ stars, names, cons }))
  console.log(`stars.json: ${stars.length} stars, ${Object.keys(names).length} named`)
}

async function buildConstellations() {
  const raw = path.join(CACHE, 'constellations.lines.json')
  await download(SOURCES.lines, raw)
  const geo = JSON.parse(await readFile(raw, 'utf8'))
  // Output: { lines: [ [[raDeg,dec],...polyline], ... ] }
  const polylines = []
  for (const feat of geo.features) {
    const geom = feat.geometry
    if (!geom) continue
    const multi = geom.type === 'MultiLineString' ? geom.coordinates : [geom.coordinates]
    for (const seg of multi) {
      polylines.push(seg.map(([lon, lat]) => [
        +((lon + 360) % 360).toFixed(3), +lat.toFixed(3),
      ]))
    }
  }
  await writeFile(path.join(DATA, 'constellations.json'), JSON.stringify({ lines: polylines }))
  console.log(`constellations.json: ${polylines.length} polylines`)
}

const TYPE_NAMES = {
  G: 'Galaxy', GPair: 'Galaxy pair', GTrpl: 'Galaxy triplet', GGroup: 'Galaxy group',
  OCl: 'Open cluster', GCl: 'Globular cluster', 'Cl+N': 'Cluster + nebula',
  PN: 'Planetary nebula', HII: 'HII region', EmN: 'Emission nebula', Neb: 'Nebula',
  RfN: 'Reflection nebula', SNR: 'Supernova remnant', '*Ass': 'Stellar association',
  '**': 'Double star', '*': 'Star', NonEx: 'Nonexistent', Dup: 'Duplicate', Other: 'Object',
}

function hmsToHours(s) {
  const m = s.trim().match(/^(\d+):(\d+):([\d.]+)$/)
  if (!m) return NaN
  return +m[1] + +m[2] / 60 + +m[3] / 3600
}
function dmsToDeg(s) {
  const m = s.trim().match(/^([+-]?)(\d+):(\d+):([\d.]+)$/)
  if (!m) return NaN
  const v = +m[2] + +m[3] / 60 + +m[4] / 3600
  return m[1] === '-' ? -v : v
}

// Objects absent from the main OpenNGC table (no NGC/IC designation).
const MESSIER_EXTRAS = [
  { m: 24, name: 'Sagittarius Star Cloud', type: 'Star cloud', ra: 18.28, dec: -18.55, mag: 4.6, con: 'Sgr' },
  { m: 25, name: 'Messier 25', type: 'Open cluster', ra: 18.5267, dec: -19.1167, mag: 4.6, con: 'Sgr' },
  { m: 40, name: 'Winnecke 4', type: 'Double star', ra: 12.37, dec: 58.083, mag: 9.7, con: 'UMa' },
  { m: 45, name: 'Pleiades', type: 'Open cluster', ra: 3.7833, dec: 24.1167, mag: 1.6, con: 'Tau' },
]

async function buildMessier() {
  const raw = path.join(CACHE, 'NGC.csv')
  await download(SOURCES.ngc, raw)
  const text = await readFile(raw, 'utf8')
  const lines = text.split('\n')
  const header = parseCsvLine(lines[0].trim(), ';')
  const col = Object.fromEntries(header.map((h, i) => [h, i]))

  const byM = new Map()
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line || !line.trim()) continue
    const f = parseCsvLine(line, ';')
    const mField = (f[col.M] || '').trim()
    if (!mField) continue
    const m = parseInt(mField, 10)
    if (!isFinite(m) || byM.has(m)) continue
    const ra = hmsToHours(f[col.RA] || '')
    const dec = dmsToDeg(f[col.Dec] || '')
    if (!isFinite(ra) || !isFinite(dec)) continue
    const vmag = parseFloat(f[col['V-Mag']])
    const bmag = parseFloat(f[col['B-Mag']])
    const common = (f[col['Common names']] || '').split(',')[0].trim()
    byM.set(m, {
      m,
      name: common || `Messier ${m}`,
      type: TYPE_NAMES[(f[col.Type] || '').trim()] || 'Object',
      ra: +ra.toFixed(4),
      dec: +dec.toFixed(3),
      mag: isFinite(vmag) ? vmag : isFinite(bmag) ? +(bmag - 0.8).toFixed(1) : 99,
      con: (f[col.Const] || '').trim(),
    })
  }
  for (const extra of MESSIER_EXTRAS) if (!byM.has(extra.m)) byM.set(extra.m, extra)
  const list = [...byM.values()].sort((a, b) => a.m - b.m)
  await writeFile(path.join(DATA, 'messier.json'), JSON.stringify(list))
  const missing = []
  for (let m = 1; m <= 110; m++) if (!byM.has(m)) missing.push(m)
  console.log(`messier.json: ${list.length} objects${missing.length ? `, missing: ${missing.join(',')}` : ''}`)
}

function calendarToJd(year, month, dayFrac) {
  // Fliegel–Van Flandern, valid for Gregorian dates
  const day = Math.floor(dayFrac)
  const a = Math.floor((14 - month) / 12)
  const y = year + 4800 - a
  const m = month + 12 * a - 3
  const jdn =
    day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045
  return jdn + (dayFrac - day) - 0.5
}

// Comets with perihelion in this window and q < 6 au are plausibly observable.
async function buildComets() {
  const raw = path.join(CACHE, 'cometels.json.gz')
  await download('https://www.minorplanetcenter.net/Extended_Files/cometels.json.gz', raw)
  const all = JSON.parse(gunzipSync(await readFile(raw)).toString())
  const nowJd = Date.now() / 86400000 + 2440587.5
  const out = []
  for (const c of all) {
    const q = c.Perihelion_dist
    const e = c.e
    if (!isFinite(q) || !isFinite(e) || q > 6) continue
    const tpJd = calendarToJd(c.Year_of_perihelion, c.Month_of_perihelion, c.Day_of_perihelion)
    if (tpJd < nowJd - 3 * 365.25 || tpJd > nowJd + 5 * 365.25) {
      // periodic comets remain valid between apparitions
      const isPeriodic = c.Orbit_type === 'P' && e < 1
      if (!isPeriodic || tpJd < nowJd - 20 * 365.25) continue
    }
    const H = isFinite(c.H) ? c.H : 12
    out.push({
      name: c.Designation_and_name || c.Provisional_packed_desig,
      q: +q,
      e: +e,
      peri: c.Peri,
      node: c.Node,
      incl: c.i,
      tpJd: +tpJd.toFixed(4),
      H,
      G: isFinite(c.G) ? c.G : 4,
    })
  }
  out.sort((a, b) => a.H - b.H)
  const trimmed = out.slice(0, 40)
  await writeFile(path.join(DATA, 'comets.json'), JSON.stringify(trimmed))
  console.log(`comets.json: ${trimmed.length} comets (of ${all.length} in MPC file)`)
}

const ASTEROIDS = [
  { id: '1', name: 'Ceres' },
  { id: '2', name: 'Pallas' },
  { id: '3', name: 'Juno' },
  { id: '4', name: 'Vesta' },
  { id: '6', name: 'Hebe' },
  { id: '7', name: 'Iris' },
]

async function buildAsteroids() {
  const out = []
  for (const a of ASTEROIDS) {
    const res = await fetch(`https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=${a.id}&full-prec=true&phys-par=1`)
    if (!res.ok) throw new Error(`SBDB HTTP ${res.status} for ${a.name}`)
    const j = await res.json()
    const el = Object.fromEntries(j.orbit.elements.map((e) => [e.name, parseFloat(e.value)]))
    const hPar = (j.phys_par ?? []).find((p) => p.name === 'H')
    out.push({
      name: `${a.id} ${a.name}`,
      a: el.a,
      e: el.e,
      incl: el.i,
      node: el.om,
      peri: el.w,
      M0: el.ma,
      epochJd: parseFloat(j.orbit.epoch),
      H: hPar ? parseFloat(hPar.value) : 7,
    })
    console.log(`  sbdb: ${a.name} a=${el.a.toFixed(3)} e=${el.e.toFixed(4)}`)
  }
  await writeFile(path.join(DATA, 'asteroids.json'), JSON.stringify(out))
  console.log(`asteroids.json: ${out.length} asteroids`)
}

const SATELLITES = [
  { catnr: 25544, name: 'ISS' },
  { catnr: 48274, name: 'Tiangong' },
  { catnr: 20580, name: 'Hubble' },
]

// Snapshot TLEs as a fallback for when the live Celestrak fetch fails (offline/CORS).
async function buildTleFallback() {
  const sats = []
  for (const s of SATELLITES) {
    const res = await fetch(`https://celestrak.org/NORAD/elements/gp.php?CATNR=${s.catnr}&FORMAT=tle`)
    if (!res.ok) throw new Error(`Celestrak HTTP ${res.status} for ${s.name}`)
    const lines = (await res.text()).trim().split(/\r?\n/)
    if (lines.length < 3) throw new Error(`Bad TLE for ${s.name}`)
    sats.push({ name: s.name, catnr: s.catnr, l1: lines[1].trim(), l2: lines[2].trim() })
    console.log(`  tle: ${s.name} (${lines[1].slice(18, 32).trim()})`)
  }
  await writeFile(path.join(DATA, 'tle-fallback.json'), JSON.stringify({ fetched: new Date().toISOString(), sats }))
  console.log(`tle-fallback.json: ${sats.length} satellites`)
}

async function main() {
  await mkdir(CACHE, { recursive: true })
  await mkdir(DATA, { recursive: true })
  await mkdir(TEX, { recursive: true })
  await buildStars()
  await buildConstellations()
  await buildMessier()
  await buildComets()
  await buildAsteroids()
  await buildTleFallback()
  await download(SOURCES.earthDay, path.join(TEX, 'earth-day.jpg'))
  await download(SOURCES.earthNight, path.join(TEX, 'earth-night.jpg'))
  console.log('done')
}

main().catch((err) => { console.error(err); process.exit(1) })
