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
	blurbEn: "The same data in the cold Mission 24 look — for comparing the two styles.",
	// A style variant, not an event of its own: clear the inherited schedule so it
	// sorts to the bottom of the overview instead of duplicating OP Tschernobyl's slot.
	schedule: undefined,
	accent: "#c8ccc0",
	base: { kind: "osm", theme: "m24" },
};
