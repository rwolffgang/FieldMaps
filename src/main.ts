import "./styles.css";
import "./map-view.js";
import "./landing-view.js";
import "./legal-view.js";
import type { MapView } from "./map-view.js";
import { watch, type Fix } from "./geo.js";
import { watchHeading, needsPermission, requestPermission } from "./heading.js";
import { getMapById, runningMap, GPS_HEADING_SPEED } from "./config.js";
import { goToMap, onRouteChange, routedMapId, routedLegal } from "./router.js";
import { applyDocumentLang, strings } from "./i18n.js";
import { startUpdates } from "./update.js";
import { startAnalytics } from "./analytics.js";

applyDocumentLang();
const t = strings();

// How many people use this. Cookie-less and fire-and-forget; see analytics.ts.
startAnalytics();

const view = document.querySelector("map-view") as MapView;
const landing = document.querySelector("landing-view") as HTMLElement;
const legal = document.querySelector("legal-view") as HTMLElement;

// --- Routing: overview at /, one map at /?map=<id> ---
// Both elements stay in the DOM and we toggle `hidden`, rather than tearing the map
// down: map-view already re-fits itself when its container gains size (it has to,
// for the 0x0 cold start), so hiding it is cheap and returning to it is instant.
// The map-only chrome (status toast, compass prompt) follows the same switch —
// none of it means anything on the overview.
const mapOnlyChrome = ["#toast", "#enable-compass"].map(
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

// --- On an event day, the app opens on that event's map ---
// Someone launching Field Maps from the home screen while a game is running wants
// the map, not a list with the map at the top of it. Only a bare launch (no ?map=,
// no ?page=) is redirected, and only once per tab: the map is pushed on top of the
// overview, so Back and the ‹ button still reach the list, and a later reload of the
// overview — the silent update does exactly that — leaves the player where they chose
// to be. sessionStorage is what survives that reload; if it is unavailable the
// redirect simply happens again, which is the lesser failure.
const AUTO_OPEN_KEY = "field-map-auto-opened";
function openRunningEvent() {
	if (routedMapId() != null || routedLegal()) return;
	const map = runningMap();
	if (!map) return;
	try {
		if (sessionStorage.getItem(AUTO_OPEN_KEY)) return;
		sessionStorage.setItem(AUTO_OPEN_KEY, "1");
	} catch {
		// Storage blocked: open anyway.
	}
	goToMap(map.id);
}
openRunningEvent();

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
/**
 * Core Location hands Safari a plain "kCLErrorDomain error 0" the moment a watch
 * starts without a usable fix — indoors, in a hangar, in the seconds before the
 * first satellites are found — and then delivers a position a few seconds later as
 * if nothing had happened. Repeating that verbatim put an alarming, permanent line
 * on the map for something that fixes itself, so hold everything but a denied
 * permission back until it has lasted a while, and take it down on the first fix.
 */
const GPS_GRACE_MS = 12000;
let gpsErrorTimer = 0;

function disarmGpsError() {
	clearTimeout(gpsErrorTimer);
	gpsErrorTimer = 0;
}

let gpsStarted = false;

/**
 * Start the position watch — which is also what raises the browser's permission
 * prompt, so this is deliberately not called at load.
 *
 * The overview is a list of events. It shows no position, draws no dot and does
 * nothing with a fix, so asking there is a system dialog on top of a page that has
 * given no reason for one — and a "no" there is the reader's to find in the site
 * settings later, on a map that then cannot work. A map is the reason: it is opened
 * to be stood on, and the prompt arrives with the screen that explains it.
 *
 * Once started the watch stays on for the rest of the session, even back on the
 * overview: that screen is mostly passed through to pick another field, and a
 * restart would pay for it with a cold fix — 10 s and more under the tree cover
 * these maps are for.
 */
function startGps() {
	if (gpsStarted) return;
	gpsStarted = true;
	watch(
		(fix) => {
			lastFix = fix;
			disarmGpsError();
			clearStatus("gps");
			schedulePush();
		},
		(err) => {
			// A refused permission is the reader's to undo and will never resolve on its
			// own, so it is the one GPS failure worth saying immediately.
			if (err.code === 1 /* PERMISSION_DENIED */) {
				disarmGpsError();
				setStatus(t.gpsDenied, "gps");
				return;
			}
			// Already counting down from an earlier failure — a watch reports the same
			// dead spot over and over, and the wait should run from the first one.
			if (gpsErrorTimer) return;
			gpsErrorTimer = window.setTimeout(() => setStatus(t.gpsNoFix, "gps"), GPS_GRACE_MS);
		},
	);
}

// A deep-linked map (`?map=de`, the link that gets passed around) counts as opening
// one, so this runs on the current route as well as on every change to it.
function startGpsOverMap() {
	if (routedMapId() != null) startGps();
}
onRouteChange(startGpsOverMap);
startGpsOverMap();

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
		} else setStatus(t.compassDenied, "compass");
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

// The toast is one shared line and the last writer wins. `statusOwner` records who
// that was, so whoever put a message up can take it down again once it stops being
// true without wiping something else's.
type StatusOwner = "gps" | "compass";
let statusOwner: StatusOwner | null = null;

function setStatus(msg: string, owner: StatusOwner) {
	const el = document.querySelector("#toast") as HTMLElement | null;
	if (!el) return;
	statusOwner = owner;
	el.textContent = msg;
	// Remember that there is something to say, but only show it over a map — a GPS
	// error is noise on the overview, where there is no position to place anyway.
	el.dataset.wanted = "1";
	el.hidden = routedMapId() == null;
}

function clearStatus(owner: StatusOwner) {
	const el = document.querySelector("#toast") as HTMLElement | null;
	if (!el || statusOwner !== owner) return;
	statusOwner = null;
	el.textContent = "";
	delete el.dataset.wanted;
	el.hidden = true;
}
