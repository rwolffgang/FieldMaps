import { DEFAULT_POI_NAMES } from "../points-of-interest.js";
import type { Scenario } from "./scenario.js";

/**
 * Mission 24 — the base layout. Uses the default point-of-interest names and,
 * as an example, a play-area boundary that hugs the objectives.
 *
 * NOTE: `playArea` below is a generated placeholder (the convex hull of the PoIs,
 * expanded a little). Replace it with the real, walked boundary for this game.
 */
export const mission24: Scenario = {
	id: "m24",
	name: "Mission 24",
	poiNames: { ...DEFAULT_POI_NAMES },
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
