// Validates src/astro/kepler.ts against JPL Horizons heliocentric ecliptic vectors.
// Compiles the TS module to .cache first (it is dependency-free on purpose).
import { execSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'

execSync(
  'npx tsc src/astro/kepler.ts --outDir .cache/kepler-js --module esnext --target es2022 --declaration false --skipLibCheck --typeRoots .cache/no-types',
  { stdio: 'inherit' },
)
const kepler = await import('../.cache/kepler-js/kepler.js')

const asteroids = JSON.parse(await readFile('public/data/asteroids.json', 'utf8'))

async function horizonsVector(command, date) {
  const url =
    'https://ssd.jpl.nasa.gov/api/horizons.api?format=json' +
    `&COMMAND='${encodeURIComponent(command)}'&EPHEM_TYPE=VECTORS&CENTER='500@10'` +
    `&START_TIME='${date}'&STOP_TIME='${date} 00:01'&STEP_SIZE='1m'` +
    `&REF_PLANE=ECLIPTIC&REF_SYSTEM=J2000&VEC_TABLE='1'&OUT_UNITS='AU-D'&CSV_FORMAT=YES`
  const res = await fetch(url)
  const j = await res.json()
  const m = j.result.match(/\$\$SOE\s*([\s\S]*?)\$\$EOE/)
  if (!m) throw new Error(`No SOE block: ${j.result.slice(0, 400)}`)
  const cols = m[1].trim().split('\n')[0].split(',').map((s) => s.trim())
  // CSV columns: JDTDB, Calendar, X, Y, Z
  return { x: +cols[2], y: +cols[3], z: +cols[4] }
}

const date = '2026-06-10'
const jd = kepler.jdFromMs(Date.parse('2026-06-10T00:00:00Z'))

let worst = 0
for (const a of asteroids) {
  const id = a.name.split(' ')[0]
  const ref = await horizonsVector(`${id};`, date)
  const mine = kepler.asteroidHelioEcl(a, jd)
  const err = Math.hypot(mine.x - ref.x, mine.y - ref.y, mine.z - ref.z)
  const errArcmin = (err / mine.r) * 3437.75
  worst = Math.max(worst, errArcmin)
  console.log(
    `${a.name.padEnd(10)} mine=(${mine.x.toFixed(4)}, ${mine.y.toFixed(4)}, ${mine.z.toFixed(4)})` +
      ` jpl=(${ref.x.toFixed(4)}, ${ref.y.toFixed(4)}, ${ref.z.toFixed(4)}) err=${errArcmin.toFixed(2)}'`,
  )
}

// Comet internal consistency: r == q and ν == 0 at perihelion, all regimes
const comets = JSON.parse(await readFile('public/data/comets.json', 'utf8'))
for (const c of comets.slice(0, 6)) {
  const s = kepler.cometHelioEcl(c, c.tpJd)
  const rErr = Math.abs(s.r - c.q)
  console.log(`${c.name.slice(0, 28).padEnd(28)} e=${c.e.toFixed(3)} r(tp)=${s.r.toFixed(5)} q=${c.q.toFixed(5)} Δ=${rErr.toExponential(1)}`)
  if (rErr > 1e-6) throw new Error('perihelion mismatch')
}

console.log(`\nworst asteroid error vs Horizons: ${worst.toFixed(2)} arcmin ${worst < 5 ? '— OK' : '— TOO LARGE'}`)
if (worst >= 5) process.exit(1)
