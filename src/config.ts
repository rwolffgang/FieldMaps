import type { ControlPoint } from "./transform.js";

// =============================================================================
//  EDIT THIS FILE — everything else is generic plumbing.
// =============================================================================

/** A named location on a field map, used for navigation. */
export interface PointOfInterest {
	id: string;
	name: string;
	lat: number;
	lng: number;
}

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
	 * Named spots on this map. Use Google Maps satellite to copy lat/lng for each
	 * feature, same as control points.
	 */
	pointsOfInterest?: PointOfInterest[];
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
			{ lat: 52.382855, lng: 11.821238, px: 561, py: 301 },
			{ lat: 52.382526, lng: 11.827816, px: 893, py: 328 },
			{ lat: 52.381769, lng: 11.833687, px: 1193, py: 390 },
			{ lat: 52.379209, lng: 11.827408, px: 874, py: 603 },
		],
		pointsOfInterest: [
			{ id: "204", name: "Vorratslager", lat: 52.379127, lng: 11.823623 },
			{ id: "217", name: "Offiziersquartiere", lat: 52.378079, lng: 11.824319 },
			{ id: "502", name: "Alter Bahnhof", lat: 52.381657, lng: 11.817742 },
			{ id: "506", name: "Rampe", lat: 52.381947, lng: 11.815984 },
			{ id: "600", name: "Roter Platz", lat: 52.380306, lng: 11.822275 },
			{ id: "601", name: "Garnison Süd", lat: 52.379104, lng: 11.821979 },
			{ id: "602", name: "Garnison Nord", lat: 52.379554, lng: 11.822012 },
			{ id: "606", name: "Garage", lat: 52.380646, lng: 11.822381 },
			{ id: "607", name: "Dorf", lat: 52.379629, lng: 11.824478 },
			{ id: "608", name: "Funkstation", lat: 52.379608, lng: 11.825613 },
			{ id: "610", name: "Esco Bar", lat: 52.380446, lng: 11.8267 },
			{ id: "611", name: "Gefängnis", lat: 52.380818, lng: 11.825109 },
			{ id: "613", name: "Fahrzeughalle", lat: 52.381097, lng: 11.824952 },
			{ id: "616", name: "Forschungskeller", lat: 52.381067, lng: 11.824132 },
			{ id: "617", name: "Heizwerk", lat: 52.381305, lng: 11.822999 },
			{ id: "620", name: "MP Station", lat: 52.381803, lng: 11.82322 },
			{ id: "621", name: "Gebäude 1981", lat: 52.381709, lng: 11.825221 },
			{ id: "622", name: "Munitionslager", lat: 52.381925, lng: 11.82594 },
			{ id: "623", name: "Frachtlager", lat: 52.381934, lng: 11.826573 },
			{ id: "624", name: "Werkstatt", lat: 52.382006, lng: 11.827198 },
			{ id: "630", name: "Tower", lat: 52.381482, lng: 11.827873 },
			{ id: "631", name: "Grabensystem", lat: 52.381183, lng: 11.827608 },
			{ id: "632", name: "Fort", lat: 52.38037, lng: 11.828291 },
			{ id: "635", name: "Schießstand", lat: 52.381097, lng: 11.826379 },
			{ id: "638", name: "Hangar", lat: 52.382532, lng: 11.826579 },
			{ id: "700", name: "Kaserne", lat: 52.383773, lng: 11.814515 },
			{ id: "714", name: "Hacienda El Mojito", lat: 52.384138, lng: 11.823325 },
			{ id: "720", name: "Zollhaus", lat: 52.384282, lng: 11.828191 },
			{ id: "800", name: "Task Force HQ", lat: 52.383492, lng: 11.834536 },
			{ id: "803", name: "Kirche", lat: 52.380874, lng: 11.834534 },
			{ id: "807", name: "Schützengräben", lat: 52.383058, lng: 11.833218 },
			{ id: "810", name: "Verladeplatz", lat: 52.380613, lng: 11.830516 },
			{ id: "813", name: "Kommandobunker", lat: 52.380005, lng: 11.830943 },
			{ id: "814", name: "Testgelände", lat: 52.379919, lng: 11.832244 },
			{ id: "817", name: "Depot", lat: 52.379373, lng: 11.834199 }, // 52.379373, 11.834199
			{ id: "820", name: "Asservatenkammer", lat: 52.378881, lng: 11.836845 },
			{ id: "821", name: "Grenzposten", lat: 52.380013, lng: 11.837379 },
			{ id: "825", name: "Markt", lat: 52.381444, lng: 11.82986 },
			{ id: "826", name: "Checkpoint A", lat: 52.381162, lng: 11.831821 },
			{ id: "Lima", name: "Turbine Lima", lat: 52.382866, lng: 11.821249 },
			{ id: "Oskar", name: "Turbine Oskar", lat: 52.382876, lng: 11.81352 },
			{ id: "Bravo", name: "Turbine Bravo", lat: 52.38252, lng: 11.827808 },
			{ id: "Sierra", name: "Turbine Sierra", lat: 52.379219, lng: 11.827421 },
			{ id: "Echo", name: "Turbine Echo", lat: 52.381784, lng: 11.833683 },
		],
	},
];

/*
,
	{
		id: "muenster",
		name: "Münster",
		image: "map_muenster.png",
		width: 1834,
		height: 1844,
		controlPoints: [
			{ lat: 51.976946, lng: 7.625693, px: 697, py: 912 },
			{ lat: 51.974732, lng: 7.629535, px: 1361, py: 1525 },
			{ lat: 51.97977, lng: 7.631856, px: 1744, py: 138 },
		],
		pointsOfInterest: [{ id: "patrick", name: "Patrick HQ", lat: 51.975859, lng: 7.62732 }],
	},
*/

/** Which map loads on first visit (before any saved preference). */
export const DEFAULT_MAP_ID = MAPS[0]?.id ?? "";

export function getMapById(id: string): MapDefinition {
	return MAPS.find((map) => map.id === id) ?? MAPS[0];
}

/** Position smoothing: 0 = raw GPS (jumpy), 1 = frozen. ~0.4 is a good start. */
export const POSITION_SMOOTHING = 0.4;
/** If a new fix jumps more than this many meters, snap instead of smoothing. */
export const SNAP_DISTANCE_M = 25;

/** Heading smoothing for the compass (low-pass on the angle). */
export const HEADING_SMOOTHING = 0.25;
/** Above this ground speed (m/s) prefer GPS course over the (metal-noisy) compass. */
export const GPS_HEADING_SPEED = 0.7;
