import { useEffect, useMemo, useRef } from 'react'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { Catalog } from '../data/catalog'

const VERT = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
uniform float uScale;
varying vec3 vColor;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale;
  gl_Position = projectionMatrix * mv;
}
`

const FRAG = /* glsl */ `
uniform float uOpacity;
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  float a = smoothstep(1.0, 0.3, d) * uOpacity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor, a);
}
`

interface Props {
  catalog: Catalog
  radius: number
  sizeScale?: number
  opacity?: number
  /** Receives the material so a parent's frame loop can drive uOpacity (daylight fade). */
  materialRef?: React.MutableRefObject<THREE.ShaderMaterial | null>
  onSelect?: (index: number) => void
}

export function StarPoints({ catalog, radius, sizeScale = 1, opacity = 1, materialRef, onSelect }: Props) {
  const dpr = useThree((s) => s.viewport.dpr)
  const localMat = useRef<THREE.ShaderMaterial | null>(null)

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const pos = new Float32Array(catalog.starCount * 3)
    for (let i = 0; i < pos.length; i++) pos[i] = catalog.starEqj[i] * radius
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aColor', new THREE.BufferAttribute(catalog.starColor, 3))
    g.setAttribute('aSize', new THREE.BufferAttribute(catalog.starSize, 1))
    return g
  }, [catalog, radius])

  const material = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uScale: { value: sizeScale * dpr },
        uOpacity: { value: opacity },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    localMat.current = m
    if (materialRef) materialRef.current = m
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    material.uniforms.uScale.value = sizeScale * dpr
  }, [material, sizeScale, dpr])

  useEffect(() => {
    return () => {
      geometry.dispose()
      material.dispose()
    }
  }, [geometry, material])

  const handleClick = onSelect
    ? (e: ThreeEvent<MouseEvent>) => {
        if (e.delta > 6 || e.index === undefined) return
        e.stopPropagation()
        onSelect(e.index)
      }
    : undefined

  return <points geometry={geometry} material={material} onClick={handleClick} />
}
