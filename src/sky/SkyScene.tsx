import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import * as A from 'astronomy-engine'
import * as THREE from 'three'
import type { Catalog } from '../data/catalog'
import { SKY_BODIES } from '../astro/bodies'
import { DEG, altazToSkyDir, astroTime, eqjToSkyMatrix, makeObserver } from '../astro/frames'
import { selectionAltAz } from '../astro/selection'
import { useStore } from '../state/store'
import { MovingBodiesSky } from './MovingBodiesSky'
import { StarPoints } from '../three/StarPoints'
import { discTexture, glowTexture, groundTexture, reticleTexture, ringTexture } from '../three/sprites'
import { skyTint, starFade } from './tint'

const SKY_R = 1000
const BODY_R = 880
const HIGHLIGHT_R = 850

const MONO_FONT = '/fonts/IBMPlexMono-Medium.ttf'

function CardinalMarks() {
  const marks = useMemo(
    () =>
      [
        { az: 0, label: 'N' },
        { az: 90, label: 'E' },
        { az: 180, label: 'S' },
        { az: 270, label: 'W' },
      ].map((m) => ({ ...m, pos: altazToSkyDir(m.az, 2.2).multiplyScalar(840) })),
    [],
  )
  return (
    <>
      {marks.map((m) => (
        <Billboard key={m.label} position={m.pos}>
          <Text font={MONO_FONT} fontSize={30} color="#e8b873" fillOpacity={0.85} anchorY="middle">
            {m.label}
          </Text>
        </Billboard>
      ))}
    </>
  )
}

function HorizonRing() {
  const geometry = useMemo(() => {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 144; i++) {
      const az = (i / 144) * 360
      pts.push(altazToSkyDir(az, 0).multiplyScalar(870))
    }
    return new THREE.BufferGeometry().setFromPoints(pts)
  }, [])
  return (
    <primitive
      object={new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#e8b873', transparent: true, opacity: 0.4 }))}
    />
  )
}

function Ground() {
  const tex = useMemo(() => groundTexture(), [])
  return (
    <mesh position={[0, -2.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[5000, 64]} />
      <meshBasicMaterial map={tex} />
    </mesh>
  )
}

function ConstellationLines({ catalog, materialRef }: { catalog: Catalog; materialRef: React.MutableRefObject<THREE.LineBasicMaterial | null> }) {
  const geometry = useMemo(() => {
    const pos = new Float32Array(catalog.conLines.length)
    for (let i = 0; i < pos.length; i++) pos[i] = catalog.conLines[i] * (SKY_R - 5)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return g
  }, [catalog])
  const material = useMemo(() => {
    const m = new THREE.LineBasicMaterial({ color: '#e8b873', transparent: true, opacity: 0.22, depthWrite: false })
    materialRef.current = m
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <lineSegments geometry={geometry} material={material} />
}

function MessierMarkers({
  catalog,
  materialRef,
  onSelect,
}: {
  catalog: Catalog
  materialRef: React.MutableRefObject<THREE.PointsMaterial | null>
  onSelect: (i: number) => void
}) {
  const geometry = useMemo(() => {
    const pos = new Float32Array(catalog.messierEqj.length)
    for (let i = 0; i < pos.length; i++) pos[i] = catalog.messierEqj[i] * (SKY_R - 10)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return g
  }, [catalog])
  const material = useMemo(() => {
    const m = new THREE.PointsMaterial({
      map: ringTexture('#7fd4e4'),
      size: 15,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    })
    materialRef.current = m
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <points
      geometry={geometry}
      material={material}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if (e.delta > 6 || e.index === undefined) return
        e.stopPropagation()
        onSelect(e.index)
      }}
    />
  )
}

export function SkyScene({ catalog }: { catalog: Catalog }) {
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const show = useStore((s) => s.show)
  const setSelection = useStore((s) => s.setSelection)

  const eqjGroup = useRef<THREE.Group>(null)
  const starsMat = useRef<THREE.ShaderMaterial | null>(null)
  const conMat = useRef<THREE.LineBasicMaterial | null>(null)
  const mesMat = useRef<THREE.PointsMaterial | null>(null)
  const bodyGroups = useRef<(THREE.Group | null)[]>([])
  const highlight = useRef<THREE.Sprite>(null)
  const bg = useMemo(() => new THREE.Color('#04060d'), [])

  useEffect(() => {
    scene.background = bg
  }, [scene, bg])

  const tmpDir = useMemo(() => new THREE.Vector3(), [])

  useFrame(() => {
    const { timeMs, location, skyCam, selection } = useStore.getState()
    const time = astroTime(timeMs)
    const obs = makeObserver(location.lat, location.lon)

    camera.rotation.order = 'YXZ'
    camera.rotation.set(skyCam.alt * DEG, -skyCam.az * DEG, 0)
    if (Math.abs(camera.fov - skyCam.fov) > 0.01) {
      camera.fov = skyCam.fov
      camera.updateProjectionMatrix()
    }

    const g = eqjGroup.current
    if (g) {
      g.matrixAutoUpdate = false
      eqjToSkyMatrix(time, obs, g.matrix)
    }

    let sunAlt = -90
    SKY_BODIES.forEach((def, i) => {
      const grp = bodyGroups.current[i]
      if (!grp) return
      const eq = A.Equator(def.body, time, obs, true, true)
      const hor = A.Horizon(time, obs, eq.ra, eq.dec, 'normal')
      if (def.name === 'Sun') sunAlt = hor.altitude
      altazToSkyDir(hor.azimuth, hor.altitude, tmpDir).multiplyScalar(BODY_R)
      grp.position.copy(tmpDir)
    })

    skyTint(sunAlt, bg)
    const fade = starFade(sunAlt)
    if (starsMat.current) starsMat.current.uniforms.uOpacity.value = fade
    if (conMat.current) conMat.current.opacity = 0.22 * Math.max(0.25, fade)
    if (mesMat.current) mesMat.current.opacity = 0.8 * Math.max(0.15, fade)

    const h = highlight.current
    if (h) {
      if (selection) {
        const { az, alt } = selectionAltAz(selection, catalog, time, obs)
        if (useStore.getState().track) {
          useStore.getState().setSkyCam({ az, alt: Math.min(89.9, Math.max(-30, alt)) })
        }
        altazToSkyDir(az, alt, tmpDir).multiplyScalar(HIGHLIGHT_R)
        h.visible = true
        h.position.copy(tmpDir)
        const pulse = 1 + 0.12 * Math.sin(performance.now() / 280)
        h.scale.setScalar(38 * pulse)
      } else {
        h.visible = false
      }
    }
  })

  const reticle = useMemo(() => reticleTexture('#ffd9a0'), [])

  return (
    <>
      <group ref={eqjGroup}>
        <StarPoints
          catalog={catalog}
          radius={SKY_R}
          materialRef={starsMat}
          onSelect={(i) => setSelection({ kind: 'star', index: i })}
        />
        {show.constellations && <ConstellationLines catalog={catalog} materialRef={conMat} />}
        {show.messier && (
          <MessierMarkers
            catalog={catalog}
            materialRef={mesMat}
            onSelect={(i) => setSelection({ kind: 'messier', index: i })}
          />
        )}
      </group>
      {show.labels && <BrightStarLabels catalog={catalog} />}
      <MovingBodiesSky catalog={catalog} />

      {SKY_BODIES.map((def, i) => (
        <group
          key={def.name}
          ref={(el) => {
            bodyGroups.current[i] = el
          }}
        >
          {def.name === 'Sun' && (
            <sprite scale={[150, 150, 1]} renderOrder={1}>
              <spriteMaterial map={glowTexture('#ffe9b8')} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
            </sprite>
          )}
          {def.name === 'Moon' && (
            <sprite scale={[70, 70, 1]} renderOrder={1}>
              <spriteMaterial map={glowTexture('#b8c4d8')} transparent opacity={0.5} depthWrite={false} blending={THREE.AdditiveBlending} />
            </sprite>
          )}
          <sprite
            scale={[def.size, def.size, 1]}
            renderOrder={2}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              if (e.delta > 6) return
              e.stopPropagation()
              setSelection({ kind: 'planet', name: def.name })
            }}
          >
            <spriteMaterial map={discTexture(def.color)} transparent depthWrite={false} />
          </sprite>
          {show.labels && def.name !== 'Pluto' && (
            <Billboard position={[0, -def.size * 1.4 - 10, 0]}>
              <Text font={MONO_FONT} fontSize={13} color={def.color} fillOpacity={0.8} anchorY="top">
                {def.name.toUpperCase()}
              </Text>
            </Billboard>
          )}
        </group>
      ))}

      <sprite ref={highlight} visible={false} renderOrder={5}>
        <spriteMaterial map={reticle} transparent depthWrite={false} depthTest={false} />
      </sprite>

      <Ground />
      <HorizonRing />
      <CardinalMarks />
    </>
  )
}

/**
 * Labels for the brightest named stars. Lives in world space (not the rotating
 * EQJ group) so billboarding stays correct; positions are re-derived per frame.
 */
function BrightStarLabels({ catalog }: { catalog: Catalog }) {
  const labels = useMemo(() => {
    const out: { name: string; base: THREE.Vector3 }[] = []
    for (const [idxStr, name] of Object.entries(catalog.starNames)) {
      const idx = +idxStr
      if (catalog.stars[idx].mag > 1.6) continue
      const v = new THREE.Vector3(
        catalog.starEqj[idx * 3],
        catalog.starEqj[idx * 3 + 1],
        catalog.starEqj[idx * 3 + 2],
      ).multiplyScalar(SKY_R - 20)
      out.push({ name, base: v })
    }
    return out
  }, [catalog])

  const refs = useRef<(THREE.Group | null)[]>([])
  const m = useMemo(() => new THREE.Matrix4(), [])

  useFrame(() => {
    const { timeMs, location } = useStore.getState()
    eqjToSkyMatrix(astroTime(timeMs), makeObserver(location.lat, location.lon), m)
    labels.forEach((l, i) => {
      const ref = refs.current[i]
      if (ref) ref.position.copy(l.base).applyMatrix4(m)
    })
  })

  return (
    <>
      {labels.map((l, i) => (
        <Billboard
          key={l.name}
          ref={(el) => {
            refs.current[i] = el
          }}
        >
          <Text font={MONO_FONT} fontSize={11} color="#9fb4d0" fillOpacity={0.75} anchorY="bottom" position={[0, 8, 0]}>
            {l.name}
          </Text>
        </Billboard>
      ))}
    </>
  )
}
