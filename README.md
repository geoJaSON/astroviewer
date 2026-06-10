# Astroviewer

**The sky & the space behind it.** A split-screen astronomy app: a Stellarium-style
sky view on the left, a 3D solar-system view on the right, linked by a shared
selection, observer location, and clock. Click a star, planet, or Messier object in
either panel and a line of sight is drawn from your location on the globe out to the
object — showing *where in space* the dot on the dome actually is.

Built to teach perspective: why Orion is a winter constellation, why planets
retrograde, why the "dome" of the sky is a projection of 3D space.

## Run it

```sh
npm install
npm run prepare-data   # downloads + preprocesses catalogs (one time)
npm run dev            # http://localhost:5173
```

## Small bodies & satellites

- **Satellites**: ISS, Tiangong, and Hubble via SGP4. TLEs are fetched live from
  Celestrak at startup (bundled snapshot as fallback — re-run `prepare-data` to
  refresh it). Selecting one shows range, orbital altitude, period, and the next
  pass above 10°; in the space view the orbit ring hugs the Earth at true scale.
- **Comets**: the ~40 currently relevant comets from the MPC orbit file, propagated
  from osculating elements (elliptic / parabolic / hyperbolic all handled —
  validated against JPL Horizons in `scripts/validate-kepler.mjs`). Selected comets
  draw their trajectory in the space view.
- **Asteroids**: Ceres, Pallas, Juno, Vesta, Hebe, Iris from JPL SBDB, with faint
  belt orbit rings.
- **Tonight** button: sunset, civil dusk, astronomical darkness window, sunrise,
  moonrise/set, and Moon phase for the current location (times in your device's
  timezone).
- Planet cards show **angular size** — the number that matters at the eyepiece.

## Quality of life

- **Search** (`/`): find any planet, named star, or Messier object ("vega", "m31",
  "saturn") — selecting a result slews the sky view to it.
- **Point & track**: buttons on the info card. *Point sky* slews once; *Track* keeps
  the object centered while time runs (great for retrograde loops). Dragging the
  sky releases tracking.
- **Keyboard**: `Space` play/pause · `←`/`→` ±1 h (`Shift` ±1 day) · `N` now ·
  `F` Earth/Sun focus · `T` track · `Esc` deselect · `?` help overlay.
- Location, layer toggles, split position, and focus persist across reloads.

## Things to try

- **Retrograde motion**: select Mars, set the rate to `1 day/s`, and watch the sky
  view trace the loop while the space view shows Earth overtaking Mars.
- **Seasonal visibility**: select M42 (Orion Nebula) in June — the info panel says
  "below horizon," and the space view shows the sight line exiting through the
  day side of Earth. Step `+1m` until it clears.
- **The dome made literal**: the cyan wireframe sphere around Earth in the space
  view is the celestial sphere; the amber dashed ring is the ecliptic.
- **Light time**: select any star — the info card notes the year its light departed.

## Architecture

- `scripts/prepare-data.mjs` — downloads HYG v4.1 stars (mag ≤ 6.5, ~9k), d3-celestial
  constellation lines, OpenNGC Messier objects, NASA Earth textures → `public/data`.
- `src/astro/frames.ts` — all coordinate-frame conversions (EQJ ↔ horizon ↔ scene
  frames), verified numerically by `scripts/sanity.mjs` against astronomy-engine's
  reference path.
- `src/sky/` — planetarium panel (camera inside a celestial sphere, alt/az camera).
- `src/space/` — heliocentric panel. Directions are exact; distances are compressed
  (`r ∝ d^0.55`) and body sizes exaggerated so the whole system reads at once.
  Stars live on a fixed-radius shell (they are effectively at infinity).
- `src/state/store.ts` — zustand store: simulation clock, observer, selection,
  sky-camera pose. Both panels read it imperatively inside their frame loops.
- `scripts/smoke.mjs` — headless-Edge smoke test (console errors + screenshots).

## Data credits

- [HYG Database](https://github.com/astronexus/HYG-Database) (CC BY-SA 4.0)
- [OpenNGC](https://github.com/mattiaverga/OpenNGC) (CC BY-SA 4.0)
- [d3-celestial](https://github.com/ofrohn/d3-celestial) constellation lines (BSD)
- [astronomy-engine](https://github.com/cosinekitty/astronomy) ephemerides (MIT)
- Earth imagery: NASA Blue Marble / Earth at Night (public domain)
