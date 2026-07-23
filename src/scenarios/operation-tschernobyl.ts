import { DEFAULT_POI_NAMES } from "../points-of-interest.js";
import type { Scenario } from "./scenario.js";

/**
 * Operation Tschernobyl — Stalker/Chernobyl themed re-labelling of the field.
 * Starts from the default names and renames a handful of objectives.
 *
 * `playArea` is left empty here, so the whole field is playable (no mask). Fill it
 * in with the real boundary if this game restricts the area.
 */
export const operationTschernobyl: Scenario = {
	id: "opt",
	name: "Operation Tschernobyl",
	poiNames: {
		...DEFAULT_POI_NAMES,
		"610": "Stalker Bar",
		"700": "Freiheit HQ",
		"631": "No Man's Land",
		"800": "Militär HQ",
		"607": "Forscher",
	},
	playArea: [],
};
