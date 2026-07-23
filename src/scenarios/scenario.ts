// -----------------------------------------------------------------------------
// scenarios/scenario.ts
// A "scenario" is one playable variant of the field: which points of interest are
// active (and what they're called) plus the boundary of the active play area.
// Every scenario renders on the SAME shared OpenStreetMap base (see src/osm-map.ts)
// with the same styling — only the labels and the play-area boundary change.
//
// To add a scenario: copy an existing file in this folder, edit its poiNames and
// playArea, and register it in ./index.ts. Nothing else needs to change.
// -----------------------------------------------------------------------------

/** A [lat, lng] coordinate pair, as copied from Google Maps. */
export type LatLng = [number, number];

export interface Scenario {
	/** Stable id used for persistence and the map id (`osm-<id>`). */
	id: string;
	/** Label shown in the scenario selector. */
	name: string;
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
