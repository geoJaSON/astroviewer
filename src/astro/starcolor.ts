// Star color from B-V color index via blackbody temperature approximation,
// softened toward white for a realistic naked-eye look.

function bvToTemp(bv: number): number {
  const b = Math.min(2, Math.max(-0.4, bv))
  return 4600 * (1 / (0.92 * b + 1.7) + 1 / (0.92 * b + 0.62))
}

// Tanner Helland's blackbody -> RGB approximation.
function tempToRGB(kelvin: number): [number, number, number] {
  const t = Math.min(40000, Math.max(1000, kelvin)) / 100
  let r: number, g: number, b: number
  if (t <= 66) {
    r = 255
    g = 99.4708025861 * Math.log(t) - 161.1195681661
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592)
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492)
    b = 255
  }
  const clamp = (x: number) => Math.min(255, Math.max(0, x)) / 255
  return [clamp(r), clamp(g), clamp(b)]
}

const SOFTEN = 0.3

export function bvToColor(bv: number): [number, number, number] {
  const [r, g, b] = tempToRGB(bvToTemp(bv))
  return [r + (1 - r) * SOFTEN, g + (1 - g) * SOFTEN, b + (1 - b) * SOFTEN]
}

/** Visual magnitude -> point size in device pixels (before pixel-ratio scaling). */
export function magToSize(mag: number): number {
  return Math.min(15, Math.max(1.15, 9 * Math.pow(10, -0.13 * mag)))
}
