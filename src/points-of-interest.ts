// -----------------------------------------------------------------------------
// points-of-interest.ts
// The shared registry of physical field locations. GPS coordinates are the same
// no matter which scenario you play — only the *labels* change per scenario (see
// src/scenarios/). Add a point here once; reference it by id from a scenario.
// -----------------------------------------------------------------------------

/** A physical location on the field. Coordinates are shared across all scenarios. */
export interface PointOfInterest {
	id: string;
	lat: number;
	lng: number;
}

/** A point of interest with the display label for a specific scenario. */
export interface LabeledPointOfInterest extends PointOfInterest {
	name: string;
}

/**
 * The six wind turbines on the field. They are the tallest thing out there and
 * every scenario renames them, so they are recognised by id and drawn as a
 * turbine glyph standing on their coordinate rather than as a plain dot.
 */
export const WIND_TURBINE_IDS = new Set(["Lima", "Oskar", "Bravo", "Sierra", "Echo", "Tango"]);

export function isWindTurbine(id: string): boolean {
	return WIND_TURBINE_IDS.has(id);
}

/**
 * Barriers across the field's roads — places a player is stopped, not buildings —
 * drawn as a boom-gate glyph rather than a dot. Like the turbines they carry a name
 * for an id, not a building number.
 */
export const CHECKPOINT_IDS = new Set(["Schranke"]);

export function isCheckpoint(id: string): boolean {
	return CHECKPOINT_IDS.has(id);
}

/** Every physical point of interest on the field, keyed by a stable id. */
export const POINTS_OF_INTEREST: PointOfInterest[] = [
	{ id: "204", lat: 52.379127, lng: 11.823623 },
	{ id: "217", lat: 52.378079, lng: 11.824319 },
	{ id: "502", lat: 52.381657, lng: 11.817742 },
	{ id: "506", lat: 52.381947, lng: 11.815984 },
	{ id: "600", lat: 52.380306, lng: 11.822275 },
	{ id: "601", lat: 52.379104, lng: 11.821979 },
	{ id: "602", lat: 52.379554, lng: 11.822012 },
	{ id: "606", lat: 52.380646, lng: 11.822381 },
	{ id: "607", lat: 52.379629, lng: 11.824478 },
	{ id: "608", lat: 52.379608, lng: 11.825613 },
	{ id: "610", lat: 52.380446, lng: 11.8267 },
	{ id: "611", lat: 52.380818, lng: 11.825109 },
	{ id: "613", lat: 52.381097, lng: 11.824952 },
	{ id: "616", lat: 52.381067, lng: 11.824132 },
	{ id: "617", lat: 52.381305, lng: 11.822999 },
	{ id: "620", lat: 52.381803, lng: 11.82322 },
	{ id: "621", lat: 52.381709, lng: 11.825221 },
	{ id: "622", lat: 52.381925, lng: 11.82594 },
	{ id: "623", lat: 52.381934, lng: 11.826573 },
	{ id: "624", lat: 52.382006, lng: 11.827198 },
	{ id: "630", lat: 52.381482, lng: 11.827873 },
	{ id: "631", lat: 52.381183, lng: 11.827608 },
	{ id: "632", lat: 52.38037, lng: 11.828291 },
	{ id: "635", lat: 52.381097, lng: 11.826379 },
	{ id: "638", lat: 52.382532, lng: 11.826579 },
	{ id: "700", lat: 52.383773, lng: 11.814515 },
	{ id: "714", lat: 52.384138, lng: 11.823325 },
	{ id: "720", lat: 52.384282, lng: 11.828191 },
	{ id: "800", lat: 52.383492, lng: 11.834536 },
	{ id: "803", lat: 52.380874, lng: 11.834534 },
	{ id: "807", lat: 52.383058, lng: 11.833218 },
	{ id: "810", lat: 52.380613, lng: 11.830516 },
	{ id: "813", lat: 52.380005, lng: 11.830943 },
	{ id: "814", lat: 52.379919, lng: 11.832244 },
	{ id: "817", lat: 52.379373, lng: 11.834199 },
	{ id: "820", lat: 52.378881, lng: 11.836845 },
	{ id: "821", lat: 52.380013, lng: 11.837379 },
	{ id: "825", lat: 52.381444, lng: 11.82986 },
	{ id: "826", lat: 52.381162, lng: 11.831821 },
	{ id: "Lima", lat: 52.382866, lng: 11.821249 },
	{ id: "Oskar", lat: 52.382876, lng: 11.81352 },
	{ id: "Bravo", lat: 52.38252, lng: 11.827808 },
	{ id: "Sierra", lat: 52.379219, lng: 11.827421 },
	{ id: "Echo", lat: 52.381784, lng: 11.833683 },

	// --- Read off the Dark Emergency 2026 tactical map (DE-39517-2026-1). That map
	// was georeferenced from the five wind turbines above; the fit closed to 3.0 m
	// RMS, so these are good to a few metres.
	{ id: "423", lat: 52.377631, lng: 11.813228 },
	{ id: "500", lat: 52.379487, lng: 11.820102 },
	{ id: "505", lat: 52.380906, lng: 11.816381 },
	{ id: "508", lat: 52.379583, lng: 11.816271 },
	{ id: "808", lat: 52.382722, lng: 11.830432 },
	{ id: "824", lat: 52.380539, lng: 11.832675 },
	{ id: "Tango", lat: 52.379548, lng: 11.815083 },

	// --- Read off the Lost Airfield tactical map, which numbers many more of the
	// site's buildings than the other events use. Georeferenced from 28 buildings
	// shared with the list above (9.8 m RMS), so treat these as ~10 m accurate.
	{ id: "206", lat: 52.377679, lng: 11.82373 },
	{ id: "207", lat: 52.378267, lng: 11.823273 },
	{ id: "210", lat: 52.377977, lng: 11.825122 },
	{ id: "211", lat: 52.378629, lng: 11.824747 },
	{ id: "212", lat: 52.378632, lng: 11.824052 },
	{ id: "213", lat: 52.37825, lng: 11.822312 },
	{ id: "215", lat: 52.378894, lng: 11.825456 },
	{ id: "216", lat: 52.379454, lng: 11.826897 },
	{ id: "220", lat: 52.378236, lng: 11.825819 },
	{ id: "603", lat: 52.378919, lng: 11.822782 },
	{ id: "604", lat: 52.379142, lng: 11.82363 },
	{ id: "605", lat: 52.378802, lng: 11.822202 },
	{ id: "609", lat: 52.379588, lng: 11.82331 },
	{ id: "614", lat: 52.381072, lng: 11.825202 },
	{ id: "615", lat: 52.38116, lng: 11.824219 },
	{ id: "625", lat: 52.381759, lng: 11.824688 },
	{ id: "626", lat: 52.382125, lng: 11.82519 },
	{ id: "633", lat: 52.380216, lng: 11.827056 },
	{ id: "634", lat: 52.381069, lng: 11.825873 },
	{ id: "636", lat: 52.381065, lng: 11.826973 },
	{ id: "637", lat: 52.382475, lng: 11.826004 },
	{ id: "802", lat: 52.381915, lng: 11.833291 },
	{ id: "804", lat: 52.38246, lng: 11.834801 },
	{ id: "811", lat: 52.380551, lng: 11.835244 },
	{ id: "812", lat: 52.379683, lng: 11.831299 },
	{ id: "815", lat: 52.380099, lng: 11.83341 },
	{ id: "816", lat: 52.379419, lng: 11.831967 },
	{ id: "819", lat: 52.380093, lng: 11.834799 },
	{ id: "823", lat: 52.380642, lng: 11.833624 },
	{ id: "827", lat: 52.380615, lng: 11.831598 },
	{ id: "830", lat: 52.381917, lng: 11.829239 },

	// --- Placed from a GPS reading on the ground, not read off a map.
	{ id: "Schranke", lat: 52.3831897, lng: 11.8285109 },
];

/**
 * Canonical labels for the Mission 24 layout — the default naming most scenarios
 * start from. A scenario spreads these and overrides only what differs.
 */
export const DEFAULT_POI_NAMES: Record<string, string> = {
	"204": "Vorratslager",
	"217": "Offiziersquartiere",
	"502": "Alter Bahnhof",
	"506": "Rampe",
	"600": "Roter Platz",
	"601": "Garnison Süd",
	"602": "Garnison Nord",
	"606": "Garage",
	"607": "Dorf",
	"608": "Funkstation",
	"610": "Esco Bar",
	"611": "Gefängnis",
	"613": "Fahrzeughalle",
	"616": "Forschungskeller",
	"617": "Heizwerk",
	"620": "MP Station",
	"621": "Gebäude 1981",
	"622": "Munitionslager",
	"623": "Frachtlager",
	"624": "Werkstatt",
	"630": "Tower",
	"631": "Grabensystem",
	"632": "Fort",
	"635": "Schießstand",
	"638": "Hangar",
	"700": "Kaserne",
	"714": "Hacienda El Mojito",
	"720": "Zollhaus",
	"800": "Task Force HQ",
	"803": "Kirche",
	"807": "Schützengräben",
	"810": "Verladeplatz",
	"813": "Kommandobunker",
	"814": "Testgelände",
	"817": "Depot",
	"820": "Asservatenkammer",
	"821": "Grenzposten",
	"825": "Markt",
	"826": "Checkpoint A",
	Lima: "Turbine Lima",
	Oskar: "Turbine Oskar",
	Bravo: "Turbine Bravo",
	Sierra: "Turbine Sierra",
	Echo: "Turbine Echo",
	Tango: "Turbine Tango",
	// Named on the Dark Emergency / Airsoft Days / OP Tschernobyl legends.
	"423": "Steinbruch",
	"500": "Wasserreservoir",
	"505": "Fertigungsstraße",
	"508": "Ruine",
	"808": "Panzerstraße",
	"824": "Plantagen",
	Schranke: "Schranke",
};

/**
 * Buildings that only the Lost Airfield map numbers. It ships no legend, so these
 * are labelled by their site building number rather than a game name.
 */
export const LOST_AIRFIELD_ONLY_NAMES: Record<string, string> = Object.fromEntries(
	[
		"206",
		"207",
		"210",
		"211",
		"212",
		"213",
		"215",
		"216",
		"220",
		"603",
		"604",
		"605",
		"609",
		"614",
		"615",
		"625",
		"626",
		"633",
		"634",
		"636",
		"637",
		"802",
		"804",
		"811",
		"812",
		"815",
		"816",
		"819",
		"823",
		"827",
		"830",
	].map((id) => [id, `Gebäude ${id}`]),
);

/**
 * Build a scenario's label set: the Mission 24 baseline, with `overrides` applied
 * and `hide` removed. Removing (not blanking) matters — a PoI is shown if its id is
 * *present* in the map, so an empty string would render an unlabelled dot.
 */
export function scenarioPoiNames(
	overrides: Record<string, string> = {},
	hide: string[] = [],
): Record<string, string> {
	const names = { ...DEFAULT_POI_NAMES, ...overrides };
	for (const id of hide) delete names[id];
	return names;
}

/**
 * Resolved label sets, keyed by the `poiNames` object they came from.
 *
 * A scenario's `poiNames` is a module-level object built once at load, so it is a
 * stable key — and the answer for it never changes. Without this the list was rebuilt
 * (a fresh object per point, ~110 of them) on every call, and the callers are the hot
 * ones: `render()`, `getSelectedPoi()` on every fix, and once per headquarters while
 * pairing emblems to buildings. The returned array is shared, so treat it as
 * read-only — every caller that sorts or filters it already copies first.
 */
const labelledCache = new WeakMap<Record<string, string>, LabeledPointOfInterest[]>();

/**
 * Resolve a scenario's `poiNames` map into displayable points of interest: only
 * the ids present in `poiNames` are shown, each with its scenario label.
 */
export function labelPointsOfInterest(poiNames: Record<string, string>): LabeledPointOfInterest[] {
	let labelled = labelledCache.get(poiNames);
	if (!labelled) {
		labelled = POINTS_OF_INTEREST.flatMap((poi) => {
			const name = poiNames[poi.id];
			return name == null ? [] : [{ ...poi, name }];
		});
		labelledCache.set(poiNames, labelled);
	}
	return labelled;
}

/**
 * Order for a list a player scans by eye: the numbered buildings in ascending
 * numeric order, then the other named places (the checkpoints), then the wind
 * turbines grouped at the end — each named group alphabetically.
 */
export function comparePointsOfInterest(a: PointOfInterest, b: PointOfInterest): number {
	const group = (id: string) => (isWindTurbine(id) ? 2 : /^\d+$/.test(id) ? 0 : 1);
	const byGroup = group(a.id) - group(b.id);
	if (byGroup) return byGroup;
	if (group(a.id) === 0) return Number(a.id) - Number(b.id);
	return a.id.localeCompare(b.id);
}
