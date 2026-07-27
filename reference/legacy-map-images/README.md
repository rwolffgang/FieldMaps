# Legacy map images

The photo map bases the app used to render. **Source material, not app assets** —
kept the way `reference/tactical-maps/` is kept, so the work that came off them
can be re-derived or checked.

They live outside `public/` on purpose. Anything under `public/` is copied into
`dist/` _and_ precached by the service worker (`globPatterns` in
`vite.config.ts` matches every image extension), so a player installing the PWA
in the car park pays for all of it on mobile data before the app works offline.
Retiring these took the precache from 5.4 MB to 1.7 MB.

- `map_m24.png` — Mission 24's printed map, photographed and georeferenced. It
  was the last one still shipping. The scenario now draws the shared OSM vector
  base in the `m24` theme, which was taken from this very map.
- `map_de.jpg`, `map_opt.jpg` — the photo bases for Dark Emergency and Operation
  Tschernobyl, from before both moved to the shared OSM base. Already unused.
- `480532358_…_n.jpg` — an unreferenced field photo.

## The Mission 24 play area came from here

`map_m24.png` had the out-of-bounds area painted into it, so the scenario needed
no `playArea` of its own. The shared canvas spans far more ground than the event
uses, so the boundary had to be recovered before the photo could be retired.

It was thresholded straight off the image — in-bounds ground is neutral
grey-green satellite, everything outside is a maroon wash, so `r - b` separates
them — then morphologically closed to swallow the lettering drawn over the
field, traced, simplified to ~12 m, and pushed back through the scenario's own
four control points (Lima, Bravo, Echo, Sierra; 0.0 m round-trip). The result is
the 45-point ring in `src/scenarios/mission24.ts`.

That makes it the loosest boundary in the repo: it is the 2024-era printed
edition, while that file's zones, frontlines and HQs come from the 2026 map. If
you ever walk the boundary with a GPS track, replace it.

## Putting one back

Move the file into `public/`, point the scenario's `base.image` at it, and
re-encode it first — `map_m24` was 2.2 MB as a PNG against 215 KB as WebP at
q92, with no visible difference at the zoom levels the canvas is drawn at.
