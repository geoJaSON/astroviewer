// Sky background tint and star fade driven by the Sun's altitude.
import * as THREE from 'three'

const NIGHT = new THREE.Color('#04060d')
const ASTRO = new THREE.Color('#070c18')
const CIVIL = new THREE.Color('#1a2a4a')
const DAY = new THREE.Color('#6f9fd0')

export function skyTint(sunAltDeg: number, out: THREE.Color): THREE.Color {
  if (sunAltDeg <= -18) return out.copy(NIGHT)
  if (sunAltDeg <= -6) return out.copy(NIGHT).lerp(ASTRO, (sunAltDeg + 18) / 12)
  if (sunAltDeg <= 0) return out.copy(ASTRO).lerp(CIVIL, (sunAltDeg + 6) / 6)
  if (sunAltDeg <= 8) return out.copy(CIVIL).lerp(DAY, sunAltDeg / 8)
  return out.copy(DAY)
}

export function starFade(sunAltDeg: number): number {
  if (sunAltDeg <= -10) return 1
  if (sunAltDeg <= -2) return 1 - ((sunAltDeg + 10) / 8) * 0.72
  if (sunAltDeg <= 6) return 0.28 - ((sunAltDeg + 2) / 8) * 0.25
  return 0.03
}
