// The live markers' diff and staleness. Run with `npm test`.
import { appearanceKey, diffMarkers, escapeHtml, isStale, minutesSince } from "./marker-diff.js";
import type { MapMarker } from "./types.js";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
	if (cond) {
		console.log(`  ok   ${name}`);
	} else {
		console.log(`  FAIL ${name} ${detail}`);
		failures++;
	}
}

const alice: MapMarker = { id: "alice", lat: 52.38, lng: 11.82, label: "Alice", color: "#f00" };
const bob: MapMarker = { id: "bob", lat: 52.381, lng: 11.821 };
const previous = new Map<string, MapMarker>([
	[alice.id, alice],
	[bob.id, bob],
]);

console.log("diffMarkers");
let diff = diffMarkers(previous, [alice, bob]);
check(
	"same array, nothing to do",
	diff.added.length + diff.updated.length + diff.restyled.length + diff.removed.length === 0,
);

diff = diffMarkers(previous, [{ ...alice, lat: 52.3801 }, bob]);
check("a move is an update", diff.updated.length === 1 && diff.updated[0].id === "alice");
check("a move rebuilds nothing", diff.restyled.length === 0 && diff.added.length === 0);

diff = diffMarkers(previous, [{ ...alice, heading: 90 }, bob]);
check("a heading change is an update", diff.updated.length === 1);

diff = diffMarkers(previous, [{ ...alice, color: "#00f" }, bob]);
check("a new colour rebuilds the element", diff.restyled.length === 1 && diff.updated.length === 0);

diff = diffMarkers(previous, [{ ...alice, label: "Alice (medic)" }, bob]);
check("a new label rebuilds the element", diff.restyled.length === 1);

diff = diffMarkers(previous, [alice]);
check("a missing id is removed", diff.removed.length === 1 && diff.removed[0] === "bob");

diff = diffMarkers(previous, [alice, bob, { id: "carol", lat: 52.382, lng: 11.822 }]);
check("a new id is added", diff.added.length === 1 && diff.added[0].id === "carol");

diff = diffMarkers(new Map(), [alice, { ...alice, lat: 1 }]);
check("a duplicate id keeps the last one", diff.added.length === 1 && diff.added[0].lat === 1);

diff = diffMarkers(previous, [{ ...alice, navigable: true }, bob]);
check(
	"navigable is an update, not a rebuild",
	diff.updated.length === 1 && diff.restyled.length === 0,
);

check("appearance ignores position", appearanceKey(alice) === appearanceKey({ ...alice, lat: 0 }));

console.log("staleness");
const now = 1_000_000_000;
check("never stale without seenAt", !isStale(alice, now, 30_000));
check("fresh", !isStale({ ...alice, seenAt: now - 10_000 }, now, 30_000));
check("stale past the limit", isStale({ ...alice, seenAt: now - 31_000 }, now, 30_000));
check("a limit of 0 never goes stale", !isStale({ ...alice, seenAt: 0 }, now, 0));
check("minutes, rounded down", minutesSince({ ...alice, seenAt: now - 150_000 }, now) === 2);
check("no negative minutes", minutesSince({ ...alice, seenAt: now + 5000 }, now) === 0);

console.log("escapeHtml");
check(
	"escapes markup",
	escapeHtml(`<img src=x onerror="a">&'`) === "&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;",
);

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
if (failures) process.exit(1);
