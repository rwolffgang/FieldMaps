# `<field-map>` — integration guide

For a developer, or a coding agent, building an app on top of this package. Everything you need is in this file and in the package's type declarations (`dist/*.d.ts`); you do not need the Field Maps repository. If something here disagrees with the types, the types win — and please report it.

**Packages:** `@fieldmaps/field-map` (this element) and `@fieldmaps/core` (its data and math, installed with it).
**Reference implementation:** `test-page/` in the Field Maps repository (`npm run dev:component`) uses every feature below, in plain TypeScript.

---

## 1. What it is, and what it is not

`<field-map>` is a custom element that shows **the Mahlwinkel airfield** (Sachsen-Anhalt, Germany) — the site of the airsoft and LARP events Field Maps was made for — with:

- the event's tactical map (OpenStreetMap terrain in the event's colours), its numbered buildings ("points of interest", PoIs), play-area boundary, zones, faction headquarters;
- the player's live GPS position and heading;
- navigation to a PoI, to any coordinate, to the player's own marks, or to a moving marker;
- **live markers** your app supplies — e.g. other players' positions from your server;
- a German and an English UI, chosen from the browser.

It is **not**:

- **a general map.** It covers one field. The map content (terrain, PoIs, zones, play areas) ships inside `@fieldmaps/core` and cannot be supplied or changed by the host. You pick a **scenario** (one event's version of the field) by id. You can change how it **looks**, not what is on it.
- **networked.** The element makes no network requests except loading its own two assets (`map_osm.geojson`, `logos/*.png`). It never sends anything anywhere. A server that syncs players is your app's; the element gives you the hooks (§5).
- **embeddable in a box (v1).** It covers the whole viewport (`position: fixed` inside). Put your own chrome over it and tell it how much space that takes (`insets`, §3.1), or into its hook slots (§3.4).
- **dependent on a framework.** It is a standard custom element (built with Lit). Use it from plain HTML, React, Vue, Svelte, anything.

Works offline once its assets are cached (it was built for a field with no mobile signal). Needs HTTPS for GPS.

## 2. Install and quick start

### 2.1 Install

The packages are shipped as tarballs attached to a GitHub release of `rwolffgang/FieldMaps` (not on npm yet):

```sh
npm install lit leaflet \
  https://github.com/rwolffgang/FieldMaps/releases/download/<tag>/fieldmaps-core-<version>.tgz \
  https://github.com/rwolffgang/FieldMaps/releases/download/<tag>/fieldmaps-field-map-<version>.tgz
```

`lit` (^3.2) and `leaflet` (^1.9.4) are peer dependencies — install them alongside. The element's stylesheet (and Leaflet's) is bundled and injected automatically; there is **no CSS to import**.

### 2.2 Serve the assets

The element loads `map_osm.geojson` and `logos/*.png` by URL, relative to its `asset-base` attribute (default: the page's own directory). They live in `node_modules/@fieldmaps/core/assets/`.

**Vite** — add the plugin; it serves them in dev and writes them into the build at the root:

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { fieldMapsAssets } from "@fieldmaps/core/vite";

export default defineConfig({ plugins: [fieldMapsAssets()] });
// fieldMapsAssets({ dir: "fieldmaps" }) puts them under /fieldmaps/ — then set asset-base="fieldmaps/"
```

**Anything else** — copy `node_modules/@fieldmaps/core/assets/` into your public/static folder (e.g. as `public/fieldmaps/`) and set `asset-base="/fieldmaps/"`.

**Offline / PWA** — precache those files with the rest of your app (Workbox: include `**/*.geojson` and `**/*.png` in `globPatterns`). The GeoJSON is ~230 KB.

### 2.3 Plain HTML (with any bundler)

```html
<body style="margin:0">
	<field-map scenario="opt"></field-map>
	<script type="module">
		import "@fieldmaps/field-map";

		const map = document.querySelector("field-map");
		map.addEventListener("fieldmap-fix", (e) => console.log("I am at", e.detail.lat, e.detail.lng));
		map.addEventListener("fieldmap-ready", () => map.navigateToPoi("630"));
	</script>
</body>
```

That is a complete app: the map, the player's position (the browser asks for location permission once the map is on screen), the PoI list, navigation.

Give the element's container the full viewport (the element is `position: absolute; inset: 0` and its parts are `position: fixed`). `body { margin: 0; height: 100%; overflow: hidden }` is a good base.

### 2.4 React

Custom elements take **properties**, not just attributes; set object-valued ones through a ref, and listen with `addEventListener`.

```tsx
import { useEffect, useRef } from "react";
import "@fieldmaps/field-map";
import type { FieldMapElement, MapMarker, NavigationChangeDetail } from "@fieldmaps/field-map";

export function FieldMapView(props: {
	scenario: string;
	markers: MapMarker[];
	onNavigation?: (detail: NavigationChangeDetail) => void;
}) {
	const ref = useRef<FieldMapElement>(null);
	useEffect(() => {
		if (ref.current) ref.current.markers = props.markers;
	}, [props.markers]);
	useEffect(() => {
		const el = ref.current;
		if (!el || !props.onNavigation) return;
		const handler = (e: CustomEvent<NavigationChangeDetail>) => props.onNavigation!(e.detail);
		el.addEventListener("fieldmap-navigation", handler);
		return () => el.removeEventListener("fieldmap-navigation", handler);
	}, [props.onNavigation]);
	return <field-map ref={ref} scenario={props.scenario} />;
}

// Once, in a .d.ts, so TSX knows the tag:
declare global {
	namespace JSX {
		interface IntrinsicElements {
			"field-map": React.DetailedHTMLProps<
				React.HTMLAttributes<FieldMapElement>,
				FieldMapElement
			> & {
				scenario?: string;
			};
		}
	}
}
```

Mount it **once** and keep it mounted (hide it rather than unmounting): it keeps the GPS watch running for the session so a return to the map does not wait for a cold fix. Server-side rendering: render nothing for it on the server; import the package only in the browser (`useEffect` / dynamic import).

### 2.5 TypeScript

Nothing special is needed. A working setup for a Vite app:

```jsonc
// tsconfig.json
{
	"compilerOptions": {
		"target": "ES2022",
		"module": "ESNext",
		"moduleResolution": "bundler",
		"strict": true,
		"lib": ["ES2022", "DOM", "DOM.Iterable"],
		"types": ["vite/client"],
	},
	// Leave vite.config.ts out (or add @types/node and an esnext lib): Vite's own types
	// need them, the Field Maps packages do not.
	"include": ["src"],
}
```

## 3. Reference

TypeScript users get all of this typed: `document.querySelector("field-map")` returns a `FieldMapElement` — **the interface to read** for the element's whole public surface (in `dist/types.d.ts`; the `FieldMap` class also declares its private parts) — and `addEventListener("fieldmap-…", e => e.detail…)` is typed through `HTMLElementEventMap`. The declarations need no `@types/leaflet`.

### 3.1 Properties

| Property (attribute)                                 | Type                                       | Default                     | What it does                                                                                                                                                                                           |
| ---------------------------------------------------- | ------------------------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scenario` (`scenario`)                              | `string`                                   | `""`                        | **Required.** The scenario id (§6). Changing it redraws the map and ends a running navigation (`reason: "scenario-changed"`). An unknown id shows an error in the status pill and logs to the console. |
| `theme`                                              | `OsmThemeName \| OsmTheme`                 | the scenario's              | The basemap's look (§7).                                                                                                                                                                               |
| `assetBase` (`asset-base`)                           | `string`                                   | `""` = the page's directory | Where `map_osm.geojson` and `logos/` are served (§2.2).                                                                                                                                                |
| `locale` (`locale`)                                  | `"de" \| "en"`                             | the browser's               | UI language.                                                                                                                                                                                           |
| `strings`                                            | `Partial<FieldMapStrings>`                 | `{}`                        | Replace any UI text; see `FIELD_MAP_STRINGS` for all keys.                                                                                                                                             |
| `storagePrefix` (`storage-prefix`)                   | `string`                                   | `"field-map"`               | Prefix of the `localStorage` keys it keeps (§3.5). Set your own, e.g. `"my-larp-map"`.                                                                                                                 |
| `insets`                                             | `{ top?: number; bottom?: number }`        | `{}`                        | Pixels your own chrome covers at the top/bottom. The element's rows move clear of it, and popups pan clear of it.                                                                                      |
| `positionSource` (`position-source`)                 | `"device" \| "external"`                   | `"device"`                  | `device`: the element runs the browser's GPS and compass itself. `external`: it uses only `setPosition()` (e.g. a native GPS layer, or a replay).                                                      |
| `wakeLock` (`wake-lock`)                             | `boolean`                                  | `true`                      | Keep the screen on while the map is visible. Attribute `wake-lock="false"` turns it off.                                                                                                               |
| `attribution` (`attribution`)                        | `boolean`                                  | `true`                      | Show "© OpenStreetMap" (the data licence requires a credit; turn off only if you credit OSM elsewhere where players see it).                                                                           |
| `markers`                                            | `readonly MapMarker[]`                     | `[]`                        | Live markers (§5). Replace the array to update.                                                                                                                                                        |
| `markerLayers`                                       | `readonly MarkerLayer[]` (`{ id, label }`) | `[]`                        | Rows in the ⚙ menu that hide/show markers by their `layer`.                                                                                                                                            |
| `staleAfterMs` (`stale-after-ms`)                    | `number`                                   | `30000`                     | A marker whose `seenAt` is older fades and shows its age. `0`: never.                                                                                                                                  |
| `topStart` / `topEnd` / `topNotice` / `bottomNotice` | `Element \| null`                          | `null`                      | Your own chrome inside the map's rows (§3.4).                                                                                                                                                          |

### 3.2 Methods and getters

| Member                                                | Returns               | Notes                                                                                                                                                                                                |
| ----------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `navigateToPoi(poiId, { source? })`                   | `NavigationState`     | Navigate to a PoI of the current scenario by its id (`"630"`, `"Lima"`). **Throws `RangeError`** for an id the scenario does not show (`scenarioPoiIds(scenario)` lists them).                       |
| `navigateToCoordinates(lat, lng, { name?, source? })` | `NavigationState`     | Navigate anywhere. `name` defaults to the grid square ("Square H6") or "Marked position". **Throws `RangeError`** on non-finite or out-of-range values. A point off the field is allowed.            |
| `navigateToMarker(markerId, { source? })`             | `NavigationState`     | Navigate to a live marker; follows it as it moves. **Throws `RangeError`** if `markers` has no such id. Ends by itself when the marker leaves `markers`.                                             |
| `stopNavigation({ source? })`                         | `void`                | End the running navigation, if any.                                                                                                                                                                  |
| `navigation` (getter)                                 | `NavigationState`     | The running navigation, or `null`. JSON-safe.                                                                                                                                                        |
| `navigating` (getter)                                 | `boolean`             | `navigation !== null`.                                                                                                                                                                               |
| `fix` (getter)                                        | `PositionFix \| null` | The position as drawn (smoothed). `null` before the first fix.                                                                                                                                       |
| `setPosition(fix, heading?)`                          | `void`                | `position-source="external"` only: `{ lat, lng, accuracy, heading?, speed? }` plus where the phone points (degrees, or `null`). Applied on the next frame. Throws `TypeError` on non-finite numbers. |
| `resize()`                                            | `void`                | Re-measure after you un-hide the element (it also notices by itself after layout).                                                                                                                   |
| `refreshStyle()`                                      | `void`                | Re-read `--field-map-accent*` after changing them at runtime (§7.2).                                                                                                                                 |

All three `navigateTo*` calls:

- replace a running navigation (the event's `previous` says what it replaced);
- behave exactly like the player's own gestures: route line, distance card, turn hints, arrival;
- may be called **before the first GPS fix** (the route appears with the fix) and **right after setting `scenario`** (they apply once that map is loaded; a scenario change in between drops them);
- require `scenario` to be set (else they throw `Error`);
- take `source` (default `"host"`), echoed in `fieldmap-navigation`, so you can tell your own calls from the player's.

### 3.3 Events

All are `CustomEvent`s that bubble and are composed. Listen on the element.

| Event                   | `detail`                                                                         | When                                                                                                                                                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `fieldmap-ready`        | `{ scenario }`                                                                   | The scenario's map data has loaded and is drawn.                                                                                                                                                                                                       |
| `fieldmap-fix`          | `PositionFix`                                                                    | The player's position or heading changed. **Up to once per animation frame** (60 Hz while the compass moves) — throttle before sending anywhere. **Only on change:** a player standing still may produce none for a while, so send a heartbeat (§5.1). |
| `fieldmap-navigation`   | `NavigationChangeDetail`                                                         | A navigation started, stopped, lost its target, or was ended by a scenario change.                                                                                                                                                                     |
| `fieldmap-arrived`      | `{ target: NavigationTarget }`                                                   | Within 8 m of the target. Once per approach (again only after moving 20 m away). The navigation keeps running; call `stopNavigation()` if arrival should end it.                                                                                       |
| `fieldmap-guidance`     | `GuidanceDetail \| null`                                                         | While navigating with a compass: the target's bearing relative to where the phone points, and the distance. `null` when there is none (no compass, arrived, stopped). Frequent.                                                                        |
| `fieldmap-marker-click` | `{ id }`                                                                         | The player tapped (or long-pressed) a live marker. Show your own UI for it.                                                                                                                                                                            |
| `fieldmap-marks-change` | `{ scenario, marks: Mark[] }`                                                    | The player added, renamed or deleted one of their own marks on this map.                                                                                                                                                                               |
| `fieldmap-permission`   | `{ kind: "geolocation" \| "compass", state: "granted" \| "denied" \| "prompt" }` | Sensor permission changed. `compass/prompt`: the browser gates the compass behind a tap — iOS Safari, and also recent desktop Chromium — so the element shows an "Enable compass" button under the top row.                                            |

Example payloads (copied from the test page's event log):

```jsonc
// fieldmap-fix
{ "lat": 52.3808, "lng": 11.8243, "accuracy": 8, "heading": 45, "speed": null, "at": 1793146144492 }

// fieldmap-navigation — the player picked building 630 from the list
{
	"state": {
		"target": { "kind": "poi", "id": "630", "name": "Tower", "lat": 52.381482, "lng": 11.827873 },
		"startedAt": 1793146144492,
		"source": "user"
	},
	"previous": null,
	"reason": "started",   // "started" | "stopped" | "target-removed" | "scenario-changed"
	"source": "user"       // who caused this change: "user" | "host"
}

// fieldmap-navigation — following another player, who then dropped out of `markers`
{ "state": null, "previous": { "target": { "kind": "marker", "id": "alice", "name": "Alice", "lat": 52.38, "lng": 11.82 }, "startedAt": 1793146161573, "source": "user" }, "reason": "target-removed", "source": "host" }

// fieldmap-guidance
{ "relativeDeg": 27.6, "distanceM": 254.1 }

// fieldmap-arrived
{ "target": { "kind": "poi", "id": "630", "name": "Tower", "lat": 52.381482, "lng": 11.827873 } }

// fieldmap-marker-click
{ "id": "alice" }

// fieldmap-permission
{ "kind": "geolocation", "state": "denied" }
```

`NavigationTarget.kind`: `poi` (a scenario PoI; its `id` is the same on every client), `mark` (the player's own mark; the id is local to this device), `marker` (one of your live markers; your id), `spot` (any coordinate — a long press or `navigateToCoordinates`; its `id` is `"lat,lng"`). Every target carries `lat`/`lng`, so another client can always resolve it.

### 3.4 Your own chrome inside the map

The map's top of screen is one column: a row of round buttons (yours on the left and right, the ⚙ settings button outermost on the right), then a notice row, then the iOS compass prompt and any sensor error. The bottom is the status pill, the scale, the PoI list and the recenter button. Put your elements into those rows rather than floating them over the map, and they stack with the element's own:

| Hook                                    | Where                         | Field Maps puts there            |
| --------------------------------------- | ----------------------------- | -------------------------------- |
| `topStart` / `slot="top-start"`         | top row, left                 | the ‹ back button                |
| `topEnd` / `slot="top-end"`             | top row, right, before ⚙      | its dosimeter button             |
| `topNotice` / `slot="top-notice"`       | under the top row, full width | a hint, the "new version" banner |
| `bottomNotice` / `slot="bottom-notice"` | above the status pill         | the install bar                  |

Either assign an element to the property, or write it as a child with the `slot` attribute (picked up once, when the element connects):

```html
<field-map scenario="opt">
	<button slot="top-start" class="fm-round-button" aria-label="Menu">☰</button>
</field-map>
```

Each hook takes **one** element; wrap several in a container. A container with `style="display: contents"` makes its children the row's own items. Give round buttons the class `fm-round-button` to match the ⚙.

For chrome you keep **outside** the element (a header, a tab bar), set `insets` instead.

### 3.5 Storage

The element keeps the player's own settings in `localStorage` (never anything that leaves the device), under `storagePrefix`:

- `<prefix>-marks` — the player's marks, per scenario, as lat/lng;
- `<prefix>-toggles` — the ⚙ layer switches;
- `<prefix>-marker-layers` — which of your `markerLayers` the player hid.

Each works without storage too (private mode): it then lasts the session.

## 4. Points of interest, marks, gestures

- **PoIs** are the scenario's numbered buildings, wind turbines and barriers. The player navigates to one from the list at the bottom, by tapping it ("Navigate here"), or by double-clicking it.
- **A long press** (or right-click) on open ground offers "Navigate here" and "Mark" for that spot.
- **Marks** are the player's own: set from the long-press popup or the flag button (at their position), renamed and deleted from the mark's popup. They are per device; to share one, send its coordinates (`fieldmap-marks-change` gives you the list) and navigate to them elsewhere with `navigateToCoordinates`.
- The ⚙ menu toggles PoI numbers, the grid, the play-area mask, zones, headquarters, marks, and your `markerLayers`.

## 5. Recipes

### 5.1 Live positions through your server

```
<field-map> ──fieldmap-fix──▶ your app ──throttled, e.g. 1 Hz──▶ your server
                                                                  │ fan out
<field-map> ◀──.markers = [...]── your app ◀── other players' fixes ─┘
```

A complete client side over WebSocket. The message shapes are a **suggestion** — use whatever your server speaks.

```ts
import "@fieldmaps/field-map";
import type { MapMarker, NavigationState } from "@fieldmaps/field-map";

const map = document.querySelector("field-map")!; // typed as FieldMapElement
const me = { id: crypto.randomUUID(), name: "Alice", team: "red" };
const TEAM_COLOURS: Record<string, string> = { red: "#ff5a4f", blue: "#4fa3ff" };
const others = new Map<string, MapMarker>();

map.markerLayers = [
	{ id: "red", label: "Team Red" },
	{ id: "blue", label: "Team Blue" },
];

let socket: WebSocket;
function connect() {
	socket = new WebSocket("wss://example.org/positions");
	socket.onmessage = (event) => {
		// { type: "fix", id, name, team, lat, lng, accuracy, heading, at }
		// { type: "left", id }
		const msg = JSON.parse(event.data);
		if (msg.type === "fix" && msg.id !== me.id) {
			others.set(msg.id, {
				id: msg.id,
				lat: msg.lat,
				lng: msg.lng,
				label: msg.name,
				color: TEAM_COLOURS[msg.team],
				heading: msg.heading,
				accuracyM: msg.accuracy,
				seenAt: msg.at, // fades after `staleAfterMs` without news
				layer: msg.team,
				navigable: true, // listed under "Live" in the navigation list
			});
		} else if (msg.type === "left") {
			others.delete(msg.id);
		} else return;
		map.markers = [...others.values()]; // a new array each time: it is diffed by id
	};
	socket.onclose = () => setTimeout(connect, 3000); // the map keeps working offline meanwhile
}
connect();

// Our own position out, at most once a second.
let lastSent = 0;
function sendFix(fix = map.fix) {
	if (!fix || socket.readyState !== WebSocket.OPEN) return;
	lastSent = Date.now();
	// `at` is when we sent it: other clients fade this player after `staleAfterMs` without one.
	socket.send(
		JSON.stringify({ type: "fix", id: me.id, name: me.name, team: me.team, ...fix, at: lastSent }),
	);
}
map.addEventListener("fieldmap-fix", (event) => {
	if (Date.now() - lastSent >= 1000) sendFix(event.detail);
});
// fieldmap-fix fires only when something changed. A player standing still (GPS steady,
// no compass) may produce none for a long time, and would fade on everyone else's
// screen — so repeat the last fix as a heartbeat.
setInterval(() => {
	if (Date.now() - lastSent >= 5000) sendFix();
}, 1000);
```

Updating `markers` once a second for dozens of players is cheap: the element compares the new array with the last by `id` and only moves what moved. Team filtering ("blue only sees blue") belongs on your server, or in your app before you set `markers`.

### 5.2 Syncing navigations (e.g. a squad lead sets a waypoint)

Continues §5.1 (`map`, `socket`, `me`, and the `NavigationState` import). Here every change the player makes is sent — starts and stops alike; filter on `reason` if your app only shares starts.

```ts
// Out: what the player did on this device.
map.addEventListener("fieldmap-navigation", (event) => {
	const { state, source } = event.detail;
	if (source !== "user") return; // came from the server: do not echo it back
	socket.send(JSON.stringify({ type: "navigation", from: me.id, state }));
});

// In: apply with source "host" (the default for method calls).
function applyRemoteNavigation(state: NavigationState) {
	if (!state) return map.stopNavigation();
	const { target } = state;
	if (target.kind === "poi") map.navigateToPoi(target.id);
	else if (target.kind === "marker" && map.markers.some((m) => m.id === target.id))
		map.navigateToMarker(target.id);
	// Marks and spots are local to their device; their coordinates are not.
	else map.navigateToCoordinates(target.lat, target.lng, { name: target.name });
}

// Wire both into connect() from §5.1:
//   in socket.onmessage:  if (msg.type === "navigation" && msg.from !== me.id) applyRemoteNavigation(msg.state);
//   and on (re)connect, the current state in one message:
//   socket.onopen = () => socket.send(JSON.stringify({ type: "navigation", from: me.id, state: map.navigation }));
```

### 5.3 Custom markers (objectives, a supply drop)

The same `markers` array; give the marker an `icon` (an HTML/SVG string, ~24 px, centred on the coordinate) and no `seenAt`:

```ts
const flag = `<svg width="24" height="24" viewBox="0 0 24 24"><path d="M5 3v18M5 4h12l-3 4 3 4H5" stroke="#fff" stroke-width="2" fill="#e11d48"/></svg>`;
map.markers = [
	...players,
	{
		id: "obj-alpha",
		lat: 52.3815,
		lng: 11.8261,
		label: "Objective A",
		icon: flag,
		layer: "objectives",
		navigable: true,
	},
];
```

`icon` is inserted as markup: build it from trusted parts, never from text your users typed. `label` is escaped. A marker with `heading` gets an arrow in its `color`; with `accuracyM`, a faint ring of that radius.

## 6. Scenarios

| id    | Event                 | When (month/day, yearly) | Theme | PoIs | Zones | HQs |
| ----- | --------------------- | ------------------------ | ----- | ---- | ----- | --- |
| `m24` | Mission 24            | 7/3–7/5                  | `m24` | 51   | 1     | 4   |
| `de`  | Dark Emergency        | 4/29–5/2                 | `de`  | 44   | 4     | 6   |
| `opt` | Operation Tschernobyl | 10/8–10/11               | `opt` | 46   | 2     | 7   |
| `lso` | LIGHT-SIM             | 9/17–9/20                | `lso` | 47   | 0     | 3   |
| `asd` | Airsoft Days          | 8/6–8/9                  | `asd` | 41   | 0     | 3   |
| `laf` | Lost Airfield         | 6/20                     | `laf` | 68   | 0     | 2   |

In code, from `@fieldmaps/core/mahlwinkel`:

```ts
import {
	SCENARIOS,
	getScenario,
	scenarioPoiIds,
	scenarioCentre,
	FIELD_BOUNDS,
	getMap,
	labelPointsOfInterest,
} from "@fieldmaps/core/mahlwinkel";

SCENARIOS.map((s) => ({ id: s.id, name: s.name, blurb: s.blurb, schedule: s.schedule })); // build a picker
scenarioPoiIds("opt"); // ["204", "211", …] — valid for navigateToPoi on that scenario
labelPointsOfInterest(getMap("opt")!.poiNames); // [{ id, name, lat, lng, kind? }, …] — names as the players see them
scenarioCentre("opt"); // { lat, lng } inside that event's play area — a default waypoint, a test position
getScenario("opt")!.playArea; // the play area's boundary, [lat, lng][] (empty: the whole field)
FIELD_BOUNDS; // { north, south, west, east } — the whole map; outside it the player is "off the map"
```

PoI **ids are physical** (the same building has the same id in every scenario); **names are per scenario** (building 610 is "Esco Bar" in one event and "Stalker Bar" in another). Sync ids, show names.

The map content comes from the package and cannot be changed by the host. Wrong or missing data (a building, a zone, a new event) is fixed in the Field Maps repository (`packages/core/src/mahlwinkel/`) and arrives with the next package release.

## 7. Styling

**The default is Field Maps' own look.** Every override is optional and partial.

### 7.1 The basemap

```ts
import { THEMES, extendTheme } from "@fieldmaps/core";

map.theme = "lso"; // any built-in: "opt" | "m24" | "de" | "asd" | "lso" | "laf"
map.theme = extendTheme("de", {
	styles: { road_major: { color: "#ff3b30" }, forest: { fillOpacity: 0 } }, // per feature class, per property
	outOfBounds: { boundary: "#00e0ff" },
});
```

An `OsmTheme` has `ground`, `tone`, `grid`, `border` (the surround), `edge`, `outOfBounds`, and a style per feature class. The classes are `grass, farmland, builtup, bare, wetland, forest, water, waterway, building, road_major, road_minor, track, path, railway, treeline, barrier`. Areas take `fillColor, fillOpacity, color?, weight?`; lines take `color, weight, dashArray?, opacity?, lineCap?`. Hide a class with opacity 0. The zones' and headquarters' colours are scenario data and stay as printed.

### 7.2 The chrome

Set these on the element (any `field-map { … }` rule of yours wins over the defaults):

| Custom property           | Default                 | Used for                                                                          |
| ------------------------- | ----------------------- | --------------------------------------------------------------------------------- |
| `--field-map-accent`      | `#38bdf8`               | the player's dot and accuracy circle, active controls, default live-marker colour |
| `--field-map-accent-warm` | `#ffa201`               | PoIs, the route, the navigation card                                              |
| `--field-map-surface`     | `rgba(11, 15, 20, 0.9)` | pills, the PoI list, HUD buttons, panels                                          |
| `--field-map-text`        | `#e6edf3`               | text on those                                                                     |
| `--field-map-font`        | `system-ui, sans-serif` | everything                                                                        |

The dot, circle and route line are drawn in JavaScript: after changing `--field-map-accent*` at runtime, call `map.refreshStyle()`.

Anything else: every rule of the element is scoped `field-map .class`; write the same selector in your stylesheet and yours wins (it is injected at the start of `<head>`, so yours comes later). Useful classes: `.fm-round-button`, `.pill`, `.poi-select`, `.nav-card`, `.recenter`, `.fm-live` (a live marker; `--fm-live-color` is its colour), `.fm-live-label`, `.stale`, `.poi-dot`, `.mark-flag`, `.hq-ring`, `.zone-label`, `.leaflet-popup.poi-popup`.

## 8. Rules that break things silently

1. **Do not put it in a shadow root.** It renders into the light DOM so Leaflet's stylesheet (injected into `<head>`) reaches it. Inside a shadow root the map renders as broken, unstyled tiles.
2. **Do not add your own Leaflet layers.** There is no supported access to the Leaflet map. Moving things go in `markers`; there is no API for static shapes, by design — the field's content is the package's.
3. **HTTPS** (or `localhost`) is required for GPS. Over plain HTTP the element reports `fieldmap-permission` `{ geolocation, denied }`.
4. **The location prompt appears only once the element is visible with a scenario.** A hidden element (`hidden`, `display: none`, 0×0) never asks. If you test for a fix, show a map first.
5. **Full viewport only (v1).** Do not size it to a box. Use `insets` for your header/footer.
6. **Set `asset-base`** if the assets are not next to your page — otherwise the map stays blank with "Map could not be loaded — tap to retry".
7. **Replace `markers`, do not mutate it.** `map.markers.push(x)` changes nothing on screen; `map.markers = [...map.markers, x]` does.
8. **`fieldmap-fix` and `fieldmap-guidance` fire per frame.** Throttle before network or storage work.
9. **One element per page.** Two would run two GPS watches and fight over the screen.
10. **Do not call `update()`** — that is Lit's render cycle. External positions go through `setPosition()`.

## 9. Troubleshooting

| Symptom                                             | Cause / fix                                                                                                                                                                                                                              |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blank dark screen, status "Map could not be loaded" | `map_osm.geojson` not found: see §2.2, check `asset-base`, look for a 404 in the network panel.                                                                                                                                          |
| Map draws, faction emblems are empty rings          | `logos/` not served next to the GeoJSON.                                                                                                                                                                                                 |
| No location prompt, "Waiting for GPS…" forever      | Not HTTPS; element hidden or 0×0; `position-source="external"` without `setPosition()`; the browser blocked location earlier (site settings).                                                                                            |
| "Location permission denied"                        | The player refused; only the browser's site settings undo it. Tell them so.                                                                                                                                                              |
| No turn hints, "Enable compass for turn hints"      | No compass yet: where the browser gates it (iOS Safari, recent desktop Chromium) the player must tap "Enable compass" under the top row; a laptop has no compass to enable. Moving faster than walking pace uses the GPS course instead. |
| Other players fade although they are online         | Their app sends fixes only on change: add the heartbeat from §5.1.                                                                                                                                                                       |
| Markers do not move                                 | You mutated the array (§8.7), or reused the same `id` for different things.                                                                                                                                                              |
| `RangeError` from `navigateToPoi`                   | That PoI is not in this scenario: check `scenarioPoiIds(map.scenario)`.                                                                                                                                                                  |
| Nothing renders at all                              | `lit`/`leaflet` not installed, or the module was not imported (`import "@fieldmaps/field-map"` defines the element).                                                                                                                     |
| Styles of my app leak into the map                  | Your global rules (e.g. on `button`) apply inside it; scope them, or override with `field-map …` selectors.                                                                                                                              |

When in doubt, compare with the test page in the Field Maps repository: it exercises every API above and logs every event.

### Testing your app

- **A position without GPS:** `position-source="external"` and `map.setPosition({ lat, lng, accuracy: 8 }, heading)`; `scenarioCentre(id)` gives a point on the field. In Playwright, a granted `geolocation` on the browser context works in device mode too (one fix, repeated only when you change it).
- **Wait for the map:** `fieldmap-ready`.
- **A navigation the player started** (`source: "user"`): choose a value in the element's own list — `page.selectOption("field-map .poi-select", "630")` — whose values are the PoI ids. (The list's other values are internal; use them only through the API.)
- **Read state:** `map.navigation`, `map.fix`, `map.markers`; live markers are `field-map .fm-live-marker` elements (`.stale` once faded).

## 10. Privacy and licences

- The element stores only the player's own settings, on the device (§3.5), and sends nothing. **Sharing positions is your app's doing**: it is personal data, so your app needs its own privacy notice and an opt-in before it sends anyone's location.
- **Code:** MIT (`LICENSE`).
- **Map data:** © OpenStreetMap contributors, ODbL. Keep the on-map credit (`attribution`) or credit OpenStreetMap visibly elsewhere.
- **Faction emblems** (`assets/logos/`): the factions' and the organiser's (Airsoft Helden) artwork, shown with the events they belong to. They are **not** covered by the MIT licence; ask before using them for anything else.
