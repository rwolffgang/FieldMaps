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

/** A complete look for the OSM vector map. */
interface OsmTheme {
	/** Ground fill under everything, so no background shows between features. */
	ground: string;
	/** Optional translucent wash over the whole field to unify the palette. */
	tone?: { color: string; opacity: number };
	/** Coordinate grid line color. */
	grid: string;
	/** Opaque surround painted outside the grid rectangle (the map's border). */
	border: string;
	/** Crisp line drawn along the grid rectangle edge. */
	edge: string;
	/** Per-feature-class styling. */
	styles: Record<FeatureClass, ClassStyle>;
}

// "Operation Tschernobyl" — warm, desaturated, satellite-photo sepia. Forest
// darkens the olive-tan ground, clearings/sand lighten it; a warm wash unifies it.
const OPT_GOLD = "#e6c24d";
const optTheme: OsmTheme = {
	ground: "#5c5233",
	tone: { color: "#6b4a1e", opacity: 0.1 },
	grid: "#c8aa5a",
	border: "#17120a",
	edge: "#c8aa5a",
	styles: {
		forest: { kind: "area", fillColor: "#37401f", fillOpacity: 0.82 },
		treeline: { kind: "line", color: "#4a5a2e", weight: 2, dashArray: "2 5" },
		grass: { kind: "area", fillColor: "#7c7040", fillOpacity: 0.5 },
		farmland: { kind: "area", fillColor: "#8a7845", fillOpacity: 0.5 },
		bare: { kind: "area", fillColor: "#b39a5f", fillOpacity: 0.7 },
		builtup: { kind: "area", fillColor: "#6b6040", fillOpacity: 0.45 },
		wetland: { kind: "area", fillColor: "#4d5540", fillOpacity: 0.55 },
		water: { kind: "area", fillColor: "#4a5a5e", fillOpacity: 0.7, color: "#6b7d7f", weight: 1 },
		building: { kind: "area", fillColor: "#d8d0b6", fillOpacity: 0.4, color: "#e6dcc0", weight: 1 },
		waterway: { kind: "line", color: "#6b7d7f", weight: 2 },
		railway: { kind: "line", color: "#b0a262", weight: 1.6, dashArray: "8 5" },
		road_major: { kind: "line", color: OPT_GOLD, weight: 3 },
		road_minor: { kind: "line", color: "#d8b84a", weight: 2.2 },
		track: { kind: "line", color: "#d8b84a", weight: 2, dashArray: "9 7" },
		path: { kind: "line", color: "#e0c464", weight: 2, dashArray: "1 8", lineCap: "round" },
		barrier: { kind: "line", color: "#c2d6e2", weight: 1.6, dashArray: "9 7" },
	},
};

// "Mission 24" — cold, dark tactical satellite. Near-black forest over dark gray
// ground, crisp white line work for roads/paths/buildings, red zone boundaries,
// faint white grid inside a dark maroon border. No warm wash.
const M24_WHITE = "#e9ede3";
const m24Theme: OsmTheme = {
	ground: "#33352c",
	grid: "#d8dcd0",
	border: "#241a17",
	edge: "#c8ccc0",
	styles: {
		forest: { kind: "area", fillColor: "#15170f", fillOpacity: 0.9 },
		treeline: { kind: "line", color: "#3a4a2e", weight: 2, dashArray: "2 5" },
		grass: { kind: "area", fillColor: "#474636", fillOpacity: 0.55 },
		farmland: { kind: "area", fillColor: "#504d38", fillOpacity: 0.5 },
		bare: { kind: "area", fillColor: "#5a5342", fillOpacity: 0.6 },
		builtup: { kind: "area", fillColor: "#3e3d31", fillOpacity: 0.5 },
		wetland: { kind: "area", fillColor: "#33413a", fillOpacity: 0.55 },
		water: { kind: "area", fillColor: "#26323a", fillOpacity: 0.7, color: "#46606b", weight: 1 },
		building: {
			kind: "area",
			fillColor: "#cfd4c6",
			fillOpacity: 0.16,
			color: "#dfe4d6",
			weight: 1,
		},
		waterway: { kind: "line", color: "#4f6b78", weight: 2 },
		railway: { kind: "line", color: "#b0b4a8", weight: 1.6, dashArray: "8 5" },
		road_major: { kind: "line", color: M24_WHITE, weight: 3 },
		road_minor: { kind: "line", color: "#c2c6ba", weight: 2.2 },
		track: { kind: "line", color: "#cfd3c7", weight: 2, dashArray: "9 7" },
		path: { kind: "line", color: "#dfe3d8", weight: 2, dashArray: "1 8", lineCap: "round" },
		barrier: { kind: "line", color: "#c25146", weight: 1.6, dashArray: "9 7" },
	},
};

// "Dark Emergency" — the coldest of the set. Near-black forest on charcoal ground,
// hard white line work, a black surround. Taken from DE-39517-2026-1.
const DE_WHITE = "#f2f4ef";
const deTheme: OsmTheme = {
	ground: "#2b2f28",
	grid: "#e6e9e0",
	border: "#0b0c0a",
	edge: "#8f958a",
	styles: {
		forest: { kind: "area", fillColor: "#101408", fillOpacity: 0.92 },
		treeline: { kind: "line", color: "#28331c", weight: 2, dashArray: "2 5" },
		grass: { kind: "area", fillColor: "#3d4030", fillOpacity: 0.55 },
		farmland: { kind: "area", fillColor: "#454633", fillOpacity: 0.5 },
		bare: { kind: "area", fillColor: "#575040", fillOpacity: 0.62 },
		builtup: { kind: "area", fillColor: "#35372c", fillOpacity: 0.5 },
		wetland: { kind: "area", fillColor: "#2b3831", fillOpacity: 0.55 },
		water: { kind: "area", fillColor: "#1d2830", fillOpacity: 0.72, color: "#3d5560", weight: 1 },
		building: {
			kind: "area",
			fillColor: "#dfe4d8",
			fillOpacity: 0.14,
			color: "#eef1e9",
			weight: 1,
		},
		waterway: { kind: "line", color: "#456070", weight: 2 },
		railway: { kind: "line", color: "#a8ada0", weight: 1.6, dashArray: "8 5" },
		road_major: { kind: "line", color: DE_WHITE, weight: 3.2 },
		road_minor: { kind: "line", color: "#d2d6cb", weight: 2.2 },
		track: { kind: "line", color: "#c6cbbe", weight: 2, dashArray: "9 7" },
		path: { kind: "line", color: "#e4e8dd", weight: 2, dashArray: "1 8", lineCap: "round" },
		barrier: { kind: "line", color: "#c9444a", weight: 1.6, dashArray: "9 7" },
	},
};

// "Airsoft Days" — the only bright look: the printed map sits on a vivid apple-green
// surround, with the same white line work over dark forest. From ASD-39517-2024-7.
const asdTheme: OsmTheme = {
	ground: "#3c4433",
	grid: "#e8f0d8",
	border: "#4f8f2a",
	edge: "#dff0c4",
	styles: {
		forest: { kind: "area", fillColor: "#17220f", fillOpacity: 0.9 },
		treeline: { kind: "line", color: "#354a22", weight: 2, dashArray: "2 5" },
		grass: { kind: "area", fillColor: "#4c5a34", fillOpacity: 0.58 },
		farmland: { kind: "area", fillColor: "#57612f", fillOpacity: 0.5 },
		bare: { kind: "area", fillColor: "#6a6446", fillOpacity: 0.62 },
		builtup: { kind: "area", fillColor: "#414631", fillOpacity: 0.5 },
		wetland: { kind: "area", fillColor: "#33463a", fillOpacity: 0.55 },
		water: { kind: "area", fillColor: "#23343c", fillOpacity: 0.72, color: "#476b74", weight: 1 },
		building: {
			kind: "area",
			fillColor: "#e2e8d4",
			fillOpacity: 0.18,
			color: "#f0f4e6",
			weight: 1,
		},
		waterway: { kind: "line", color: "#4a6b76", weight: 2 },
		railway: { kind: "line", color: "#aeb69e", weight: 1.6, dashArray: "8 5" },
		road_major: { kind: "line", color: "#f4f8ec", weight: 3 },
		road_minor: { kind: "line", color: "#d8dfc9", weight: 2.2 },
		track: { kind: "line", color: "#cbd3bc", weight: 2, dashArray: "9 7" },
		path: { kind: "line", color: "#e8eede", weight: 2, dashArray: "1 8", lineCap: "round" },
		barrier: { kind: "line", color: "#c8d64a", weight: 1.6, dashArray: "9 7" },
	},
};

// "LIGHT-SIM" — a plain, almost unstyled satellite look with a cool blue cast and a
// thin white UTM grid on a near-black surround. From DE-39517-2026-7.
const lsoTheme: OsmTheme = {
	ground: "#39423a",
	tone: { color: "#12314a", opacity: 0.08 },
	grid: "#ffffff",
	border: "#0d1114",
	edge: "#ffffff",
	styles: {
		forest: { kind: "area", fillColor: "#1b2a1a", fillOpacity: 0.88 },
		treeline: { kind: "line", color: "#2f4429", weight: 2, dashArray: "2 5" },
		grass: { kind: "area", fillColor: "#4a5340", fillOpacity: 0.55 },
		farmland: { kind: "area", fillColor: "#535840", fillOpacity: 0.5 },
		bare: { kind: "area", fillColor: "#6d6552", fillOpacity: 0.65 },
		builtup: { kind: "area", fillColor: "#3f463c", fillOpacity: 0.5 },
		wetland: { kind: "area", fillColor: "#31443e", fillOpacity: 0.55 },
		water: { kind: "area", fillColor: "#20323f", fillOpacity: 0.75, color: "#4a7a90", weight: 1 },
		building: {
			kind: "area",
			fillColor: "#e6eae0",
			fillOpacity: 0.12,
			color: "#f4f7ef",
			weight: 1,
		},
		waterway: { kind: "line", color: "#4d7285", weight: 2 },
		railway: { kind: "line", color: "#aab2a6", weight: 1.6, dashArray: "8 5" },
		road_major: { kind: "line", color: "#ffffff", weight: 3 },
		road_minor: { kind: "line", color: "#e2e6dd", weight: 2 },
		track: { kind: "line", color: "#d5dad0", weight: 1.8, dashArray: "9 7" },
		path: { kind: "line", color: "#eef1ea", weight: 1.8, dashArray: "1 7", lineCap: "round" },
		barrier: { kind: "line", color: "#4aa3d6", weight: 1.6, dashArray: "9 7" },
	},
};

// "Lost Airfield" — a desaturated grey-green daytime satellite with soft white line
// work and a black surround; lighter than Dark Emergency, colder than Airsoft Days.
const lafTheme: OsmTheme = {
	ground: "#4a5147",
	grid: "#dfe4da",
	border: "#0a0c0b",
	edge: "#b9c0b4",
	styles: {
		forest: { kind: "area", fillColor: "#222c1d", fillOpacity: 0.85 },
		treeline: { kind: "line", color: "#38472c", weight: 2, dashArray: "2 5" },
		grass: { kind: "area", fillColor: "#5a6148", fillOpacity: 0.55 },
		farmland: { kind: "area", fillColor: "#626648", fillOpacity: 0.5 },
		bare: { kind: "area", fillColor: "#7c7561", fillOpacity: 0.65 },
		builtup: { kind: "area", fillColor: "#4d5348", fillOpacity: 0.5 },
		wetland: { kind: "area", fillColor: "#3d4d45", fillOpacity: 0.55 },
		water: { kind: "area", fillColor: "#2a3a44", fillOpacity: 0.72, color: "#557079", weight: 1 },
		building: {
			kind: "area",
			fillColor: "#eef1e8",
			fillOpacity: 0.22,
			color: "#ffffff",
			weight: 1,
		},
		waterway: { kind: "line", color: "#557079", weight: 2 },
		railway: { kind: "line", color: "#b6bcb0", weight: 1.6, dashArray: "8 5" },
		road_major: { kind: "line", color: "#f6f8f3", weight: 3 },
		road_minor: { kind: "line", color: "#dee3d8", weight: 2.2 },
		track: { kind: "line", color: "#d2d8cc", weight: 2, dashArray: "9 7" },
		path: { kind: "line", color: "#e9ede4", weight: 2, dashArray: "1 8", lineCap: "round" },
		barrier: { kind: "line", color: "#d8b34a", weight: 1.6, dashArray: "9 7" },
	},
};

const THEMES = {
	opt: optTheme,
	m24: m24Theme,
	de: deTheme,
	asd: asdTheme,
	lso: lsoTheme,
	laf: lafTheme,
} as const;
/** Name of an available OSM look. */
export type OsmThemeName = keyof typeof THEMES;

/**
 * The theme's opaque surround color — the same fill `buildOsmFrame` paints outside the
 * grid rectangle. Used as the map container's background so panning past the field (or
 * past the drawn clip area during a fast fling) shows the map's own border color
 * instead of the app's dark blue.
 */
export function osmSurroundColor(theme: OsmThemeName = "opt"): string {
	return THEMES[theme].border;
}

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
	/** Which look to render. Defaults to "opt". */
	theme?: OsmThemeName;
	/** Dedicated (low z-index) pane so the map renders under markers/overlays. */
	pane?: string;
	/**
	 * Renderer to draw into. The terrain panes pass a `L.canvas()` here: as SVG this
	 * layer is ~380 DOM paths the browser restyles and rasterizes on every redraw, and
	 * a drag forces several redraws. Canvas makes it one bitmap and one call per shape.
	 */
	renderer?: L.Renderer;
}

function ringToLatLngs(ring: [number, number][], project: ProjectFn): L.LatLngExpression[] {
	return ring.map(([lng, lat]) => project(lng, lat));
}

/**
 * Build a single LayerGroup containing the themed ground base, every OSM feature,
 * and (for themes that use one) a tone wash — stacked bottom to top. Add it to the
 * map like any other layer.
 */
export function buildOsmLayer(data: OsmFeatureCollection, opts: BuildOsmOptions): L.LayerGroup {
	const { project, pixelProject, width, height, pane, renderer } = opts;
	const theme = THEMES[opts.theme ?? "opt"];
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
		renderer,
		stroke: false,
		fill: true,
		fillColor: theme.ground,
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
		const style = theme.styles[klass];

		for (const f of features) {
			if (style.kind === "area" && f.geometry.type === "Polygon") {
				const latlngs = f.geometry.coordinates.map((ring) => ringToLatLngs(ring, project));
				L.polygon(latlngs, {
					pane,
					renderer,
					stroke: style.weight != null,
					color: style.color ?? style.fillColor,
					weight: style.weight ?? 0,
					fill: true,
					fillColor: style.fillColor,
					fillOpacity: style.fillOpacity,
					interactive: false,
				}).addTo(group);
			} else if (f.geometry.type === "LineString") {
				const s = (style.kind === "line" ? style : theme.styles.path) as LineStyle;
				L.polyline(ringToLatLngs(f.geometry.coordinates, project), {
					pane,
					renderer,
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
						renderer,
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

	// 3) Optional tone wash over the whole field, tying the palette together.
	if (theme.tone) {
		L.polygon(canvasCorners(), {
			pane,
			renderer,
			stroke: false,
			fill: true,
			fillColor: theme.tone.color,
			fillOpacity: theme.tone.opacity,
			interactive: false,
		}).addTo(group);
	}

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
	/** Theme (for the grid color). Defaults to "opt". */
	theme?: OsmThemeName;
	/** Pane to draw into (kept separate so the grid can be toggled). */
	pane?: string;
	/** Renderer to draw into — see `BuildOsmOptions.renderer`. */
	renderer?: L.Renderer;
}

/**
 * Build the faint coordinate grid as its own layer, so it can be shown/hidden
 * independently of the terrain. Drawn on top, like the printed map's grid. The
 * outer border is drawn by buildOsmFrame instead (always on).
 */
export function buildOsmGrid(opts: BuildGridOptions): L.LayerGroup {
	const { pixelProject, width, height, stepPx, pane, renderer } = opts;
	const group = L.layerGroup();
	if (stepPx <= 0) return group;

	const color = THEMES[opts.theme ?? "opt"].grid;
	const gridStyle = { pane, renderer, color, weight: 1, opacity: 0.16, interactive: false };
	for (let x = stepPx; x < width; x += stepPx) {
		L.polyline([pixelProject(x, 0), pixelProject(x, height)], gridStyle).addTo(group);
	}
	for (let y = stepPx; y < height; y += stepPx) {
		L.polyline([pixelProject(0, y), pixelProject(width, y)], gridStyle).addTo(group);
	}
	return group;
}

export interface BuildFrameOptions {
	/** Canvas pixel -> Leaflet LatLng. */
	pixelProject: PixelProjectFn;
	/** Canvas size in pixels. */
	width: number;
	height: number;
	/** Theme (for the border + edge colors). Defaults to "opt". */
	theme?: OsmThemeName;
	/** Pane to draw into. */
	pane?: string;
	/** Renderer to draw into — see `BuildOsmOptions.renderer`. */
	renderer?: L.Renderer;
}

/**
 * Give the map a clean border: paint everything OUTSIDE the grid rectangle with an
 * opaque surround (hiding OSM geometry that spills past the edge), then stroke the
 * rectangle edge. Nothing is rendered beyond the grid.
 */
export function buildOsmFrame(opts: BuildFrameOptions): L.LayerGroup {
	const { pixelProject, width, height, pane, renderer } = opts;
	const theme = THEMES[opts.theme ?? "opt"];
	const group = L.layerGroup();

	const canvas: L.LatLngExpression[] = [
		pixelProject(0, 0),
		pixelProject(width, 0),
		pixelProject(width, height),
		pixelProject(0, height),
	];

	// Far larger than the field so it covers the whole viewport at any pan/zoom.
	const M = 100000;
	const outer: L.LatLngExpression[] = [
		[-M, -M],
		[-M, width + M],
		[height + M, width + M],
		[height + M, -M],
	];

	// Opaque surround (canvas rectangle is a hole).
	L.polygon([outer, canvas], {
		pane,
		renderer,
		stroke: false,
		fill: true,
		fillColor: theme.border,
		fillOpacity: 1,
		interactive: false,
	}).addTo(group);
	// Crisp edge line along the grid rectangle.
	L.polygon(canvas, {
		pane,
		renderer,
		color: theme.edge,
		weight: 1.5,
		opacity: 0.6,
		fill: false,
		interactive: false,
	}).addTo(group);

	return group;
}
