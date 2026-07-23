import { DEFAULT_POI_NAMES } from "../points-of-interest.js";
import type { Scenario } from "./scenario.js";

/**
 * Mission 24 — the original hand-made field map. Drawn on the pre-georeferenced
 * photo image (map_m24.png); the out-of-bounds area is already part of the image,
 * so no play-area mask is needed.
 */
export const mission24: Scenario = {
	id: "m24",
	name: "Mission 24",
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
	playArea: [],
};
