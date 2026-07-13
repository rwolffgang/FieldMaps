import type { ControlPoint } from "./transform.js";

// =============================================================================
//  EDIT THIS FILE — everything else is generic plumbing.
// =============================================================================

/** Canonical field location — shared across all map images of this field. */
export interface PointOfInterest {
	id: string;
	lat: number;
	lng: number;
}

/** PoI with the display label for a specific map image. */
export interface LabeledPointOfInterest extends PointOfInterest {
	name: string;
}

/**
 * All points of interest on the field. GPS coordinates are the same no matter
 * which map image you are viewing; only the label changes per map.
 */
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
];

/** Default PoI labels — shared across map images unless a map overrides them. */
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
};

/** One georeferenced field map: image file, dimensions, and GPS calibration. */
export interface MapDefinition {
	/** Stable identifier used for persistence and URLs. */
	id: string;
	/** Label shown in the map selector dropdown. */
	name: string;
	/** Path to the map image (drop the file in /public and match the name). */
	image: string;
	/** Pixel dimensions of that exact image file. */
	width: number;
	height: number;
	/**
	 * Hardcoded control points tying GPS to image pixels.
	 *  - Provide at least 2; 3–4 spread across the field is better (corners beat
	 *    a cluster — clustered points amplify error far away from them).
	 *  - px/py are pixels on the image above: x from the LEFT, y from the TOP.
	 *  - How to get them: open the field in Google Maps satellite, find features
	 *    you can also pinpoint on your map (path junctions, field corners, a
	 *    building corner). Right-click -> copy the lat/lng. Read the pixel position
	 *    of the same feature in any image editor.
	 *
	 * The dev console prints the calibration RMS error in meters on startup — if a
	 * point is mistyped you'll see the error jump, which is how you catch it.
	 */
	controlPoints: ControlPoint[];
	/**
	 * PoI labels that differ from DEFAULT_POI_NAMES on this map image. Keys are
	 * PoI ids from POINTS_OF_INTEREST.
	 */
	poiNameOverrides?: Record<string, string>;
	/** PoI ids to hide on this map image, even if they have a default label. */
	hiddenPoiIds?: string[];
}

/**
 * All available field maps. Add one entry per image + calibration set.
 * Drop each image in /public; the offline service worker precaches *.png automatically.
 */
export const MAPS: MapDefinition[] = [
	{
		id: "m24",
		name: "M24",
		image: "map_m24.png",
		width: 1598,
		height: 906,
		controlPoints: [
			{ lat: 52.382855, lng: 11.821238, px: 561, py: 301 }, // Lima
			{ lat: 52.382526, lng: 11.827816, px: 893, py: 328 }, // Bravo
			{ lat: 52.381769, lng: 11.833687, px: 1193, py: 390 }, // Echo
			{ lat: 52.379209, lng: 11.827408, px: 874, py: 603 }, // Sierra
		],
	},
	{
		id: "opt",
		name: "Operation Tschernobyl",
		image: "map_opt.jpg",
		width: 2048,
		height: 1448,
		controlPoints: [
			{ lat: 52.382855, lng: 11.821238, px: 786, py: 703 }, // Lima
			{ lat: 52.382516, lng: 11.827811, px: 1359, py: 752 }, // Bravo
			{ lat: 52.379208, lng: 11.827409, px: 1323, py: 1227 }, // Sierra
		],
		poiNameOverrides: {
			"610": "Stalker Bar",
			"700": "Freiheit HQ",
			"631": "No Man's Land",
			"800": "Militär HQ",
			"607": "Forscher",
		},
	},
];

/** Which map loads on first visit (before any saved preference). */
export const DEFAULT_MAP_ID = MAPS[0]?.id ?? "";

export function getMapById(id: string): MapDefinition {
	return MAPS.find((map) => map.id === id) ?? MAPS[0];
}

function poiNameForMap(map: MapDefinition, poiId: string): string | undefined {
	if (map.hiddenPoiIds?.includes(poiId)) return undefined;
	return map.poiNameOverrides?.[poiId] ?? DEFAULT_POI_NAMES[poiId];
}

/** PoIs visible on a map: shared coordinates with that map's labels. */
export function getPointsOfInterestForMap(mapId: string): LabeledPointOfInterest[] {
	const map = getMapById(mapId);
	return POINTS_OF_INTEREST.flatMap((poi) => {
		const name = poiNameForMap(map, poi.id);
		if (name == null) return [];
		return [{ ...poi, name }];
	});
}

/** Position smoothing: 0 = raw GPS (jumpy), 1 = frozen. ~0.4 is a good start. */
export const POSITION_SMOOTHING = 0.4;
/** If a new fix jumps more than this many meters, snap instead of smoothing. */
export const SNAP_DISTANCE_M = 25;

/** Heading smoothing for the compass (low-pass on the angle). */
export const HEADING_SMOOTHING = 0.25;
/** Above this ground speed (m/s) prefer GPS course over the (metal-noisy) compass. */
export const GPS_HEADING_SPEED = 0.7;
