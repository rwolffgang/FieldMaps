import "./styles.css";
import "./map-view.js";
import "./landing-view.js";
import "./legal-view.js";
import type { MapView } from "./map-view.js";
import { watch, type Fix } from "./geo.js";
import { watchHeading, needsPermission, requestPermission } from "./heading.js";
import { getMapById, GPS_HEADING_SPEED } from "./config.js";
import { onRouteChange, routedMapId, routedLegal } from "./router.js";
import { applyDocumentLang, strings } from "./i18n.js";
import { startUpdates } from "./update.js";

applyDocumentLang();
const t = strings();

const view = document.querySelector("map-view") as MapView;
const landing = document.querySelector("landing-view") as HTMLElement;
const legal = document.querySelector("legal-view") as HTMLElement;

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
	// ?page=impressum wins over ?map= — it is only ever reached through its own
	// link, which carries no map id, but the precedence keeps the state simple.
	const showLegal = routedLegal();
	const mapId = showLegal ? null : routedMapId();
	const showMap = mapId != null;
	landing.hidden = showMap || showLegal;
	legal.hidden = !showLegal;
	view.hidden = !showMap;
	for (const el of mapOnlyChrome) {
		if (!el) continue;
		// Never *reveal* chrome that was hidden for its own reasons (an unused compass
		// prompt, an empty toast) — only hide it while the overview is up.
		if (!showMap) el.hidden = true;
		else if (el.dataset.wanted === "1") el.hidden = false;
	}
	if (mapId != null) view.showRoutedMap(mapId);
	document.title = showLegal
		? `${strings().legal.impressumTitle} · Field Maps`
		: mapId != null
			? `${getMapById(mapId).name} · Field Maps`
			: "Field Maps";
}

onRouteChange(applyRoute);
applyRoute();

// --- Staying on the deployed build ---
// `update.ts` does the finding; this decides when the swap is allowed to happen.
// Off the map it is free — the overview and the Impressum are rebuilt from the URL
// alone, so the update goes in and the page reloads before anyone notices. Over a
// map it is not: a reload drops the player's pan, their zoom and, worst of all,
// wherever they were navigating to. So a foreground map gets the banner and the
// choice, and the update takes itself the moment the app goes into the background —
// unless a navigation is running, which is the one thing worth waiting out.
const updateBanner = document.querySelector("#update-banner") as HTMLButtonElement;
updateBanner.textContent = t.updateReady;
let applyUpdate: (() => void) | null = null;
updateBanner.addEventListener("click", () => applyUpdate?.());

const updates = startUpdates({
	canReloadNow: () => routedMapId() == null || (document.hidden && !view.navigating),
	onWaiting: (apply) => {
		applyUpdate = apply;
		updateBanner.hidden = false;
	},
	onApplying: () => {
		updateBanner.hidden = true;
	},
});
// Leaving a map for the overview makes the reload free; take it there and then.
onRouteChange(() => updates.applyWhenSafe());

let compassHeading: number | null = null;
let lastFix: Fix | null = null;
let pushFrame = 0;

function pushToMap() {
	if (!lastFix) return;
	// Prefer GPS course while moving (compass is noisy near metal replicas);
	// fall back to the magnetometer when standing still.
	const moving = (lastFix.speed ?? 0) > GPS_HEADING_SPEED && lastFix.heading != null;
	const heading = moving ? lastFix.heading! : compassHeading;
	view.update_(lastFix.lat, lastFix.lng, lastFix.accuracy, heading);
}

/**
 * Push the latest position + heading to the map, at most once per displayed frame.
 *
 * GPS arrives about once a second, but `deviceorientation` fires at the sensor's own
 * rate — 60 Hz on most phones, more on some — and every one of those events used to
 * run a full `update_`: a marker move, two vector paths reprojected, and a `panTo`
 * that fires `moveend` and so walks the basemap's whole tile set. None of that can
 * show up more often than the display refreshes, so coalesce into one frame's work.
 *
 * Both inputs are module state, so the frame always reads the newest values rather
 * than a queued snapshot — and a backgrounded tab (where no frame runs) simply
 * resumes with the current position instead of replaying a backlog.
 */
function schedulePush() {
	if (pushFrame) return;
	pushFrame = requestAnimationFrame(() => {
		pushFrame = 0;
		pushToMap();
	});
}

// --- Geolocation ---
watch(
	(fix) => {
		lastFix = fix;
		schedulePush();
	},
	(err) => {
		setStatus(t.gpsError(err.message));
	},
);

// --- Compass ---
function startCompass() {
	watchHeading((h) => {
		compassHeading = h;
		schedulePush();
	});
}
if (needsPermission()) {
	// iOS: must be triggered by a user gesture.
	const btn = document.querySelector("#enable-compass") as HTMLButtonElement;
	// index.html carries an English default so the button is never empty; this is the
	// first point where the reader's language is known.
	btn.textContent = t.enableCompass;
	btn.dataset.wanted = "1";
	btn.hidden = routedMapId() == null;
	btn.addEventListener("click", async () => {
		if (await requestPermission()) {
			delete btn.dataset.wanted;
			btn.hidden = true;
			startCompass();
		} else setStatus(t.compassDenied);
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
