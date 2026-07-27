import { DEFAULT_POI_NAMES } from "../points-of-interest.js";
import type { Scenario } from "./scenario.js";

/**
 * Mission 24 — drawn on the shared OSM vector base in the cold "m24" look, which was
 * taken from this event's own printed map.
 *
 * It used to render a pre-georeferenced photo of that printed map instead. Nothing
 * ships that photo any more (it is kept in `reference/legacy-map-images/`): it was a
 * 2.2 MB image every phone had to precache before the app worked offline, and the
 * vector base draws the same ground live, at any zoom, from data that is already
 * bundled for every other scenario.
 *
 * The photo had the out-of-bounds area painted into it, so this scenario carried no
 * `playArea`. On the shared canvas — which spans far more ground than the event uses —
 * that would open on a screenful of empty surround with no boundary drawn at all, so
 * the boundary below was recovered from the photo before it was retired: the in-bounds
 * ground there is neutral grey-green satellite and everything outside is a maroon
 * wash, so the mask was thresholded straight off the image, traced, and pushed back
 * through this scenario's own control points (0.0 m round-trip). Same method as every
 * other coordinate here, just automated — see the note on accuracy below.
 *
 * The zones, frontlines and HQ emblems come from the *current* printed map
 * (M24-39517-2026-6), georeferenced from 36 buildings and turbines. The play area
 * comes from the older photo, so treat it as the loosest number in this file.
 */
export const mission24: Scenario = {
	id: "m24",
	name: "Mission 24",
	blurb: "24 Stunden am Stück: Kartell, Task Force und Rebellen um die Zivile Zone.",
	blurbEn: "24 hours straight: cartel, task force and rebels around the civilian zone.",
	schedule: { start: [7, 3], end: [7, 5] },
	accent: "#b8483c",
	base: { kind: "osm", theme: "m24" },
	poiNames: { ...DEFAULT_POI_NAMES },
	headquarters: [
		{
			id: "kartell",
			name: "Honra Kartell",
			lat: 52.384138,
			lng: 11.823325,
			color: "#c8393f",
			logo: "logos/kartell.png",
		},
		{
			id: "taskforce",
			name: "Task Force HQ",
			lat: 52.383492,
			lng: 11.834536,
			color: "#2f6fc4",
			logo: "logos/taskforce.png",
		},
		{
			id: "rebellen",
			name: "Rebellen HQ",
			lat: 52.379629,
			lng: 11.824478,
			color: "#2f9d5e",
			logo: "logos/rebellen.png",
		},
		{ id: "escobar", name: "Esco Bar", lat: 52.380446, lng: 11.8267, color: "#e8862d" },
	],
	zones: [
		{
			// The map is explicit that this is NOT a safe zone — it is a civilian area
			// with its own engagement rules, so it is drawn as a wash rather than hatch.
			id: "zivile-zone",
			name: "Zivile Zone",
			color: "#e8d5a8",
			style: "fill",
			points: [
				[52.38105, 11.823887],
				[52.3811, 11.826802],
				[52.380635, 11.826915],
				[52.380114, 11.826648],
				[52.37966, 11.826074],
				[52.379404, 11.82549],
				[52.3793, 11.824219],
				[52.379401, 11.823309],
				[52.379723, 11.822621],
				[52.380499, 11.822701],
				[52.380857, 11.823099],
			],
		},
	],
	lines: [
		{
			id: "task-force-grenze",
			name: "Task Force Grenze",
			color: "#2f9fe0",
			points: [
				[52.383488, 11.828677],
				[52.38232, 11.828681],
				[52.381414, 11.828768],
				[52.381285, 11.829409],
				[52.38077, 11.830154],
				[52.380119, 11.830314],
				[52.379535, 11.830418],
				[52.379151, 11.830902],
				[52.379084, 11.831961],
			],
		},
		{
			id: "kartell-gebiet",
			name: "Kartell kontrolliertes Gebiet",
			color: "#d8433f",
			points: [
				[52.384921, 11.824523],
				[52.382983, 11.824354],
				[52.382769, 11.821273],
				[52.381409, 11.821074],
				[52.379528, 11.820941],
				[52.378587, 11.820806],
			],
		},
	],
	// Recovered from the retired photo map (see the note at the top of this file), so
	// this is the loosest boundary in the repo: it is the 2024-era printed edition,
	// simplified to ~12 m. On the ground the tape wins.
	playArea: [
		[52.385128, 11.822596],
		[52.385006, 11.823443],
		[52.385007, 11.832453],
		[52.384367, 11.83456],
		[52.384367, 11.834875],
		[52.384631, 11.835093],
		[52.384618, 11.835823],
		[52.384028, 11.835978],
		[52.383776, 11.835623],
		[52.381948, 11.83473],
		[52.382163, 11.835736],
		[52.38209, 11.836997],
		[52.380416, 11.837366],
		[52.380331, 11.837938],
		[52.379982, 11.838055],
		[52.379718, 11.838015],
		[52.379634, 11.837502],
		[52.37872, 11.837282],
		[52.378685, 11.836434],
		[52.378998, 11.836258],
		[52.378907, 11.831723],
		[52.379031, 11.828569],
		[52.379574, 11.827802],
		[52.379574, 11.827348],
		[52.379803, 11.82731],
		[52.379815, 11.827014],
		[52.379348, 11.825652],
		[52.378842, 11.825985],
		[52.378409, 11.825649],
		[52.378446, 11.824841],
		[52.379012, 11.824567],
		[52.379025, 11.824271],
		[52.378558, 11.822436],
		[52.378463, 11.821331],
		[52.378174, 11.821074],
		[52.381375, 11.820927],
		[52.381418, 11.815131],
		[52.381912, 11.814975],
		[52.382577, 11.812828],
		[52.382853, 11.81279],
		[52.38289, 11.812119],
		[52.383083, 11.8121],
		[52.383178, 11.812791],
		[52.385055, 11.812856],
		[52.385008, 11.821767],
	],
};
