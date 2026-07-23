// -----------------------------------------------------------------------------
// scripts/fetch-osm.mjs
//
// Download OpenStreetMap data for the playfield from the Overpass API and bake it
// into a compact GeoJSON file (public/map_osm.geojson) that the app renders as a
// custom vector map. This is the ONLY online step: once the file is committed the
// app runs fully offline (the service worker precaches the .geojson).
//
// Run:  node scripts/fetch-osm.mjs
//
// It also prints the MapDefinition control points + pixel dimensions to paste into
// src/config.ts. The pixel canvas uses the exact same equirectangular projection as
// src/transform.ts, so the fitted transform reproduces it with ~zero residual and
// the OSM geometry lines up with the GPS dot and the points of interest.
// -----------------------------------------------------------------------------

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// --- Area of interest ---------------------------------------------------------
// Bounding box around the field, with margin so surrounding forest/roads show.
// All points of interest in src/config.ts fall well inside this box.
const BBOX = {
	latMin: 52.376,
	latMax: 52.3855,
	lngMin: 11.809,
	lngMax: 11.84,
};

// Pixels per meter for the generated coordinate canvas. 1 px = 1 m keeps the map
// dimensions comparable to the image maps; vector rendering is resolution-free.
const PX_PER_M = 1.0;

// --- Equirectangular projection (mirror of src/transform.ts) ------------------
const R = 6378137; // WGS84 equatorial radius, meters
const DEG = Math.PI / 180;
// Reference = top-left corner, so it matches solveTransform's lat0 = first point.
const LAT0 = BBOX.latMax;
const COS_LAT0 = Math.cos(LAT0 * DEG);

/** GPS -> image pixel (origin top-left, y DOWN), same convention as the app. */
function toPixel(lat, lng) {
	const px = (lng - BBOX.lngMin) * COS_LAT0 * R * DEG * PX_PER_M;
	const py = (BBOX.latMax - lat) * R * DEG * PX_PER_M;
	return { px, py };
}

const WIDTH = Math.round(toPixel(BBOX.latMin, BBOX.lngMax).px);
const HEIGHT = Math.round(toPixel(BBOX.latMin, BBOX.lngMax).py);

// --- Overpass query -----------------------------------------------------------
// Pull the feature classes worth drawing on a tactical field map. `out geom`
// inlines each way's coordinates; relation members come back with geometry too.
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const BB = `${BBOX.latMin},${BBOX.lngMin},${BBOX.latMax},${BBOX.lngMax}`;
const QUERY = `
[out:json][timeout:60];
(
  way["highway"](${BB});
  way["railway"](${BB});
  way["waterway"](${BB});
  way["building"](${BB});
  way["natural"](${BB});
  way["landuse"](${BB});
  way["leisure"](${BB});
  way["barrier"](${BB});
  way["man_made"="pier"](${BB});
  relation["type"="multipolygon"]["natural"](${BB});
  relation["type"="multipolygon"]["landuse"](${BB});
  relation["type"="multipolygon"]["water"](${BB});
);
out geom;
`;

// --- Feature classification ---------------------------------------------------
// Map raw OSM tags to a small set of style classes the renderer understands.
// Returns { k: <class>, area: bool } or null to skip.
function classify(tags) {
	if (!tags) return null;

	if (tags.building) return { k: "building", area: true };

	if (tags.natural) {
		const n = tags.natural;
		if (n === "water") return { k: "water", area: true };
		if (n === "wood" || n === "scrub" || n === "heath") return { k: "forest", area: true };
		if (n === "wetland") return { k: "wetland", area: true };
		if (n === "grassland") return { k: "grass", area: true };
		if (n === "tree_row") return { k: "treeline", area: false };
	}

	if (tags.landuse) {
		const l = tags.landuse;
		if (l === "forest") return { k: "forest", area: true };
		if (l === "meadow" || l === "grass" || l === "village_green" || l === "recreation_ground")
			return { k: "grass", area: true };
		if (l === "farmland" || l === "farmyard" || l === "orchard") return { k: "farmland", area: true };
		if (l === "residential" || l === "industrial" || l === "commercial" || l === "railway")
			return { k: "builtup", area: true };
		if (l === "quarry" || l === "brownfield" || l === "landfill" || l === "construction")
			return { k: "bare", area: true };
	}

	if (tags.leisure) {
		const le = tags.leisure;
		if (le === "park" || le === "garden" || le === "pitch" || le === "playground")
			return { k: "grass", area: true };
	}

	if (tags.waterway) {
		if (tags.waterway === "riverbank") return { k: "water", area: true };
		return { k: "waterway", area: false };
	}

	if (tags.railway) return { k: "railway", area: false };

	if (tags.barrier) return { k: "barrier", area: false };

	if (tags.man_made === "pier") return { k: "path", area: false };

	if (tags.highway) {
		const h = tags.highway;
		if (["motorway", "trunk", "primary", "secondary"].includes(h))
			return { k: "road_major", area: false };
		if (["tertiary", "unclassified", "residential", "living_street", "service"].includes(h))
			return { k: "road_minor", area: false };
		if (h === "track") return { k: "track", area: false };
		if (["path", "footway", "cycleway", "bridleway", "steps", "pedestrian"].includes(h))
			return { k: "path", area: false };
		return { k: "road_minor", area: false };
	}

	return null;
}

// Overpass `geometry` array [{lat,lng}] -> GeoJSON coords [lng,lat], rounded to
// ~1e-6 deg (~0.1 m) to keep the file small.
function toCoords(geometry) {
	if (!Array.isArray(geometry)) return [];
	return geometry
		.filter((p) => p && typeof p.lat === "number" && typeof p.lon === "number")
		.map((p) => [Math.round(p.lon * 1e6) / 1e6, Math.round(p.lat * 1e6) / 1e6]);
}

function isClosed(coords) {
	if (coords.length < 4) return false;
	const a = coords[0];
	const b = coords[coords.length - 1];
	return a[0] === b[0] && a[1] === b[1];
}

async function main() {
	process.stderr.write(`Querying Overpass for ${BB} …\n`);
	const res = await fetch(OVERPASS_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			// Overpass rejects requests without a descriptive User-Agent (HTTP 406).
			"User-Agent": "airsoft-field-map/0.1 (offline field map build script)",
		},
		body: "data=" + encodeURIComponent(QUERY),
	});
	if (!res.ok) throw new Error(`Overpass HTTP ${res.status}: ${await res.text()}`);
	const json = await res.json();

	const features = [];
	const push = (klass, type, coordinates) => {
		if (!coordinates.length) return;
		features.push({ type: "Feature", properties: { k: klass }, geometry: { type, coordinates } });
	};

	for (const el of json.elements ?? []) {
		const cls = classify(el.tags);
		if (!cls) continue;

		if (el.type === "way") {
			const coords = toCoords(el.geometry);
			if (coords.length < 2) continue;
			if (cls.area && isClosed(coords)) push(cls.k, "Polygon", [coords]);
			else push(cls.k, "LineString", coords);
		} else if (el.type === "relation") {
			// Multipolygon: draw each outer member ring; holes are ignored (fine for
			// a tactical overview). Inner members are skipped.
			for (const m of el.members ?? []) {
				if (m.type !== "way" || m.role === "inner") continue;
				const coords = toCoords(m.geometry);
				if (coords.length < 3) continue;
				const ring = isClosed(coords) ? coords : [...coords, coords[0]];
				push(cls.k, "Polygon", [ring]);
			}
		}
	}

	// Sort so fills (areas) precede lines — a stable, sensible default paint order
	// that the renderer refines further.
	const collection = {
		type: "FeatureCollection",
		properties: {
			source: "OpenStreetMap contributors, ODbL",
			bbox: BBOX,
			pxPerM: PX_PER_M,
			width: WIDTH,
			height: HEIGHT,
		},
		features,
	};

	const outPath = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "map_osm.geojson");
	await writeFile(outPath, JSON.stringify(collection));

	const counts = {};
	for (const f of features) counts[f.properties.k] = (counts[f.properties.k] ?? 0) + 1;

	process.stderr.write(`\nWrote ${features.length} features to public/map_osm.geojson\n`);
	process.stderr.write(`Class counts: ${JSON.stringify(counts)}\n\n`);
	process.stderr.write(`--- Paste into src/config.ts (MapDefinition) ---\n`);
	process.stderr.write(`width: ${WIDTH},\n`);
	process.stderr.write(`height: ${HEIGHT},\n`);
	process.stderr.write(`controlPoints: [\n`);
	const corners = [
		["TL", BBOX.latMax, BBOX.lngMin],
		["TR", BBOX.latMax, BBOX.lngMax],
		["BL", BBOX.latMin, BBOX.lngMin],
		["BR", BBOX.latMin, BBOX.lngMax],
	];
	for (const [name, lat, lng] of corners) {
		const { px, py } = toPixel(lat, lng);
		process.stderr.write(
			`\t{ lat: ${lat}, lng: ${lng}, px: ${Math.round(px)}, py: ${Math.round(py)} }, // ${name}\n`,
		);
	}
	process.stderr.write(`],\n`);
}

main().catch((err) => {
	process.stderr.write(String(err?.stack ?? err) + "\n");
	process.exit(1);
});
