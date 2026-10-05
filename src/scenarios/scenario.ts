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
import type { EventSchedule } from "../event-schedule.js";

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

/** How a zone's interior is drawn; see `Zone.style`. */
export type ZoneStyle = "hatch" | "fill" | "outline" | "biohazard";

/**
 * A marked area copied off the printed tactical map — a safe zone, a faction's
 * territory, the "Zivile Zone", and so on. Drawn over the terrain, under the PoIs.
 */
export interface Zone {
	/** Stable id (used as a React-less render key and for the hatch pattern). */
	id: string;
	/** Label drawn in the middle of the area. */
	name: string;
	/** Ordered ring of [lat, lng] points. */
	points: LatLng[];
	/** Line + fill colour, any CSS colour. */
	color: string;
	/**
	 * "hatch" = diagonal stripes (the printed maps' safe-zone look), "fill" = flat
	 * translucent wash, "outline" = ring only, "biohazard" = a wash strewn with
	 * biohazard symbols (the printed maps' "Verstrahlt" look). Defaults to "hatch".
	 */
	style?: ZoneStyle;
}

/**
 * A faction headquarters / spawn, drawn as its emblem in a coloured ring — the
 * "Hauptquartier" circles on the printed maps.
 */
export interface Headquarters {
	id: string;
	/** Label shown under the emblem. */
	name: string;
	lat: number;
	lng: number;
	/** Ring colour, matching the printed map. */
	color: string;
	/** Emblem file under /public/logos (omit for a plain ring). */
	logo?: string;
}

/**
 * An open boundary line — a faction frontline such as Mission 24H's "Task Force
 * Grenze". Unlike a Zone this is not closed and encloses nothing.
 */
export interface BoundaryLine {
	id: string;
	name?: string;
	points: LatLng[];
	color: string;
}

export interface Scenario {
	/** Stable id, also used for persistence and as the map id. */
	id: string;
	/** Label shown on the landing card. */
	name: string;
	/** One line for the landing page card — what this game is, in the user's words. */
	blurb?: string;
	/** The same line in English, for a browser that is not set to German. */
	blurbEn?: string;
	/**
	 * When the event runs, month/day only — these repeat every year. Drives both the
	 * date shown on the landing card and the ordering there (soonest first). Leave it
	 * off for a style variant that isn't an event of its own.
	 */
	schedule?: EventSchedule;
	/** Accent colour for the landing card, taken from the event's printed map. */
	accent?: string;
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
	/** Marked areas from the printed map (safe zones, faction territory, …). */
	zones?: Zone[];
	/** Faction headquarters, drawn with their emblems. */
	headquarters?: Headquarters[];
	/** Open frontlines / boundary lines from the printed map. */
	lines?: BoundaryLine[];
	/**
	 * Offer the prop radiation dosimeter (`src/dosimeter-view.ts`) from the map's top
	 * row. For the Stalker games; it measures nothing and is driven by a slider.
	 */
	dosimeter?: boolean;
	/**
	 * PoIs that radiate for the dosimeter (its ОБЪЕКТ lamp) — pick a few that fit the
	 * story; with many the counter is always yellow and stops meaning anything. The
	 * faction headquarters always radiate, and so do the `biohazard` zones (ЗОНА).
	 */
	radiatingPois?: string[];
}
