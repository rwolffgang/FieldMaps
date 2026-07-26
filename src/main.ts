import "./styles.css";
import "./map-view.js";
import "./landing-view.js";
import type { MapView } from "./map-view.js";
import { watch, type Fix } from "./geo.js";
import { watchHeading, needsPermission, requestPermission } from "./heading.js";
import { getMapById, GPS_HEADING_SPEED } from "./config.js";
import { onRouteChange, routedMapId } from "./router.js";
import { applyDocumentLang } from "./i18n.js";

applyDocumentLang();

const view = document.querySelector("map-view") as MapView;
const landing = document.querySelector("landing-view") as HTMLElement;

// --- Routing: overview at /, one map at /?map=<id> ---
// Both elements stay in the DOM and we toggle `hidden`, rather than tearing the map
// down: map-view already re-fits itself when its container gains size (it has to,
// for the 0x0 cold start), so hiding it is cheap and returning to it is instant.
// The map-only chrome (status toast, compass prompt, coordinate test input) follows
// the same switch — none of it means anything on the overview.
const mapOnlyChrome = ["#test-coords", "#toast", "#enable-compass"].map(
	(selector) => document.querySelector(selector) as HTMLElement | null,
);

function applyRoute() {
	const mapId = routedMapId();
	const showMap = mapId != null;
	landing.hidden = showMap;
	view.hidden = !showMap;
	for (const el of mapOnlyChrome) {
		if (!el) continue;
		// Never *reveal* chrome that was hidden for its own reasons (an unused compass
		// prompt, an empty toast) — only hide it while the overview is up.
		if (!showMap) el.hidden = true;
		else if (el.dataset.wanted === "1") el.hidden = false;
	}
	if (mapId != null) view.showRoutedMap(mapId);
	document.title = mapId != null ? `${getMapById(mapId).name} · Field Maps` : "Field Maps";
}

onRouteChange(applyRoute);
applyRoute();

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
	btn.dataset.wanted = "1";
	btn.hidden = routedMapId() == null;
	btn.addEventListener("click", async () => {
		if (await requestPermission()) {
			delete btn.dataset.wanted;
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
	testInput.dataset.wanted = "1"; // always shown over a map, never on the overview
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
	const el = document.querySelector("#toast") as HTMLElement | null;
	if (!el) return;
	el.textContent = msg;
	// Remember that there is something to say, but only show it over a map — a GPS
	// error is noise on the overview, where there is no position to place anyway.
	el.dataset.wanted = "1";
	el.hidden = routedMapId() == null;
}
