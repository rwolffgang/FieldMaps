import { DEFAULT_POI_NAMES } from "../points-of-interest.js";
import type { Scenario } from "./scenario.js";

/**
 * Mission 24 — the original hand-made field map. Drawn on the pre-georeferenced
 * photo image (map_m24.png); the out-of-bounds area is already part of the image,
 * so no play-area mask is needed.
 *
 * The zones, frontlines and HQ emblems below come from the current printed map
 * (M24-39517-2026-6), georeferenced from 36 buildings and turbines. They are real
 * ground positions, so they sit correctly on top of the older photo base.
 */
export const mission24: Scenario = {
	id: "m24",
	name: "Mission 24",
	blurb: "24 Stunden am Stück: Kartell, Task Force und Rebellen um die Zivile Zone.",
	dates: "3.–5. Juli",
	accent: "#b8483c",
	base: {
		kind: "image",
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
	playArea: [],
};
