# Using `<field-map>` in a Lovable project

For a developer building on [Lovable](https://lovable.dev). Lovable generates a Vite + React + TypeScript app, which `<field-map>` works in as it is. What needs saying is what Lovable's AI cannot find out by itself: the packages are **not on npm**, and it cannot read the integration guide inside `node_modules`. This page gives it both.

Three steps: paste the knowledge text into the project, send the setup prompt, then test on a phone.

## 1. Project knowledge

In Lovable: **Project settings → Knowledge** (the project's custom instructions). Paste this; it is sent with every prompt, so the rules stay in force after the setup is done.

```text
This app shows a map with the <field-map> custom element from the Field Maps project.

Packages — NOT on the npm registry. Never install @fieldmaps/* by name; a registry
lookup either fails or, worse, finds someone else's package. They are installed from
these exact tarball URLs, as package.json dependencies:
  "@fieldmaps/core": "https://github.com/rwolffgang/FieldMaps/releases/download/field-map-v0.1.0-pre.1/fieldmaps-core-0.1.0.tgz"
  "@fieldmaps/field-map": "https://github.com/rwolffgang/FieldMaps/releases/download/field-map-v0.1.0-pre.1/fieldmaps-field-map-0.1.0.tgz"
plus the peer dependencies "lit" (^3.2) and "leaflet" (^1.9.4).

The complete integration guide (properties, methods, events, recipes, troubleshooting):
https://raw.githubusercontent.com/rwolffgang/FieldMaps/field-map-v0.1.0-pre.1/packages/field-map/AGENTS.md
If you cannot open that URL, read docs/field-map-guide.md in this repository. The
package's TypeScript declarations win over anything written here.

Rules:
- One <field-map> per app, mounted once and kept mounted. Render it outside <Routes>
  in the app shell and hide it with the `hidden` attribute on non-map routes; never
  unmount it on navigation (it would restart GPS from a cold fix).
- It covers the whole viewport (position: fixed inside). Never size it into a box.
  Our own header/footer go over it; tell it their height with the `insets` property
  ({ top, bottom } in px).
- Never put it inside a shadow root. Never add Leaflet layers to it.
- React passes only attributes to custom elements. Object values (markers, insets,
  theme, strings, markerLayers) are set as properties through a ref, events are
  listened to with addEventListener in a useEffect (and removed in its cleanup).
- Replace `markers`, never mutate it: el.markers = [...el.markers, m].
- fieldmap-fix and fieldmap-guidance fire up to once per animation frame: throttle
  before any network, database or state work.
- Never call el.update() (that is Lit's render). External positions: setPosition().
- Map content (buildings, zones, play areas) comes from the package and cannot be
  changed here. Pick an event with the `scenario` attribute: m24, de, opt, lso, asd, laf.
- Set storage-prefix to our own app's name so our localStorage keys do not collide.
- Keep the OpenStreetMap credit visible (attribution, on by default).
- Sharing a player's position with others is personal data: opt-in first, and it
  needs a privacy notice.
```

If Lovable says it cannot open the guide's URL, put the guide into the project yourself: download it from that URL and add it as `docs/field-map-guide.md` (through Lovable's code editor, or the project's GitHub repository if you connected one). It is also in the installed package, at `node_modules/@fieldmaps/field-map/AGENTS.md`.

## 2. Setup prompt

Send this as a chat message. It does the whole integration in one go; change the scenario id (`opt`) to your event's.

```text
Add the <field-map> map to this app. Follow the project knowledge, and the integration
guide it links to, §2 (install, assets, React).

1. package.json: add the dependencies "@fieldmaps/core" and "@fieldmaps/field-map" with
   the exact tarball URLs from the project knowledge (not from the npm registry), plus
   "lit": "^3.2.1" and "leaflet": "^1.9.4".

2. vite.config.ts: import { fieldMapsAssets } from "@fieldmaps/core/vite" and add
   fieldMapsAssets() to the existing plugins array (keep the plugins already there).
   It serves map_osm.geojson and logos/ at the site root in dev and copies them into
   the build. Do not set asset-base.

3. src/field-map.d.ts — so TSX knows the tag:
     import type { FieldMapElement } from "@fieldmaps/field-map";
     import type { DetailedHTMLProps, HTMLAttributes } from "react";
     declare module "react" {
       namespace JSX {
         interface IntrinsicElements {
           "field-map": DetailedHTMLProps<HTMLAttributes<FieldMapElement>, FieldMapElement> & {
             scenario?: string;
             locale?: "de" | "en";
             "storage-prefix"?: string;
             "position-source"?: "device" | "external";
           };
         }
       }
     }

4. src/components/FieldMapView.tsx: import "@fieldmaps/field-map" (this defines the
   element) and render <field-map ref={ref} scenario={scenario} storage-prefix="<our-app>" />.
   Set object-valued properties (markers, insets) through the ref in useEffects, and
   forward the events we need (start with fieldmap-ready and fieldmap-navigation) with
   addEventListener/removeEventListener in useEffects. Type the ref as FieldMapElement.

5. Mount FieldMapView once, in the app shell outside <Routes>, and give it the `hidden`
   attribute on routes that are not the map, so it stays mounted. The map route itself
   renders only our own overlay chrome (if any); pass its height through `insets`.

6. Do not import any CSS for it — the element injects its own and Leaflet's stylesheet.
```

After that, features are prompts like _"Show other players from our Supabase table as live markers — follow §5.1 of the field-map guide"_ or _"When the squad lead picks a building, navigate everyone there — §5.2"_. Pointing at the guide's section is what keeps the AI on the documented API instead of guessing one.

## 3. Testing

- **GPS needs its own tab.** The map asks for location only over HTTPS, and only once it is visible with a scenario. The preview inside the Lovable editor is an embedded frame, which may not be allowed to ask: if it says "Location permission denied", open the preview in a new tab, or the published URL on a phone — that is the real test anyway.
- **A position without walking to the field.** Ask Lovable for a dev-only toggle: `position-source="external"` and `el.setPosition({ lat, lng, accuracy: 8 }, null)`, with the point from `scenarioCentre("opt")` (`import { scenarioCentre } from "@fieldmaps/core/mahlwinkel"`).
- **Compare with the reference.** The Field Maps repository's test page (`npm run dev:component`, branch `field-map-component`) uses every feature in plain TypeScript and logs every event.

## 4. When something is off

| Symptom                                                                           | What to tell Lovable                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Install fails with a 404 for `@fieldmaps/…`                                       | It tried the npm registry. "Use the tarball URLs from the project knowledge in package.json."                                                                                                                               |
| Blank dark map, "Map could not be loaded"                                         | `fieldMapsAssets()` is missing from `vite.config.ts`, or `asset-base` was set. Check the network panel for a 404 on `map_osm.geojson`.                                                                                      |
| Map shows inside a box, or is cut off                                             | It was sized. "`<field-map>` is full-viewport; remove its sizing and use `insets` for our header."                                                                                                                          |
| Buttons on the map look wrong (borders, fonts, colours)                           | The app's global styles (Tailwind's base layer, shadcn's `* { border-color }`) reach into it. Override with `field-map .…` selectors, or the `--field-map-*` custom properties (guide §7.2) — never by editing the package. |
| GPS restarts / "Waiting for GPS…" after every page change                         | The element is being unmounted on navigation. "Keep FieldMapView mounted outside `<Routes>`, toggle `hidden`."                                                                                                              |
| Markers do not move                                                               | The array was mutated. "Replace `markers` with a new array."                                                                                                                                                                |
| TypeScript: `Property 'field-map' does not exist on type 'JSX.IntrinsicElements'` | `src/field-map.d.ts` is missing or not under `src/`.                                                                                                                                                                        |

## 5. Moving to a newer release

Each pre-release is a GitHub release of `rwolffgang/FieldMaps` with a tag `field-map-v<version>`. To move: replace the tag (and version, if it changed) in the two `package.json` URLs **and** in the project knowledge, then let Lovable reinstall. Read the release notes first; while it is a pre-release, the API may still change.
