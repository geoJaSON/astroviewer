import * as A from 'astronomy-engine'

export interface PlanetDef {
  body: A.Body
  name: string
  color: string
  /** Space-view sphere radius, scene units (exaggerated for visibility). */
  radius: number
  periodYears: number
}

export const PLANETS: PlanetDef[] = [
  { body: A.Body.Mercury, name: 'Mercury', color: '#c9b8a8', radius: 0.45, periodYears: 0.2408 },
  { body: A.Body.Venus, name: 'Venus', color: '#e8d5a8', radius: 0.85, periodYears: 0.6152 },
  { body: A.Body.Earth, name: 'Earth', color: '#7fb8e8', radius: 2.2, periodYears: 1 },
  { body: A.Body.Mars, name: 'Mars', color: '#e8895f', radius: 0.6, periodYears: 1.8808 },
  { body: A.Body.Jupiter, name: 'Jupiter', color: '#e0b890', radius: 1.9, periodYears: 11.862 },
  { body: A.Body.Saturn, name: 'Saturn', color: '#e6cf9f', radius: 1.65, periodYears: 29.457 },
  { body: A.Body.Uranus, name: 'Uranus', color: '#9fd8df', radius: 1.15, periodYears: 84.02 },
  { body: A.Body.Neptune, name: 'Neptune', color: '#6f9fe8', radius: 1.1, periodYears: 164.79 },
  { body: A.Body.Pluto, name: 'Pluto', color: '#cdb9a5', radius: 0.35, periodYears: 248.09 },
]

export interface SkyBodyDef {
  body: A.Body
  name: string
  color: string
  /** Sprite size in sky-view world units (sky sphere radius ~880). */
  size: number
}

/** Bodies drawn on the sky dome (everything except Earth itself). */
export const SKY_BODIES: SkyBodyDef[] = [
  { body: A.Body.Sun, name: 'Sun', color: '#fff2d5', size: 34 },
  { body: A.Body.Moon, name: 'Moon', color: '#e8ecf2', size: 28 },
  { body: A.Body.Mercury, name: 'Mercury', color: '#c9b8a8', size: 7 },
  { body: A.Body.Venus, name: 'Venus', color: '#f0e0b8', size: 12 },
  { body: A.Body.Mars, name: 'Mars', color: '#e8895f', size: 9 },
  { body: A.Body.Jupiter, name: 'Jupiter', color: '#e0c0a0', size: 12 },
  { body: A.Body.Saturn, name: 'Saturn', color: '#e6cf9f', size: 10 },
  { body: A.Body.Uranus, name: 'Uranus', color: '#9fd8df', size: 6.5 },
  { body: A.Body.Neptune, name: 'Neptune', color: '#6f9fe8', size: 6.5 },
  { body: A.Body.Pluto, name: 'Pluto', color: '#cdb9a5', size: 5 },
]

export const BODY_BY_NAME: Record<string, A.Body> = Object.fromEntries(
  SKY_BODIES.map((b) => [b.name, b.body]),
)
BODY_BY_NAME.Earth = A.Body.Earth

/** Physical radii in km, for angular-size readouts. */
export const RADII_KM: Record<string, number> = {
  Sun: 695700,
  Moon: 1737.4,
  Mercury: 2439.7,
  Venus: 6051.8,
  Mars: 3389.5,
  Jupiter: 69911,
  Saturn: 58232,
  Uranus: 25362,
  Neptune: 24622,
  Pluto: 1188.3,
}
