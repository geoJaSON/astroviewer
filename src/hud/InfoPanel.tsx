import { useMemo } from 'react'
import * as A from 'astronomy-engine'
import type { Catalog } from '../data/catalog'
import { BODY_BY_NAME, RADII_KM } from '../astro/bodies'
import {
  formatAngSize,
  formatAu,
  formatAz,
  formatDec,
  formatDeg,
  formatDistanceLy,
  formatKm,
  formatRA,
  lightTravelText,
} from '../astro/format'
import { astroTime, eclxyzToEqj, eqjToRaDec, makeObserver } from '../astro/frames'
import { asteroidMagnitude, cometMagnitude, cometPeriodDays } from '../astro/kepler'
import { nextPass, satEciKm, satLookAngles } from '../astro/satellites'
import { minorBodyGeoEcl, selectionAltAz, selectionTitle } from '../astro/selection'
import { slewSkyToSelection } from '../state/actions'
import { useStore } from '../state/store'

function moonPhaseName(angleDeg: number): string {
  const names = [
    'New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous',
    'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent',
  ]
  return names[Math.round((((angleDeg % 360) + 360) % 360) / 45) % 8]
}

interface Row {
  label: string
  value: string
}

export function InfoPanel({ catalog }: { catalog: Catalog | null }) {
  const sel = useStore((s) => s.selection)
  const sec = useStore((s) => Math.floor(s.timeMs / 1000))
  const location = useStore((s) => s.location)
  const setSelection = useStore((s) => s.setSelection)
  const track = useStore((s) => s.track)
  const setTrack = useStore((s) => s.setTrack)

  // Rise/set searches are comparatively heavy: refresh per displayed minute.
  const minute = Math.floor(sec / 60)

  // Next satellite pass: a 48 h SGP4 scan; refresh every 10 displayed minutes.
  const tenMinute = Math.floor(sec / 600)
  const satPass = useMemo(() => {
    if (!sel || sel.kind !== 'sat' || !catalog) return null
    return nextPass(catalog.sats[sel.index], tenMinute * 600000, location.lat, location.lon)
  }, [sel, tenMinute, location, catalog])

  const riseSet = useMemo(() => {
    if (!sel || sel.kind !== 'planet') return null
    try {
      const time = astroTime(minute * 60000)
      const obs = makeObserver(location.lat, location.lon)
      const body = BODY_BY_NAME[sel.name]
      const rise = A.SearchRiseSet(body, obs, +1, time, 2)
      const set = A.SearchRiseSet(body, obs, -1, time, 2)
      const fmt = (t: A.AstroTime | null) => {
        if (!t) return '—'
        const d = t.date
        const p = (n: number) => String(n).padStart(2, '0')
        return `${p(d.getHours())}:${p(d.getMinutes())}`
      }
      return { rise: fmt(rise), set: fmt(set) }
    } catch {
      return null
    }
  }, [sel, minute, location])

  if (!sel || !catalog) return null

  const time = astroTime(sec * 1000)
  const obs = makeObserver(location.lat, location.lon)
  const { title, sub } = selectionTitle(sel, catalog)
  const { az, alt } = selectionAltAz(sel, catalog, time, obs)
  const above = alt > 0

  const rows: Row[] = []
  rows.push({ label: 'ALTITUDE', value: formatDeg(alt) })
  rows.push({ label: 'AZIMUTH', value: formatAz(az) })

  let note: string | null = null

  if (sel.kind === 'planet') {
    try {
      const body = BODY_BY_NAME[sel.name]
      const gv = A.GeoVector(body, time, true)
      const au = Math.hypot(gv.x, gv.y, gv.z)
      rows.push({ label: 'DISTANCE', value: formatAu(au) })
      rows.push({ label: 'LIGHT TIME', value: lightTravelText(au) })
      if (sel.name !== 'Sun' && sel.name !== 'Moon') {
        const ill = A.Illumination(body, time)
        rows.push({ label: 'MAGNITUDE', value: ill.mag.toFixed(1) })
      }
      if (sel.name === 'Moon') {
        const ill = A.Illumination(body, time)
        rows.push({ label: 'PHASE', value: moonPhaseName(A.MoonPhase(time)) })
        rows.push({ label: 'ILLUMINATED', value: `${Math.round(ill.phase_fraction * 100)}%` })
      }
      if (riseSet) {
        rows.push({ label: 'RISE', value: riseSet.rise })
        rows.push({ label: 'SET', value: riseSet.set })
      }
      const radius = RADII_KM[sel.name]
      if (radius) rows.push({ label: 'ANG. SIZE', value: formatAngSize(radius, au) })
      const eq = A.Equator(body, time, obs, true, true)
      rows.push({ label: 'RA / DEC', value: `${formatRA(eq.ra)} ${formatDec(eq.dec)}` })
    } catch {
      /* body outside model range */
    }
  } else if (sel.kind === 'comet' || sel.kind === 'asteroid') {
    const g = minorBodyGeoEcl(sel, catalog, time)
    const eqj = eclxyzToEqj(g.x, g.y, g.z)
    const { ra, dec } = eqjToRaDec(eqj.x, eqj.y, eqj.z)
    rows.push({ label: 'DISTANCE', value: formatAu(g.delta) })
    rows.push({ label: 'FROM SUN', value: formatAu(g.r) })
    if (sel.kind === 'comet') {
      const c = catalog.comets[sel.index]
      rows.push({ label: 'EST. MAG', value: `~${cometMagnitude(c, g.r, g.delta).toFixed(1)}` })
      const tpDate = new Date((c.tpJd - 2440587.5) * 86400000)
      rows.push({ label: 'PERIHELION', value: tpDate.toISOString().slice(0, 10) })
      const period = cometPeriodDays(c)
      if (period) rows.push({ label: 'PERIOD', value: `${(period / 365.25).toFixed(1)} yr` })
    } else {
      const a = catalog.asteroids[sel.index]
      rows.push({ label: 'EST. MAG', value: `~${asteroidMagnitude(a.H, g.r, g.delta).toFixed(1)}` })
    }
    rows.push({ label: 'RA / DEC', value: `${formatRA(ra)} ${formatDec(dec)}` })
    if (above) note = 'Position computed from MPC/JPL osculating elements.'
  } else if (sel.kind === 'sat') {
    const s = catalog.sats[sel.index]
    const look = satLookAngles(s, time.date, location.lat, location.lon)
    if (look) rows.push({ label: 'RANGE', value: formatKm(look.rangeKm) })
    const eci = satEciKm(s, time.date)
    if (eci) rows.push({ label: 'ORBIT ALT', value: formatKm(Math.hypot(eci.x, eci.y, eci.z) - 6371) })
    rows.push({ label: 'PERIOD', value: `${s.periodMin.toFixed(1)} min` })
    if (satPass) {
      const d = new Date(satPass.riseMs)
      const p = (n: number) => String(n).padStart(2, '0')
      rows.push({
        label: 'NEXT PASS',
        value: `${p(d.getHours())}:${p(d.getMinutes())} · max ${Math.round(satPass.maxAlt)}°`,
      })
    } else {
      rows.push({ label: 'NEXT PASS', value: 'none in 48 h' })
    }
    if (above) note = 'Pass times ignore sunlight — a visible pass also needs a dark sky and a sunlit satellite.'
  } else {
    const row = sel.kind === 'star' ? catalog.stars[sel.index] : catalog.messier[sel.index]
    rows.push({ label: 'RA / DEC', value: `${formatRA(row.ra)} ${formatDec(row.dec)}` })
    rows.push({ label: 'MAGNITUDE', value: row.mag.toFixed(1) })
    if (sel.kind === 'star') {
      const dist = catalog.stars[sel.index].dist
      if (dist > 0) {
        const ly = dist * 3.26156
        rows.push({ label: 'DISTANCE', value: formatDistanceLy(dist) })
        const year = new Date(sec * 1000).getUTCFullYear() - Math.round(ly)
        note = `The light you see left this star around ${year < 0 ? `${-year} BCE` : year}.`
      }
    }
  }

  if (!above) {
    note = 'Below the horizon — in the space view, the line of sight passes through the Earth.'
  }

  return (
    <aside className="info-card">
      <button className="info-close" onClick={() => setSelection(null)} aria-label="close">
        ×
      </button>
      <h2 className="info-title">{title}</h2>
      <div className="info-sub">{sub}</div>
      <div className={`info-status${above ? ' up' : ' down'}`}>
        {above ? '● ABOVE HORIZON' : '○ BELOW HORIZON'}
      </div>
      <dl className="info-grid">
        {rows.map((r) => (
          <div key={r.label} className="info-row">
            <dt>{r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        ))}
      </dl>
      {note && <p className="info-note">{note}</p>}
      <div className="info-actions">
        <button onClick={() => slewSkyToSelection(sel, catalog)}>⌖ POINT SKY</button>
        <button className={track ? 'on' : ''} onClick={() => setTrack(!track)}>
          TRACK {track ? 'ON' : 'OFF'}
        </button>
      </div>
    </aside>
  )
}
