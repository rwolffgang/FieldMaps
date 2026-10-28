import { solveTransform, ControlPoint } from "./transform.js";

const R = 6378137;
const DEG = Math.PI / 180;

// Invert the projection so we can synthesize (lat,lng) from chosen (E,N).
function unproject(E: number, N: number, lat0: number, lng0: number) {
	const lat = lat0 + N / (R * DEG);
	const lng = lng0 + E / (Math.cos(lat0 * DEG) * R * DEG);
	return { lat, lng };
}

function makeGroundTruth(scale: number, rotDeg: number, cx: number, cy: number) {
	const t = rotDeg * DEG;
	// Reflection-form similarity used by solveTransform:
	//   px = a*E + b*N + c ; py = b*E - a*N + d, with a=s*cos, b=s*sin
	const a = scale * Math.cos(t);
	const b = scale * Math.sin(t);
	return (E: number, N: number) => ({ px: a * E + b * N + cx, py: b * E - a * N + cy });
}

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
	if (cond) {
		console.log(`  ok   ${name}`);
	} else {
		console.log(`  FAIL ${name} ${detail}`);
		failures++;
	}
}

function runCase(scale: number, rotDeg: number) {
	const lat0 = 51.9601,
		lng0 = 7.6261;
	const fwd = makeGroundTruth(scale, rotDeg, 500, 700);
	// Spread control points across a ~200m field.
	const grid = [
		[-80, -60],
		[90, -40],
		[10, 100],
		[-30, 30],
	];
	const pts: ControlPoint[] = grid.map(([E, N]) => {
		const { lat, lng } = unproject(E, N, lat0, lng0);
		const { px, py } = fwd(E, N);
		return { lat, lng, px, py };
	});

	const T = solveTransform(pts);
	check(`rot=${rotDeg} scale recovered`, Math.abs(T.scale - scale) < 1e-3, `got ${T.scale}`);
	check(`rot=${rotDeg} rms ~0`, T.rmsMeters < 1e-2, `got ${T.rmsMeters}`);

	// A fresh (non-control) point should reproject correctly.
	const test = unproject(25, -15, lat0, lng0);
	const expected = fwd(25, -15);
	const got = T.toPixel(test.lat, test.lng);
	const err = Math.hypot(got.px - expected.px, got.py - expected.py);
	check(`rot=${rotDeg} arbitrary point`, err < 1e-2, `err=${err}px`);

	// And back again: a spot picked on the map is a pixel, and navigating to it needs
	// the lat/lng. Round-trip a pixel that is nowhere near a control point.
	const back = T.toLatLng(320, 880);
	const round = T.toPixel(back.lat, back.lng);
	const roundErr = Math.hypot(round.px - 320, round.py - 880);
	check(`rot=${rotDeg} pixel round-trip`, roundErr < 1e-6, `err=${roundErr}px`);
}

console.log("Transform self-test");
runCase(10, 0); // north-aligned map
runCase(8.5, 23); // map printed rotated 23deg vs north
runCase(12, -47);

// Bearing -> screen angle: on a north-aligned map, heading 0 (north) should
// point screen-up, i.e. CSS rotation ~0deg.
const lat0 = 51.9601,
	lng0 = 7.6261;
const fwd0 = makeGroundTruth(10, 0, 500, 700);
const pts0 = [
	[-80, -60],
	[90, -40],
	[10, 100],
].map(([E, N]) => {
	const lat = lat0 + N / (R * DEG);
	const lng = lng0 + E / (Math.cos(lat0 * DEG) * R * DEG);
	const { px, py } = fwd0(E, N);
	return { lat, lng, px, py };
});
const T0 = solveTransform(pts0);
const north = ((T0.bearingToScreenDeg(0) % 360) + 360) % 360;
const east = ((T0.bearingToScreenDeg(90) % 360) + 360) % 360;
check("north-aligned: bearing 0 -> ~0deg", Math.min(north, 360 - north) < 1e-3, `got ${north}`);
check("north-aligned: bearing 90 -> ~90deg", Math.abs(east - 90) < 1e-3, `got ${east}`);

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
