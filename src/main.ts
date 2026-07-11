import "./styles.css";
import "./map-view.js";
import type { MapView } from "./map-view.js";
import { watch, type Fix } from "./geo.js";
import { watchHeading, needsPermission, requestPermission } from "./heading.js";
import { GPS_HEADING_SPEED } from "./config.js";

const view = document.querySelector("map-view") as MapView;

let compassHeading: number | null = null;
let lastFix: Fix | null = null;

function pushToMap() {
	if (!lastFix) return;
	// Prefer GPS course while moving (compass is noisy near metal replicas);
	// fall back to the magnetometer when standing still.
	const moving = (lastFix.speed ?? 0) > GPS_HEADING_SPEED && lastFix.heading != null;
	const heading = moving ? lastFix.heading! : compassHeading;
	view.update_(lastFix.lat, lastFix.lng, lastFix.accuracy, heading);
}

// --- Geolocation ---
watch(
	(fix) => {
		lastFix = fix;
		pushToMap();
	},
	(err) => {
		setStatus(`GPS error: ${err.message}`);
	},
);

// --- Compass ---
function startCompass() {
	watchHeading((h) => {
		compassHeading = h;
		pushToMap();
	});
}
if (needsPermission()) {
	// iOS: must be triggered by a user gesture.
	const btn = document.querySelector("#enable-compass") as HTMLButtonElement;
	btn.hidden = false;
	btn.addEventListener("click", async () => {
		if (await requestPermission()) {
			btn.hidden = true;
			startCompass();
		} else setStatus("Compass permission denied");
	});
} else {
	startCompass();
}

// --- Keep the screen awake during a match ---
async function keepAwake() {
	// Auto-releases when the page is hidden; we re-acquire on visibility change.
	try {
		await (navigator as any).wakeLock?.request("screen");
	} catch {}
}
keepAwake();
document.addEventListener("visibilitychange", () => {
	if (document.visibilityState === "visible") keepAwake();
});

// --- Testing aid: paste "lat, lng" from Google Maps to place the dot ---
// Lets you exercise the calibration on a desktop without a real GPS fix.
const testInput = document.querySelector("#test-coords") as HTMLInputElement | null;
if (testInput) {
	const applyTestCoords = (text: string) => {
		const m = text.match(/(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)/);
		if (!m) {
			setStatus("Couldn't parse coordinates");
			return;
		}
		const lat = parseFloat(m[1]);
		const lng = parseFloat(m[2]);
		// Feed straight to the view (bypassing geo smoothing); no heading, tiny circle.
		view.update_(lat, lng, 3, null);
		setStatus(`Test: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
	};
	testInput.addEventListener("keydown", (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			applyTestCoords(testInput.value);
		}
	});
	// Apply immediately on paste, before the field even shows the text.
	testInput.addEventListener("paste", (e) => {
		const text = e.clipboardData?.getData("text") ?? "";
		if (text) {
			e.preventDefault();
			testInput.value = text.trim();
			applyTestCoords(text);
		}
	});
}

function setStatus(msg: string) {
	const el = document.querySelector("#toast");
	if (el) {
		el.textContent = msg;
		(el as HTMLElement).hidden = false;
	}
}
