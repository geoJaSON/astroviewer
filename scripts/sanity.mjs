// Numerical sanity checks for the coordinate-frame conventions used by the app.
// Verifies against astronomy-engine's own Equator/Horizon reference path.
import * as A from 'astronomy-engine'

const deg = (r) => (r * 180) / Math.PI
const rad = (d) => (d * Math.PI) / 180

const time = A.MakeTime(new Date('2026-06-10T04:00:00Z'))
const obs = new A.Observer(40.7128, -74.006, 10)

console.log('--- 1. HOR frame axis convention ---')
for (const [label, v] of [
  ['+x', [1, 0, 0]],
  ['+y', [0, 1, 0]],
  ['+z', [0, 0, 1]],
]) {
  const s = A.HorizonFromVector(new A.Vector(v[0], v[1], v[2], time), '')
  console.log(`${label}: az=${s.lon.toFixed(1)} alt=${s.lat.toFixed(1)}`)
}

console.log('--- 2. RotateVector matrix layout ---')
const rot = A.Rotation_EQJ_HOR(time, obs)
const tv = new A.Vector(0.3, -0.5, 0.8, time)
const ref = A.RotateVector(rot, tv)
const r = rot.rot
// candidate A: out_j = sum_i rot[i][j] * v_i
const a = [0, 1, 2].map((j) => r[0][j] * tv.x + r[1][j] * tv.y + r[2][j] * tv.z)
// candidate B: out_i = sum_j rot[i][j] * v_j
const b = [0, 1, 2].map((i) => r[i][0] * tv.x + r[i][1] * tv.y + r[i][2] * tv.z)
console.log('ref:', [ref.x, ref.y, ref.z].map((x) => x.toFixed(6)).join(' '))
console.log('A  :', a.map((x) => x.toFixed(6)).join(' '))
console.log('B  :', b.map((x) => x.toFixed(6)).join(' '))

console.log('--- 3. Star alt/az: official path vs EQJ rotation path ---')
// Vega, J2000
const ra = 18.61565,
  dec = 38.78369
A.DefineStar(A.Body.Star1, ra, dec, 100)
const eq = A.Equator(A.Body.Star1, time, obs, true, true)
const hor = A.Horizon(time, obs, eq.ra, eq.dec, '')
const raR = rad(ra * 15),
  decR = rad(dec)
const v = [Math.cos(decR) * Math.cos(raR), Math.cos(decR) * Math.sin(raR), Math.sin(decR)]
const hv = A.RotateVector(rot, new A.Vector(v[0], v[1], v[2], time))
const s = A.HorizonFromVector(hv, '')
console.log(`official: az=${hor.azimuth.toFixed(3)} alt=${hor.altitude.toFixed(3)}`)
console.log(`matrix  : az=${s.lon.toFixed(3)} alt=${s.lat.toFixed(3)}`)

console.log('--- 4. Earth orientation (space view) ---')
// space frame: three.x = ecl.x, three.y = ecl.z, three.z = -ecl.y
const R_EQJ_ECL = A.Rotation_EQJ_ECL()
function eqjToSpace(x, y, z) {
  const e = A.RotateVector(R_EQJ_ECL, new A.Vector(x, y, z, time))
  return [e.x, e.z, -e.y]
}
const gstDeg = A.SiderealTime(time) * 15
const Xw = eqjToSpace(Math.cos(rad(gstDeg)), Math.sin(rad(gstDeg)), 0)
const Yw = eqjToSpace(0, 0, 1)
const Zw = [
  Xw[1] * Yw[2] - Xw[2] * Yw[1],
  Xw[2] * Yw[0] - Xw[0] * Yw[2],
  Xw[0] * Yw[1] - Xw[1] * Yw[0],
]
// marker local position (three-globe / SphereGeometry equirect convention), R=1
const lat = obs.latitude,
  lon = obs.longitude
const phi = rad(90 - lat),
  theta = rad(lon + 180)
const local = [-Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)]
// world = M * local with columns Xw Yw Zw
const world = [0, 1, 2].map((j) => Xw[j] * local[0] + Yw[j] * local[1] + Zw[j] * local[2])
// reference: zenith direction = HOR(0,0,1) -> EQJ -> space
const rotHorEqj = A.Rotation_HOR_EQJ(time, obs)
const zen = A.RotateVector(rotHorEqj, new A.Vector(0, 0, 1, time))
const zenSpace = eqjToSpace(zen.x, zen.y, zen.z)
const dot = world[0] * zenSpace[0] + world[1] * zenSpace[1] + world[2] * zenSpace[2]
console.log(`marker dir : ${world.map((x) => x.toFixed(4)).join(' ')}`)
console.log(`zenith dir : ${zenSpace.map((x) => x.toFixed(4)).join(' ')}`)
console.log(`angle between: ${deg(Math.acos(Math.min(1, dot))).toFixed(3)} deg`)

console.log('--- 5. Sun direction consistency ---')
const sunGeo = A.GeoVector(A.Body.Sun, time, true)
const earthHelio = A.HelioVector(A.Body.Earth, time)
const d1 = eqjToSpace(sunGeo.x, sunGeo.y, sunGeo.z)
const d2 = eqjToSpace(-earthHelio.x, -earthHelio.y, -earthHelio.z)
const n1 = Math.hypot(...d1),
  n2 = Math.hypot(...d2)
const dd = (d1[0] * d2[0] + d1[1] * d2[1] + d1[2] * d2[2]) / (n1 * n2)
console.log(`geo-sun vs -helio-earth angle: ${deg(Math.acos(Math.min(1, dd))).toFixed(4)} deg`)

