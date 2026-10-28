// When the element asks for the compass. Run with `npm test`.
import { decideCompass, type CompassEvidence } from "./compass-decision.js";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
	if (cond) {
		console.log(`  ok   ${name}`);
	} else {
		console.log(`  FAIL ${name} ${detail}`);
		failures++;
	}
}

const none: CompassEvidence = {
	sawHeading: false,
	sawEmptyReading: false,
	timedOut: false,
	hasPermissionApi: false,
	coarsePointer: false,
	granted: false,
};
const is = (evidence: Partial<CompassEvidence>, expected: string, name: string) => {
	const got = decideCompass({ ...none, ...evidence });
	check(name, got === expected, `expected ${expected}, got ${got}`);
};

is(
	{ sawHeading: true, hasPermissionApi: true, coarsePointer: true },
	"on",
	"a heading means on, whatever else",
);
is(
	{ sawHeading: true, sawEmptyReading: true, timedOut: true },
	"on",
	"a heading after an empty reading still means on",
);
is(
	{ sawEmptyReading: true, hasPermissionApi: true },
	"unavailable",
	"laptop Chromium: empty reading, fine pointer",
);
is({ sawEmptyReading: true }, "unavailable", "empty reading without the API");
is(
	{ sawEmptyReading: true, hasPermissionApi: true, coarsePointer: true },
	"needs-permission",
	"gated phone: empty reading, API, touch",
);
is({ hasPermissionApi: true, coarsePointer: true }, "wait", "nothing yet: wait");
is(
	{ timedOut: true, hasPermissionApi: true, coarsePointer: true },
	"needs-permission",
	"iOS: silence, then the API",
);
is({ timedOut: true }, "unavailable", "silence without the API: no compass");
is(
	{ granted: true, hasPermissionApi: true, coarsePointer: true },
	"wait",
	"granted: wait for the first reading",
);
is({ granted: true, sawHeading: true }, "on", "granted, then a heading: on");
is(
	{ granted: true, sawEmptyReading: true, hasPermissionApi: true, coarsePointer: true },
	"unavailable",
	"granted, then an empty reading: no compass, no second ask",
);
is(
	{ granted: true, timedOut: true, hasPermissionApi: true },
	"unavailable",
	"granted, then silence: no compass",
);

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
if (failures) process.exit(1);
