// Coordinate-frame plumbing between astronomy-engine and the two three.js scenes.
// Conventions verified numerically in scripts/sanity.mjs:
//   - astronomy-engine HOR frame: +x north, +y west, +z zenith
//   - RotationMatrix: out_j = Σ_i rot[i][j]·v_i  (standard matrix element m[j][i] = rot[i][j])
//
// Sky-view world frame:   +X east, +Y zenith, -Z north (camera sits at origin)
// Space-view world frame: ecliptic J2000 — three.x = ecl.x, three.y = ecl.z (ecliptic
//                         north up), three.z = -ecl.y; Sun at origin, units below.
import * as A from 'astronomy-engine'
import * as THREE from 'three'

export const DEG = Math.PI / 180

// ---------------------------------------------------------------- sky view ---

// hor(x=N, y=W, z=up) -> sky(x=E, y=up, z=-N)
const HOR_TO_SKY = new THREE.Matrix4().set(
  0, -1, 0, 0,
  0, 0, 1, 0,
  -1, 0, 0, 0,
  0, 0, 0, 1,
)

export function rotToMatrix4(rot: A.RotationMatrix, out = new THREE.Matrix4()): THREE.Matrix4 {
  const r = rot.rot
  return out.set(
    r[0][0], r[1][0], r[2][0], 0,
    r[0][1], r[1][1], r[2][1], 0,
    r[0][2], r[1][2], r[2][2], 0,
    0, 0, 0, 1,
  )
}

const tmpM = new THREE.Matrix4()

/** Matrix mapping J2000 equatorial unit vectors into the sky-view world frame. */
export function eqjToSkyMatrix(time: A.AstroTime, obs: A.Observer, out = new THREE.Matrix4()): THREE.Matrix4 {
  rotToMatrix4(A.Rotation_EQJ_HOR(time, obs), tmpM)
  return out.copy(HOR_TO_SKY).multiply(tmpM)
}

export function raDecToEqj(raHours: number, decDeg: number, out = new THREE.Vector3()): THREE.Vector3 {
  const ra = raHours * 15 * DEG
  const dec = decDeg * DEG
  return out.set(Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec))
}

/** Azimuth (N=0, E=90) / altitude in degrees -> sky-view direction. */
export function altazToSkyDir(azDeg: number, altDeg: number, out = new THREE.Vector3()): THREE.Vector3 {
  const az = azDeg * DEG
  const alt = altDeg * DEG
  return out.set(Math.sin(az) * Math.cos(alt), Math.sin(alt), -Math.cos(az) * Math.cos(alt))
}

// -------------------------------------------------------------- space view ---

const R_EQJ_ECL = A.Rotation_EQJ_ECL().rot

export function eqjxyzToSpace(x: number, y: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
  const ex = R_EQJ_ECL[0][0] * x + R_EQJ_ECL[1][0] * y + R_EQJ_ECL[2][0] * z
  const ey = R_EQJ_ECL[0][1] * x + R_EQJ_ECL[1][1] * y + R_EQJ_ECL[2][1] * z
  const ez = R_EQJ_ECL[0][2] * x + R_EQJ_ECL[1][2] * y + R_EQJ_ECL[2][2] * z
  return out.set(ex, ez, -ey)
}

export function eqjVecToSpace(v: { x: number; y: number; z: number }, out = new THREE.Vector3()): THREE.Vector3 {
  return eqjxyzToSpace(v.x, v.y, v.z, out)
}

/** Constant rotation taking EQJ-frame geometry (star shell) into the space-view frame. */
export const EQJ_TO_SPACE_MATRIX = (() => {
  const X = eqjxyzToSpace(1, 0, 0, new THREE.Vector3())
  const Y = eqjxyzToSpace(0, 1, 0, new THREE.Vector3())
  const Z = eqjxyzToSpace(0, 0, 1, new THREE.Vector3())
  return new THREE.Matrix4().makeBasis(X, Y, Z)
})()

// Compressed distance scale: r_scene = SCALE_K * (r_au ^ SCALE_GAMMA).
// Keeps directions exact while pulling Neptune (30 au) within ~6.5x Earth's ring.
export const SCALE_GAMMA = 0.55
export const SCALE_K = 60
export const EARTH_RADIUS = 2.2
export const STAR_SHELL_RADIUS = 4000

export function scaleAu(au: number): number {
  return SCALE_K * Math.pow(au, SCALE_GAMMA)
}

/** Heliocentric EQJ vector (au) -> compressed scene position. */
export function helioToScene(v: { x: number; y: number; z: number }, out = new THREE.Vector3()): THREE.Vector3 {
  const d = Math.hypot(v.x, v.y, v.z)
  if (d < 1e-9) return out.set(0, 0, 0)
  const s = scaleAu(d) / d
  return eqjxyzToSpace(v.x * s, v.y * s, v.z * s, out)
}

const vX = new THREE.Vector3()
const vY = new THREE.Vector3()
const vZ = new THREE.Vector3()

/**
 * Earth's rotation: local +X = (lat 0, lon 0), +Y = north pole.
 * Greenwich meridian faces RA = GST. Verified in scripts/sanity.mjs (check 4).
 */
export function earthOrientation(time: A.AstroTime, out = new THREE.Matrix4()): THREE.Matrix4 {
  const gst = A.SiderealTime(time) * 15 * DEG
  eqjxyzToSpace(Math.cos(gst), Math.sin(gst), 0, vX)
  eqjxyzToSpace(0, 0, 1, vY)
  vZ.crossVectors(vX, vY)
  return out.makeBasis(vX, vY, vZ)
}

/** Lat/lon -> position in Earth-local frame (matches SphereGeometry equirect UVs). */
export function latLonToLocal(latDeg: number, lonDeg: number, radius: number, out = new THREE.Vector3()): THREE.Vector3 {
  const phi = (90 - latDeg) * DEG
  const theta = (lonDeg + 180) * DEG
  return out.set(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  )
}

/** Direction of a given az/alt (as seen by the observer) in the space-view frame. */
export function altazToSpaceDir(
  azDeg: number,
  altDeg: number,
  time: A.AstroTime,
  obs: A.Observer,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  const az = azDeg * DEG
  const alt = altDeg * DEG
  // HOR frame: x north, y west, z up
  const hx = Math.cos(alt) * Math.cos(az)
  const hy = -Math.cos(alt) * Math.sin(az)
  const hz = Math.sin(alt)
  const r = A.Rotation_HOR_EQJ(time, obs).rot
  const ex = r[0][0] * hx + r[1][0] * hy + r[2][0] * hz
  const ey = r[0][1] * hx + r[1][1] * hy + r[2][1] * hz
  const ez = r[0][2] * hx + r[1][2] * hy + r[2][2] * hz
  return eqjxyzToSpace(ex, ey, ez, out)
}

const R_ECL_EQJ = A.Rotation_ECL_EQJ().rot

/** Ecliptic J2000 xyz -> EQJ xyz. */
export function eclxyzToEqj(x: number, y: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(
    R_ECL_EQJ[0][0] * x + R_ECL_EQJ[1][0] * y + R_ECL_EQJ[2][0] * z,
    R_ECL_EQJ[0][1] * x + R_ECL_EQJ[1][1] * y + R_ECL_EQJ[2][1] * z,
    R_ECL_EQJ[0][2] * x + R_ECL_EQJ[1][2] * y + R_ECL_EQJ[2][2] * z,
  )
}

const R_EQJ_ECL_M = A.Rotation_EQJ_ECL().rot

/** Earth's heliocentric position in ecliptic J2000 coordinates (au). */
export function earthHelioEcl(time: A.AstroTime, out = new THREE.Vector3()): THREE.Vector3 {
  const v = A.HelioVector(A.Body.Earth, time)
  return out.set(
    R_EQJ_ECL_M[0][0] * v.x + R_EQJ_ECL_M[1][0] * v.y + R_EQJ_ECL_M[2][0] * v.z,
    R_EQJ_ECL_M[0][1] * v.x + R_EQJ_ECL_M[1][1] * v.y + R_EQJ_ECL_M[2][1] * v.z,
    R_EQJ_ECL_M[0][2] * v.x + R_EQJ_ECL_M[1][2] * v.y + R_EQJ_ECL_M[2][2] * v.z,
  )
}

/** Heliocentric ecliptic xyz (au) -> compressed scene position (space view). */
export function eclToScene(x: number, y: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
  const d = Math.hypot(x, y, z)
  if (d < 1e-9) return out.set(0, 0, 0)
  const s = scaleAu(d) / d
  return out.set(x * s, z * s, -y * s)
}

/** Geocentric ecliptic J2000 vector -> az/alt for an observer. */
export function eclGeoToAltAz(
  x: number,
  y: number,
  z: number,
  time: A.AstroTime,
  obs: A.Observer,
): { az: number; alt: number } {
  const eqj = eclxyzToEqj(x, y, z, tmpEcl)
  const rot = A.Rotation_EQJ_HOR(time, obs)
  const hv = A.RotateVector(rot, new A.Vector(eqj.x, eqj.y, eqj.z, time))
  const s = A.HorizonFromVector(hv, '')
  return { az: s.lon, alt: s.lat }
}

const tmpEcl = new THREE.Vector3()

/** Equator-of-date xyz (e.g. TEME ≈ EQD from SGP4) -> space-view direction. */
export function eqdxyzToSpace(
  x: number,
  y: number,
  z: number,
  time: A.AstroTime,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  const r = A.Rotation_EQD_EQJ(time).rot
  return eqjxyzToSpace(
    r[0][0] * x + r[1][0] * y + r[2][0] * z,
    r[0][1] * x + r[1][1] * y + r[2][1] * z,
    r[0][2] * x + r[1][2] * y + r[2][2] * z,
    out,
  )
}

/** EQJ xyz -> RA (hours) / Dec (deg). */
export function eqjToRaDec(x: number, y: number, z: number): { ra: number; dec: number } {
  const r = Math.hypot(x, y, z)
  let ra = Math.atan2(y, x) / (15 * DEG)
  if (ra < 0) ra += 24
  return { ra, dec: Math.asin(z / r) / DEG }
}

// ------------------------------------------------------------------ shared ---

export function makeObserver(lat: number, lon: number): A.Observer {
  return new A.Observer(lat, lon, 0)
}

export function astroTime(ms: number): A.AstroTime {
  return A.MakeTime(new Date(ms))
}

/** Julian date (UT) of an AstroTime. */
export function jdOf(time: A.AstroTime): number {
  return time.ut + 2451545.0
}

/** J2000 RA/Dec -> current az/alt for an observer (no refraction). */
export function raDecToAltAz(
  raHours: number,
  decDeg: number,
  time: A.AstroTime,
  obs: A.Observer,
): { az: number; alt: number } {
  const v = raDecToEqj(raHours, decDeg)
  const rot = A.Rotation_EQJ_HOR(time, obs)
  const hv = A.RotateVector(rot, new A.Vector(v.x, v.y, v.z, time))
  const s = A.HorizonFromVector(hv, '')
  return { az: s.lon, alt: s.lat }
}

export function sunAltitude(time: A.AstroTime, obs: A.Observer): number {
  const eq = A.Equator(A.Body.Sun, time, obs, true, true)
  return A.Horizon(time, obs, eq.ra, eq.dec, 'normal').altitude
}
