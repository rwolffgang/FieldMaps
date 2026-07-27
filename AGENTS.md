# AGENTS.md

**Field Maps** — https://www.fieldmaps.app

## TODO

- [ ] **Rename the GitHub repository** from `rwolffgang/MahlwinkelMap` to match the Field Maps name. It is still the old name from when this only covered Mahlwinkel. Once renamed, update `REPO_URL` in `src/landing-view.ts` (the "Quellcode" link on the landing page) and the `origin` remote — GitHub redirects the old URL, but the visible link should be the real one.

Offline-first PWA that shows the user's live GPS position on a pre-georeferenced airsoft field map. No tile server, no backend — everything is computed client-side from a hardcoded calibration. Every scenario now draws the **custom vector map**, rendered live from bundled OpenStreetMap data (`scripts/fetch-osm.mjs` → `public/map_osm.geojson`, rendered by `src/osm-map.ts`) in that event's theme. The app ships **no map imagery at all** — the retired photo bases live in `reference/legacy-map-images/`. A photo `base` is still supported (`kind: "image"`, see `src/scenarios/scenario.ts`) but nothing uses it; prefer a theme on the shared base.

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

- `src/scenarios/*.ts` — **one file per playable scenario.** Each picks a `base` (in practice always the shared OSM vector map plus a theme; a photo `image` with its own control points is still supported but unused), the scenario's PoI labels (`poiNames`), and its play-area boundary polygon (`playArea`, `[lat, lng]` points; everything outside is masked). Optionally also `zones` (marked areas: safe zones, "Zivile Zone", …), `headquarters` (faction HQs drawn with their emblem from `/public/logos`), and `lines` (open frontlines). Copy a file, edit it, register it in `src/scenarios/index.ts`.
- `src/points-of-interest.ts` — the shared registry of physical PoI **coordinates** (same across all scenarios) plus the default label set.
- `src/config.ts` — turns each scenario into a selectable map (resolving its base) and holds the smoothing tunables. Prefer editing scenario files over this.

## File map

- `src/transform.ts` — **the core.** GPS → image pixel via a least-squares _similarity_ fit from the control points. Exposes `solveTransform(points)` returning `{ toPixel, metersToPixels, pixelsToMeters, bearingToScreenDeg, scale, rmsMeters }`.
- `src/config.ts` — map definitions (one OSM vector map per scenario, all on the shared canvas) and tuning.
- `src/scenarios/` — per-scenario labels + play area; `index.ts` registers them.
- `src/points-of-interest.ts` — shared PoI coordinates + default labels + `labelPointsOfInterest`.
- `src/geo.ts` — `watch(onFix, onError)` wraps `watchPosition`, emits a `Fix { lat, lng, accuracy, heading, speed }`, applies light EMA smoothing with a snap-on-teleport.
- `src/heading.ts` — compass. `watchHeading(onHeading)`, plus `needsPermission()` / `requestPermission()` for iOS. Circular-mean angle smoothing.
- `src/map-view.ts` — the `<map-view>` Lit component wrapping Leaflet: image overlay OR OSM vector base, coordinate grid, the out-of-bounds play-area mask (darken + diagonal hatch, injected SVG `<pattern>`), the scenario's zones/frontlines and HQ emblems, accuracy circle, position marker, follow/recenter, and the layer **toggles** (PoI id labels, grid, boundary mask, zones, HQs — persisted; each shown only when applicable). A `ResizeObserver` re-fits when the container gains size (0×0 cold start). Navigation can be started three ways, all through `startNavigation`: the PoI select, the **"Navigate here" button** in a dot's popup, or a **double-click on the dot**. Hovering a dot still just labels it — the popup is the version you can act on, so it closes the tooltip while it is open, and its auto-pan padding is measured off the live chrome (`chromeInsets`) rather than restating the CSS row heights. **A PoI is drawn once, and whatever is drawn is the tap target** (`bindPoiInteractions` puts the same label/popup/double-click on all three): a turbine gets its glyph, a building with a faction emblem on it gets the emblem — the scenarios place several HQs exactly on a numbered building, so `samePlace` pairs them and the dot is left off. Emblems only stand in while the HQ layer is shown, which is why toggling it rebuilds the dots.
- `src/landing-view.ts` — the `<landing-view>` overview at `/`: intro, the site chip and the note under the events heading (the app covers **one** field, the Mahlwinkel airfield — say so before someone installs it expecting their own event; the "Field Maps" name is deliberately site-neutral, the coverage is not), the install card ("add to home screen", with the per-platform gesture — hidden by CSS under `display-mode: standalone`, where it would only describe what the user already did), event cards ordered by date, and the footer links (donations, `robert@wolffgang.de`, GitHub, Impressum).
- `src/brand.ts` — the two colours off the app icon (`BRAND_BLUE`, `BRAND_BLUE_DEEP`, `BRAND_ORANGE`). Leaflet needs colours as JS strings, the chrome takes them from CSS, so `styles.css` mirrors them as `--brand-*` / `--accent` / `--accent-warm` at the top of `:root`. Change one, change the other. Blue means "you and the app" (position dot, accuracy circle, active controls), orange means "a place on the ground" (PoIs, navigation, the install prompt); everything else stays neutral so those two keep their weight. Per-event map palettes (`accent`, the `osm-map` themes) are separate and stay per-event.
- `src/legal-view.ts` — the `<legal-view>` legal page at `/?page=impressum`: Impressum (§ 5 DDG) and privacy notice, both languages, text in `i18n.ts`. **`OPERATOR` at the top of the file is the one thing that has to be right** — name, summonable postal address, contact email. Missing address lines render as loud orange placeholders rather than disappearing, because an Impressum with no address is the failure worth shouting about. Reachable offline like every other screen, which is why it is a route and not an external page.
- `src/router.ts` — the whole "router": read/write the `?map=` and `?page=` parameters, notify on change and on Back.
- `src/event-schedule.ts` — recurring month/day schedules, German date formatting, and the soonest-first comparator.
- `src/main.ts` — wires geo + heading into the view, chooses heading source, wake lock, iOS compass button, and switches between the three screens on route change.
- `src/transform.test.ts` — synthetic known-truth self-test. Not part of the build (`tsconfig` excludes `*.test.ts`).
- `src/osm-map.ts` — renders an OpenStreetMap-derived GeoJSON (`public/map_osm.geojson`) as styled Leaflet vector layers (roads, paths, buildings, forest, water). The three terrain panes draw to **`<canvas>`**, not SVG (`CANVAS_PANES` in `map-view.ts` builds one `L.canvas()` renderer each, passed down as the `renderer` option): as SVG the base was ~380 DOM paths the browser restyled and rasterized on every redraw, several times per drag, in full-viewport layers at device pixel ratio — measured at ~36 Mpx per redraw on a 1280×720 desktop at DPR 2, which is what made dragging crawl. **If you add a path to these builders, pass `renderer` through with `pane`** — miss it and that one shape silently gets its own SVG renderer in the same pane, which is both slow and a z-order trap. The mask and zone panes stay SVG deliberately: their hatch is an injected SVG `<pattern>` that canvas cannot express, and they are only a handful of paths. Ships six **themes**, one per event's printed tactical map: `opt` (warm sepia), `m24` (cold dark satellite), `de` (near-black), `asd` (green surround), `lso` (cool blue-grey), `laf` (grey-green). A scenario's OSM base picks one. `buildOsmFrame` paints an opaque surround outside the grid rectangle so the map has a clean border and nothing renders past the edge. Projects each feature through the same GPS→pixel transform, so it lines up with the GPS dot and PoIs. Fully offline: the data is bundled and precached.
- `reference/tactical-maps/` — the organiser's printed Taktikkarten, one per event, downloaded from `airsofthelden-events.com/<event>/taktikkarte`. **Source material, not app assets** — they live outside `public/` so they are not bundled or precached. Every PoI coordinate, play area, zone and HQ position in `src/` was read off these; keep them so the numbers can be re-derived or checked.
- `public/logos/` — faction emblems (GOF, KGG, Miliz, Task Force, Kartell, Rebellen, TERRA, UCRF, the TNO factions, Delta, Ghost), pulled from the organiser's site and normalised to 256×256 PNG. Referenced by `Headquarters.logo`, so these **are** bundled.
- `scripts/fetch-osm.mjs` — one-off, reproducible download of OSM data from the Overpass API into `public/map_osm.geojson`. The **only** online step; run `node scripts/fetch-osm.mjs` to refresh the data. It also prints the control points + canvas dimensions to paste into the OSM `MapDefinition` in `config.ts`.

## Screens and URLs

Three screens, two query parameters (`src/router.ts`):

- `/` — the overview (`src/landing-view.ts`): what the app is, then one card per event.
- `/?map=<id>` — that event's map, opened directly.
- `/?page=impressum` — Impressum and privacy notice (`src/legal-view.ts`), linked from the overview's footer.

A **query parameter**, not a path or a hash, so a bookmarked map resolves on any static host without rewrite rules — which matters because this ships as an offline PWA and a saved link has to open from the service worker cache with no server in reach. Room to extend later (`&poi=630`).

All three views stay in the DOM and `main.ts` toggles `hidden`, rather than tearing the map down: `map-view` already re-fits when its container gains size (it has to, for the 0×0 cold start), so returning to a map is instant. The map-only chrome (status toast, compass prompt, coordinate test input) follows the same switch via a `data-wanted` flag, so nothing that was hidden for its own reasons gets revealed by the route change.

Event cards are real `<a href="?map=…">` elements with the click intercepted — long-press-to-copy, open-in-new-tab and bookmarking all keep working. That is the point of the screen.

## Event ordering

`src/event-schedule.ts` stores each event as month/day only (no year), because they recur annually — that keeps the scenario files from going stale every January. `mapsByDate()` sorts the overview and the HUD selector soonest-first, counting a running event as zero days away, so the map you need is at the top on the day you need it. Style variants (no `schedule`) sort last. It is a function, not a constant, because the answer depends on today's date and people leave this open for a whole weekend.

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
- **Precache size:** the map image is precached for offline use. If a large map exceeds the Workbox limit, raise `maximumFileSizeToCacheInBytes` in `vite.config.ts`. More important than the limit is the total: `globPatterns` sweeps up **every** image under `public/`, referenced or not, and a player installs the app on mobile data. Anything no scenario loads belongs in `reference/` (see `reference/legacy-map-images/`), and photo bases ship as WebP — `map_m24` alone was 2.2 MB as a PNG against 215 KB re-encoded.

## Conventions

- TypeScript strict mode; keep heavy logic in the framework-agnostic modules (`transform`, `geo`, `heading`) and orchestration in `main.ts` / the Lit component.
- No new runtime dependencies without a clear reason — self-containment is a feature here.
- Prefer editing `config.ts` over hardcoding values in modules.
