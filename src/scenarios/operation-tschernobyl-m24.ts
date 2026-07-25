import { operationTschernobyl } from "./operation-tschernobyl.js";
import type { Scenario } from "./scenario.js";

/**
 * A copy of Operation Tschernobyl (same labels + play-area limits) rendered on the
 * OSM base in the cold, dark "Mission 24" style instead of the warm sepia. Handy
 * for comparing the two looks on identical data.
 */
export const operationTschernobylM24: Scenario = {
	...operationTschernobyl,
	id: "opt-m24",
	name: "Op Tschernobyl (M24-Stil)",
	blurb: "Dieselben Daten, kalter Mission-24-Look — zum Vergleich der beiden Stile.",
	dates: "Variante",
	accent: "#c8ccc0",
	base: { kind: "osm", theme: "m24" },
};
