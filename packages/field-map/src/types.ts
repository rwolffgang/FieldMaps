// -----------------------------------------------------------------------------
// types.ts
// The public shapes of `<field-map>`: what a host hands it, and what its events
// carry. Everything here is plain data — JSON-safe — so a host can send it to a
// server as it is.
// -----------------------------------------------------------------------------

import type { Mark, OsmTheme, OsmThemeName } from "@fieldmaps/core";
import type { FieldMapLang, FieldMapStrings } from "./strings.js";

/** Who started (or stopped) a navigation: the player on the map, or the host app in code. */
export type NavigationSource = "user" | "host";

/** What a navigation is heading for. */
export interface NavigationTarget {
	/**
	 * - `poi`: a point of interest of the current scenario (`id` is its physical id, "630")
	 * - `mark`: one of the player's own marks (`id` is the mark's id)
	 * - `marker`: a live marker the host set (`id` is the marker's id); it moves with it
	 * - `spot`: anywhere else — a long-pressed spot, or `navigateToCoordinates`
	 */
	kind: "poi" | "mark" | "marker" | "spot";
	id: string;
	/** As shown to the player. */
	name: string;
	/** Always present, so another client can resolve the target without knowing the ids. */
	lat: number;
	lng: number;
}

/** The running navigation, or null when there is none. */
export type NavigationState = null | {
	target: NavigationTarget;
	/** Epoch milliseconds. */
	startedAt: number;
	source: NavigationSource;
};

/** Why `fieldmap-navigation` fired. */
export type NavigationChangeReason =
	/** A navigation started — also when it replaced a running one (see `previous`). */
	| "started"
	/** The player ended it, or the host called `stopNavigation()`. */
	| "stopped"
	/** Its target went away: a deleted mark, or a live marker no longer in `markers`. */
	| "target-removed"
	/** The `scenario` changed, which ends any navigation on the old map. */
	| "scenario-changed";

export interface NavigationChangeDetail {
	state: NavigationState;
	previous: NavigationState;
	reason: NavigationChangeReason;
	/** Who caused this change. For "started" the same as `state.source`. */
	source: NavigationSource;
}

export interface NavigateOptions {
	/**
	 * Recorded on the navigation and echoed in `fieldmap-navigation`, so a host that
	 * syncs navigations can skip sending a change it received from its server back to
	 * it. Defaults to "host" for every method call.
	 */
	source?: NavigationSource;
}

/** The player's position, as the dot on the map shows it (lightly smoothed). */
export interface PositionFix {
	lat: number;
	lng: number;
	/** Metres, the radius of the accuracy circle. */
	accuracy: number;
	/** Degrees clockwise from north that the map's arrow points, or null without one. */
	heading: number | null;
	/** Metres per second, when the GPS reports it. */
	speed: number | null;
	/** Epoch milliseconds. */
	at: number;
}

/** What `setPosition()` takes in `position-source="external"` mode. */
export interface ExternalFix {
	lat: number;
	lng: number;
	/** Metres. */
	accuracy: number;
	/** GPS course in degrees from north, when moving. */
	heading?: number | null;
	/** Metres per second. */
	speed?: number | null;
}

/** Progress of the running navigation. */
export interface GuidanceDetail {
	/** The target's bearing relative to where the phone points: 0 ahead, 90 right. */
	relativeDeg: number;
	distanceM: number;
}

/**
 * Something the host draws on the map that is not part of the scenario: another
 * player, an objective, a supply drop. Replace the whole `markers` array whenever
 * something changes; the element compares it with the last one by `id` and only
 * moves, restyles, adds or removes what differs.
 */
export interface MapMarker {
	/** Stable across updates — e.g. the player's user id. */
	id: string;
	lat: number;
	lng: number;
	/** Shown under the marker and in the navigation list (callsign, objective name). */
	label?: string;
	/** Any CSS colour; the default dot, the arrow and the label take it. Default: the accent. */
	color?: string;
	/**
	 * Replaces the default dot: an HTML/SVG string, inserted as markup — so build it
	 * from trusted parts only. It is centred on the coordinate, and should be about 24 px.
	 */
	icon?: string;
	/** Degrees from north; draws an arrow in the marker's colour. Omit or null for none. */
	heading?: number | null;
	/** Metres; draws a faint ring of that radius around the marker. */
	accuracyM?: number;
	/**
	 * Epoch milliseconds of the position. Once older than the element's `staleAfterMs`
	 * the marker fades and shows how long ago it was seen. Omit to never go stale.
	 */
	seenAt?: number;
	/** Groups markers under a row of the ⚙ menu (see `markerLayers`), so they can be hidden. */
	layer?: string;
	/** Listed in the navigation select, so the player can navigate to it. */
	navigable?: boolean;
}

/** One row of the ⚙ menu that shows or hides every marker with that `layer`. */
export interface MarkerLayer {
	id: string;
	label: string;
}

/** Space the host's own chrome takes over the map, in CSS pixels. */
export interface FieldMapInsets {
	top?: number;
	bottom?: number;
}

export interface PermissionDetail {
	kind: "geolocation" | "compass";
	/**
	 * - `granted`: a first fix arrived / the compass is running
	 * - `denied`: the player refused; only the browser's site settings undo it
	 * - `prompt`: the iOS compass needs a tap on the element's "Enable compass" button
	 */
	state: "granted" | "denied" | "prompt";
}

/** Every event `<field-map>` dispatches, by name. All bubble and cross shadow roots. */
export interface FieldMapEventMap {
	/** The scenario's map is drawn (its OSM data has loaded). */
	"fieldmap-ready": CustomEvent<{ scenario: string }>;
	/** The player's position or heading changed. At most once per animation frame. */
	"fieldmap-fix": CustomEvent<PositionFix>;
	/** A navigation started, stopped, or lost its target. */
	"fieldmap-navigation": CustomEvent<NavigationChangeDetail>;
	/** The player came within a few metres of the navigation target. Once per approach. */
	"fieldmap-arrived": CustomEvent<{ target: NavigationTarget }>;
	/** Distance and relative bearing to the target, while navigating with a compass. */
	"fieldmap-guidance": CustomEvent<GuidanceDetail | null>;
	/** The player tapped a live marker. */
	"fieldmap-marker-click": CustomEvent<{ id: string }>;
	/** The player added, renamed or deleted one of their own marks on this map. */
	"fieldmap-marks-change": CustomEvent<{ scenario: string; marks: readonly Mark[] }>;
	/** A sensor permission changed. */
	"fieldmap-permission": CustomEvent<PermissionDetail>;
}

/**
 * `<field-map>`'s whole public surface — what `document.querySelector("field-map")`
 * returns. The element class (`FieldMap`) implements it; read this rather than the
 * class, whose declarations also list its private parts.
 */
export interface FieldMapElement extends HTMLElement {
	/** Scenario id ("opt", "de", …). Required. Changing it ends a running navigation. */
	scenario: string;
	/** Basemap look: a built-in name or an `OsmTheme` (see `extendTheme`). Default: the scenario's. */
	theme: OsmThemeName | OsmTheme | undefined;
	/** Where `map_osm.geojson` and `logos/` are served. Default: the page's directory. */
	assetBase: string;
	/** UI language. Default: the browser's. */
	locale: FieldMapLang | undefined;
	/** Replacements for any UI text. */
	strings: Partial<FieldMapStrings>;
	/** Prefix of the element's `localStorage` keys. Default "field-map". */
	storagePrefix: string;
	/** Space the host's own chrome covers at the top/bottom of the screen, in px. */
	insets: FieldMapInsets;
	/** "device": the element runs GPS and compass itself. "external": only `setPosition()`. */
	positionSource: "device" | "external";
	/** Keep the screen on while visible. Default true. */
	wakeLock: boolean;
	/** Show the "© OpenStreetMap" credit. Default true. */
	attribution: boolean;
	/** Live markers. Replace the array to update; it is diffed by `id`. */
	markers: readonly MapMarker[];
	/** Rows of the ⚙ menu that hide/show markers by `layer`. */
	markerLayers: readonly MarkerLayer[];
	/** A marker whose `seenAt` is older than this fades. 0: never. Default 30000. */
	staleAfterMs: number;
	/** Host chrome placed in the element's rows (see the guide, §3.4). */
	topStart: Element | null;
	topEnd: Element | null;
	topNotice: Element | null;
	bottomNotice: Element | null;

	/** The position as drawn (smoothed); null before the first fix. */
	readonly fix: PositionFix | null;
	/** The running navigation, or null. JSON-safe. */
	readonly navigation: NavigationState;
	/** Whether a navigation is running. */
	readonly navigating: boolean;

	/** Navigate to a PoI of the scenario. Throws RangeError for an id it does not show. */
	navigateToPoi(poiId: string, options?: NavigateOptions): NavigationState;
	/** Navigate to any coordinate. Throws RangeError on a value that is not one. */
	navigateToCoordinates(
		lat: number,
		lng: number,
		options?: NavigateOptions & { name?: string },
	): NavigationState;
	/** Navigate to a live marker, following it. Throws RangeError for an unknown id. */
	navigateToMarker(markerId: string, options?: NavigateOptions): NavigationState;
	/** End the running navigation, if any. */
	stopNavigation(options?: NavigateOptions): void;
	/** `positionSource = "external"` only: the player's position, and where the phone points. */
	setPosition(fix: ExternalFix, heading?: number | null): void;
	/** Re-measure after the element was un-hidden. */
	resize(): void;
	/** Re-read `--field-map-accent*` into the parts drawn in JavaScript. */
	refreshStyle(): void;

	addEventListener<K extends keyof FieldMapEventMap>(
		type: K,
		listener: (this: FieldMapElement, event: FieldMapEventMap[K]) => unknown,
		options?: boolean | AddEventListenerOptions,
	): void;
	addEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: boolean | AddEventListenerOptions,
	): void;
	removeEventListener<K extends keyof FieldMapEventMap>(
		type: K,
		listener: (this: FieldMapElement, event: FieldMapEventMap[K]) => unknown,
		options?: boolean | EventListenerOptions,
	): void;
	removeEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: boolean | EventListenerOptions,
	): void;
}
