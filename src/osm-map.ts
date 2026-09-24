// -----------------------------------------------------------------------------
// osm-map.ts
// The look of the map, and the two things that draw it: `bakeOsm` projects the
// OpenStreetMap-derived GeoJSON (public/map_osm.geojson, produced by
// scripts/fetch-osm.mjs) into canvas pixels once, and `paintTile` paints that baked
// geometry — plus the grid, the out-of-bounds mask, the zones and the border — into
// one tile of the basemap. `src/basemap-layer.ts` owns the tiles themselves.
//
// The geometry goes through the SAME GPS->pixel transform the rest of the app uses,
// so the drawn features line up with the GPS dot and the points of interest.
// Everything is bundled — no tile server, no network — so the map works offline.
//
// Styling deliberately mimics the "Operation Tschernobyl" printed map: an aged
// sepia satellite look — dark olive-brown forest, sandy clearings, gold roads and
// trails, translucent building footprints, a faint gold coordinate grid, and a
// warm tone wash over the whole field.
// -----------------------------------------------------------------------------

import type { ZoneStyle } from "./scenarios/scenario.js";

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
		barrier: { kind: "line", color: "#4a4538", weight: 1.6, dashArray: "9 7" },
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
		barrier: { kind: "line", color: "#4e5048", weight: 1.6, dashArray: "9 7" },
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
		barrier: { kind: "line", color: "#454843", weight: 1.6, dashArray: "9 7" },
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
		barrier: { kind: "line", color: "#4a4f40", weight: 1.6, dashArray: "9 7" },
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
		barrier: { kind: "line", color: "#4a4f4c", weight: 1.6, dashArray: "9 7" },
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
		barrier: { kind: "line", color: "#3d423e", weight: 1.6, dashArray: "9 7" },
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

/**
 * Grid spacing in metres — the 100 m squares the printed maps use (LIGHT-SIM's is a
 * real UTM zone 32N grid at that pitch, see `src/scenarios/light-sim.ts`), and the
 * step the scale bar reads against.
 */
export const GRID_STEP_M = 100;

/**
 * Name of a grid column, counting from the canvas's left edge: A…Z, then AA, AB —
 * spreadsheet lettering, so the scheme cannot run out however wide the field gets.
 * Rows are simply numbered from the top edge, matching the pixel convention.
 */
export function gridColumnLabel(index: number): string {
	let label = "";
	for (let n = index; n >= 0; n = Math.floor(n / 26) - 1) {
		label = String.fromCharCode(65 + (n % 26)) + label;
	}
	return label;
}

// =============================================================================
//  Baking
//
//  Every vertex is projected to canvas pixels ONCE per map load and kept in a flat
//  Float32Array — a vertex buffer, in the game-engine sense. Painting a tile is then
//  a transform plus moveTo/lineTo over that buffer: nothing is re-projected,
//  re-simplified or allocated while the map moves. The whole file is 379 features and
//  ~9k vertices, so the bake costs about a millisecond and the per-feature bounding
//  box is all the culling a tile needs.
// =============================================================================

/**
 * Project a coordinate pair to canvas pixels. The argument order is the source's:
 * GeoJSON hands over `(lng, lat)`, the scenario rings `(lat, lng)` — the caller closes
 * over the right one.
 */
export type Project = (a: number, b: number) => { px: number; py: number };

/** One or more canvas-pixel rings with the bounding box that culls them. */
export interface BakedShape {
	/** Flat `[x0, y0, x1, y1, …]` per ring. */
	rings: Float32Array[];
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

export interface BakedFeature extends BakedShape {
	k: FeatureClass;
	/** The source geometry was a Polygon: an area style fills it, a line style rings it. */
	closed: boolean;
}

/** The whole OSM base, projected and already sorted into `DRAW_ORDER`. */
export interface BakedGeometry {
	features: BakedFeature[];
}

function emptyShape(): BakedShape {
	return { rings: [], minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

function addRing(shape: BakedShape, coords: [number, number][], project: Project): void {
	const flat = new Float32Array(coords.length * 2);
	for (let i = 0; i < coords.length; i++) {
		const { px, py } = project(coords[i][0], coords[i][1]);
		flat[i * 2] = px;
		flat[i * 2 + 1] = py;
		if (px < shape.minX) shape.minX = px;
		if (px > shape.maxX) shape.maxX = px;
		if (py < shape.minY) shape.minY = py;
		if (py > shape.maxY) shape.maxY = py;
	}
	shape.rings.push(flat);
}

/** Bake a single ring — a play-area boundary, a zone, a frontline. */
export function bakeShape(points: [number, number][], project: Project): BakedShape {
	const shape = emptyShape();
	if (points.length > 0) addRing(shape, points, project);
	return shape;
}

/** Bake the bundled OSM feature collection. Runs once per map load. */
export function bakeOsm(data: OsmFeatureCollection, project: Project): BakedGeometry {
	const order = new Map(DRAW_ORDER.map((klass, index) => [klass, index]));
	const features: BakedFeature[] = [];

	for (const feature of data.features) {
		const rank = order.get(feature.properties.k);
		if (rank == null) continue;
		const shape = emptyShape();
		if (feature.geometry.type === "Polygon") {
			for (const ring of feature.geometry.coordinates) addRing(shape, ring, project);
		} else {
			addRing(shape, feature.geometry.coordinates, project);
		}
		features.push({
			...shape,
			k: feature.properties.k,
			closed: feature.geometry.type === "Polygon",
		});
	}

	// Sorted here rather than at paint time: the order is fixed for the life of the
	// map, and a tile then paints in one pass over one array.
	features.sort((a, b) => order.get(a.k)! - order.get(b.k)!);
	return { features };
}

// =============================================================================
//  Painting a tile
//
//  Everything static goes in here — terrain, grid, out-of-bounds mask, zones,
//  frontlines, border — because everything static can then be rasterized once per
//  tile and afterwards only translated. Only things that MOVE (the position dot, the
//  route, the PoI and HQ markers, the zone labels) stay Leaflet layers.
// =============================================================================

/** A marked area traced off the printed map, baked. */
export interface BakedZone {
	shape: BakedShape;
	color: string;
	style: ZoneStyle;
}

/** An open frontline, baked. */
export interface BakedLine {
	shape: BakedShape;
	color: string;
}

/** Everything a tile has to know to paint itself. Rebuilt only on a map/toggle change. */
export interface TileScene {
	/**
	 * The OSM base. `null` on a photo map, where the imagery is a Leaflet overlay in a
	 * pane below the tiles — the tiles then paint only what is traced on top of it (mask,
	 * zones, frontlines) and stay transparent everywhere else.
	 */
	terrain: BakedGeometry | null;
	theme: OsmThemeName;
	/** The canvas rectangle. Nothing is painted inside it that is not the map, and
	 *  nothing is painted outside it that is not the surround. */
	width: number;
	height: number;
	/** Grid spacing in canvas pixels; 0 draws no grid. */
	gridStepPx: number;
	playArea: BakedShape | null;
	zones: BakedZone[];
	lines: BakedLine[];
	showGrid: boolean;
	showMask: boolean;
	showZones: boolean;
}

/** Where a tile sits in canvas pixels, and how big a canvas pixel is on it. */
export interface TileView {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
	/** Screen (CSS) pixels per canvas pixel — the tile zoom's scale. */
	scale: number;
	/** Device pixels per screen pixel in this tile's backing store. */
	pixelRatio: number;
}

/** Out-of-bounds hatch: perpendicular period and stripe width, in screen pixels. */
const MASK_HATCH = { period: 9, width: 2.5, color: "#000000", alpha: 0.3 };
/** Zone hatch, per the printed maps' safe-zone stripes. */
const ZONE_HATCH = { period: 10, width: 3.5, alpha: 0.55 };
/**
 * Biohazard zone, per the printed maps' "Verstrahlt" areas: symbols `size` screen
 * pixels across, staggered two to a `period`-pixel tile so they read as a scatter
 * rather than a grid.
 */
const ZONE_BIOHAZARD = { period: 64, size: 26, alpha: 0.75 };

const NO_DASH: number[] = [];
const dashCache = new Map<string, number[]>();

function parseDash(dashArray: string | undefined): number[] {
	if (!dashArray) return NO_DASH;
	let parsed = dashCache.get(dashArray);
	if (!parsed) {
		parsed = dashArray
			.split(/[\s,]+/)
			.map(Number)
			.filter(Number.isFinite);
		dashCache.set(dashArray, parsed);
	}
	return parsed;
}

function setDash(ctx: CanvasRenderingContext2D, dashArray: string | undefined, scale: number) {
	const dash = parseDash(dashArray);
	ctx.setLineDash(dash === NO_DASH ? NO_DASH : dash.map((segment) => segment / scale));
}

function overlaps(shape: BakedShape, view: TileView, padPx: number): boolean {
	const pad = padPx / view.scale;
	return (
		shape.maxX >= view.minX - pad &&
		shape.minX <= view.maxX + pad &&
		shape.maxY >= view.minY - pad &&
		shape.minY <= view.maxY + pad
	);
}

function traceShape(ctx: CanvasRenderingContext2D, shape: BakedShape, close: boolean) {
	for (const ring of shape.rings) {
		if (ring.length < 4) continue;
		ctx.moveTo(ring[0], ring[1]);
		for (let i = 2; i < ring.length; i += 2) ctx.lineTo(ring[i], ring[i + 1]);
		if (close) ctx.closePath();
	}
}

/**
 * The diagonal stripe tile behind every hatch, cached by look and resolution.
 *
 * This replaces the SVG `<pattern>` the mask and the zones used to be filled with —
 * same idea (a fixed-size stripe repeated in *screen* space), except a canvas can
 * hold it. The stripes are baked at 45° into a square tile rather than rotated at
 * paint time, because `CanvasPattern.setTransform` is the one part of this that is
 * not dependable everywhere.
 */
const stripeCache = new Map<string, HTMLCanvasElement>();

function stripeSide(period: number, pixelRatio: number): number {
	// A 45° line repeated every `side` pixels along both axes is `side / √2` apart
	// measured perpendicular, which is the period the SVG pattern specified.
	return Math.max(2, Math.round(period * Math.SQRT2 * pixelRatio));
}

function stripeTile(
	color: string,
	alpha: number,
	period: number,
	width: number,
	pixelRatio: number,
): HTMLCanvasElement {
	const key = `${color}|${alpha}|${period}|${width}|${pixelRatio}`;
	let tile = stripeCache.get(key);
	if (tile) return tile;

	const side = stripeSide(period, pixelRatio);
	tile = document.createElement("canvas");
	tile.width = side;
	tile.height = side;
	const ctx = tile.getContext("2d")!;
	ctx.strokeStyle = color;
	ctx.globalAlpha = alpha;
	ctx.lineWidth = width * pixelRatio;
	// Three passes so the stripe crossing each corner is drawn from both sides and the
	// tile repeats seamlessly.
	for (const offset of [-side, 0, side]) {
		ctx.beginPath();
		ctx.moveTo(offset, side);
		ctx.lineTo(offset + side, 0);
		ctx.stroke();
	}
	stripeCache.set(key, tile);
	return tile;
}

function modulo(value: number, size: number): number {
	return ((value % size) + size) % size;
}

/**
 * The biohazard symbol, drawn from its geometric construction rather than shipped as
 * an image: three arms (circles on a circle of centres), each hollowed by a circle set
 * further out so it breaks through the rim, a hole and three slits at the hub, and the
 * ring showing through each arm's hollow. Unit = the arms' radius, so the whole symbol
 * spans `2 × (armOffset + 1)`.
 */
const BIOHAZARD = {
	armOffset: 0.733,
	hollowRadius: 0.7,
	hollowOffset: 1.1,
	hubRadius: 0.2,
	ringRadius: 0.9,
	ringWidth: 0.2,
	gap: 0.067,
	slitLength: 0.55,
};
const BIOHAZARD_EXTENT = BIOHAZARD.armOffset + 1;
const BIOHAZARD_ARMS = [-90, 30, 150].map((deg) => (deg * Math.PI) / 180);

/** Draw one biohazard symbol centred on (x, y); `radius` is its overall half-width. */
function drawBiohazard(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
	const b = BIOHAZARD;
	const circle = (cx: number, cy: number, r: number) => {
		ctx.moveTo(cx + r, cy);
		ctx.arc(cx, cy, r, 0, Math.PI * 2);
	};
	const around = (offset: number, r: number) => {
		for (const a of BIOHAZARD_ARMS) circle(Math.cos(a) * offset, Math.sin(a) * offset, r);
	};

	ctx.save();
	ctx.translate(x, y);
	ctx.scale(radius / BIOHAZARD_EXTENT, radius / BIOHAZARD_EXTENT);

	// The three arms, hollowed out, with the hub hole and slits cut through them.
	ctx.beginPath();
	around(b.armOffset, 1);
	ctx.fill();
	ctx.globalCompositeOperation = "destination-out";
	ctx.beginPath();
	around(b.hollowOffset, b.hollowRadius);
	circle(0, 0, b.hubRadius);
	ctx.fill();
	ctx.lineWidth = b.gap;
	ctx.beginPath();
	for (const a of BIOHAZARD_ARMS) {
		ctx.moveTo(0, 0);
		ctx.lineTo(-Math.cos(a) * b.slitLength, -Math.sin(a) * b.slitLength);
	}
	ctx.stroke();
	ctx.globalCompositeOperation = "source-over";

	// The ring, visible only inside the hollows and kept a gap clear of the arms.
	ctx.beginPath();
	around(b.hollowOffset, b.hollowRadius - b.gap);
	ctx.clip();
	ctx.beginPath();
	circle(0, 0, b.ringRadius + b.ringWidth / 2);
	circle(0, 0, b.ringRadius - b.ringWidth / 2);
	ctx.fill("evenodd");
	ctx.restore();
}

/**
 * The biohazard tile, cached like the stripes. Two symbols per tile, on the diagonal,
 * so the repeat is a staggered scatter; each sits wholly inside its quarter, so the
 * tile repeats seamlessly without drawing anything across its edges.
 */
const biohazardCache = new Map<string, HTMLCanvasElement>();

function biohazardTile(color: string, alpha: number, pixelRatio: number): HTMLCanvasElement {
	const key = `${color}|${alpha}|${pixelRatio}`;
	let tile = biohazardCache.get(key);
	if (tile) return tile;

	const side = Math.max(4, Math.round(ZONE_BIOHAZARD.period * pixelRatio));
	const radius = Math.min(ZONE_BIOHAZARD.size * pixelRatio, side / 2) / 2;
	tile = document.createElement("canvas");
	tile.width = side;
	tile.height = side;
	const ctx = tile.getContext("2d")!;
	ctx.fillStyle = color;
	ctx.strokeStyle = color;
	drawBiohazard(ctx, side / 4, side / 4, radius);
	drawBiohazard(ctx, (side * 3) / 4, (side * 3) / 4, radius);
	// Alpha goes on the finished symbols in one pass, so the cut-outs stay clean.
	ctx.globalCompositeOperation = "destination-in";
	ctx.globalAlpha = alpha;
	ctx.fillRect(0, 0, side, side);
	biohazardCache.set(key, tile);
	return tile;
}

/**
 * Fill the path already on `ctx` with a repeating tile, in DEVICE space so it keeps
 * its size on screen at any zoom — and offset so it lines up across tile seams.
 * The path itself is untouched: a canvas path is stored in device coordinates as it
 * is built, so changing the transform afterwards moves only the pattern.
 */
function fillPattern(ctx: CanvasRenderingContext2D, view: TileView, tile: HTMLCanvasElement) {
	const pattern = ctx.createPattern(tile, "repeat");
	if (!pattern) return;
	const side = tile.width;
	const unit = view.scale * view.pixelRatio;

	ctx.save();
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.translate(-modulo(view.minX * unit, side), -modulo(view.minY * unit, side));
	ctx.globalAlpha = 1;
	ctx.fillStyle = pattern;
	ctx.fill("evenodd");
	ctx.restore();
}

/** Fill the path already on `ctx` with a diagonal hatch; see `fillPattern`. */
function fillHatch(
	ctx: CanvasRenderingContext2D,
	view: TileView,
	color: string,
	alpha: number,
	period: number,
	width: number,
) {
	fillPattern(ctx, view, stripeTile(color, alpha, period, width, view.pixelRatio));
}

function paintFeature(
	ctx: CanvasRenderingContext2D,
	feature: BakedFeature,
	theme: OsmTheme,
	scale: number,
) {
	const style = theme.styles[feature.k];

	if (style.kind === "area" && feature.closed) {
		ctx.beginPath();
		traceShape(ctx, feature, true);
		ctx.globalAlpha = style.fillOpacity;
		ctx.fillStyle = style.fillColor;
		// Same rule Leaflet's paths use, so a polygon with holes still reads as one.
		ctx.fill("evenodd");
		if (style.weight != null) {
			ctx.globalAlpha = 1;
			ctx.strokeStyle = style.color ?? style.fillColor;
			ctx.lineWidth = style.weight / scale;
			ctx.setLineDash(NO_DASH);
			ctx.stroke();
		}
		return;
	}

	// A LineString classified as an area (rare) falls back to the path style, exactly
	// as the Leaflet version did; a closed way classified as a line gets its ring stroked.
	const line = (style.kind === "line" ? style : theme.styles.path) as LineStyle;
	ctx.beginPath();
	traceShape(ctx, feature, feature.closed);
	ctx.globalAlpha = line.opacity ?? 0.95;
	ctx.strokeStyle = line.color;
	ctx.lineWidth = line.weight / scale;
	ctx.lineCap = line.lineCap ?? "butt";
	setDash(ctx, line.dashArray, scale);
	ctx.stroke();
	ctx.lineCap = "butt";
}

/**
 * Paint one tile. `ctx` must already be transformed into canvas-pixel space (see
 * `BasemapLayer.createTile`), so everything here is written in the app's own pixel
 * convention: origin top-left, y down.
 */
export function paintTile(ctx: CanvasRenderingContext2D, scene: TileScene, view: TileView): void {
	const theme = THEMES[scene.theme];
	const { minX, minY, maxX, maxY, scale } = view;
	const terrain = scene.terrain;

	ctx.globalAlpha = 1;
	if (terrain) {
		// 1) The surround IS the frame. Filling it first means a tile off the edge of the
		//    field is finished in one call, and nothing can render past the border.
		ctx.fillStyle = theme.border;
		ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
	}

	ctx.save();
	ctx.beginPath();
	ctx.rect(0, 0, scene.width, scene.height);
	ctx.clip();

	if (terrain) {
		// 2) Ground, so no surround shows between features.
		ctx.fillStyle = theme.ground;
		ctx.fillRect(0, 0, scene.width, scene.height);

		// 3) The OSM features, in paint order, culled to this tile.
		for (const feature of terrain.features) {
			const style = theme.styles[feature.k];
			const pad = (style.kind === "line" ? style.weight : (style.weight ?? 0)) + 2;
			if (!overlaps(feature, view, pad)) continue;
			paintFeature(ctx, feature, theme, scale);
		}

		// 4) Optional tone wash tying the palette together.
		if (theme.tone) {
			ctx.globalAlpha = theme.tone.opacity;
			ctx.fillStyle = theme.tone.color;
			ctx.fillRect(0, 0, scene.width, scene.height);
		}
	}

	// 5) Coordinate grid, like the printed map's.
	if (scene.showGrid && scene.gridStepPx > 0) {
		ctx.globalAlpha = 0.16;
		ctx.strokeStyle = theme.grid;
		ctx.lineWidth = 1 / scale;
		ctx.setLineDash(NO_DASH);
		ctx.beginPath();
		for (let x = scene.gridStepPx; x < scene.width; x += scene.gridStepPx) {
			if (x < minX || x > maxX) continue;
			ctx.moveTo(x, Math.max(0, minY));
			ctx.lineTo(x, Math.min(scene.height, maxY));
		}
		for (let y = scene.gridStepPx; y < scene.height; y += scene.gridStepPx) {
			if (y < minY || y > maxY) continue;
			ctx.moveTo(Math.max(0, minX), y);
			ctx.lineTo(Math.min(scene.width, maxX), y);
		}
		ctx.stroke();
	}

	// 6) Out-of-bounds mask: darken + hatch everything outside the play area, then
	//    outline the boundary so its edge stays legible.
	const playArea = scene.playArea;
	if (scene.showMask && playArea && playArea.rings.length > 0) {
		ctx.beginPath();
		ctx.rect(0, 0, scene.width, scene.height);
		traceShape(ctx, playArea, true);
		ctx.globalAlpha = 0.55;
		ctx.fillStyle = "#05070a";
		ctx.fill("evenodd");
		fillHatch(ctx, view, MASK_HATCH.color, MASK_HATCH.alpha, MASK_HATCH.period, MASK_HATCH.width);

		if (overlaps(playArea, view, 4)) {
			ctx.beginPath();
			traceShape(ctx, playArea, true);
			ctx.globalAlpha = 0.9;
			ctx.strokeStyle = "#e8c24d";
			ctx.lineWidth = 2 / scale;
			ctx.setLineDash([10 / scale, 6 / scale]);
			ctx.stroke();
		}
	}

	// 7) Marked areas and frontlines traced off the printed map.
	if (scene.showZones) {
		for (const zone of scene.zones) {
			if (zone.shape.rings.length === 0 || !overlaps(zone.shape, view, 4)) continue;

			if (zone.style !== "outline") {
				ctx.beginPath();
				traceShape(ctx, zone.shape, true);
				ctx.globalAlpha = zone.style === "hatch" ? 0.1 : zone.style === "fill" ? 0.22 : 0.14;
				ctx.fillStyle = zone.color;
				ctx.fill("evenodd");
				if (zone.style === "hatch") {
					fillHatch(ctx, view, zone.color, ZONE_HATCH.alpha, ZONE_HATCH.period, ZONE_HATCH.width);
				} else if (zone.style === "biohazard") {
					fillPattern(ctx, view, biohazardTile(zone.color, ZONE_BIOHAZARD.alpha, view.pixelRatio));
				}
			}

			ctx.beginPath();
			traceShape(ctx, zone.shape, true);
			ctx.globalAlpha = 0.95;
			ctx.strokeStyle = zone.color;
			ctx.lineWidth = 2 / scale;
			ctx.setLineDash([8 / scale, 5 / scale]);
			ctx.stroke();
		}

		for (const line of scene.lines) {
			if (line.shape.rings.length === 0 || !overlaps(line.shape, view, 6)) continue;
			ctx.beginPath();
			traceShape(ctx, line.shape, false);
			ctx.globalAlpha = 0.95;
			ctx.strokeStyle = line.color;
			ctx.lineWidth = 4 / scale;
			ctx.setLineDash([14 / scale, 9 / scale]);
			ctx.stroke();
		}
	}

	ctx.restore();

	// 8) Crisp edge along the canvas rectangle — outside the clip, so the stroke is not
	//    halved by its own boundary. A photo base draws its own edge by ending.
	if (terrain) {
		ctx.globalAlpha = 0.6;
		ctx.strokeStyle = theme.edge;
		ctx.lineWidth = 1.5 / scale;
		ctx.setLineDash(NO_DASH);
		ctx.strokeRect(0, 0, scene.width, scene.height);
	}
	ctx.globalAlpha = 1;
}
