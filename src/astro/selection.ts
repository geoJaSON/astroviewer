import * as A from 'astronomy-engine'
import * as THREE from 'three'
import type { Catalog } from '../data/catalog'
import type { Selection } from '../state/store'
import { BODY_BY_NAME } from './bodies'
import { earthHelioEcl, eclGeoToAltAz, jdOf, raDecToAltAz, raDecToEqj } from './frames'
import { asteroidHelioEcl, cometHelioEcl } from './kepler'
import { satLookAngles } from './satellites'

const tmpEarth = new THREE.Vector3()

/** Geocentric ecliptic J2000 vector (au) for a comet/asteroid selection. */
export function minorBodyGeoEcl(
  sel: Selection & { kind: 'comet' | 'asteroid' },
  catalog: Catalog,
  time: A.AstroTime,
): { x: number; y: number; z: number; r: number; delta: number } {
  const jd = jdOf(time)
  const h =
    sel.kind === 'comet'
      ? cometHelioEcl(catalog.comets[sel.index], jd)
      : asteroidHelioEcl(catalog.asteroids[sel.index], jd)
  earthHelioEcl(time, tmpEarth)
  const x = h.x - tmpEarth.x
  const y = h.y - tmpEarth.y
  const z = h.z - tmpEarth.z
  return { x, y, z, r: h.r, delta: Math.hypot(x, y, z) }
}

/** Current az/alt of the selected object for an observer. */
export function selectionAltAz(
  sel: Selection,
  catalog: Catalog,
  time: A.AstroTime,
  obs: A.Observer,
): { az: number; alt: number } {
  if (sel.kind === 'planet') {
    const eq = A.Equator(BODY_BY_NAME[sel.name], time, obs, true, true)
    const hor = A.Horizon(time, obs, eq.ra, eq.dec, 'normal')
    return { az: hor.azimuth, alt: hor.altitude }
  }
  if (sel.kind === 'comet' || sel.kind === 'asteroid') {
    const g = minorBodyGeoEcl(sel, catalog, time)
    return eclGeoToAltAz(g.x, g.y, g.z, time, obs)
  }
  if (sel.kind === 'sat') {
    const look = satLookAngles(catalog.sats[sel.index], time.date, obs.latitude, obs.longitude)
    return look ? { az: look.az, alt: look.alt } : { az: 0, alt: -90 }
  }
  const row = sel.kind === 'star' ? catalog.stars[sel.index] : catalog.messier[sel.index]
  return raDecToAltAz(row.ra, row.dec, time, obs)
}

/** EQJ unit direction for star/messier selections (null for solar-system bodies). */
export function selectionEqjDir(sel: Selection, catalog: Catalog, out = new THREE.Vector3()): THREE.Vector3 | null {
  if (sel.kind !== 'star' && sel.kind !== 'messier') return null
  const row = sel.kind === 'star' ? catalog.stars[sel.index] : catalog.messier[sel.index]
  return raDecToEqj(row.ra, row.dec, out)
}

export function selectionTitle(sel: Selection, catalog: Catalog): { title: string; sub: string } {
  if (sel.kind === 'planet') {
    const sub = sel.name === 'Sun' ? 'Star · Solar System' : sel.name === 'Moon' ? 'Satellite of Earth' : 'Planet · Solar System'
    return { title: sel.name, sub }
  }
  if (sel.kind === 'comet') {
    const c = catalog.comets[sel.index]
    return { title: c.name, sub: c.e >= 1 ? 'Comet · non-periodic' : 'Comet' }
  }
  if (sel.kind === 'asteroid') {
    return { title: catalog.asteroids[sel.index].name, sub: 'Asteroid · Main belt' }
  }
  if (sel.kind === 'sat') {
    const s = catalog.sats[sel.index]
    return { title: s.name, sub: `Satellite · NORAD ${s.catnr}` }
  }
  if (sel.kind === 'star') {
    const name = catalog.starNames[sel.index]
    const con = catalog.starCons[sel.index]
    const mag = catalog.stars[sel.index].mag
    return {
      title: name ?? `Star · mag ${mag.toFixed(1)}`,
      sub: con ? `Star · ${con}` : 'Star',
    }
  }
  const m = catalog.messier[sel.index]
  return { title: `M${m.m} · ${m.name}`, sub: `${m.type} · ${m.con}` }
}
