// -----------------------------------------------------------------------------
// osm-map.ts
// Render an OpenStreetMap-derived GeoJSON file (public/map_osm.geojson, produced
// by scripts/fetch-osm.mjs) as a styled Leaflet vector map.
//
// The geometry is projected through the SAME GPS->pixel transform the rest of the
// app uses, then handed to Leaflet CRS.Simple, so the drawn features line up with
// the GPS dot and the points of interest. Everything is bundled — no tiles, no
// network — so the custom map works fully offline.
//
// Styling deliberately mimics the "Operation Tschernobyl" printed map: an aged
// sepia satellite look — dark olive-brown forest, sandy clearings, gold roads and
// trails, translucent building footprints, a faint gold coordinate grid, and a
// warm tone wash over the whole field.
// -----------------------------------------------------------------------------

import * as L from "leaflet";

/** Feature classes emitted by scripts/fetch-osm.mjs (property `k`). */
type FeatureClass =
	| "grass"
	| "farmland"
	| "builtup"
	| "bare"
	| "wetland"
	| "forest"
	| "water"
	| "waterway"
	| "building"
	| "road_major"
	| "road_minor"
	| "track"
	| "path"
	| "railway"
	| "treeline"
	| "barrier";

interface OsmFeature {
	type: "Feature";
	properties: { k: FeatureClass };
	geometry:
		| { type: "LineString"; coordinates: [number, number][] }
		| { type: "Polygon"; coordinates: [number, number][][] };
}

export interface OsmFeatureCollection {
	type: "FeatureCollection";
	features: OsmFeature[];
}

interface AreaStyle {
	kind: "area";
	fillColor: string;
	fillOpacity: number;
	color?: string;
	weight?: number;
}
interface LineStyle {
	kind: "line";
	color: string;
	weight: number;
	dashArray?: string;
	opacity?: number;
	lineCap?: "butt" | "round" | "square";
}
type ClassStyle = AreaStyle | LineStyle;

// "Operation Tschernobyl" palette. Warm, desaturated, satellite-photo tones. The
// ground BASE fills the whole field so no black shows through between features;
// forest darkens it, clearings/sand lighten it — the OPT contrast. A translucent
// TONE wash on top unifies everything into a single sepia cast.
const GROUND_BASE = "#5c5233"; // olive-tan "open ground" the whole field sits on
const TONE_WASH = "#6b4a1e"; // warm brown overlay painted over the field
const TONE_OPACITY = 0.1;
const GRID_COLOR = "#c8aa5a"; // faint gold coordinate grid
const GOLD = "#e6c24d"; // roads / trails

const STYLES: Record<FeatureClass, ClassStyle> = {
	// --- area fills (over the olive-tan ground base) ---
	forest: { kind: "area", fillColor: "#37401f", fillOpacity: 0.82 },
	treeline: { kind: "line", color: "#4a5a2e", weight: 2, dashArray: "2 5" },
	grass: { kind: "area", fillColor: "#7c7040", fillOpacity: 0.5 },
	farmland: { kind: "area", fillColor: "#8a7845", fillOpacity: 0.5 },
	bare: { kind: "area", fillColor: "#b39a5f", fillOpacity: 0.7 },
	builtup: { kind: "area", fillColor: "#6b6040", fillOpacity: 0.45 },
	wetland: { kind: "area", fillColor: "#4d5540", fillOpacity: 0.55 },
	water: { kind: "area", fillColor: "#4a5a5e", fillOpacity: 0.7, color: "#6b7d7f", weight: 1 },
	// Translucent whitish satellite footprints, like the OPT building boxes.
	building: { kind: "area", fillColor: "#d8d0b6", fillOpacity: 0.4, color: "#e6dcc0", weight: 1 },
	// --- lines ---
	waterway: { kind: "line", color: "#6b7d7f", weight: 2 },
	railway: { kind: "line", color: "#b0a262", weight: 1.6, dashArray: "8 5" },
	// Straße — solid gold.
	road_major: { kind: "line", color: GOLD, weight: 3 },
	road_minor: { kind: "line", color: "#d8b84a", weight: 2.2 },
	// Befahrbare Wege — dashed gold (drivable tracks).
	track: { kind: "line", color: "#d8b84a", weight: 2, dashArray: "9 7" },
	// Marschwege — dotted gold foot trails (round caps make round dots).
	path: { kind: "line", color: "#e0c464", weight: 2, dashArray: "1 8", lineCap: "round" },
	// Sperrgebiet-style boundary — light blue-white dashes.
	barrier: { kind: "line", color: "#c2d6e2", weight: 1.6, dashArray: "9 7" },
};

// Paint order, bottom to top: broad land cover, then water, then buildings, then
// the linear network (roads/paths) so routes stay visible on top of everything.
const DRAW_ORDER: FeatureClass[] = [
	"builtup",
	"bare",
	"farmland",
	"grass",
	"wetland",
	"forest",
	"water",
	"waterway",
	"building",
	"railway",
	"road_major",
	"road_minor",
	"track",
	"path",
	"treeline",
	"barrier",
];

/** Project GeoJSON [lng, lat] to a Leaflet CRS.Simple LatLng for the current map. */
export type ProjectFn = (lng: number, lat: number) => L.LatLngExpression;
/** Project a canvas pixel (x from left, y from top) to a Leaflet CRS.Simple LatLng. */
export type PixelProjectFn = (px: number, py: number) => L.LatLngExpression;

export interface BuildOsmOptions {
	/** GeoJSON [lng,lat] -> Leaflet LatLng, for the OSM features. */
	project: ProjectFn;
	/** Canvas pixel -> Leaflet LatLng, for the ground base and grid. */
	pixelProject: PixelProjectFn;
	/** Canvas size in pixels (from the map definition). */
	width: number;
	height: number;
	/** Dedicated (low z-index) pane so the map renders under markers/overlays. */
	pane?: string;
}

function ringToLatLngs(ring: [number, number][], project: ProjectFn): L.LatLngExpression[] {
	return ring.map(([lng, lat]) => project(lng, lat));
}

/**
 * Build a single LayerGroup containing the OPT-styled ground base, coordinate
 * grid, every OSM feature, and a sepia tone wash — stacked bottom to top. Add it
 * to the map like any other layer.
 */
export function buildOsmLayer(data: OsmFeatureCollection, opts: BuildOsmOptions): L.LayerGroup {
	const { project, pixelProject, width, height, pane } = opts;
	const group = L.layerGroup();

	const canvasCorners = (): L.LatLngExpression[] => [
		pixelProject(0, 0),
		pixelProject(width, 0),
		pixelProject(width, height),
		pixelProject(0, height),
	];

	// 1) Ground base — the whole field filled so no background shows between features.
	L.polygon(canvasCorners(), {
		pane,
		stroke: false,
		fill: true,
		fillColor: GROUND_BASE,
		fillOpacity: 1,
		interactive: false,
	}).addTo(group);

	// 2) OSM features, bucketed by class and painted in DRAW_ORDER (Leaflet paints
	// in insertion order within the SVG pane).
	const byClass = new Map<FeatureClass, OsmFeature[]>();
	for (const f of data.features) {
		const list = byClass.get(f.properties.k);
		if (list) list.push(f);
		else byClass.set(f.properties.k, [f]);
	}

	for (const klass of DRAW_ORDER) {
		const features = byClass.get(klass);
		if (!features) continue;
		const style = STYLES[klass];

		for (const f of features) {
			if (style.kind === "area" && f.geometry.type === "Polygon") {
				const latlngs = f.geometry.coordinates.map((ring) => ringToLatLngs(ring, project));
				L.polygon(latlngs, {
					pane,
					stroke: style.weight != null,
					color: style.color ?? style.fillColor,
					weight: style.weight ?? 0,
					fill: true,
					fillColor: style.fillColor,
					fillOpacity: style.fillOpacity,
					interactive: false,
				}).addTo(group);
			} else if (f.geometry.type === "LineString") {
				const s = (style.kind === "line" ? style : STYLES.path) as LineStyle;
				L.polyline(ringToLatLngs(f.geometry.coordinates, project), {
					pane,
					color: s.color,
					weight: s.weight,
					dashArray: s.dashArray,
					lineCap: s.lineCap,
					opacity: s.opacity ?? 0.95,
					interactive: false,
				}).addTo(group);
			} else if (style.kind === "line" && f.geometry.type === "Polygon") {
				// A closed way classified as a line (e.g. a fenced compound): stroke the ring.
				for (const ring of f.geometry.coordinates) {
					L.polyline(ringToLatLngs(ring, project), {
						pane,
						color: style.color,
						weight: style.weight,
						dashArray: style.dashArray,
						lineCap: style.lineCap,
						opacity: style.opacity ?? 0.95,
						interactive: false,
					}).addTo(group);
				}
			}
		}
	}

	// 3) Sepia tone wash over the whole field, tying the palette together.
	L.polygon(canvasCorners(), {
		pane,
		stroke: false,
		fill: true,
		fillColor: TONE_WASH,
		fillOpacity: TONE_OPACITY,
		interactive: false,
	}).addTo(group);

	return group;
}

export interface BuildGridOptions {
	/** Canvas pixel -> Leaflet LatLng. */
	pixelProject: PixelProjectFn;
	/** Canvas size in pixels. */
	width: number;
	height: number;
	/** Grid line spacing in pixels. */
	stepPx: number;
	/** Pane to draw into (kept separate so the grid can be toggled). */
	pane?: string;
}

/**
 * Build the faint gold coordinate grid + outer frame as its own layer, so it can be
 * shown/hidden independently of the terrain. Drawn on top of the terrain, like the
 * printed OPT map's grid.
 */
export function buildOsmGrid(opts: BuildGridOptions): L.LayerGroup {
	const { pixelProject, width, height, stepPx, pane } = opts;
	const group = L.layerGroup();
	if (stepPx <= 0) return group;

	const gridStyle = { pane, color: GRID_COLOR, weight: 1, opacity: 0.16, interactive: false };
	for (let x = stepPx; x < width; x += stepPx) {
		L.polyline([pixelProject(x, 0), pixelProject(x, height)], gridStyle).addTo(group);
	}
	for (let y = stepPx; y < height; y += stepPx) {
		L.polyline([pixelProject(0, y), pixelProject(width, y)], gridStyle).addTo(group);
	}
	// Outer frame, a touch stronger.
	L.polygon(
		[
			pixelProject(0, 0),
			pixelProject(width, 0),
			pixelProject(width, height),
			pixelProject(0, height),
		],
		{ pane, color: GRID_COLOR, weight: 1.5, opacity: 0.3, fill: false, interactive: false },
	).addTo(group);

	return group;
}
