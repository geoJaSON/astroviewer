import { create } from 'zustand'

export interface Location {
  lat: number
  lon: number
  name: string
}

export type Selection =
  | { kind: 'planet'; name: string }
  | { kind: 'star'; index: number }
  | { kind: 'messier'; index: number }
  | { kind: 'comet'; index: number }
  | { kind: 'asteroid'; index: number }
  | { kind: 'sat'; index: number }

export interface ShowFlags {
  constellations: boolean
  labels: boolean
  messier: boolean
  orbits: boolean
  dome: boolean
  /** Comets + bright asteroids. */
  minor: boolean
  sats: boolean
}

const DEFAULT_SHOW: ShowFlags = {
  constellations: true,
  labels: true,
  messier: true,
  orbits: true,
  dome: true,
  minor: true,
  sats: true,
}

export interface SkyCam {
  az: number
  alt: number
  fov: number
}

interface AppState {
  timeMs: number
  /** Simulation seconds per real second. 0 = paused. */
  speed: number
  lastSpeed: number
  location: Location
  selection: Selection | null
  /** Keep the sky camera centered on the selection as time runs. */
  track: boolean
  skyCam: SkyCam
  show: ShowFlags
  /** Sky panel width, percent. */
  split: number
  focus: 'earth' | 'sun'

  setTime: (ms: number) => void
  setSpeed: (s: number) => void
  togglePlay: () => void
  setLocation: (loc: Location) => void
  setSelection: (sel: Selection | null) => void
  setTrack: (on: boolean) => void
  setSkyCam: (cam: Partial<SkyCam>) => void
  toggleShow: (key: keyof ShowFlags) => void
  setSplit: (pct: number) => void
  setFocus: (f: 'earth' | 'sun') => void
}

const PERSIST_KEY = 'astroviewer-prefs'

interface Prefs {
  location?: Location
  show?: ShowFlags
  split?: number
  focus?: 'earth' | 'sun'
}

function loadPrefs(): Prefs {
  try {
    return JSON.parse(localStorage.getItem(PERSIST_KEY) ?? '{}') as Prefs
  } catch {
    return {}
  }
}

const prefs = loadPrefs()

export const useStore = create<AppState>()((set) => ({
  timeMs: Date.now(),
  speed: 1,
  lastSpeed: 1,
  location: prefs.location ?? { lat: 40.7128, lon: -74.006, name: 'New York' },
  selection: null,
  track: false,
  skyCam: { az: 180, alt: 30, fov: 70 },
  show: { ...DEFAULT_SHOW, ...(prefs.show ?? {}) },
  split: prefs.split ?? 50,
  focus: prefs.focus ?? 'earth',

  setTime: (ms) => set({ timeMs: ms }),
  setSpeed: (s) => set((st) => ({ speed: s, lastSpeed: s !== 0 ? s : st.lastSpeed })),
  togglePlay: () => set((st) => ({ speed: st.speed === 0 ? st.lastSpeed : 0 })),
  setLocation: (loc) => set({ location: loc }),
  setSelection: (sel) => set((st) => ({ selection: sel, track: sel ? st.track : false })),
  setTrack: (on) => set({ track: on }),
  setSkyCam: (cam) => set((st) => ({ skyCam: { ...st.skyCam, ...cam } })),
  toggleShow: (key) => set((st) => ({ show: { ...st.show, [key]: !st.show[key] } })),
  setSplit: (pct) => set({ split: Math.min(75, Math.max(25, pct)) }),
  setFocus: (f) => set({ focus: f }),
}))

// Persist lightweight preferences (not time/selection) with change detection,
// since the store notifies every animation frame while the clock runs.
let lastSaved = ''
let saveTimer: ReturnType<typeof setTimeout> | undefined
useStore.subscribe((s) => {
  const json = JSON.stringify({ location: s.location, show: s.show, split: s.split, focus: s.focus })
  if (json === lastSaved) return
  lastSaved = json
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(PERSIST_KEY, json)
    } catch {
      /* storage unavailable */
    }
  }, 400)
})

// Expose for dev tooling / smoke tests.
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__store = useStore
}

/** Advances simulation time with requestAnimationFrame. Mount once. */
export function startClock(): () => void {
  let raf = 0
  let last = performance.now()
  const tick = (now: number) => {
    const dt = Math.min(0.25, (now - last) / 1000)
    last = now
    const { speed, timeMs } = useStore.getState()
    if (speed !== 0) useStore.setState({ timeMs: timeMs + dt * speed * 1000 })
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(raf)
}
