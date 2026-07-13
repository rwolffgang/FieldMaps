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
			{ id: "502", name: "Alter Bahnhof", lat: 52.381657, lng: 11.817742 },
			{ id: "506", name: "Rampe", lat: 52.381947, lng: 11.815984 },
			{ id: "600", name: "Roter Platz", lat: 0, lng: 0 },
			{ id: "601", name: "Garnison", lat: 0, lng: 0 },
			{ id: "606", name: "Garage", lat: 0, lng: 0 },
			{ id: "607", name: "Dorf", lat: 0, lng: 0 },
			{ id: "608", name: "Funkstation", lat: 0, lng: 0 },
			{ id: "610", name: "Esco Bar", lat: 0, lng: 0 },
			{ id: "611", name: "Gefängnis", lat: 0, lng: 0 },
			{ id: "613", name: "Fahrzeughalle", lat: 0, lng: 0 },
			{ id: "616", name: "Forschungskeller", lat: 0, lng: 0 },
			{ id: "617", name: "Heizwerk", lat: 0, lng: 0 },
			{ id: "620", name: "MP Station", lat: 0, lng: 0 },
			{ id: "621", name: "Gebäude 1981", lat: 0, lng: 0 },
			{ id: "622", name: "Munitionslager", lat: 0, lng: 0 },
			{ id: "623", name: "Frachtlager", lat: 0, lng: 0 },
			{ id: "624", name: "Werkstatt", lat: 0, lng: 0 },
			{ id: "630", name: "Tower", lat: 0, lng: 0 },
			{ id: "631", name: "Grabensystem", lat: 0, lng: 0 },
			{ id: "632", name: "Fort", lat: 0, lng: 0 },
			{ id: "635", name: "Schießstand", lat: 0, lng: 0 },
			{ id: "638", name: "Hangar", lat: 0, lng: 0 },
			{ id: "700", name: "Kaserne", lat: 0, lng: 0 },
			{ id: "714", name: "Hacienda El Mojito", lat: 0, lng: 0 },
			{ id: "720", name: "Zollhaus", lat: 0, lng: 0 },
			{ id: "800", name: "Task Force HQ", lat: 0, lng: 0 },
			{ id: "803", name: "Kirche", lat: 0, lng: 0 },
			{ id: "807", name: "Schützengräben", lat: 0, lng: 0 },
			{ id: "810", name: "Verladeplatz", lat: 0, lng: 0 },
			{ id: "813", name: "Kommandobunker", lat: 0, lng: 0 },
			{ id: "814", name: "Testgelände", lat: 0, lng: 0 },
			{ id: "817", name: "Depot", lat: 0, lng: 0 },
			{ id: "820", name: "Asservatenkammer", lat: 0, lng: 0 },
			{ id: "821", name: "Grenzposten", lat: 0, lng: 0 },
			{ id: "825", name: "Markt", lat: 0, lng: 0 },
			{ id: "826", name: "Checkpoint A", lat: 0, lng: 0 },
		],
	},
	// Add more maps here — copy the block above, change id/name/image/dimensions,
	// and supply control points for that field's GPS location.
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
