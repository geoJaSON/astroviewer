// Earth satellites via SGP4 (satellite.js). TLEs are fetched live from Celestrak
// when possible, falling back to the snapshot bundled by scripts/prepare-data.mjs.
import {
  twoline2satrec,
  propagate,
  gstime,
  eciToEcf,
  ecfToLookAngles,
  type SatRec,
  type EciVec3,
} from 'satellite.js'

const DEG = Math.PI / 180

export interface LoadedSat {
  name: string
  catnr: number
  satrec: SatRec
  periodMin: number
}

interface TleRecord {
  name: string
  catnr: number
  l1: string
  l2: string
}

const CELESTRAK = (catnr: number) => `https://celestrak.org/NORAD/elements/gp.php?CATNR=${catnr}&FORMAT=tle`

async function fetchLiveTle(catnr: number, name: string, signal: AbortSignal): Promise<TleRecord> {
  const res = await fetch(CELESTRAK(catnr), { signal })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const lines = (await res.text()).trim().split(/\r?\n/)
  if (lines.length < 3 || !lines[1].startsWith('1 ')) throw new Error('bad TLE')
  return { name, catnr, l1: lines[1].trim(), l2: lines[2].trim() }
}

export async function loadSatellites(): Promise<{ sats: LoadedSat[]; live: boolean }> {
  const fallbackPromise = fetch('/data/tle-fallback.json').then((r) => r.json()) as Promise<{
    sats: TleRecord[]
  }>

  let records: TleRecord[]
  let live = false
  try {
    const fallback = await fallbackPromise
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 6000)
    try {
      records = await Promise.all(
        fallback.sats.map((s) => fetchLiveTle(s.catnr, s.name, ctrl.signal)),
      )
      live = true
    } catch {
      records = fallback.sats
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return { sats: [], live: false }
  }

  const sats: LoadedSat[] = []
  for (const r of records) {
    try {
      const satrec = twoline2satrec(r.l1, r.l2)
      sats.push({ name: r.name, catnr: r.catnr, satrec, periodMin: (2 * Math.PI) / satrec.no })
    } catch {
      /* skip unparseable */
    }
  }
  return { sats, live }
}

/** Geocentric ECI (TEME) position in km, or null if propagation fails. */
export function satEciKm(s: LoadedSat, date: Date): EciVec3<number> | null {
  try {
    const pv = propagate(s.satrec, date)
    const p = pv?.position
    if (!p || typeof p === 'boolean') return null
    return p
  } catch {
    return null
  }
}

export function satLookAngles(
  s: LoadedSat,
  date: Date,
  latDeg: number,
  lonDeg: number,
): { az: number; alt: number; rangeKm: number } | null {
  const p = satEciKm(s, date)
  if (!p) return null
  const ecf = eciToEcf(p, gstime(date))
  const look = ecfToLookAngles({ latitude: latDeg * DEG, longitude: lonDeg * DEG, height: 0.01 }, ecf)
  return { az: look.azimuth / DEG, alt: look.elevation / DEG, rangeKm: look.rangeSat }
}

export interface PassInfo {
  riseMs: number
  maxMs: number
  setMs: number
  maxAlt: number
}

/** Next pass above 10° altitude within 48 h (ignores sunlight visibility). */
export function nextPass(s: LoadedSat, fromMs: number, latDeg: number, lonDeg: number): PassInfo | null {
  const STEP = 30_000
  const LIMIT = fromMs + 48 * 3600_000
  const altAt = (ms: number) => satLookAngles(s, new Date(ms), latDeg, lonDeg)?.alt ?? -90

  let t = fromMs
  // if currently in a pass, skip past it first
  while (t < LIMIT && altAt(t) >= 10) t += STEP
  while (t < LIMIT && altAt(t) < 10) t += STEP
  if (t >= LIMIT) return null

  const riseMs = t
  let maxAlt = -90
  let maxMs = t
  while (t < LIMIT) {
    const alt = altAt(t)
    if (alt < 10) break
    if (alt > maxAlt) {
      maxAlt = alt
      maxMs = t
    }
    t += STEP
  }
  return { riseMs, maxMs, setMs: t, maxAlt }
}
