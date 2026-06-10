import { useEffect } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import type { Catalog } from '../data/catalog'
import { formatAz, formatDeg } from '../astro/format'
import { useStore } from '../state/store'
import { SkyScene } from './SkyScene'

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Stellarium-style grab-the-sky controls: drag to pan, wheel to zoom FOV. */
function SkyControls() {
  const gl = useThree((s) => s.gl)

  useEffect(() => {
    const el = gl.domElement
    let dragging = false
    let lx = 0
    let ly = 0

    const down = (e: PointerEvent) => {
      if (e.button !== 0) return
      dragging = true
      lx = e.clientX
      ly = e.clientY
      el.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (!dragging) return
      const { skyCam, setSkyCam, track, setTrack } = useStore.getState()
      if (track) setTrack(false) // manual pan releases tracking
      const k = skyCam.fov / el.clientHeight
      let az = skyCam.az - (e.clientX - lx) * k
      az = ((az % 360) + 360) % 360
      const alt = clamp(skyCam.alt + (e.clientY - ly) * k, -30, 89.9)
      setSkyCam({ az, alt })
      lx = e.clientX
      ly = e.clientY
    }
    const up = (e: PointerEvent) => {
      dragging = false
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const { skyCam, setSkyCam } = useStore.getState()
      setSkyCam({ fov: clamp(skyCam.fov * Math.exp(e.deltaY * 0.0012), 12, 110) })
    }

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('wheel', wheel)
    }
  }, [gl])

  return null
}

function SkyReadout() {
  const cam = useStore((s) => s.skyCam)
  return (
    <div className="panel-readout">
      <span>AZ {formatAz(cam.az)}</span>
      <span>ALT {formatDeg(cam.alt)}</span>
      <span>FOV {formatDeg(cam.fov, 0)}</span>
    </div>
  )
}

export function SkyView({ catalog }: { catalog: Catalog }) {
  return (
    <div className="view-root">
      <Canvas
        flat
        camera={{ fov: 70, near: 0.5, far: 12000, position: [0, 0, 0] }}
        raycaster={{ params: { Points: { threshold: 14 }, Line: { threshold: 1 }, Mesh: {}, LOD: {}, Sprite: {} } }}
        gl={{ antialias: true }}
      >
        <SkyScene catalog={catalog} />
        <SkyControls />
      </Canvas>
      <SkyReadout />
    </div>
  )
}
