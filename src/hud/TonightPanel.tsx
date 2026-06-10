// "Tonight" planning card: sun/twilight/moon times for the current observer.
// Computed when opened (these are iterative searches, not per-frame math).
import { useEffect, useMemo, useRef, useState } from 'react'
import * as A from 'astronomy-engine'
import { astroTime, makeObserver } from '../astro/frames'
import { useStore } from '../state/store'

function fmt(t: A.AstroTime | null): string {
  if (!t) return '—'
  const d = t.date
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

function moonPhaseName(angleDeg: number): string {
  const names = [
    'New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous',
    'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent',
  ]
  return names[Math.round((((angleDeg % 360) + 360) % 360) / 45) % 8]
}

export function TonightPanel() {
  const [open, setOpen] = useState(false)
  const location = useStore((s) => s.location)
  const minute = useStore((s) => Math.floor(s.timeMs / 60000))
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const rows = useMemo(() => {
    if (!open) return []
    try {
      const time = astroTime(minute * 60000)
      const obs = makeObserver(location.lat, location.lon)
      const sunset = A.SearchRiseSet(A.Body.Sun, obs, -1, time, 2)
      const duskCivil = A.SearchAltitude(A.Body.Sun, obs, -1, time, 2, -6)
      const duskAstro = A.SearchAltitude(A.Body.Sun, obs, -1, time, 2, -18)
      const dawnAstro = duskAstro ? A.SearchAltitude(A.Body.Sun, obs, +1, duskAstro, 2, -18) : null
      const sunrise = A.SearchRiseSet(A.Body.Sun, obs, +1, time, 2)
      const moonrise = A.SearchRiseSet(A.Body.Moon, obs, +1, time, 2)
      const moonset = A.SearchRiseSet(A.Body.Moon, obs, -1, time, 2)
      const ill = A.Illumination(A.Body.Moon, time)
      const out: [string, string][] = [
        ['SUNSET', fmt(sunset)],
        ['CIVIL DUSK', fmt(duskCivil)],
        ['DARK (ASTRO)', fmt(duskAstro)],
        ['DARK ENDS', fmt(dawnAstro)],
        ['SUNRISE', fmt(sunrise)],
        ['MOONRISE', fmt(moonrise)],
        ['MOONSET', fmt(moonset)],
        ['MOON', `${moonPhaseName(A.MoonPhase(time))} · ${Math.round(ill.phase_fraction * 100)}%`],
      ]
      return out
    } catch {
      return [['ERROR', 'no events found']] as [string, string][]
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, Math.floor(minute / 15), location])

  return (
    <div className="loc-control" ref={rootRef}>
      <button className="tonight-button" onClick={() => setOpen(!open)}>
        TONIGHT
      </button>
      {open && (
        <div className="loc-popover tonight-popover">
          <div className="tonight-head">
            {location.name} · times local
          </div>
          {rows.map(([k, v]) => (
            <div key={k} className="info-row">
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
          <p className="tonight-note">
            Best deep-sky viewing falls between DARK (ASTRO) and DARK ENDS — ideally while the Moon is down.
          </p>
        </div>
      )}
    </div>
  )
}
