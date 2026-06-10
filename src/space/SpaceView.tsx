import { Canvas } from '@react-three/fiber'
import type { Catalog } from '../data/catalog'
import { useStore } from '../state/store'
import { SpaceScene } from './SpaceScene'

function FocusToggle() {
  const focus = useStore((s) => s.focus)
  const setFocus = useStore((s) => s.setFocus)
  return (
    <button
      className="panel-button focus-toggle"
      onClick={() => setFocus(focus === 'earth' ? 'sun' : 'earth')}
      title="Toggle camera focus"
    >
      FOCUS · {focus === 'earth' ? 'EARTH' : 'SUN'}
    </button>
  )
}

export function SpaceView({ catalog }: { catalog: Catalog }) {
  return (
    <div className="view-root">
      <Canvas
        camera={{ fov: 50, near: 0.5, far: 16000, position: [0, 110, 260] }}
        raycaster={{ params: { Points: { threshold: 55 }, Line: { threshold: 1 }, Mesh: {}, LOD: {}, Sprite: {} } }}
        gl={{ antialias: true, localClippingEnabled: true }}
      >
        <SpaceScene catalog={catalog} />
      </Canvas>
      <div className="panel-readout">
        <span>DISTANCES COMPRESSED · r ∝ d^0.55</span>
        <span>SIZES EXAGGERATED</span>
      </div>
      <FocusToggle />
    </div>
  )
}
