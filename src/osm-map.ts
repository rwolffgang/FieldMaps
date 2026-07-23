// -----------------------------------------------------------------------------
// osm-map.ts
// Render an OpenStreetMap-derived GeoJSON file (public/map_osm.geojson, produced
// by scripts/fetch-osm.mjs) as a styled Leaflet vector map.
//
// The geometry is projected through the SAME GPS->pixel transform the rest of the
// app uses, then handed to Leaflet CRS.Simple, so the drawn features line up with
// the GPS dot and the points of interest. Everything is bundled — no tiles, no
// network — so the custom map works fully offline.
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
}
type ClassStyle = AreaStyle | LineStyle;

// Dark-theme palette tuned to read against the app background (#0b0f14). Kept
// deliberately muted so the amber points-of-interest and the cyan GPS dot pop.
const STYLES: Record<FeatureClass, ClassStyle> = {
	// --- area fills ---
	builtup: { kind: "area", fillColor: "#2b2f38", fillOpacity: 0.5 },
	bare: { kind: "area", fillColor: "#3a352b", fillOpacity: 0.5 },
	farmland: { kind: "area", fillColor: "#41482a", fillOpacity: 0.35 },
	grass: { kind: "area", fillColor: "#2c4a32", fillOpacity: 0.4 },
	wetland: { kind: "area", fillColor: "#284a42", fillOpacity: 0.4 },
	forest: { kind: "area", fillColor: "#1f5b34", fillOpacity: 0.6 },
	water: { kind: "area", fillColor: "#1b4a72", fillOpacity: 0.75, color: "#3d6f9e", weight: 1 },
	building: { kind: "area", fillColor: "#5b6270", fillOpacity: 0.6, color: "#8b98a5", weight: 1 },
	// --- lines ---
	waterway: { kind: "line", color: "#3d6f9e", weight: 2 },
	railway: { kind: "line", color: "#b8c0cc", weight: 1.4, dashArray: "9 6" },
	road_major: { kind: "line", color: "#e0c56b", weight: 3.5 },
	road_minor: { kind: "line", color: "#9a9488", weight: 2 },
	track: { kind: "line", color: "#b39a63", weight: 1.6, dashArray: "5 5" },
	path: { kind: "line", color: "#d9b98a", weight: 1.6, dashArray: "2 5" },
	treeline: { kind: "line", color: "#3f7a4e", weight: 2, dashArray: "3 4" },
	barrier: { kind: "line", color: "#6b7280", weight: 1 },
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

function ringToLatLngs(ring: [number, number][], project: ProjectFn): L.LatLngExpression[] {
	return ring.map(([lng, lat]) => project(lng, lat));
}

/**
 * Build a single LayerGroup containing every OSM feature, styled and stacked in a
 * sensible paint order. Add it to the map like any other layer. Pass `pane` to put
 * the features in a dedicated (low z-index) pane so they render as a basemap under
 * the app's markers and overlays.
 */
export function buildOsmLayer(
	data: OsmFeatureCollection,
	project: ProjectFn,
	pane?: string,
): L.LayerGroup {
	const group = L.layerGroup();

	// Bucket features by class so we can add them in DRAW_ORDER (Leaflet paints in
	// insertion order within the SVG pane).
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
				const line = style.kind === "line" ? style : STYLES.path;
				const s = line as LineStyle;
				L.polyline(ringToLatLngs(f.geometry.coordinates, project), {
					pane,
					color: s.color,
					weight: s.weight,
					dashArray: s.dashArray,
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
						opacity: style.opacity ?? 0.95,
						interactive: false,
					}).addTo(group);
				}
			}
		}
	}

	return group;
}
