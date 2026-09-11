# Tactical maps (reference material)

The organiser's printed Taktikkarten, one per event. **Source material, not app
assets** — they deliberately live outside `public/` so Vite does not bundle them and
Workbox does not precache them into the offline PWA (they are ~9 MB together).

Every PoI coordinate, play area, zone and headquarters position in `src/` was read
off these images. Keep them so the numbers can be re-derived or checked.

| File                             | Event                  | Version code     | Source                        |
| -------------------------------- | ---------------------- | ---------------- | ----------------------------- |
| `de_2026_taktikkarte.jpg`        | Dark Emergency         | DE-39517-2026-1  | `/dark-emergency/taktikkarte` |
| `de_2022_taktikkarte.jpg`        | Dark Emergency (older) | DE-39517-2022-4  | supplied locally              |
| `m24_2026_taktikkarte.jpg`       | Mission 24H            | M24-39517-2026-6 | `/mission-24h/taktikkarte`    |
| `opt_2024_taktikkarte.jpg`       | OP Tschernobyl         | TNO-39517-2024-9 | `/op-tschernobyl/taktikkarte` |
| `light_sim_2026_taktikkarte.jpg` | LIGHT-SIM              | DE-39517-2026-7  | `/light-sim/taktikkarte`      |
| `asd_2024_taktikkarte.jpg`       | Airsoft Days           | ASD-39517-2024-7 | `/airsoft-days/taktikkarte`   |
| `lost_airfield_taktikkarte.jpg`  | Lost Airfield          | —                | `/lost-airfield/taktikkarte`  |

All base URLs are `https://airsofthelden-events.com`. Those paths are redirects to
the Shopify CDN and are the stable way to re-fetch — note that the Dark Emergency
downloads page does _not_ link its map ("coming soon"), but the redirect still
serves the current file.

## Checked against the organiser, 11 September 2026

Each `/taktikkarte` path was fetched and compared byte for byte with the copy here.

| Event          | Served file                              | Verdict                            |
| -------------- | ---------------------------------------- | ---------------------------------- |
| LIGHT-SIM      | `LSO_2026_Taktikkarte_UTM_web_Final.jpg` | identical — ours is current        |
| OP Tschernobyl | `tNO2024_Taktikkarte_web_1.jpg`          | identical — still the 2024 edition |
| Dark Emergency | `DE2026_Taktikkarte_Download_Final.jpg`  | identical                          |
| Mission 24H    | `M24_Taktikkarte_ASH_2026_Web_….jpg`     | same image, 14 bytes of metadata   |
| Lost Airfield  | `Lost-Airfield-Taktikkarte-web.jpg`      | same image, 14 bytes of metadata   |
| Airsoft Days   | `ASD2025_Taktikkarte_Web.pdf`            | **superseded** — a 2025 PDF now    |

Two things worth knowing before the October game:

- **OP Tschernobyl has no 2026 map.** The downloads page lists only a waiver for it,
  with no Taktikkarte row at all, while `/op-tschernobyl/taktikkarte` still redirects
  to the 2024 file. Nothing newer exists on the event pages, the faction pages, the
  news blog, the store search or the legacy `airsofthelden.com` domain. Re-check the
  downloads page nearer the event.
- **Airsoft Days moved to a 2025 PDF**, so `asd_2024_taktikkarte.jpg` is now the only
  stale file in this folder. Nothing in `src/` has been re-read off it yet.

LIGHT-SIM also gained an operational guide, `/light-sim/leitfaden`
(`LightSim_-_Leitfaden_2026_V4.pdf`, 8 September 2026). It is not kept here — 17 MB,
and page 17 carries the same DE-39517-2026-7 map at lower resolution. What it adds:
UCRF HQ is building 700 and TERRA HQ is building 120, and the season has seven
scoring zones whose positions are hidden until their control points are found. That
last point is why `src/scenarios/light-sim.ts` does not draw them.

## How they were georeferenced

The app's own similarity transform (`src/transform.ts`) fitted image pixels to GPS,
then inverted. See "Where the coordinates come from" in `AGENTS.md` for the accuracy
of each source. Short version:

- **LIGHT-SIM** is the anchor — it carries a real UTM zone 32N grid at 100 m spacing
  (192.4 px per 100 m on the 4096 px-wide file), so its georeference is measured
  rather than fitted. Re-solving it in September 2026 put the shared PoIs on their
  buildings and the printed UCRF marker 7 m from building 700, but showed the
  LIGHT-SIM play area, TERRA HQ and car park to be 50–140 m out. They were re-read
  off the grid; see `src/scenarios/light-sim.ts`.
- **Dark Emergency 2026** fitted to 3.0 m RMS from the five named wind turbines.
- **Lost Airfield** fitted to 9.8 m RMS from 28 buildings shared with the other maps.
- **Mission 24H 2026** fitted from 36 buildings and turbines.
- Play areas, zones and frontlines were traced by hand and are good to a few tens of
  metres only.
