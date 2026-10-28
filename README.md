<p align="center">
  <img src="public/icons/icon-192.png" alt="Field Maps app icon" width="128" height="128">
</p>

<h1 align="center">Field Maps</h1>

<p align="center">
  <strong>Your position on the tactical map — offline, no signal needed.</strong><br>
  <a href="https://www.fieldmaps.app">www.fieldmaps.app</a>
</p>

Field Maps is an offline-first progressive web app for a single site: the former
military airfield at **Mahlwinkel, Saxony-Anhalt, Germany**. It uses the phone's GPS
to show where you are standing on the tactical map of the airsoft event you are
playing — every numbered building, safe zone, faction headquarters and play-area
boundary, drawn the way that event's printed Taktikkarte draws it.

There is no tile server and no backend. The map is a vector rendering of bundled
OpenStreetMap data, the georeferencing is a hardcoded calibration solved in the
browser, and every screen is reachable from the service worker cache. Once the app
has been opened on a network, it works with no signal at all — which is the point,
because the field has very little.

The one thing the app sends anywhere is a cookie-less page view to Cloudflare Web
Analytics on start-up, so there is some idea of how many people use it. It stores
nothing on the device, identifies nobody, and never fires without a network. See
`src/analytics.ts`, and the privacy notice at `/?page=impressum`. The map element
itself (`packages/field-map`) sends nothing at all.

## What it does

- **Live position and heading.** GPS position with its accuracy circle, plus a
  heading arrow that points true even where the printed map is not north-aligned.
  Heading comes from GPS course while you move and the magnetometer while you stand
  still, because metal replicas deflect a compass.
- **Navigate to a point of interest.** Pick a building from the list, tap
  "Navigate here" in its popup, or double-tap its dot on the map.
- **Your own marks, per map.** Long-press any spot and tap "Mark", or drop one where
  you stand with the flag button by the recenter control. Marks can be renamed,
  deleted and navigated to like any building, and stay on the phone.
- **One map per event.** Labels, zones, headquarters, frontlines and colours change
  per event; the ground underneath is the same airfield every time.
- **Layer toggles** for point-of-interest numbers, the grid, the out-of-bounds mask,
  zones, headquarters and your own marks. Your choices persist.
- **Sticky grid axis** so the column letters and row numbers stay on screen while
  the map scrolls under them.
- **Both languages.** German and English, including the Impressum and privacy notice.
- **Installs as an app.** One tap on Android, where the browser hands the page its
  own install prompt; the Share-sheet gesture spelled out on iOS, which has no such
  API. Opened inside Instagram's or Facebook's built-in browser, where nothing can
  be installed at all, it says so instead of giving instructions that cannot work.
- **Share by QR code.** A code and a link, for handing the app to someone standing
  next to you at a field with no reception.

## Events covered

Six scenarios, ordered on the overview screen by how soon they start. While one of them is running, opening the app goes straight to its map (Back still leads to the overview):

| Event                 | When           | Id    |
| --------------------- | -------------- | ----- |
| Dark Emergency        | 29 Apr – 2 May | `de`  |
| Lost Airfield         | 20 Jun         | `laf` |
| Mission 24            | 3 – 5 Jul      | `m24` |
| Airsoft Days          | 6 – 9 Aug      | `asd` |
| LIGHT-SIM             | 17 – 20 Sep    | `lso` |
| Operation Tschernobyl | 8 – 11 Oct     | `opt` |

Dates are stored as month and day only, because the events recur annually.

## Install it

Open [www.fieldmaps.app](https://www.fieldmaps.app) on your phone and add it to your
home screen — Share → "Add to Home Screen" on iPhone, ⋮ → "Install app" on Android.
It then runs full screen like a normal app, and it keeps itself up to date without
being asked.

## Run it locally

Node 22 (see `.node-version`).

```bash
npm install
npm run dev
```

Other commands:

| Command                  | What it does                                                 |
| ------------------------ | ------------------------------------------------------------ |
| `npm run build`          | Typecheck with `tsc --noEmit`, then `vite build` to `dist/`  |
| `npm test`               | The packages' tests and guards, then the dosimeter model     |
| `npm run dev:component`  | The `<field-map>` test page on port 5180 (see below)         |
| `npm run build:packages` | Build `packages/*/dist` for publishing                       |
| `npm run preview`        | Build, then serve it through `wrangler dev` as it deploys    |
| `npm run serve`          | Serve an existing `dist/` on port 4173, open to the network  |
| `npm run tunnel`         | Expose port 4173 over HTTPS, for testing GPS on a real phone |
| `npm run deploy`         | Build and `wrangler deploy` to Cloudflare                    |
| `npm run format`         | Prettier over the repository                                 |

Geolocation needs a secure context, so the app will not locate you from `file://`,
and neither will it over plain HTTP from another device. `npm run dev` binds to the
network, which is enough for layout work on a phone. For a real GPS test, build,
`npm run serve`, and put an HTTPS URL in front of it with `npm run tunnel`.

`dist/` can also be published over HTTPS on any static host, GitHub Pages included.
The one requirement a host has to honour is `public/_headers`, which serves `sw.js`
as `no-cache` — that single line is the whole self-update path.

## Using the map in another app

The map is a package of its own, so another app — another LARP's, say — can show it
without copying this repository:

- **`packages/field-map`** (`@fieldmaps/field-map`) is `<field-map>`, a custom element:
  the scenario's map, the player's position, points of interest, navigation, marks,
  and live markers the host app supplies (other players from its own server). It
  takes a scenario id and talks to its host through properties, methods and
  `fieldmap-*` events; it never touches the network.
- **`packages/core`** (`@fieldmaps/core`) is everything that needs no UI: the field's
  scenarios, points of interest and calibration, the OpenStreetMap data and faction
  emblems, and the math.

Field Maps itself is the first app built on them (`src/map-screen.ts`). The
integration guide, written to be enough on its own for a developer or a coding agent,
ships inside the package: [`packages/field-map/AGENTS.md`](packages/field-map/AGENTS.md).
`npm run dev:component` serves a test page that embeds nothing but the element, with
an event log, simulated players and two-tab sync.

Releases go out as `npm pack` tarballs attached to a GitHub pre-release. Pushing a
`field-map-v<version>` tag on `origin/main` publishes one
(`.github/workflows/field-map-release.yml`): it tests, builds and packs both packages,
and writes the install URLs into the release notes. The version follows the tag —
both packages are packed as `<version>`, and the element depends on that same
release's core tarball by URL, so it always brings its matching core and never looks
`@fieldmaps/core` up on the npm registry. A host lists core too, from the same
release: a core from another release is not refused, it is installed beside the
element's own. Nothing in the repository is bumped for
this. `packages/field-map/LOVABLE.md` keeps `{{tag}}` placeholders in the repository;
the run fills them in for the copy in the tarball and the one attached to the release.

## Licence

The code is MIT (`LICENSE`). The map data is © OpenStreetMap contributors under the
ODbL; the faction emblems and tactical maps are the organiser's and the factions' own
and are not covered by the MIT licence.

## Refreshing the map data

The basemap comes from `packages/core/assets/map_osm.geojson`, downloaded once from
the Overpass API. To refresh it:

```bash
node scripts/fetch-osm.mjs
```

That is the only step in this project that touches the network at build time. The
script also prints the control points and canvas dimensions to paste into `OSM_BASE`
in `packages/core/src/mahlwinkel/index.ts`.

## Stack

Vite, Lit and TypeScript, with Leaflet (`L.CRS.Simple`) for rendering and
`vite-plugin-pwa` (Workbox) for the offline service worker. Leaflet and Lit are the
only runtime dependencies, and staying that self-contained is deliberate.

The basemap is not a set of Leaflet vector layers. Geometry is projected to canvas
pixels once per map load and rasterized into canvas tiles, so panning moves finished
pixels instead of redrawing vectors. Only things that follow the user — the position
marker, the route, the labels — are Leaflet layers.

## Where the coordinates come from

Every point-of-interest coordinate, play area, zone and headquarters position was
read off the organiser's printed tactical maps in `reference/tactical-maps/`, by
fitting the same similarity transform the app uses and inverting it. Accuracy varies
by source: the buildings are good to a few metres, while the traced play areas and
zones are only good to a few tens of metres. The printed maps say as much — the real
boundary on the ground is marked with tape.

## Contributing

`AGENTS.md` is the working document for anyone changing the code, human or agent. It
covers the file map, the invariants that must not be broken, the calibration
workflow and the platform gotchas. Read it before touching the transform math, the
basemap or the service worker.

Adding an event usually means one new file in `packages/core/src/mahlwinkel/scenarios/`
plus a line in that folder's `index.ts`.

## Contact

Robert Wolffgang — <robert@wolffgang.de>. The Impressum and privacy notice live at
[fieldmaps.app/?page=impressum](https://www.fieldmaps.app/?page=impressum).
If the app is useful to you, there is a
[donation link](https://buymeacoffee.com/rwolffgang).
