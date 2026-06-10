export function formatRA(raHours: number): string {
  const h = Math.floor(raHours)
  const m = Math.round((raHours - h) * 60)
  return `${h}h ${String(m).padStart(2, '0')}m`
}

export function formatDec(decDeg: number): string {
  const sign = decDeg < 0 ? '−' : '+'
  const a = Math.abs(decDeg)
  const d = Math.floor(a)
  const m = Math.round((a - d) * 60)
  return `${sign}${d}° ${String(m).padStart(2, '0')}′`
}

export function formatDeg(d: number, digits = 1): string {
  return `${d.toFixed(digits)}°`
}

export function formatAz(az: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
  const idx = Math.round((((az % 360) + 360) % 360) / 22.5) % 16
  return `${az.toFixed(1)}° ${dirs[idx]}`
}

export function formatDistanceLy(distPc: number): string {
  const ly = distPc * 3.26156
  if (ly >= 1000) return `${(ly / 1000).toFixed(1)}k ly`
  return `${ly.toFixed(ly < 10 ? 1 : 0)} ly`
}

export function formatAu(au: number): string {
  if (au < 0.01) return `${(au * 149597870.7).toFixed(0)} km`
  return `${au.toFixed(au < 1 ? 3 : 2)} au`
}

export function lightTravelText(au: number): string {
  const sec = au * 499.005
  if (sec < 2) return `${sec.toFixed(2)} light-seconds`
  if (sec < 120) return `${sec.toFixed(1)} light-seconds`
  const min = sec / 60
  if (min < 120) return `${min.toFixed(1)} light-minutes`
  return `${(min / 60).toFixed(1)} light-hours`
}

/** Angular size from physical radius (km) and distance (au). */
export function formatAngSize(radiusKm: number, distAu: number): string {
  const deg = (2 * Math.asin(Math.min(1, radiusKm / (distAu * 149597870.7)))) * (180 / Math.PI)
  if (deg >= 1 / 60) return `${(deg * 60).toFixed(1)}′`
  return `${(deg * 3600).toFixed(1)}″`
}

export function formatKm(km: number): string {
  return `${Math.round(km).toLocaleString('en-US')} km`
}

export function formatUTC(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UT`
}

export function formatLocal(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export function formatLatLon(lat: number, lon: number): string {
  const la = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}`
  const lo = `${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`
  return `${la} ${lo}`
}
