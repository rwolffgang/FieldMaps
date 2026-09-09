// -----------------------------------------------------------------------------
// scenarios/index.ts
// Register every scenario here. The order is the order they appear on the landing page.
// -----------------------------------------------------------------------------

import type { Scenario } from "./scenario.js";
import { mission24 } from "./mission24.js";
import { operationTschernobyl } from "./operation-tschernobyl.js";
import { operationTschernobylM24 } from "./operation-tschernobyl-m24.js";
import { darkEmergency } from "./dark-emergency.js";
import { airsoftDays } from "./airsoft-days.js";
import { lightSim } from "./light-sim.js";
import { lostAirfield } from "./lost-airfield.js";

export type { Scenario, LatLng, Zone, Headquarters, BoundaryLine } from "./scenario.js";

export const SCENARIOS: Scenario[] = [
	mission24,
	darkEmergency,
	operationTschernobyl,
	operationTschernobylM24,
	lightSim,
	airsoftDays,
	lostAirfield,
];
