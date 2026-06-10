// Two-body heliocentric propagation from MPC/JPL osculating elements.
// Handles elliptic, near-parabolic, and hyperbolic orbits. Outputs heliocentric
// ecliptic J2000 coordinates in au (the frame MPC and SBDB elements use).
// Validated against JPL Horizons vectors in scripts/validate-kepler.mjs.

const DEG = Math.PI / 180
const K_GAUSS = 0.01720209895 // Gaussian gravitational constant, rad/day · au^1.5

export interface CometEls {
  name: string
  q: number // perihelion distance, au
  e: number
  peri: number // argument of perihelion ω, deg
  node: number // ascending node Ω, deg
  incl: number // inclination, deg
  tpJd: number // perihelion time, JD
  H: number // absolute total magnitude
  G: number // slope parameter (≈4 typical)
}

export interface AsteroidEls {
  name: string
  a: number // semi-major axis, au
  e: number
  incl: number
  node: number
  peri: number
  M0: number // mean anomaly at epoch, deg
  epochJd: number
  H: number
}

export interface HelioState {
  x: number
  y: number
  z: number
  r: number // heliocentric distance, au
}

export function jdFromMs(ms: number): number {
  return ms / 86400000 + 2440587.5
}

function solveKeplerE(M: number, e: number): number {
  // wrap to [-π, π] for a stable start
  M = M % (2 * Math.PI)
  if (M > Math.PI) M -= 2 * Math.PI
  if (M < -Math.PI) M += 2 * Math.PI
  let E = e < 0.8 ? M : Math.PI * Math.sign(M || 1)
  for (let i = 0; i < 30; i++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
    E -= d
    if (Math.abs(d) < 1e-12) break
  }
  return E
}

function solveKeplerH(M: number, e: number): number {
  let H = Math.asinh(M / e)
  for (let i = 0; i < 40; i++) {
    const d = (e * Math.sinh(H) - H - M) / (e * Math.cosh(H) - 1)
    H -= d
    if (Math.abs(d) < 1e-12) break
  }
  return H
}

/** [r, ν] for an elliptic orbit at dt days from perihelion. */
function rNuElliptic(q: number, e: number, dt: number): [number, number] {
  const a = q / (1 - e)
  const n = K_GAUSS / Math.pow(a, 1.5)
  const E = solveKeplerE(n * dt, e)
  const r = a * (1 - e * Math.cos(E))
  const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2))
  return [r, nu]
}

/** [r, ν] for a parabolic orbit (Barker's equation, closed form). */
function rNuParabolic(q: number, dt: number): [number, number] {
  const Mp = (K_GAUSS / (Math.SQRT2 * Math.pow(q, 1.5))) * dt
  const w = (3 / 2) * Mp
  const u = Math.cbrt(w + Math.sqrt(w * w + 1))
  const s = u - 1 / u // tan(ν/2)
  const nu = 2 * Math.atan(s)
  const r = q * (1 + s * s)
  return [r, nu]
}

/** [r, ν] for a hyperbolic orbit at dt days from perihelion. */
function rNuHyperbolic(q: number, e: number, dt: number): [number, number] {
  const a = q / (e - 1) // positive convention
  const n = K_GAUSS / Math.pow(a, 1.5)
  const H = solveKeplerH(n * dt, e)
  const r = a * (e * Math.cosh(H) - 1)
  const nu = 2 * Math.atan2(Math.sqrt(e + 1) * Math.sinh(H / 2), Math.sqrt(e - 1) * Math.cosh(H / 2))
  return [r, nu]
}

/** Perifocal (r, ν) -> heliocentric ecliptic J2000 xyz via the 3-1-3 rotation. */
function perifocalToEcl(r: number, nu: number, periDeg: number, nodeDeg: number, inclDeg: number): HelioState {
  const xw = r * Math.cos(nu)
  const yw = r * Math.sin(nu)
  const cw = Math.cos(periDeg * DEG)
  const sw = Math.sin(periDeg * DEG)
  const cO = Math.cos(nodeDeg * DEG)
  const sO = Math.sin(nodeDeg * DEG)
  const ci = Math.cos(inclDeg * DEG)
  const si = Math.sin(inclDeg * DEG)
  return {
    x: (cO * cw - sO * sw * ci) * xw + (-cO * sw - sO * cw * ci) * yw,
    y: (sO * cw + cO * sw * ci) * xw + (-sO * sw + cO * cw * ci) * yw,
    z: sw * si * xw + cw * si * yw,
    r,
  }
}

export function cometHelioEcl(el: CometEls, jd: number): HelioState {
  const dt = jd - el.tpJd
  let rNu: [number, number]
  if (el.e < 0.985) rNu = rNuElliptic(el.q, el.e, dt)
  else if (el.e <= 1.015) rNu = rNuParabolic(el.q, dt)
  else rNu = rNuHyperbolic(el.q, el.e, dt)
  return perifocalToEcl(rNu[0], rNu[1], el.peri, el.node, el.incl)
}

export function asteroidHelioEcl(el: AsteroidEls, jd: number): HelioState {
  const n = K_GAUSS / Math.pow(el.a, 1.5)
  const M = el.M0 * DEG + n * (jd - el.epochJd)
  const E = solveKeplerE(M, el.e)
  const r = el.a * (1 - el.e * Math.cos(E))
  const nu = 2 * Math.atan2(Math.sqrt(1 + el.e) * Math.sin(E / 2), Math.sqrt(1 - el.e) * Math.cos(E / 2))
  return perifocalToEcl(r, nu, el.peri, el.node, el.incl)
}

/** MPC total-magnitude model: m = H + 5·log Δ + 2.5·G·log r. */
export function cometMagnitude(el: CometEls, rHelio: number, deltaGeo: number): number {
  return el.H + 5 * Math.log10(deltaGeo) + 2.5 * el.G * Math.log10(rHelio)
}

/** Asteroid magnitude ignoring the phase term (good to a few tenths). */
export function asteroidMagnitude(H: number, rHelio: number, deltaGeo: number): number {
  return H + 5 * Math.log10(rHelio * deltaGeo)
}

/** Orbital period in days for closed orbits, or null. */
export function cometPeriodDays(el: CometEls): number | null {
  if (el.e >= 1) return null
  const a = el.q / (1 - el.e)
  return (2 * Math.PI) / (K_GAUSS / Math.pow(a, 1.5))
}
