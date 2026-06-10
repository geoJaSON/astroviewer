import type { Catalog } from '../data/catalog'
import { astroTime, makeObserver } from '../astro/frames'
import { selectionAltAz } from '../astro/selection'
import { useStore, type Selection } from './store'

/** Point the sky-view camera at the selection's current position. */
export function slewSkyToSelection(sel: Selection, catalog: Catalog): void {
  const { timeMs, location, setSkyCam } = useStore.getState()
  const { az, alt } = selectionAltAz(sel, catalog, astroTime(timeMs), makeObserver(location.lat, location.lon))
  setSkyCam({ az, alt: Math.min(89.9, Math.max(-30, alt)) })
}
