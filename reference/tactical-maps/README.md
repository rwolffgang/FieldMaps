# Tactical maps (reference material)

The organiser's printed Taktikkarten, one per event. **Source material, not app
assets** — they deliberately live outside `public/` so Vite does not bundle them and
Workbox does not precache them into the offline PWA (they are ~12 MB together).

Every PoI coordinate, play area, zone and headquarters position in `src/` was read
off these images. Keep them so the numbers can be re-derived or checked.

| File                             | Event                  | Version code     | Source                        |
| -------------------------------- | ---------------------- | ---------------- | ----------------------------- |
| `de_2026_taktikkarte.jpg`        | Dark Emergency         | DE-39517-2026-1  | `/dark-emergency/taktikkarte` |
| `de_2022_taktikkarte.jpg`        | Dark Emergency (older) | DE-39517-2022-4  | supplied locally              |
| `m24_2026_taktikkarte.jpg`       | Mission 24H            | M24-39517-2026-6 | `/mission-24h/taktikkarte`    |
| `opt_2026_taktikkarte.jpg`       | OP Tschernobyl         | TNO-39517-2026-9 | `/op-tschernobyl/taktikkarte` |
| `opt_2024_taktikkarte.jpg`       | OP Tschernobyl (older) | TNO-39517-2024-9 | earlier download              |
| `light_sim_2026_taktikkarte.jpg` | LIGHT-SIM              | DE-39517-2026-7  | `/light-sim/taktikkarte`      |
| `asd_2024_taktikkarte.jpg`       | Airsoft Days           | ASD-39517-2024-7 | `/airsoft-days/taktikkarte`   |
| `lost_airfield_taktikkarte.jpg`  | Lost Airfield          | —                | `/lost-airfield/taktikkarte`  |

All base URLs are `https://airsofthelden-events.com`. Those paths are redirects to
the Shopify CDN and are the stable way to re-fetch — note that the Dark Emergency
downloads page does _not_ link its map ("coming soon"), but the redirect still
serves the current file.

## How they were georeferenced

The app's own similarity transform (`src/transform.ts`) fitted image pixels to GPS,
then inverted. See "Where the coordinates come from" in `AGENTS.md` for the accuracy
of each source. Short version:

- **LIGHT-SIM** is the anchor — it carries a real UTM zone 32N grid at 100 m spacing
  (192.7 px per 100 m), so its georeference is measured rather than fitted.
- **Dark Emergency 2026** fitted to 3.0 m RMS from the five named wind turbines.
- **Lost Airfield** fitted to 9.8 m RMS from 28 buildings shared with the other maps.
- **Mission 24H 2026** fitted from 36 buildings and turbines.
- **OP Tschernobyl 2026** fitted to 3.0 m RMS from the five named wind turbines.
- Play areas, zones and frontlines were traced by hand and are good to a few tens of
  metres only.
