import { Suspense, useEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader, useThree, type ThreeEvent } from '@react-three/fiber'
import { Billboard, Line, OrbitControls, Text } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as A from 'astronomy-engine'
import * as THREE from 'three'
import type { Catalog } from '../data/catalog'
import { PLANETS } from '../astro/bodies'
import {
  DEG,
  EARTH_RADIUS,
  EQJ_TO_SPACE_MATRIX,
  STAR_SHELL_RADIUS,
  altazToSpaceDir,
  astroTime,
  earthOrientation,
  eclToScene,
  eqdxyzToSpace,
  eqjxyzToSpace,
  helioToScene,
  jdOf,
  latLonToLocal,
  makeObserver,
} from '../astro/frames'
import { asteroidHelioEcl, cometHelioEcl } from '../astro/kepler'
import { satEciKm } from '../astro/satellites'
import { selectionEqjDir } from '../astro/selection'
import { MovingBodiesSpace } from './MovingBodiesSpace'
import { useStore } from '../state/store'
import { StarPoints } from '../three/StarPoints'
import { glowTexture, reticleTexture, ringTexture } from '../three/sprites'

const MOON_VIS_DIST = 7
const DOME_RADIUS = 13
const CONE_LENGTH = 30

const MONO_FONT = '/fonts/IBMPlexMono-Medium.ttf'

const UP = new THREE.Vector3(0, 1, 0)

function circlePoints(radius: number, transform?: (x: number, y: number, out: THREE.Vector3) => THREE.Vector3): THREE.Vector3[] {
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= 128; i++) {
    const a = (i / 128) * Math.PI * 2
    const out = new THREE.Vector3()
    if (transform) pts.push(transform(Math.cos(a) * radius, Math.sin(a) * radius, out).clone())
    else pts.push(out.set(Math.cos(a) * radius, 0, Math.sin(a) * radius))
  }
  return pts
}

function EarthMesh() {
  const [day, night] = useLoader(THREE.TextureLoader, ['/textures/earth-day.jpg', '/textures/earth-night.jpg'])
  useEffect(() => {
    day.colorSpace = THREE.SRGBColorSpace
    night.colorSpace = THREE.SRGBColorSpace
    day.anisotropy = 4
  }, [day, night])
  return (
    <mesh>
      <sphereGeometry args={[EARTH_RADIUS, 64, 64]} />
      <meshStandardMaterial
        map={day}
        emissive="#8090b8"
        emissiveMap={night}
        emissiveIntensity={0.55}
        roughness={0.9}
        metalness={0}
      />
    </mesh>
  )
}

function EarthFallback() {
  return (
    <mesh>
      <sphereGeometry args={[EARTH_RADIUS, 32, 32]} />
      <meshStandardMaterial color="#3a6fa8" />
    </mesh>
  )
}

/** Celestial-sphere teaching aid around Earth: dome + celestial equator + ecliptic ring. */
function Dome() {
  const equatorPts = useMemo(
    () => circlePoints(DOME_RADIUS, (x, y, out) => eqjxyzToSpace(x / DOME_RADIUS, y / DOME_RADIUS, 0, out).multiplyScalar(DOME_RADIUS)),
    [],
  )
  const eclipticPts = useMemo(() => circlePoints(DOME_RADIUS), [])
  return (
    <group>
      <mesh>
        <sphereGeometry args={[DOME_RADIUS, 28, 18]} />
        <meshBasicMaterial color="#7fd4e4" wireframe transparent opacity={0.05} depthWrite={false} />
      </mesh>
      <Line points={equatorPts} color="#7fd4e4" transparent opacity={0.35} lineWidth={1} />
      <Line points={eclipticPts} color="#e8b873" transparent opacity={0.4} lineWidth={1} dashed dashSize={0.8} gapSize={0.5} />
    </group>
  )
}

export function SpaceScene({ catalog }: { catalog: Catalog }) {
  const camera = useThree((s) => s.camera)
  const show = useStore((s) => s.show)
  const location = useStore((s) => s.location)
  const setSelection = useStore((s) => s.setSelection)

  const earthGroup = useRef<THREE.Group>(null)
  const earthAnchor = useRef<THREE.Group>(null)
  const moonRef = useRef<THREE.Group>(null)
  const coneRef = useRef<THREE.Mesh>(null)
  const highlightRef = useRef<THREE.Sprite>(null)
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const planetRefs = useRef<Record<string, THREE.Group | null>>({})
  const labelRefs = useRef<Record<string, THREE.Group | null>>({})

  // Reusable per-frame scratch objects.
  const scratch = useMemo(
    () => ({
      earthPos: new THREE.Vector3(),
      moonPos: new THREE.Vector3(),
      obsWorld: new THREE.Vector3(),
      up: new THREE.Vector3(),
      dir: new THREE.Vector3(),
      target: new THREE.Vector3(),
      m4: new THREE.Matrix4(),
      v: new THREE.Vector3(),
      delta: new THREE.Vector3(),
    }),
    [],
  )

  // Horizon clip: the cone is cut by the observer's local horizon plane, so it only
  // shows the part of the view that is actually above ground.
  const horizonPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), [])

  // View cone geometry: apex at the origin, opening along +Y to a base ring at y=1,
  // so position=observer + quaternion(UP->dir) + scale(r,L,r) does the right thing.
  const coneGeom = useMemo(() => {
    const g = new THREE.ConeGeometry(1, 1, 48, 1, true)
    g.rotateX(Math.PI)
    g.translate(0, 0.5, 0)
    return g
  }, [])

  // Sight line, built imperatively so its 2 vertices can be rewritten per frame.
  const sightLine = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
    const m = new THREE.LineDashedMaterial({
      color: '#ffd9a0',
      transparent: true,
      opacity: 0.95,
      dashSize: 3,
      gapSize: 1.8,
      depthWrite: false,
    })
    const line = new THREE.Line(g, m)
    line.frustumCulled = false
    line.visible = false
    line.renderOrder = 4
    return line
  }, [])

  // Orbit paths, sampled once around the current epoch.
  const orbitPaths = useMemo(() => {
    const t0 = astroTime(useStore.getState().timeMs)
    return PLANETS.map((p) => {
      const days = p.periodYears * 365.25
      const pts: THREE.Vector3[] = []
      const N = 200
      for (let i = 0; i <= N; i++) {
        const tt = t0.AddDays(-days / 2 + (days * i) / N)
        pts.push(helioToScene(A.HelioVector(p.body, tt), new THREE.Vector3()).clone())
      }
      return { name: p.name, color: p.color, pts }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const moonRingPts = useMemo(() => circlePoints(MOON_VIS_DIST), [])

  useFrame(() => {
    const { timeMs, location, skyCam, selection, focus } = useStore.getState()
    const time = astroTime(timeMs)
    const obs = makeObserver(location.lat, location.lon)
    const s = scratch

    // Earth: position along orbit + rotation from sidereal time.
    helioToScene(A.HelioVector(A.Body.Earth, time), s.earthPos)
    const eg = earthGroup.current
    if (eg) {
      eg.matrixAutoUpdate = false
      earthOrientation(time, s.m4)
      s.m4.setPosition(s.earthPos)
      eg.matrix.copy(s.m4)
    }
    earthAnchor.current?.position.copy(s.earthPos)

    // Planets.
    for (const p of PLANETS) {
      if (p.name === 'Earth') continue
      const grp = planetRefs.current[p.name]
      if (!grp) continue
      helioToScene(A.HelioVector(p.body, time), grp.position)
    }

    // Moon: true direction from Earth, compressed distance.
    const gv = A.GeoVector(A.Body.Moon, time, true)
    eqjxyzToSpace(gv.x, gv.y, gv.z, s.dir).normalize()
    s.moonPos.copy(s.earthPos).addScaledVector(s.dir, MOON_VIS_DIST)
    moonRef.current?.position.copy(s.moonPos)

    // Observer point on the globe -> world.
    latLonToLocal(location.lat, location.lon, EARTH_RADIUS * 1.005, s.obsWorld)
    if (eg) s.obsWorld.applyMatrix4(eg.matrix)

    // Horizon plane: keep only the half-space above the observer's local zenith plane.
    altazToSpaceDir(0, 90, time, obs, s.up)
    horizonPlane.normal.copy(s.up)
    horizonPlane.constant = -s.up.dot(s.obsWorld)

    // Line-of-sight cone matching the sky view's camera.
    const cone = coneRef.current
    if (cone) {
      altazToSpaceDir(skyCam.az, skyCam.alt, time, obs, s.dir)
      cone.position.copy(s.obsWorld)
      cone.quaternion.setFromUnitVectors(UP, s.dir)
      const r = Math.tan((skyCam.fov / 2) * DEG) * CONE_LENGTH
      cone.scale.set(r, CONE_LENGTH, r)
    }

    // Sight line + target reticle.
    let hasTarget = false
    if (selection) {
      if (selection.kind === 'planet') {
        if (selection.name === 'Sun') {
          s.target.set(0, 0, 0)
          hasTarget = true
        } else if (selection.name === 'Moon') {
          s.target.copy(s.moonPos)
          hasTarget = true
        } else {
          const grp = planetRefs.current[selection.name]
          if (grp) {
            s.target.copy(grp.position)
            hasTarget = true
          }
        }
      } else if (selection.kind === 'comet' || selection.kind === 'asteroid') {
        const jd = jdOf(time)
        const h =
          selection.kind === 'comet'
            ? cometHelioEcl(catalog.comets[selection.index], jd)
            : asteroidHelioEcl(catalog.asteroids[selection.index], jd)
        if (h.r < 80) {
          eclToScene(h.x, h.y, h.z, s.target)
          hasTarget = true
        }
      } else if (selection.kind === 'sat') {
        const p = satEciKm(catalog.sats[selection.index], time.date)
        if (p) {
          eqdxyzToSpace(p.x, p.y, p.z, time, s.target)
            .multiplyScalar(EARTH_RADIUS / 6371)
            .add(s.earthPos)
          hasTarget = true
        }
      } else {
        const dir = selectionEqjDir(selection, catalog, s.v)
        if (dir) {
          eqjxyzToSpace(dir.x, dir.y, dir.z, s.target).normalize().multiplyScalar(STAR_SHELL_RADIUS - 40)
          hasTarget = true
        }
      }
    }
    sightLine.visible = hasTarget
    const hl = highlightRef.current
    if (hl) hl.visible = hasTarget
    if (hasTarget) {
      const attr = sightLine.geometry.getAttribute('position') as THREE.BufferAttribute
      attr.setXYZ(0, s.obsWorld.x, s.obsWorld.y, s.obsWorld.z)
      attr.setXYZ(1, s.target.x, s.target.y, s.target.z)
      attr.needsUpdate = true
      sightLine.computeLineDistances()
      if (hl) {
        hl.position.copy(s.target)
        const dist = camera.position.distanceTo(s.target)
        hl.scale.setScalar(Math.min(220, Math.max(0.4, dist * 0.028)))
      }
    }

    // Labels: distance-proportional scale so they read at any zoom.
    for (const p of PLANETS) {
      const label = labelRefs.current[p.name]
      if (!label) continue
      const pos = p.name === 'Earth' ? s.earthPos : planetRefs.current[p.name]?.position
      if (!pos) continue
      label.position.set(pos.x, pos.y + p.radius * 1.6 + 0.4, pos.z)
      const dist = camera.position.distanceTo(label.position)
      label.scale.setScalar(Math.min(26, Math.max(0.5, dist * 0.011)))
    }

    // Camera follows the focused body without disturbing the orbit offset.
    const ctl = controlsRef.current
    if (ctl) {
      const focusPos = focus === 'earth' ? s.earthPos : s.v.set(0, 0, 0)
      s.delta.copy(focusPos).sub(ctl.target)
      if (s.delta.lengthSq() > 1e-12) {
        ctl.target.copy(focusPos)
        camera.position.add(s.delta)
      }
    }
  })

  const pick = (name: string) => (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6) return
    e.stopPropagation()
    setSelection({ kind: 'planet', name })
  }

  return (
    <>
      <ambientLight intensity={0.18} />
      <pointLight position={[0, 0, 0]} intensity={2.6} decay={0} color="#fff4e0" />

      {/* Sun */}
      <mesh onClick={pick('Sun')}>
        <sphereGeometry args={[5, 32, 32]} />
        <meshBasicMaterial color="#fff0c8" />
      </mesh>
      <sprite scale={[40, 40, 1]} renderOrder={1}>
        <spriteMaterial map={glowTexture('#ffe2a8')} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>

      {/* Orbits */}
      {show.orbits &&
        orbitPaths.map((o) => (
          <Line key={o.name} points={o.pts} color={o.color} transparent opacity={0.3} lineWidth={1} />
        ))}

      {/* Planets (Earth handled separately) */}
      {PLANETS.filter((p) => p.name !== 'Earth').map((p) => (
        <group
          key={p.name}
          ref={(el) => {
            planetRefs.current[p.name] = el
          }}
        >
          <mesh onClick={pick(p.name)}>
            <sphereGeometry args={[p.radius, 32, 32]} />
            <meshStandardMaterial color={p.color} roughness={0.85} />
          </mesh>
          {p.name === 'Saturn' && (
            <mesh rotation={[-Math.PI / 2 + 0.47, 0, 0]}>
              <ringGeometry args={[p.radius * 1.3, p.radius * 2, 48]} />
              <meshBasicMaterial color="#d8c49a" side={THREE.DoubleSide} transparent opacity={0.45} depthWrite={false} />
            </mesh>
          )}
        </group>
      ))}

      {/* Earth: rotating frame */}
      <group ref={earthGroup}>
        <Suspense fallback={<EarthFallback />}>
          <EarthMesh />
        </Suspense>
        {/* Observer pin */}
        <mesh position={latLonToLocal(location.lat, location.lon, EARTH_RADIUS * 1.005)}>
          <sphereGeometry args={[0.07, 12, 12]} />
          <meshBasicMaterial color="#ffd9a0" />
        </mesh>
        <ObserverPin />
      </group>

      {/* Earth-anchored, non-rotating teaching aids */}
      <group ref={earthAnchor}>
        {show.dome && <Dome />}
        <Line points={moonRingPts} color="#6b7689" transparent opacity={0.18} lineWidth={1} />
      </group>

      {/* Moon */}
      <group ref={moonRef}>
        <mesh onClick={pick('Moon')}>
          <sphereGeometry args={[0.55, 24, 24]} />
          <meshStandardMaterial color="#c9ced8" roughness={1} />
        </mesh>
      </group>

      {/* Line-of-sight cone (apex at observer, axis = sky-view camera) */}
      <mesh ref={coneRef} geometry={coneGeom} renderOrder={3}>
        <meshBasicMaterial
          color="#ffd9a0"
          transparent
          opacity={0.13}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          clippingPlanes={[horizonPlane]}
        />
      </mesh>

      <MovingBodiesSpace catalog={catalog} />

      <primitive object={sightLine} />

      <sprite ref={highlightRef} visible={false} renderOrder={5}>
        <spriteMaterial map={reticleTexture('#7fd4e4')} transparent depthWrite={false} depthTest={false} />
      </sprite>

      {/* Labels */}
      {show.labels &&
        PLANETS.map((p) => (
          <Billboard
            key={p.name}
            ref={(el) => {
              labelRefs.current[p.name] = el
            }}
          >
            <Text font={MONO_FONT} fontSize={1.15} color={p.color} fillOpacity={0.85} anchorY="bottom">
              {p.name.toUpperCase()}
            </Text>
          </Billboard>
        ))}

      {/* Distant star shell — the sky as a 'flat' backdrop at fixed radius */}
      <group matrix={EQJ_TO_SPACE_MATRIX} matrixAutoUpdate={false}>
        <StarPoints
          catalog={catalog}
          radius={STAR_SHELL_RADIUS}
          sizeScale={0.75}
          opacity={0.9}
          onSelect={(i) => setSelection({ kind: 'star', index: i })}
        />
        {show.constellations && <ShellConstellations catalog={catalog} />}
        {show.messier && <ShellMessier catalog={catalog} onSelect={(i) => setSelection({ kind: 'messier', index: i })} />}
      </group>

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.1}
        minDistance={4.5}
        maxDistance={2200}
        enablePan={false}
      />
    </>
  )
}

/** Faint geographic-pole axis line so Earth's tilt reads clearly. */
function ObserverPin() {
  const pts = useMemo(
    () => [new THREE.Vector3(0, -EARTH_RADIUS * 1.8, 0), new THREE.Vector3(0, EARTH_RADIUS * 1.8, 0)],
    [],
  )
  return <Line points={pts} color="#7fd4e4" transparent opacity={0.4} lineWidth={1} dashed dashSize={0.35} gapSize={0.25} />
}

function ShellConstellations({ catalog }: { catalog: Catalog }) {
  const geometry = useMemo(() => {
    const pos = new Float32Array(catalog.conLines.length)
    for (let i = 0; i < pos.length; i++) pos[i] = catalog.conLines[i] * (STAR_SHELL_RADIUS - 20)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return g
  }, [catalog])
  const material = useMemo(
    () => new THREE.LineBasicMaterial({ color: '#e8b873', transparent: true, opacity: 0.09, depthWrite: false }),
    [],
  )
  return <lineSegments geometry={geometry} material={material} />
}

function ShellMessier({ catalog, onSelect }: { catalog: Catalog; onSelect: (i: number) => void }) {
  const geometry = useMemo(() => {
    const pos = new Float32Array(catalog.messierEqj.length)
    for (let i = 0; i < pos.length; i++) pos[i] = catalog.messierEqj[i] * (STAR_SHELL_RADIUS - 30)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return g
  }, [catalog])
  const material = useMemo(
    () =>
      new THREE.PointsMaterial({
        map: ringTexture('#7fd4e4'),
        size: 11,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    [],
  )
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
