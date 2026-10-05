import {
	BACKGROUND_LEVEL,
	POI_LEVEL,
	EDGE_LEVEL,
	PEAK_LEVEL,
	GUIDE_LEVEL,
	NOMINAL_SENSITIVITY,
	levelForBearing,
	applySensitivity,
	radiationLevelAt,
	signedDistanceToZoneM,
} from "./radiation.js";
import type { LatLng } from "./scenarios/scenario.js";

const R = 6378137;
const DEG = Math.PI / 180;

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
	if (cond) {
		console.log(`  ok   ${name}`);
	} else {
		console.log(`  FAIL ${name} ${detail}`);
		failures++;
	}
}

// A 200 m × 200 m square on the airfield, built from metres east/north of a corner.
const lat0 = 52.378;
const lng0 = 11.822;
function at(E: number, N: number): LatLng {
	return [lat0 + N / (R * DEG), lng0 + E / (Math.cos(lat0 * DEG) * R * DEG)];
}
const square = [at(0, 0), at(200, 0), at(200, 200), at(0, 200)];

const dist = (E: number, N: number) => signedDistanceToZoneM(...at(E, N), square);
const level = (E: number, N: number) => radiationLevelAt(...at(E, N), [square]);

console.log("signed distance");
check("centre is 100 m inside", Math.abs(dist(100, 100) + 100) < 0.1, `got ${dist(100, 100)}`);
check("30 m inside the west edge", Math.abs(dist(30, 100) + 30) < 0.1, `got ${dist(30, 100)}`);
check("50 m outside the east edge", Math.abs(dist(250, 100) - 50) < 0.1, `got ${dist(250, 100)}`);
check(
	"outside a corner measures to the corner",
	Math.abs(dist(-30, -40) - 50) < 0.1,
	`got ${dist(-30, -40)}`,
);
check(
	"closed ring gives the same answer",
	Math.abs(signedDistanceToZoneM(...at(30, 100), [...square, square[0]]) + 30) < 0.1,
);

console.log("level");
check(
	"on the edge reads EDGE_LEVEL",
	Math.abs(level(0, 100) - EDGE_LEVEL) < 0.5,
	`got ${level(0, 100)}`,
);
check("far away reads background", Math.abs(level(-1000, 100) - BACKGROUND_LEVEL) < 0.01);
check(
	"deep inside approaches the peak",
	level(100, 100) > PEAK_LEVEL - 1 && level(100, 100) <= PEAK_LEVEL,
);
check(
	"rises monotonically walking in",
	[-200, -100, -50, -20, 0, 10, 25, 60].every(
		(E, i, all) => i === 0 || level(E, 100) > level(all[i - 1], 100),
	),
);
check("no zones is background", radiationLevelAt(lat0, lng0, []) === BACKGROUND_LEVEL);
check(
	"degenerate ring is ignored",
	radiationLevelAt(lat0, lng0, [[at(0, 0), at(1, 1)]]) === BACKGROUND_LEVEL,
);

console.log("points of interest");
const [poiLat, poiLng] = at(-500, 100);
const poi = [{ lat: poiLat, lng: poiLng }];
const near = (E: number) => radiationLevelAt(...at(E, 100), [square], poi);
check("on a PoI reads POI_LEVEL", Math.abs(near(-500) - POI_LEVEL) < 0.01, `got ${near(-500)}`);
check("a PoI stays below the alarm (60)", POI_LEVEL < 60 && near(-500) < 60);
check("a PoI reaches yellow (≥ 40)", near(-500) >= 40);
check("a PoI fades out by 60 m", near(-440) < BACKGROUND_LEVEL + 2, `got ${near(-440)}`);
check("closer to a PoI reads higher", near(-470) > near(-450));
check("a PoI does not lower a zone's reading", near(100) === level(100, 100));

console.log("direction finding");
check("dead ahead reads GUIDE_LEVEL", levelForBearing(0) === GUIDE_LEVEL);
check("facing away is background", levelForBearing(180) === BACKGROUND_LEVEL);
check("90° off is background", levelForBearing(90) === BACKGROUND_LEVEL);
check("dead ahead beats 30° off", levelForBearing(0) > levelForBearing(30));
check("30° off still lifts it", levelForBearing(30) > BACKGROUND_LEVEL + 10);
check("left and right are symmetric", Math.abs(levelForBearing(20) - levelForBearing(340)) < 1e-9);
check("negative angles wrap", Math.abs(levelForBearing(-20) - levelForBearing(340)) < 1e-9);
check("never reaches the alarm (60)", GUIDE_LEVEL < 60);
check("stays inside the ×0,1 range (≤ 0.5 мР/ч, level ≤ 54)", GUIDE_LEVEL <= 54);

console.log("sensitivity");
check("nominal leaves a reading alone", applySensitivity(45, NOMINAL_SENSITIVITY) === 45);
check("zero reads background", applySensitivity(85, 0) === BACKGROUND_LEVEL);
check("full doubles the excess", applySensitivity(45, 100) === 80);
check("full clamps at 100", applySensitivity(90, 100) === 100);
check("background stays background", applySensitivity(BACKGROUND_LEVEL, 100) === BACKGROUND_LEVEL);

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
