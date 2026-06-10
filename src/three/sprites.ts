// Procedural canvas textures shared by both views (discs, rings, glows).
import * as THREE from 'three'

const cache = new Map<string, THREE.CanvasTexture>()

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  return [c, c.getContext('2d')!]
}

function toTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 2
  return t
}

/** Solid soft-edged disc (planets, moon). */
export function discTexture(color: string): THREE.CanvasTexture {
  const key = `disc:${color}`
  if (cache.has(key)) return cache.get(key)!
  const [c, ctx] = makeCanvas(64)
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, color)
  g.addColorStop(0.62, color)
  g.addColorStop(0.78, color + 'cc')
  g.addColorStop(1, color + '00')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  const t = toTexture(c)
  cache.set(key, t)
  return t
}

/** Radial glow (sun halo, atmosphere). */
export function glowTexture(color: string): THREE.CanvasTexture {
  const key = `glow:${color}`
  if (cache.has(key)) return cache.get(key)!
  const [c, ctx] = makeCanvas(128)
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, color)
  g.addColorStop(0.25, color + '88')
  g.addColorStop(0.6, color + '22')
  g.addColorStop(1, color + '00')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  const t = toTexture(c)
  cache.set(key, t)
  return t
}

/** Thin ring outline (selection highlight, Messier markers). */
export function ringTexture(color: string, width = 5): THREE.CanvasTexture {
  const key = `ring:${color}:${width}`
  if (cache.has(key)) return cache.get(key)!
  const [c, ctx] = makeCanvas(64)
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.arc(32, 32, 32 - width, 0, Math.PI * 2)
  ctx.stroke()
  const t = toTexture(c)
  cache.set(key, t)
  return t
}

/** Crosshair reticle for selections. */
export function reticleTexture(color: string): THREE.CanvasTexture {
  const key = `reticle:${color}`
  if (cache.has(key)) return cache.get(key)!
  const [c, ctx] = makeCanvas(96)
  ctx.strokeStyle = color
  ctx.lineWidth = 3.5
  ctx.beginPath()
  ctx.arc(48, 48, 30, 0, Math.PI * 2)
  ctx.stroke()
  ctx.lineWidth = 3
  for (const [x1, y1, x2, y2] of [
    [48, 2, 48, 16],
    [48, 80, 48, 94],
    [2, 48, 16, 48],
    [80, 48, 94, 48],
  ]) {
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }
  const t = toTexture(c)
  cache.set(key, t)
  return t
}

/** Ground plane radial gradient for the sky view. */
export function groundTexture(): THREE.CanvasTexture {
  const key = 'ground'
  if (cache.has(key)) return cache.get(key)!
  const [c, ctx] = makeCanvas(256)
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
  g.addColorStop(0, '#10151c')
  g.addColorStop(0.5, '#0b0f15')
  g.addColorStop(1, '#06080c')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 256)
  const t = toTexture(c)
  cache.set(key, t)
  return t
}
