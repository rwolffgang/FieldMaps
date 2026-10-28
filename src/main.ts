import "./styles.css";
import "./whats-new.js";
import "./map-screen.js";
import "./landing-view.js";
import "./legal-view.js";
import type { MapScreen } from "./map-screen.js";
import type { WhatsNewView } from "./whats-new.js";
import { DEFAULT_MAP_ID, MAPS, getMapById, runningMap } from "./config.js";
import { goToMap, onRouteChange, routedMapId, routedLegal } from "./router.js";
import { applyDocumentLang, strings } from "./i18n.js";
import { startUpdates } from "./update.js";
import { startAnalytics } from "./analytics.js";

applyDocumentLang();
const t = strings();

// How many people use this. Cookie-less and fire-and-forget; see analytics.ts.
startAnalytics();

const screen = document.querySelector("map-screen") as MapScreen;
const landing = document.querySelector("landing-view") as HTMLElement;
const legal = document.querySelector("legal-view") as HTMLElement;

/** The last map opened, so a bare launch has the likely one ready behind the overview. */
const SELECTED_KEY = "field-map-selected-id";

/**
 * Which map to load first, before anything is on screen. The URL wins — a bookmarked
 * `?map=…` must open that map even if the player last looked at a different one —
 * then the last used map, then the first one registered. Loading it while the
 * overview is up costs nothing visible (the map draws its data, not its sensors: GPS
 * starts only once a map is actually on screen), and opening it is then instant.
 */
function initialMapId(): string {
	const routed = routedMapId();
	if (routed != null) return routed;
	try {
		const stored = localStorage.getItem(SELECTED_KEY);
		if (stored != null && MAPS.some((map) => map.id === stored)) return stored;
	} catch {
		// Storage unavailable — the default will do.
	}
	return DEFAULT_MAP_ID;
}
screen.scenario = initialMapId();

// --- Routing: overview at /, one map at /?map=<id> ---
// All three screens stay in the DOM and we toggle `hidden`, rather than tearing the
// map down: `<field-map>` re-fits itself when its container gains size (it has to,
// for the 0x0 cold start), so hiding it is cheap and returning to it is instant.
function applyRoute() {
	// ?page=impressum wins over ?map= — it is only ever reached through its own
	// link, which carries no map id, but the precedence keeps the state simple.
	const showLegal = routedLegal();
	const mapId = showLegal ? null : routedMapId();
	const showMap = mapId != null;
	landing.hidden = showMap || showLegal;
	legal.hidden = !showLegal;
	screen.hidden = !showMap;
	if (mapId != null) {
		screen.scenario = mapId;
		try {
			localStorage.setItem(SELECTED_KEY, mapId);
		} catch {
			// Storage unavailable (private mode, quota, etc.) — session still works.
		}
		// The map was `hidden` until now, so its container may still be 0×0 as far as
		// Leaflet knows. It notices by itself after layout; resync on the next frame so
		// the first paint is already framed correctly.
		requestAnimationFrame(() => screen.map?.resize());
	}
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

// --- What changed, once, after an update that brought something ---
// Decided after the route, so it opens over whichever screen the launch landed on —
// on an event day that is the map, which is where the news is about.
(document.querySelector("whats-new-view") as WhatsNewView).showIfDue();

// --- Staying on the deployed build ---
// `update.ts` does the finding; this decides when the swap is allowed to happen.
// Off the map it is free — the overview and the Impressum are rebuilt from the URL
// alone, so the update goes in and the page reloads before anyone notices. Over a
// map it is not: a reload drops the player's pan, their zoom and, worst of all,
// wherever they were navigating to. So a foreground map gets the banner and the
// choice, and the update takes itself the moment the app goes into the background —
// unless a navigation is running, which is the one thing worth waiting out.
const updateBanner = screen.updateBanner;
updateBanner.textContent = t.updateReady;
let applyUpdate: (() => void) | null = null;
updateBanner.addEventListener("click", () => applyUpdate?.());

const updates = startUpdates({
	canReloadNow: () => routedMapId() == null || (document.hidden && !screen.navigating),
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

// The position, the compass, the iOS compass prompt, the GPS error toast and the
// screen wake lock are all `<field-map>`'s own (packages/field-map/src/sensors.ts):
// it starts them the first time a map is actually on screen, so the overview never
// asks for a permission it has given no reason for.
