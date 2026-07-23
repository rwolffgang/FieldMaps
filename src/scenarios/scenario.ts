// -----------------------------------------------------------------------------
// scenarios/scenario.ts
// A "scenario" is one playable variant of the field: which base map it draws on,
// which points of interest are active (and what they're called), and the boundary
// of the active play area.
//
// The base is either the shared OpenStreetMap vector map (see src/osm-map.ts) or a
// pre-georeferenced photo image. Only the labels, the base, and the play-area
// boundary change between scenarios.
//
// To add a scenario: copy an existing file in this folder, edit it, and register
// it in ./index.ts. Nothing else needs to change.
// -----------------------------------------------------------------------------

import type { ControlPoint } from "../transform.js";
import type { OsmThemeName } from "../osm-map.js";

/** A [lat, lng] coordinate pair, as copied from Google Maps. */
export type LatLng = [number, number];

/** What a scenario draws underneath its points of interest. */
export type ScenarioBase =
	| { kind: "osm"; theme?: OsmThemeName }
	| {
			kind: "image";
			/** Image file in /public. */
			image: string;
			/** Exact pixel dimensions of that image. */
			width: number;
			height: number;
			/** Control points tying GPS to the image pixels. */
			controlPoints: ControlPoint[];
	  };

export interface Scenario {
	/** Stable id, also used for persistence and as the map id. */
	id: string;
	/** Label shown in the scenario selector. */
	name: string;
	/** The map drawn under the PoIs: the shared OSM vector base, or a photo image. */
	base: ScenarioBase;
	/**
	 * PoI id -> label for this scenario. Only ids listed here are shown; a PoI with
	 * no entry is hidden. Start from DEFAULT_POI_NAMES and override what differs.
	 */
	poiNames: Record<string, string>;
	/**
	 * Boundary of the active play area, as an ordered ring of [lat, lng] points.
	 * Everything OUTSIDE this polygon is covered by the out-of-bounds texture.
	 * Leave empty ([]) to play the whole field with no mask.
	 *
	 * How to fill it: walk/trace the boundary in Google Maps, right-click each
	 * corner -> copy the lat/lng, and paste the pairs here in order.
	 */
	playArea: LatLng[];
}
