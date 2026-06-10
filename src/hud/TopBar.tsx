import { useEffect, useMemo, useRef, useState } from 'react'
import type { Catalog } from '../data/catalog'
import { SKY_BODIES } from '../astro/bodies'
import { formatLatLon } from '../astro/format'
import { slewSkyToSelection } from '../state/actions'
import { useStore, type Selection, type ShowFlags } from '../state/store'
import { TonightPanel } from './TonightPanel'

const PRESETS = [
  { name: 'New York', lat: 40.7128, lon: -74.006 },
  { name: 'London', lat: 51.5074, lon: -0.1278 },
  { name: 'Tokyo', lat: 35.6762, lon: 139.6503 },
  { name: 'Sydney', lat: -33.8688, lon: 151.2093 },
  { name: 'Nairobi', lat: -1.2864, lon: 36.8172 },
  { name: 'Denver', lat: 39.7392, lon: -104.9903 },
  { name: 'Reykjavík', lat: 64.1466, lon: -21.9426 },
  { name: 'Quito', lat: -0.1807, lon: -78.4678 },
  { name: 'McMurdo Station', lat: -77.8419, lon: 166.6863 },
]

const TOGGLES: { key: keyof ShowFlags; label: string }[] = [
  { key: 'constellations', label: 'LINES' },
  { key: 'labels', label: 'LABELS' },
  { key: 'messier', label: 'MESSIER' },
  { key: 'orbits', label: 'ORBITS' },
  { key: 'dome', label: 'DOME' },
  { key: 'minor', label: 'COMETS' },
  { key: 'sats', label: 'SATS' },
]

function LocationControl() {
  const location = useStore((s) => s.location)
  const setLocation = useStore((s) => s.setLocation)
  const [open, setOpen] = useState(false)
  const [lat, setLat] = useState(String(location.lat))
  const [lon, setLon] = useState(String(location.lon))
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLat(location.lat.toFixed(4))
    setLon(location.lon.toFixed(4))
  }, [location])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const applyManual = () => {
    const la = parseFloat(lat)
    const lo = parseFloat(lon)
    if (isFinite(la) && isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180) {
      setLocation({ lat: la, lon: lo, name: 'Custom' })
      setOpen(false)
    }
  }

  const geolocate = () => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude, name: 'My location' })
        setOpen(false)
      },
      () => {},
    )
  }

  return (
    <div className="loc-control" ref={rootRef}>
      <button className="loc-button" onClick={() => setOpen(!open)}>
        <span className="loc-name">{location.name}</span>
        <span className="loc-coords">{formatLatLon(location.lat, location.lon)}</span>
      </button>
      {open && (
        <div className="loc-popover">
          <div className="loc-presets">
            {PRESETS.map((p) => (
              <button
                key={p.name}
                className={`loc-preset${p.name === location.name ? ' active' : ''}`}
                onClick={() => {
                  setLocation(p)
                  setOpen(false)
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
          <div className="loc-manual">
            <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="lat" aria-label="latitude" />
            <input value={lon} onChange={(e) => setLon(e.target.value)} placeholder="lon" aria-label="longitude" />
            <button onClick={applyManual}>SET</button>
            <button onClick={geolocate} title="Use device location">⌖</button>
          </div>
        </div>
      )}
    </div>
  )
}

interface SearchEntry {
  label: string
  sub: string
  key: string
  sel: Selection
  mag: number
}

function Search({ catalog }: { catalog: Catalog }) {
  const setSelection = useStore((s) => s.setSelection)
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const index = useMemo<SearchEntry[]>(() => {
    const out: SearchEntry[] = []
    for (const b of SKY_BODIES) {
      const sub = b.name === 'Sun' ? 'Star' : b.name === 'Moon' ? 'Moon of Earth' : 'Planet'
      out.push({ label: b.name, sub, key: b.name.toLowerCase(), sel: { kind: 'planet', name: b.name }, mag: -30 })
    }
    catalog.messier.forEach((m, i) => {
      out.push({
        label: `M${m.m} · ${m.name}`,
        sub: `${m.type} · ${m.con}`,
        key: `m${m.m} messier ${m.m} ${m.name.toLowerCase()} ${m.type.toLowerCase()}`,
        sel: { kind: 'messier', index: i },
        mag: m.mag,
      })
    })
    for (const [idxStr, name] of Object.entries(catalog.starNames)) {
      const idx = +idxStr
      const con = catalog.starCons[idx]
      out.push({
        label: name,
        sub: `Star${con ? ` · ${con}` : ''} · mag ${catalog.stars[idx].mag.toFixed(1)}`,
        key: name.toLowerCase(),
        sel: { kind: 'star', index: idx },
        mag: catalog.stars[idx].mag,
      })
    }
    catalog.sats.forEach((s, i) => {
      out.push({
        label: s.name,
        sub: `Satellite · NORAD ${s.catnr}`,
        key: `${s.name.toLowerCase()} satellite station`,
        sel: { kind: 'sat', index: i },
        mag: -25,
      })
    })
    catalog.comets.forEach((c, i) => {
      out.push({
        label: c.name,
        sub: 'Comet',
        key: `comet ${c.name.toLowerCase()}`,
        sel: { kind: 'comet', index: i },
        mag: c.H,
      })
    })
    catalog.asteroids.forEach((a, i) => {
      out.push({
        label: a.name,
        sub: 'Asteroid',
        key: `asteroid ${a.name.toLowerCase()}`,
        sel: { kind: 'asteroid', index: i },
        mag: a.H,
      })
    })
    return out
  }, [catalog])

  const results = useMemo(() => {
    const nq = q.trim().toLowerCase()
    if (!nq) return []
    const scored: { e: SearchEntry; score: number }[] = []
    for (const e of index) {
      const starts = e.key.split(/[\s·]+/).some((tok) => tok.startsWith(nq))
      if (starts) scored.push({ e, score: 0 })
      else if (e.key.includes(nq)) scored.push({ e, score: 1 })
    }
    scored.sort((a, b) => a.score - b.score || a.e.mag - b.e.mag)
    return scored.slice(0, 8).map((s) => s.e)
  }, [q, index])

  useEffect(() => setHi(0), [q])

  const choose = (e: SearchEntry) => {
    setSelection(e.sel)
    slewSkyToSelection(e.sel, catalog)
    setQ('')
    inputRef.current?.blur()
  }

  return (
    <div className="search">
      <input
        id="object-search"
        ref={inputRef}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="SEARCH OBJECTS  ( / )"
        spellCheck={false}
        autoComplete="off"
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setHi((h) => Math.min(results.length - 1, h + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHi((h) => Math.max(0, h - 1))
          } else if (e.key === 'Enter' && results[hi]) {
            choose(results[hi])
          } else if (e.key === 'Escape') {
            setQ('')
            inputRef.current?.blur()
          }
        }}
      />
      {results.length > 0 && (
        <ul className="search-results">
          {results.map((r, i) => (
            <li key={`${r.label}-${i}`}>
              <button
                className={i === hi ? 'hi' : ''}
                onMouseEnter={() => setHi(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  choose(r)
                }}
              >
                <span className="sr-label">{r.label}</span>
                <span className="sr-sub">{r.sub}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function TopBar({ catalog, onHelp }: { catalog: Catalog; onHelp: () => void }) {
  const show = useStore((s) => s.show)
  const toggleShow = useStore((s) => s.toggleShow)
  return (
    <header className="topbar">
      <div className="brand">
        <h1>Astroviewer</h1>
        <span className="brand-sub">THE SKY &amp; THE SPACE BEHIND IT</span>
      </div>
      <LocationControl />
      <Search catalog={catalog} />
      <TonightPanel />
      <nav className="toggles">
        {TOGGLES.map((t) => (
          <button
            key={t.key}
            className={`chip${show[t.key] ? ' on' : ''}`}
            onClick={() => toggleShow(t.key)}
          >
            {t.label}
          </button>
        ))}
        <button className="chip help-chip" onClick={onHelp} title="Keyboard shortcuts (?)">
          ?
        </button>
      </nav>
    </header>
  )
}
