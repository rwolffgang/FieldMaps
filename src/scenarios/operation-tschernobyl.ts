import { DEFAULT_POI_NAMES } from "../points-of-interest.js";
import type { Scenario } from "./scenario.js";

/**
 * Operation Tschernobyl — Stalker/Chernobyl themed game on the OpenStreetMap
 * vector base (the aged-sepia style). The play area is limited: everything outside
 * the boundary below is masked out.
 *
 * NOTE: `playArea` is a generated placeholder (the convex hull of the PoIs, a bit
 * expanded). Replace it with the real, walked boundary for this game.
 */
export const operationTschernobyl: Scenario = {
	id: "opt",
	name: "Operation Tschernobyl",
	base: { kind: "osm" },
	poiNames: {
		...DEFAULT_POI_NAMES,
		"610": "Stalker Bar",
		"700": "Freiheit HQ",
		"631": "No Man's Land",
		"800": "Militär HQ",
		"607": "Forscher",
	},
	playArea: [
		[52.383026, 11.812014],
		[52.378801, 11.821488],
		[52.377653, 11.824109],
		[52.378552, 11.838138],
		[52.379819, 11.838736],
		[52.383716, 11.835552],
		[52.384601, 11.828446],
		[52.384439, 11.822996],
		[52.384031, 11.813129],
	],
};
