// -----------------------------------------------------------------------------
// map-definition.ts
// A scenario resolved into something that can be drawn: its base turned into a
// canvas size and the control points tying GPS to that canvas.
// -----------------------------------------------------------------------------

import type { ControlPoint } from "./transform.js";
import type { OsmThemeName } from "./osm-map.js";
import type { BoundaryLine, EventSchedule, Headquarters, LatLng, Zone } from "./scenario.js";

/** One selectable map: a photo overlay OR an OSM vector scenario. */
export interface MapDefinition {
	/** Stable identifier used for persistence and URLs. */
	id: string;
	/** Label shown on the landing card. */
	name: string;
	/** One-line description for the landing page card. */
	blurb?: string;
	/** The English version of `blurb`, shown to a non-German browser. */
	blurbEn?: string;
	/** When the event runs; drives the landing card's date and the overview ordering. */
	schedule?: EventSchedule;
	/** Accent colour for the landing card. */
	accent?: string;
	/** Path to a photo map image, relative to the asset base. Omit for OSM maps. */
	image?: string;
	/** Path to the bundled OSM GeoJSON, relative to the asset base. Omit for photos. */
	vectorData?: string;
	/** Which OSM look to render (vector maps only). Defaults to "opt". */
	theme?: OsmThemeName;
	/** Pixel dimensions of the coordinate canvas (image size, or OSM canvas size). */
	width: number;
	height: number;
	/** Hardcoded control points tying GPS to image/canvas pixels. */
	controlPoints: ControlPoint[];
	/** PoI id -> label to show on this map. Only listed ids are shown. */
	poiNames: Record<string, string>;
	/**
	 * Active play-area boundary as [lat, lng] points. Everything outside is covered
	 * by the out-of-bounds texture. Empty/undefined = whole field, no mask.
	 */
	playArea?: LatLng[];
	/** Marked areas traced from the event's tactical map. */
	zones?: Zone[];
	/** Faction headquarters with their emblems. */
	headquarters?: Headquarters[];
	/** Open frontlines traced from the event's tactical map. */
	lines?: BoundaryLine[];
	/** Whether the map's top row offers the prop dosimeter (Field Maps only). */
	dosimeter?: boolean;
	/** PoI ids that radiate strongly for the dosimeter (Field Maps only). */
	radiatingPois?: string[];
}
