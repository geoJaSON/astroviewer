// Comets, asteroids, and satellites in the heliocentric space view.
// Asteroid orbits draw as faint belt rings; the selected comet gets its
// trajectory; the selected satellite gets its orbit ring around Earth.
import { useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import type { Catalog } from '../data/catalog'
import {
  EARTH_RADIUS,
  astroTime,
  eclToScene,
  eqdxyzToSpace,
  helioToScene,
  jdOf,
} from '../astro/frames'
import { asteroidHelioEcl, cometHelioEcl, cometPeriodDays } from '../astro/kepler'
import { satEciKm } from '../astro/satellites'
import { useStore } from '../state/store'
import * as A from 'astronomy-engine'

const COMET_COLOR = '#9fe8c8'
const ASTEROID_COLOR = '#d8b8a0'
const SAT_COLOR = '#f0f4ff'
const EARTH_KM = 6371

export function MovingBodiesSpace({ catalog }: { catalog: Catalog }) {
  const show = useStore((s) => s.show)
  const selection = useStore((s) => s.selection)
  const setSelection = useStore((s) => s.setSelection)

  const cometRefs = useRef<(THREE.Mesh | null)[]>([])
  const asteroidRefs = useRef<(THREE.Mesh | null)[]>([])
  const satRefs = useRef<(THREE.Mesh | null)[]>([])
  const tmp = useMemo(() => ({ v: new THREE.Vector3(), earth: new THREE.Vector3() }), [])

  // Asteroid orbits: closed ellipses, sampled once.
  const asteroidOrbits = useMemo(
    () =>
      catalog.asteroids.map((a) => {
        const periodDays = (2 * Math.PI / 0.01720209895) * Math.pow(a.a, 1.5)
        const pts: THREE.Vector3[] = []
        for (let i = 0; i <= 160; i++) {
          const h = asteroidHelioEcl(a, a.epochJd + (periodDays * i) / 160)
          pts.push(eclToScene(h.x, h.y, h.z, new THREE.Vector3()).clone())
        }
        return pts
      }),
    [catalog],
  )

  // Selected comet trajectory: full ellipse when closed and short-period,
  // otherwise an arc around perihelion.
  const cometOrbit = useMemo(() => {
    if (selection?.kind !== 'comet') return null
    const c = catalog.comets[selection.index]
    const period = cometPeriodDays(c)
    const span = period && period < 80 * 365.25 ? period : 6 * 365.25
    const t0 = c.tpJd - span / 2
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 240; i++) {
      const h = cometHelioEcl(c, t0 + (span * i) / 240)
      if (h.r < 80) pts.push(eclToScene(h.x, h.y, h.z, new THREE.Vector3()).clone())
    }
    return pts
  }, [selection, catalog])

  // Selected satellite orbit ring, rebuilt imperatively each frame (SGP4 is cheap).
  const satRing = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(65 * 3), 3))
    const line = new THREE.Line(
      g,
      new THREE.LineBasicMaterial({ color: SAT_COLOR, transparent: true, opacity: 0.45, depthWrite: false }),
    )
    line.frustumCulled = false
    line.visible = false
    return line
  }, [])

  useFrame(() => {
    const { timeMs, show: showNow, selection: selNow } = useStore.getState()
    const time = astroTime(timeMs)
    const jd = jdOf(time)
    helioToScene(A.HelioVector(A.Body.Earth, time), tmp.earth)

    if (showNow.minor) {
      catalog.comets.forEach((c, i) => {
        const m = cometRefs.current[i]
        if (!m) return
        const h = cometHelioEcl(c, jd)
        if (h.r > 80) {
          m.visible = false
          return
        }
        m.visible = true
        m.position.copy(eclToScene(h.x, h.y, h.z, tmp.v))
      })
      catalog.asteroids.forEach((a, i) => {
        const m = asteroidRefs.current[i]
        if (!m) return
        const h = asteroidHelioEcl(a, jd)
        m.position.copy(eclToScene(h.x, h.y, h.z, tmp.v))
      })
    }

    if (showNow.sats) {
      catalog.sats.forEach((s, i) => {
        const m = satRefs.current[i]
        if (!m) return
        const p = satEciKm(s, time.date)
        if (!p) {
          m.visible = false
          return
        }
        m.visible = true
        eqdxyzToSpace(p.x, p.y, p.z, time, tmp.v)
          .multiplyScalar(EARTH_RADIUS / EARTH_KM)
          .add(tmp.earth)
        m.position.copy(tmp.v)
      })
    }

    // Orbit ring for the selected satellite.
    if (selNow?.kind === 'sat' && showNow.sats) {
      const s = catalog.sats[selNow.index]
      const attr = satRing.geometry.getAttribute('position') as THREE.BufferAttribute
      let ok = true
      for (let i = 0; i <= 64; i++) {
        const d = new Date(timeMs + (s.periodMin * 60000 * i) / 64)
        const p = satEciKm(s, d)
        if (!p) {
          ok = false
          break
        }
        eqdxyzToSpace(p.x, p.y, p.z, time, tmp.v)
          .multiplyScalar(EARTH_RADIUS / EARTH_KM)
          .add(tmp.earth)
        attr.setXYZ(i, tmp.v.x, tmp.v.y, tmp.v.z)
      }
      satRing.visible = ok
      attr.needsUpdate = true
    } else {
      satRing.visible = false
    }
  })

  const pick =
    (sel: Parameters<typeof setSelection>[0]) =>
    (e: ThreeEvent<MouseEvent>) => {
      if (e.delta > 6) return
      e.stopPropagation()
      setSelection(sel)
    }

  return (
    <>
      {show.minor &&
        catalog.comets.map((c, i) => (
          <mesh
            key={c.name}
            ref={(el) => {
              cometRefs.current[i] = el
            }}
            onClick={pick({ kind: 'comet', index: i })}
          >
            <sphereGeometry args={[0.32, 12, 12]} />
            <meshBasicMaterial color={COMET_COLOR} transparent opacity={0.7} />
          </mesh>
        ))}

      {show.minor &&
        catalog.asteroids.map((a, i) => (
          <mesh
            key={a.name}
            ref={(el) => {
              asteroidRefs.current[i] = el
            }}
            onClick={pick({ kind: 'asteroid', index: i })}
          >
            <sphereGeometry args={[0.45, 12, 12]} />
            <meshBasicMaterial color={ASTEROID_COLOR} />
          </mesh>
        ))}

      {show.minor &&
        show.orbits &&
        asteroidOrbits.map((pts, i) => (
          <Line key={catalog.asteroids[i].name} points={pts} color={ASTEROID_COLOR} transparent opacity={0.13} lineWidth={1} />
        ))}

      {show.minor && cometOrbit && cometOrbit.length > 1 && (
        <Line points={cometOrbit} color={COMET_COLOR} transparent opacity={0.5} lineWidth={1} dashed dashSize={2.4} gapSize={1.4} />
      )}

      {show.sats &&
        catalog.sats.map((s, i) => (
          <mesh
            key={s.catnr}
            ref={(el) => {
              satRefs.current[i] = el
            }}
            onClick={pick({ kind: 'sat', index: i })}
          >
            <sphereGeometry args={[0.045, 8, 8]} />
            <meshBasicMaterial color={SAT_COLOR} />
          </mesh>
        ))}

      <primitive object={satRing} />
    </>
  )
}
