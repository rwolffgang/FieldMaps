// -----------------------------------------------------------------------------
// scenarios/index.ts
// Register every scenario here. The order is the order they appear in the selector.
// -----------------------------------------------------------------------------

import type { Scenario } from "./scenario.js";
import { mission24 } from "./mission24.js";
import { operationTschernobyl } from "./operation-tschernobyl.js";
import { operationTschernobylM24 } from "./operation-tschernobyl-m24.js";

export type { Scenario, LatLng } from "./scenario.js";

export const SCENARIOS: Scenario[] = [mission24, operationTschernobyl, operationTschernobylM24];
