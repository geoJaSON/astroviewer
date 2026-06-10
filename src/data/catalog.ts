import { raDecToEqj } from '../astro/frames'
import type { AsteroidEls, CometEls } from '../astro/kepler'
import { loadSatellites, type LoadedSat } from '../astro/satellites'
import { bvToColor, magToSize } from '../astro/starcolor'
import * as THREE from 'three'

export interface MessierObj {
  m: number
  name: string
  type: string
  ra: number // hours
  dec: number // degrees
  mag: number
  con: string
}

export interface StarRow {
  ra: number
  dec: number
  mag: number
  ci: number
  dist: number // parsecs, 0 = unknown
}

export interface Catalog {
  starCount: number
  /** Unit vectors in EQJ frame, xyz per star. */
  starEqj: Float32Array
  starColor: Float32Array
  starSize: Float32Array
  stars: StarRow[]
  starNames: Record<number, string>
  starCons: Record<number, string>
  /** Constellation line segment endpoints as EQJ unit vectors (pairs). */
  conLines: Float32Array
  messier: MessierObj[]
  /** EQJ unit vectors, xyz per Messier object. */
  messierEqj: Float32Array
  comets: CometEls[]
  asteroids: AsteroidEls[]
  sats: LoadedSat[]
  /** True if satellite TLEs came from a live Celestrak fetch. */
  satsLive: boolean
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to load ${url} (HTTP ${res.status}). Run: npm run prepare-data`)
  return res.json()
}

export async function loadCatalog(): Promise<Catalog> {
  const [starsRaw, conRaw, messier, comets, asteroids, satsResult] = await Promise.all([
    fetchJson<{ stars: number[][]; names: Record<string, string>; cons: Record<string, string> }>('/data/stars.json'),
    fetchJson<{ lines: number[][][] }>('/data/constellations.json'),
    fetchJson<MessierObj[]>('/data/messier.json'),
    fetchJson<CometEls[]>('/data/comets.json').catch(() => [] as CometEls[]),
    fetchJson<AsteroidEls[]>('/data/asteroids.json').catch(() => [] as AsteroidEls[]),
    loadSatellites().catch(() => ({ sats: [] as LoadedSat[], live: false })),
  ])

  const n = starsRaw.stars.length
  const starEqj = new Float32Array(n * 3)
  const starColor = new Float32Array(n * 3)
  const starSize = new Float32Array(n)
  const stars: StarRow[] = new Array(n)
  const v = new THREE.Vector3()

  for (let i = 0; i < n; i++) {
    const [ra, dec, mag, ci, dist] = starsRaw.stars[i]
    stars[i] = { ra, dec, mag, ci, dist }
    raDecToEqj(ra, dec, v)
    starEqj[i * 3] = v.x
    starEqj[i * 3 + 1] = v.y
    starEqj[i * 3 + 2] = v.z
    const [r, g, b] = bvToColor(ci)
    starColor[i * 3] = r
    starColor[i * 3 + 1] = g
    starColor[i * 3 + 2] = b
    starSize[i] = magToSize(mag)
  }

  const segs: number[] = []
  for (const line of conRaw.lines) {
    for (let i = 0; i + 1 < line.length; i++) {
      const [ra1, dec1] = line[i]
      const [ra2, dec2] = line[i + 1]
      raDecToEqj(ra1 / 15, dec1, v)
      segs.push(v.x, v.y, v.z)
      raDecToEqj(ra2 / 15, dec2, v)
      segs.push(v.x, v.y, v.z)
    }
  }

  const messierEqj = new Float32Array(messier.length * 3)
  messier.forEach((m, i) => {
    raDecToEqj(m.ra, m.dec, v)
    messierEqj[i * 3] = v.x
    messierEqj[i * 3 + 1] = v.y
    messierEqj[i * 3 + 2] = v.z
  })

  const names: Record<number, string> = {}
  for (const [k, val] of Object.entries(starsRaw.names)) names[+k] = val
  const cons: Record<number, string> = {}
  for (const [k, val] of Object.entries(starsRaw.cons)) cons[+k] = val

  return {
    starCount: n,
    starEqj,
    starColor,
    starSize,
    stars,
    starNames: names,
    starCons: cons,
    conLines: new Float32Array(segs),
    messier,
    messierEqj,
    comets,
    asteroids,
    sats: satsResult.sats,
    satsLive: satsResult.live,
  }
}
