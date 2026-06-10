// Comets, bright asteroids, and satellites on the sky dome. All of these move
// against the stars, so positions are recomputed every frame.
import { useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import * as THREE from 'three'
import type { Catalog } from '../data/catalog'
import { altazToSkyDir, astroTime, earthHelioEcl, eclGeoToAltAz, jdOf, makeObserver } from '../astro/frames'
import { asteroidHelioEcl, cometHelioEcl, cometMagnitude } from '../astro/kepler'
import { satLookAngles } from '../astro/satellites'
import { useStore } from '../state/store'
import { discTexture, glowTexture } from '../three/sprites'

const BODY_R = 875
const MONO_FONT = '/fonts/IBMPlexMono-Medium.ttf'

const COMET_COLOR = '#9fe8c8'
const ASTEROID_COLOR = '#d8b8a0'
const SAT_COLOR = '#f0f4ff'

export function MovingBodiesSky({ catalog }: { catalog: Catalog }) {
  const show = useStore((s) => s.show)
  const setSelection = useStore((s) => s.setSelection)

  const cometRefs = useRef<(THREE.Group | null)[]>([])
  const asteroidRefs = useRef<(THREE.Group | null)[]>([])
  const satRefs = useRef<(THREE.Group | null)[]>([])

  const tmp = useMemo(() => ({ dir: new THREE.Vector3(), earth: new THREE.Vector3() }), [])

  useFrame(() => {
    const { timeMs, location } = useStore.getState()
    const time = astroTime(timeMs)
    const obs = makeObserver(location.lat, location.lon)
    const jd = jdOf(time)
    earthHelioEcl(time, tmp.earth)

    const placeEcl = (grp: THREE.Group, hx: number, hy: number, hz: number) => {
      const { az, alt } = eclGeoToAltAz(hx - tmp.earth.x, hy - tmp.earth.y, hz - tmp.earth.z, time, obs)
      grp.position.copy(altazToSkyDir(az, alt, tmp.dir).multiplyScalar(BODY_R))
    }

    if (useStore.getState().show.minor) {
      catalog.comets.forEach((c, i) => {
        const grp = cometRefs.current[i]
        if (!grp) return
        const h = cometHelioEcl(c, jd)
        placeEcl(grp, h.x, h.y, h.z)
        // label only when plausibly bright
        const label = grp.children[2]
        if (label) {
          const dx = h.x - tmp.earth.x
          const dy = h.y - tmp.earth.y
          const dz = h.z - tmp.earth.z
          label.visible = cometMagnitude(c, h.r, Math.hypot(dx, dy, dz)) < 8
        }
      })
      catalog.asteroids.forEach((a, i) => {
        const grp = asteroidRefs.current[i]
        if (!grp) return
        const h = asteroidHelioEcl(a, jd)
        placeEcl(grp, h.x, h.y, h.z)
      })
    }

    if (useStore.getState().show.sats) {
      catalog.sats.forEach((s, i) => {
        const grp = satRefs.current[i]
        if (!grp) return
        const look = satLookAngles(s, time.date, location.lat, location.lon)
        if (!look) {
          grp.visible = false
          return
        }
        grp.visible = true
        grp.position.copy(altazToSkyDir(look.az, look.alt, tmp.dir).multiplyScalar(BODY_R))
      })
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
          <group
            key={c.name}
            ref={(el) => {
              cometRefs.current[i] = el
            }}
          >
            <sprite scale={[16, 16, 1]} renderOrder={1}>
              <spriteMaterial
                map={glowTexture(COMET_COLOR)}
                transparent
                opacity={0.55}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </sprite>
            <sprite scale={[6, 6, 1]} renderOrder={2} onClick={pick({ kind: 'comet', index: i })}>
              <spriteMaterial map={discTexture(COMET_COLOR)} transparent depthWrite={false} />
            </sprite>
            <Billboard position={[0, -16, 0]} visible={false}>
              <Text font={MONO_FONT} fontSize={11} color={COMET_COLOR} fillOpacity={0.85} anchorY="top">
                {c.name.replace(/\s*\(.*\)/, '')}
              </Text>
            </Billboard>
          </group>
        ))}

      {show.minor &&
        catalog.asteroids.map((a, i) => (
          <group
            key={a.name}
            ref={(el) => {
              asteroidRefs.current[i] = el
            }}
          >
            <sprite scale={[5.5, 5.5, 1]} renderOrder={2} onClick={pick({ kind: 'asteroid', index: i })}>
              <spriteMaterial map={discTexture(ASTEROID_COLOR)} transparent depthWrite={false} />
            </sprite>
          </group>
        ))}

      {show.sats &&
        catalog.sats.map((s, i) => (
          <group
            key={s.catnr}
            ref={(el) => {
              satRefs.current[i] = el
            }}
          >
            <sprite scale={[6, 6, 1]} renderOrder={2} onClick={pick({ kind: 'sat', index: i })}>
              <spriteMaterial map={discTexture(SAT_COLOR)} transparent depthWrite={false} />
            </sprite>
            <Billboard position={[0, 12, 0]}>
              <Text font={MONO_FONT} fontSize={11} color={SAT_COLOR} fillOpacity={0.7} anchorY="bottom">
                {s.name.toUpperCase()}
              </Text>
            </Billboard>
          </group>
        ))}
    </>
  )
}
