# `@fieldmaps/core` — what is in it

The part of Field Maps that needs no UI. `@fieldmaps/field-map` (the `<field-map>` element) is built on it; read **that** package's AGENTS.md first if you want a map on screen. Use this one directly when you need the data or the math without the element — e.g. on a server.

## Entry points

| Import                       | What                                                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `@fieldmaps/core`            | Generic: the GPS ↔ canvas fit, geo math, GPS/compass watchers, basemap themes and painter, data types, the mark store. |
| `@fieldmaps/core/mahlwinkel` | The content: the Mahlwinkel airfield's scenarios, points of interest, calibration.                                     |
| `@fieldmaps/core/vite`       | `fieldMapsAssets()`, a Vite plugin serving `assets/` (see below).                                                      |
| `@fieldmaps/core/assets/*`   | `map_osm.geojson` (the field's OpenStreetMap data) and `logos/*.png` (faction emblems).                                |

## `@fieldmaps/core/mahlwinkel`

```ts
import {
	SCENARIOS, // Scenario[]: id, name, blurb/blurbEn, schedule (month/day), base, poiNames, playArea, zones, headquarters, lines
	getScenario, // (id) => Scenario | undefined
	MAPS,
	getMap, // the same, resolved for drawing: canvas size + control points (MapDefinition)
	scenarioPoiIds, // (id) => the PoI ids that scenario shows — what navigateToPoi accepts
	labelPointsOfInterest, // (poiNames) => [{ id, name, lat, lng, kind? }]
	POINTS_OF_INTEREST, // every physical point: { id, lat, lng, kind? } (kind: "turbine" | "checkpoint")
	OSM_BASE, // the canvas every scenario is drawn on
} from "@fieldmaps/core/mahlwinkel";
```

Coordinates are WGS84 `[lat, lng]` (`LatLng`) or `{ lat, lng }`. PoI ids are physical and stable across scenarios; names are per scenario. Play areas, zones and frontlines were traced by hand off the organiser's printed maps and are good to a few tens of metres; PoIs to about 3–10 m.

## `@fieldmaps/core`

- `distanceMeters(lat1, lng1, lat2, lng2)`, `bearingDegrees(…)`, `relativeBearingDegrees(target, heading)`, `navigationHint(relative)` → `"ahead" | "bearRight" | …`
- `solveTransform(controlPoints)` → `{ toPixel, toLatLng, metersToPixels, pixelsToMeters, bearingToScreenDeg, scale, rmsMeters }` — a least-squares similarity fit (translation, rotation, uniform scale; never shear).
- `watch(onFix, onError, { smoothing?, snapDistanceM? })` — `navigator.geolocation.watchPosition` with light smoothing that snaps on jumps; `watchHeading(onHeading, smoothing?, onNoReading?)` for the compass — `onNoReading` fires when the browser delivers an empty orientation event, which is how a device without a compass shows itself; `needsPermission()` says only that the tap-to-allow API exists (iOS and recent Chromium, laptops included); `requestPermission()` answers `"granted" | "denied" | "prompt"`, and only `"denied"` is a refusal.
- `THEMES`, `extendTheme(base, overrides)`, `resolveTheme`, `osmSurroundColor` — the basemap's looks (see the element's guide, §7).
- `markStore(key)` — the player's marks in `localStorage`, per scenario.
- Types: `Scenario`, `Zone`, `Headquarters`, `BoundaryLine`, `MapDefinition`, `PointOfInterest`, `LabeledPointOfInterest`, `Fix`, `Mark`, `OsmTheme`, …

## Assets

`<field-map>` loads `map_osm.geojson` and `logos/…` relative to its `asset-base`. With Vite, `fieldMapsAssets()` serves them in dev and emits them into the build; elsewhere copy `assets/` to where `asset-base` points. The GeoJSON is regenerated from OpenStreetMap by `scripts/fetch-osm.mjs` in the Field Maps repository.

## Licences

Code: MIT. `assets/map_osm.geojson`: © OpenStreetMap contributors, ODbL — credit OpenStreetMap wherever you show it. `assets/logos/`: the factions' and the organiser's artwork, not covered by the MIT licence.
