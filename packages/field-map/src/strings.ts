// -----------------------------------------------------------------------------
// strings.ts
// Everything `<field-map>` writes on screen, in German and English. German is
// the source text — the events are German, and so is everything printed on the
// tactical maps — and anything not "de" gets English.
//
// A host overrides any of these through the element's `strings` property; what
// it leaves out keeps the text below.
// -----------------------------------------------------------------------------

import type { NavigationHint } from "@fieldmaps/core";

export type FieldMapLang = "de" | "en";

export interface FieldMapStrings {
	waitingForGps: string;
	/** Permission refused: actionable, and shown the moment it happens. */
	gpsDenied: string;
	/** No fix yet. Transient on iOS, so only shown once it has lasted (see `sensors.ts`). */
	gpsNoFix: string;
	offMap: string;
	mapLoading: string;
	mapLoadFailed: string;
	/** `scenario` names nothing in the package. */
	unknownScenario: (id: string) => string;
	enableCompass: string;
	compassDenied: string;
	navigateTo: string;
	navigateHere: string;
	/** A spot the player long-pressed, on a map whose grid is not on screen to name it. */
	markedPosition: string;
	/** The same spot when the grid is drawn, named by the square it falls in. */
	gridSquare: (label: string) => string;
	navStop: string;
	/** The player's own marks — see `@fieldmaps/core`'s `marks.ts`. */
	markHere: string;
	markMyPosition: string;
	/** A new mark's name before the player gives it one. */
	markName: (n: number) => string;
	markRename: string;
	markRenamePrompt: string;
	markDelete: string;
	/** The delete button's second state: a mark is the player's own work, so it asks once. */
	markDeleteConfirm: string;
	marksGroup: string;
	/** The navigable live markers' group in the target list (other players, objectives). */
	liveGroup: string;
	/** How long ago a live marker was last updated, once it has gone stale. */
	lastSeen: (seconds: number) => string;
	navArrived: string;
	navEnableCompass: string;
	/** The same line on a device with no compass at all: the GPS course takes over when moving. */
	navNoCompass: string;
	navOffField: string;
	navHints: Record<NavigationHint, string>;
	scale: string;
	layers: string;
	layerPoiIds: string;
	layerGrid: string;
	layerMask: string;
	layerZones: string;
	layerHqs: string;
	layerMarks: string;
}

export const FIELD_MAP_STRINGS: Record<FieldMapLang, FieldMapStrings> = {
	de: {
		waitingForGps: "Warte auf GPS…",
		gpsDenied: "GPS-Freigabe abgelehnt — Standort in den Browser-Einstellungen erlauben",
		gpsNoFix: "⚠ Kein GPS-Signal — unter freiem Himmel klappt es besser",
		offMap: "⚠ Außerhalb der Karte — Position in der Kartenmitte angezeigt",
		mapLoading: "Karte wird geladen…",
		mapLoadFailed: "⚠ Karte konnte nicht geladen werden — tippen zum Wiederholen",
		unknownScenario: (id) => `⚠ Unbekanntes Szenario „${id}“`,
		enableCompass: "Kompass aktivieren",
		compassDenied: "Kompass-Freigabe abgelehnt",
		navigateTo: "Navigieren zu…",
		navigateHere: "Hierhin navigieren",
		markedPosition: "Markierte Position",
		gridSquare: (label) => `Feld ${label}`,
		navStop: "Navigation beenden",
		markHere: "Markieren",
		markMyPosition: "Meine Position markieren",
		markName: (n) => `Markierung ${n}`,
		markRename: "Umbenennen",
		markRenamePrompt: "Name der Markierung",
		markDelete: "Löschen",
		markDeleteConfirm: "Wirklich löschen?",
		marksGroup: "Eigene Markierungen",
		liveGroup: "Live",
		lastSeen: (seconds) =>
			seconds < 60 ? `vor ${seconds} s` : `vor ${Math.floor(seconds / 60)} min`,
		navArrived: "Du bist da",
		navEnableCompass: "Kompass aktivieren für Richtungshinweise",
		navNoCompass: "Richtungshinweise beim Gehen",
		navOffField: "Du stehst außerhalb dieses Spielfelds",
		navHints: {
			ahead: "Geradeaus",
			bearRight: "Halb rechts",
			turnRight: "Rechts abbiegen",
			behind: "Hinter dir",
			turnLeft: "Links abbiegen",
			bearLeft: "Halb links",
		},
		scale: "Maßstab",
		layers: "Kartenebenen",
		layerPoiIds: "PoI-Nummern",
		layerGrid: "Gitternetz",
		layerMask: "Spielfeldgrenze",
		layerZones: "Zonen",
		layerHqs: "Hauptquartiere",
		layerMarks: "Eigene Markierungen",
	},
	en: {
		waitingForGps: "Waiting for GPS…",
		gpsDenied: "Location permission denied — allow it in your browser settings",
		gpsNoFix: "⚠ No GPS signal — it works better out in the open",
		offMap: "⚠ Off map — outside this field; position shown at map center",
		mapLoading: "Loading map…",
		mapLoadFailed: "⚠ Map could not be loaded — tap to retry",
		unknownScenario: (id) => `⚠ Unknown scenario "${id}"`,
		enableCompass: "Enable compass",
		compassDenied: "Compass permission denied",
		navigateTo: "Navigate to…",
		navigateHere: "Navigate here",
		markedPosition: "Marked position",
		gridSquare: (label) => `Square ${label}`,
		navStop: "End navigation",
		markHere: "Mark",
		markMyPosition: "Mark my position",
		markName: (n) => `Mark ${n}`,
		markRename: "Rename",
		markRenamePrompt: "Name of the mark",
		markDelete: "Delete",
		markDeleteConfirm: "Really delete?",
		marksGroup: "My marks",
		liveGroup: "Live",
		lastSeen: (seconds) =>
			seconds < 60 ? `${seconds} s ago` : `${Math.floor(seconds / 60)} min ago`,
		navArrived: "You have arrived",
		navEnableCompass: "Enable compass for turn hints",
		navNoCompass: "Turn hints appear as you walk",
		navOffField: "You are outside this field",
		navHints: {
			ahead: "Straight ahead",
			bearRight: "Bear right",
			turnRight: "Turn right",
			behind: "Behind you",
			turnLeft: "Turn left",
			bearLeft: "Bear left",
		},
		scale: "Scale",
		layers: "Map layers",
		layerPoiIds: "PoI numbers",
		layerGrid: "Grid",
		layerMask: "Boundary mask",
		layerZones: "Zones",
		layerHqs: "Headquarters",
		layerMarks: "My marks",
	},
};

/** The browser's preferred language, as far as these strings care about it. */
export function browserLang(): FieldMapLang {
	const preferred = navigator.languages?.length ? navigator.languages : [navigator.language];
	for (const tag of preferred) {
		if (!tag) continue;
		const base = tag.toLowerCase().split("-")[0];
		if (base === "de") return "de";
		if (base === "en") return "en";
	}
	return "en";
}

/** The strings for `lang` (default: the browser's), with `overrides` on top. */
export function fieldMapStrings(
	lang: FieldMapLang = browserLang(),
	overrides: Partial<FieldMapStrings> = {},
): FieldMapStrings {
	const base = FIELD_MAP_STRINGS[lang] ?? FIELD_MAP_STRINGS.en;
	return {
		...base,
		...overrides,
		navHints: { ...base.navHints, ...overrides.navHints },
	};
}
