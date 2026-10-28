// The theme helpers and the Mahlwinkel data model. Run with `npm test`.
import {
	THEMES,
	extendTheme,
	resolveTheme,
	osmSurroundColor,
	type OsmThemeName,
} from "./osm-map.js";
import { comparePointsOfInterest } from "./poi.js";
import { MAPS, SCENARIOS, getMap, getScenario, scenarioPoiIds } from "./mahlwinkel/index.js";
import { POINTS_OF_INTEREST } from "./mahlwinkel/points-of-interest.js";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
	if (cond) {
		console.log(`  ok   ${name}`);
	} else {
		console.log(`  FAIL ${name} ${detail}`);
		failures++;
	}
}

console.log("themes");
const names: OsmThemeName[] = ["opt", "m24", "de", "asd", "lso", "laf"];
check(
	"six built-in themes",
	names.every((name) => THEMES[name] != null),
);
check("resolveTheme by name", resolveTheme("de") === THEMES.de);
const custom = extendTheme("de", {});
check("resolveTheme passes an object through", resolveTheme(custom) === custom);
check("surround from a name or an object", osmSurroundColor("de") === osmSurroundColor(custom));

const red = extendTheme(THEMES.de, { styles: { road_major: { color: "#ff0000" } } });
const before = THEMES.de.styles.road_major;
const after = red.styles.road_major;
check("override reaches the class", after.kind === "line" && after.color === "#ff0000");
check(
	"the rest of the class is kept",
	after.kind === "line" && before.kind === "line" && after.weight === before.weight,
);
check("other classes are untouched", red.styles.forest === THEMES.de.styles.forest);
check(
	"the base theme is not mutated",
	THEMES.de.styles.road_major.kind === "line" &&
		(THEMES.de.styles.road_major as { color: string }).color !== "#ff0000",
);
check("no out-of-bounds style unless asked for", red.outOfBounds === undefined);

const pale = extendTheme("opt", { ground: "#ffffff", outOfBounds: { boundary: "#00ff00" } });
check("top-level override", pale.ground === "#ffffff");
check(
	"partial out-of-bounds gets the defaults",
	pale.outOfBounds?.boundary === "#00ff00" && pale.outOfBounds.opacity > 0,
);

console.log("Mahlwinkel");
check("one map per scenario", MAPS.length === SCENARIOS.length && SCENARIOS.length > 0);
check(
	"getMap / getScenario by id",
	getMap("opt")?.id === "opt" && getScenario("opt")?.id === "opt",
);
check("unknown id is undefined", getMap("nope") === undefined && getScenario("nope") === undefined);
check(
	"OSM maps carry the shared canvas",
	MAPS.every((map) => map.vectorData === "map_osm.geojson"),
);
check("scenarioPoiIds lists the shown PoIs", scenarioPoiIds("m24").includes("630"));
check("scenarioPoiIds of an unknown scenario is empty", scenarioPoiIds("nope").length === 0);

const kindOf = (id: string) => POINTS_OF_INTEREST.find((poi) => poi.id === id)?.kind;
check("turbines are marked", kindOf("Lima") === "turbine");
check("the barrier is marked", kindOf("Schranke") === "checkpoint");
check("a building has no kind", kindOf("630") === undefined);

const sorted = [...POINTS_OF_INTEREST].sort(comparePointsOfInterest);
const firstTurbine = sorted.findIndex((poi) => poi.kind === "turbine");
check(
	"turbines sort last",
	firstTurbine > 0 && sorted.slice(firstTurbine).every((poi) => poi.kind === "turbine"),
);
check("buildings sort numerically", sorted[0].id === "204");

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
if (failures) process.exit(1);
