import type { Location } from './store'

function gpsErrorMessage(code: number): string {
  switch (code) {
    case 1:
      return 'Location permission denied'
    case 2:
      return 'Position unavailable'
    case 3:
      return 'Location request timed out'
    default:
      return 'Could not read GPS'
  }
}

function gpsLocation(): Promise<Location> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          name: 'My location',
        }),
      (err) => reject(new Error(gpsErrorMessage(err.code))),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60_000 },
    )
  })
}

async function ipLocation(): Promise<Location> {
  const res = await fetch('https://ipapi.co/json/')
  if (!res.ok) throw new Error('Network location lookup failed')
  const data = (await res.json()) as {
    latitude?: number
    longitude?: number
    city?: string
    region?: string
    error?: boolean
    reason?: string
  }
  if (data.error || data.latitude == null || data.longitude == null) {
    throw new Error(data.reason ?? 'Network location unavailable')
  }
  const place = [data.city, data.region].filter(Boolean).join(', ')
  return {
    lat: data.latitude,
    lon: data.longitude,
    name: place || 'Network location',
  }
}

/** Device GPS when available (HTTPS); otherwise approximate location from the client IP. */
export async function resolveDeviceLocation(): Promise<Location> {
  if (window.isSecureContext) {
    try {
      return await gpsLocation()
    } catch {
      /* fall through to IP lookup */
    }
  }
  return ipLocation()
}
