import { useEffect, useRef, useState } from 'react'
import { loadCatalog, type Catalog } from './data/catalog'
import { InfoPanel } from './hud/InfoPanel'
import { TimeBar } from './hud/TimeBar'
import { TopBar } from './hud/TopBar'
import { SkyView } from './sky/SkyView'
import { SpaceView } from './space/SpaceView'
import { startClock, useStore } from './state/store'

function Divider() {
  const setSplit = useStore((s) => s.setSplit)
  const ref = useRef<HTMLDivElement>(null)

  const onPointerDown = (e: React.PointerEvent) => {
    ref.current?.setPointerCapture(e.pointerId)
    const parent = ref.current?.parentElement
    if (!parent) return
    const rect = parent.getBoundingClientRect()
    const move = (ev: PointerEvent) => setSplit(((ev.clientX - rect.left) / rect.width) * 100)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div className="divider" ref={ref} onPointerDown={onPointerDown}>
      <div className="divider-grip" />
    </div>
  )
}

const SHORTCUTS: [string, string][] = [
  ['/', 'search objects'],
  ['Space', 'play / pause time'],
  ['← →', 'step ±1 hour  (＋Shift: ±1 day)'],
  ['N', 'jump to now'],
  ['F', 'space view focus: Earth ⇄ Sun'],
  ['T', 'track selection in sky view'],
  ['Esc', 'clear selection'],
  ['?', 'toggle this help'],
]

function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="kbd-overlay" onClick={onClose}>
      <div className="kbd-card" onClick={(e) => e.stopPropagation()}>
        <h2>Keyboard</h2>
        <dl>
          {SHORTCUTS.map(([k, desc]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{desc}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}

function useKeyboardShortcuts(toggleHelp: () => void) {
  useEffect(() => {
    const HOUR = 3600_000
    const DAY = 24 * HOUR
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return
      const st = useStore.getState()
      switch (e.key) {
        case ' ':
          e.preventDefault()
          st.togglePlay()
          break
        case 'ArrowLeft':
          st.setTime(st.timeMs - (e.shiftKey ? DAY : HOUR))
          break
        case 'ArrowRight':
          st.setTime(st.timeMs + (e.shiftKey ? DAY : HOUR))
          break
        case 'n':
        case 'N':
          st.setTime(Date.now())
          break
        case 'f':
        case 'F':
          st.setFocus(st.focus === 'earth' ? 'sun' : 'earth')
          break
        case 't':
        case 'T':
          if (st.selection) st.setTrack(!st.track)
          break
        case 'Escape':
          st.setSelection(null)
          break
        case '/':
          e.preventDefault()
          document.getElementById('object-search')?.focus()
          break
        case '?':
          toggleHelp()
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleHelp])
}

function Loading({ error }: { error: string | null }) {
  return (
    <div className="loading">
      <h1>Astroviewer</h1>
      {error ? (
        <p className="loading-error">{error}</p>
      ) : (
        <p className="loading-msg">ACQUIRING CATALOGS<span className="ellipsis" /></p>
      )}
    </div>
  )
}

export default function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [help, setHelp] = useState(false)
  const split = useStore((s) => s.split)

  useKeyboardShortcuts(() => setHelp((h) => !h))

  useEffect(() => {
    let alive = true
    loadCatalog()
      .then((c) => alive && setCatalog(c))
      .catch((e) => alive && setError(String(e)))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => startClock(), [])

  if (!catalog) {
    return <Loading error={error} />
  }

  return (
    <div className="app">
      <TopBar catalog={catalog} onHelp={() => setHelp((h) => !h)} />
      <main className="panels">
        <section className="panel sky-panel" style={{ width: `${split}%` }}>
          <div className="panel-head amber">SKY · LOCAL HORIZON</div>
          <SkyView catalog={catalog} />
        </section>
        <Divider />
        <section className="panel space-panel">
          <div className="panel-head cyan">SPACE · SOLAR SYSTEM</div>
          <SpaceView catalog={catalog} />
        </section>
      </main>
      <InfoPanel catalog={catalog} />
      <TimeBar />
      {help && <ShortcutsHelp onClose={() => setHelp(false)} />}
    </div>
  )
}
