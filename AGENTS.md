# AGENTS.md

Offline-first PWA that shows the user's live GPS position on a pre-georeferenced airsoft field map. No tile server, no backend — everything is computed client-side from a hardcoded calibration. Maps are either a pre-rendered image or a custom vector map drawn live from bundled OpenStreetMap data (`scripts/fetch-osm.mjs` → `public/map_osm.geojson`, rendered by `src/osm-map.ts`).

## Stack

Vite + Lit + TypeScript, Leaflet (`L.CRS.Simple`) for rendering, `vite-plugin-pwa` (Workbox) for the offline service worker. No other runtime dependencies.

## Commands

- `npm install` — restore dependencies (the delivered folder ships source only).
- `npm run dev` — local dev server.
- `npm run build` — `tsc --noEmit` typecheck, then `vite build` into `dist/`.
- `npm test` — runs the transform self-test via `tsx src/transform.test.ts`.
- `npm run preview` — serve the production build locally.

Deploy: `npm run build`, publish `dist/` over HTTPS (GitHub Pages is fine), install as a PWA on the phone. Geolocation requires a secure context, so it will not work from `file://`.

## The files a user edits

- `src/scenarios/*.ts` — **one file per playable scenario.** Each picks a `base` (the shared OSM vector map, or a photo `image` with its own control points), the scenario's PoI labels (`poiNames`), and its play-area boundary polygon (`playArea`, `[lat, lng]` points; everything outside is masked). Optionally also `zones` (marked areas: safe zones, "Zivile Zone", …), `headquarters` (faction HQs drawn with their emblem from `/public/logos`), and `lines` (open frontlines). Copy a file, edit it, register it in `src/scenarios/index.ts`.
- `src/points-of-interest.ts` — the shared registry of physical PoI **coordinates** (same across all scenarios) plus the default label set.
- `src/config.ts` — turns each scenario into a selectable map (resolving its base) and holds the smoothing tunables. Prefer editing scenario files over this.

## File map

- `src/transform.ts` — **the core.** GPS → image pixel via a least-squares _similarity_ fit from the control points. Exposes `solveTransform(points)` returning `{ toPixel, metersToPixels, pixelsToMeters, bearingToScreenDeg, scale, rmsMeters }`.
- `src/config.ts` — map definitions (photo + one OSM vector map per scenario) and tuning.
- `src/scenarios/` — per-scenario labels + play area; `index.ts` registers them.
- `src/points-of-interest.ts` — shared PoI coordinates + default labels + `labelPointsOfInterest`.
- `src/geo.ts` — `watch(onFix, onError)` wraps `watchPosition`, emits a `Fix { lat, lng, accuracy, heading, speed }`, applies light EMA smoothing with a snap-on-teleport.
- `src/heading.ts` — compass. `watchHeading(onHeading)`, plus `needsPermission()` / `requestPermission()` for iOS. Circular-mean angle smoothing.
- `src/map-view.ts` — the `<map-view>` Lit component wrapping Leaflet: image overlay OR OSM vector base, coordinate grid, the out-of-bounds play-area mask (darken + diagonal hatch, injected SVG `<pattern>`), the scenario's zones/frontlines and HQ emblems, accuracy circle, position marker, follow/recenter, and the layer **toggles** (PoI id labels, grid, boundary mask, zones, HQs — persisted; each shown only when applicable). A `ResizeObserver` re-fits when the container gains size (0×0 cold start).
- `src/main.ts` — wires geo + heading into the view, chooses heading source, wake lock, iOS compass button.
- `src/transform.test.ts` — synthetic known-truth self-test. Not part of the build (`tsconfig` excludes `*.test.ts`).
- `src/osm-map.ts` — renders an OpenStreetMap-derived GeoJSON (`public/map_osm.geojson`) as styled Leaflet vector layers (roads, paths, buildings, forest, water). Ships six **themes**, one per event's printed tactical map: `opt` (warm sepia), `m24` (cold dark satellite), `de` (near-black), `asd` (green surround), `lso` (cool blue-grey), `laf` (grey-green). A scenario's OSM base picks one. `buildOsmFrame` paints an opaque surround outside the grid rectangle so the map has a clean border and nothing renders past the edge. Projects each feature through the same GPS→pixel transform, so it lines up with the GPS dot and PoIs. Fully offline: the data is bundled and precached.
- `reference/tactical-maps/` — the organiser's printed Taktikkarten, one per event, downloaded from `airsofthelden-events.com/<event>/taktikkarte`. **Source material, not app assets** — they live outside `public/` so they are not bundled or precached. Every PoI coordinate, play area, zone and HQ position in `src/` was read off these; keep them so the numbers can be re-derived or checked.
- `public/logos/` — faction emblems (GOF, KGG, Miliz, Task Force, Kartell, Rebellen, TERRA, UCRF, the TNO factions, Delta, Ghost), pulled from the organiser's site and normalised to 256×256 PNG. Referenced by `Headquarters.logo`, so these **are** bundled.
- `scripts/fetch-osm.mjs` — one-off, reproducible download of OSM data from the Overpass API into `public/map_osm.geojson`. The **only** online step; run `node scripts/fetch-osm.mjs` to refresh the data. It also prints the control points + canvas dimensions to paste into the OSM `MapDefinition` in `config.ts`.

## Invariants — do not break these

1. **Pixel convention.** Everywhere except the Leaflet boundary, a pixel is an _image_ pixel: origin top-left, x right, y **down**. `toPixel` returns image pixels. Keep it that way; it's the debuggable convention.

2. **There are two separate y-flips. Keep them separate.**
   - Inside `transform.ts`, the forward model uses the _reflection_ form `px = a·E + b·N + c`, `py = b·E − a·N + d`. The minus sign is what maps north-up ground coordinates to image-y-down. A no-rotation map solves to `b = 0`.
   - At the Leaflet boundary, `map-view.ts::px2ll(px, py)` does `[MAP_HEIGHT - py, px]` to convert image-y-down into CRS.Simple's y-up.
     Do **not** try to collapse these into one step; they live in different layers for a reason, and merging them is the classic way to get an upside-down or mirrored map.

3. **Similarity, not affine.** The fit is translation + rotation + uniform scale (4 unknowns), solved via normal equations. Do not "upgrade" it to a full 6-parameter affine — affine allows shear and per-axis scaling, which lets noisy GPS distort the map.

4. **Bearing → screen rotation goes through `bearingToScreenDeg`.** It accounts for the map's own rotation relative to north, so the heading triangle points true even when the printed map isn't north-aligned. Don't compute triangle rotation any other way.

5. **The heading triangle rotates an _inner_ element.** Leaflet owns the marker's outer `transform` (positioning translate). Rotation is applied to `.pm-arrow` inside the divIcon. Rotating the outer element will fight Leaflet.

6. **`map-view` renders in light DOM** (`createRenderRoot() { return this; }`) so Leaflet's global CSS applies. Don't move it into shadow DOM without also injecting Leaflet's stylesheet.

## Where the coordinates come from

Every number in `points-of-interest.ts` and the scenario files was derived from the maps in `reference/tactical-maps/`, by fitting the same similarity transform the app uses (image pixels ↔ GPS) and inverting it. Accuracy differs by source, so treat them differently:

- **LIGHT-SIM** is the anchor. Its map carries a real UTM zone 32N grid at 100 m spacing (192.7 px per 100 m, detected from the image). Projecting the shared PoIs onto it lands them squarely on their buildings — that is the cross-check that validates the whole registry.
- **Dark Emergency 2026** fitted to **3.0 m RMS** from the five named wind turbines. Its extra buildings (423, 500, 505, 508, 808, 824, Tango) are that good.
- **Lost Airfield** fitted to **9.8 m RMS** from 28 buildings shared with the other maps. Its 31 exclusive buildings are good to ~10 m.
- **Play areas, zones and frontlines were traced by hand** off the printed maps and are only good to a few tens of metres. LIGHT-SIM's own map says as much: "Tatsächliche Spielfeldgrenzen werden durch Flatterband markiert." Refine them from a walked GPS track when you can.

Beware that the events renumber things: Dark Emergency 2026's "612 Fahrzeughalle" is the building every other legend calls 613, and the same id can carry a different name per event (610 is Esco Bar, Laborkomplex or Stalker Bar depending on the game). Ids are physical; names are per scenario.

## Calibration & correctness

- `solveTransform` logs `rmsMeters` on startup (`[calibration] RMS error: … m`). A mistyped control point shows up as a large residual — treat that as the first-line check after any calibration change.
- Reference origin is the first control point; the equirectangular ENU projection is accurate to sub-meter over a few hundred meters, which is the whole point of keeping the field small.
- After editing the transform math, run `npm test`. Epsilons there are set to realistic floating-point tolerances (~1e-3), not zero — the tiny residual is projection curvature, not a bug.

## Platform gotchas

- **HTTPS required** for geolocation; must be installed/served over TLS before offline use works.
- **iOS compass** needs `DeviceOrientationEvent.requestPermission()` behind a user tap — that's the "Enable compass" button, shown only when `needsPermission()` is true.
- **Heading source:** `main.ts` prefers GPS course when moving faster than `GPS_HEADING_SPEED`, falling back to the magnetometer when stationary, because metal replicas and batteries deflect the compass.
- **Tree cover** degrades GPS to 5–15 m; the accuracy circle is drawn deliberately so the user sees this. Don't over-smooth position (`POSITION_SMOOTHING`) to hide it — that just makes the dot lag reality.
- **Precache size:** the map image is precached for offline use. If a large map exceeds the Workbox limit, raise `maximumFileSizeToCacheInBytes` in `vite.config.ts`.

## Conventions

- TypeScript strict mode; keep heavy logic in the framework-agnostic modules (`transform`, `geo`, `heading`) and orchestration in `main.ts` / the Lit component.
- No new runtime dependencies without a clear reason — self-containment is a feature here.
- Prefer editing `config.ts` over hardcoding values in modules.
