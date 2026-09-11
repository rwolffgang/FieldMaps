import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { guard } from "lit/directives/guard.js";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { solveTransform, type Transform } from "./transform.js";
import {
	MAPS,
	DEFAULT_MAP_ID,
	getMapById,
	getPointsOfInterestForMap,
	type MapDefinition,
	type LabeledPointOfInterest,
} from "./config.js";
import { comparePointsOfInterest, isWindTurbine } from "./points-of-interest.js";
import { bearingDegrees, distanceMeters, navigationHint, relativeBearingDegrees } from "./geo.js";
import {
	bakeOsm,
	bakeShape,
	gridColumnLabel,
	osmSurroundColor,
	GRID_STEP_M,
	type BakedGeometry,
	type BakedLine,
	type BakedShape,
	type BakedZone,
	type OsmFeatureCollection,
	type TileScene,
} from "./osm-map.js";
import { BasemapLayer } from "./basemap-layer.js";
import { goHome, routedMapId } from "./router.js";
import { BRAND_BLUE, BRAND_ORANGE } from "./brand.js";
import { strings } from "./i18n.js";
import {
	installMethod,
	installNudgeSnoozed,
	onInstallChange,
	promptInstall,
	snoozeInstallNudge,
	type InstallMethod,
} from "./install.js";

// There is no in-app language switcher — the browser's choice is fixed for the
// session — so resolving the strings once at module load is enough.
const t = strings();

const STORAGE_KEY = "field-map-selected-id";
const TOGGLES_KEY = "field-map-toggles";
const ARRIVED_DISTANCE_M = 8;

/**
 * The `selectedPoiId` a spot picked off the map carries. Navigation is keyed by PoI
 * id throughout, so a long-pressed position joins that machinery as a PoI with a
 * reserved id rather than as a second kind of target running beside it. Numbered
 * PoI ids are digits, letters and dashes off the printed maps, so nothing can
 * collide with this.
 */
const CUSTOM_TARGET_ID = "__here__";

/**
 * How far a long-press may land outside the canvas and still be taken as a point on
 * the map, in canvas pixels. The tiles stop at the canvas edge, so past that there
 * is nothing to aim at — but the pin is drawn 22 px above the spot and a thumb is
 * wide, so refusing the last few pixels of the field would feel broken.
 */
const HOLD_SLACK_PX = 24;

/**
 * How long after one long-press a second `contextmenu` at the same spot is still
 * taken to be the same gesture. Android Chrome fires the event itself *and* runs
 * Leaflet's `tapHold` timer, so one press can arrive twice; a real second press
 * cannot land inside this window, since making one takes 600 ms of holding still.
 */
const HOLD_DEDUPE_MS = 1000;
/** …and how far apart, in screen pixels, two of them may be and still be one press. */
const HOLD_DEDUPE_PX = 20;

/**
 * How close a headquarters has to be to a PoI to count as *the same place* — the
 * emblem is then drawn on that building and the PoI needs no dot of its own. The
 * scenarios make this an easy call: every intentional pairing is 0.0 m (both were
 * read off the same spot on the printed map), and the closest unintentional one is
 * ~10 m, so anything in between separates the two cases.
 */
const SAME_PLACE_M = 5;

/**
 * Longest the scale bar may get, in screen pixels. The bar is then drawn at the
 * nicest round distance that still fits, so its real length is anywhere between
 * 40% and 100% of this — which is why it stays well clear of the recenter button
 * beneath it even at its widest.
 */
const SCALE_MAX_PX = 110;

/**
 * How much of a grid square has to be on screen before its axis label is drawn, in
 * screen pixels. Below that the square is a sliver at the edge of the display and
 * its letter would sit on top of the neighbour's.
 */
const GRID_AXIS_MIN_PX = 20;

// --- What is a layer here, and what is not ---------------------------------------
//
// Everything on this map that does not move — terrain, grid, out-of-bounds mask,
// zones, frontlines, border — is painted into the basemap's tiles (see
// `src/basemap-layer.ts`), NOT added as a Leaflet layer. A tile is rasterized once
// and afterwards only translated, so a drag costs a CSS transform and nothing else.
//
// Leaflet layers are reserved for the things that move: the position marker and its
// accuracy circle, the navigation route, the PoI dots and turbine glyphs, the faction
// emblems, the zone labels. That leaves two vector paths on the map, which is why the
// renderer buffering this file used to carry — a padded canvas per pane plus a
// synthetic `moveend` fired several times per drag to repaint them — is gone.
//
// Add something static and it belongs in `paintTile`. Add something that follows the
// user and it belongs here.

/**
 * Maximum zoom, in screen pixels per canvas pixel — and the canvas is very nearly one
 * pixel per metre, so this is 4 px/m: about a hundred metres of ground across a phone
 * screen. Beyond that there is no more detail in the OSM data to show, and every extra
 * level doubles what the basemap has to rasterize.
 */
const MAX_ZOOM = 2;

/**
 * Which map to show on first paint. The URL wins — a bookmarked `?map=…` must open
 * that map even if the user last looked at a different one — then the last used map,
 * then the first one registered.
 */
function initialMapId(): string {
	const routed = routedMapId();
	if (routed != null) return routed;
	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored != null && MAPS.some((map) => map.id === stored)) return stored;
	return DEFAULT_MAP_ID;
}

interface Toggles {
	/** Show the id (number) label on every PoI, not just on hover. */
	poiIds: boolean;
	/** Show the coordinate grid (OSM maps only). */
	grid: boolean;
	/** Cover the area outside the play boundary (scenarios with a play area). */
	mask: boolean;
	/** Show the marked areas and frontlines traced from the printed map. */
	zones: boolean;
	/** Show the faction headquarters emblems. */
	hqs: boolean;
}

const DEFAULT_TOGGLES: Toggles = { poiIds: false, grid: true, mask: true, zones: true, hqs: true };

/**
 * Centroid of a CRS.Simple ring, for placing a zone's label. The plain vertex mean
 * is enough here — these rings are small and roughly convex, and the label only has
 * to land inside the shape, not at its exact area centroid.
 */
function polygonCenter(ring: L.LatLngExpression[]): L.LatLngExpression {
	let lat = 0;
	let lng = 0;
	for (const point of ring) {
		const [a, b] = point as [number, number];
		lat += a;
		lng += b;
	}
	return [lat / ring.length, lng / ring.length];
}

/**
 * The roundest distance that still fits in `maxMeters` — 1, 2 or 5 times a power
 * of ten, the sequence every mapping app's scale bar steps through. Never returns
 * more than it was given, so the bar always fits its budget.
 */
function niceDistance(maxMeters: number): number {
	const decade = 10 ** Math.floor(Math.log10(maxMeters));
	for (const step of [5, 2]) {
		if (step * decade <= maxMeters) return step * decade;
	}
	return decade;
}

/** A scale-bar distance in metres, written the way it is read: `500 m`, `2 km`. */
function formatScaleDistance(meters: number): string {
	// The 1-2-5 steps make every kilometre value a whole number, so no decimals
	// (and no locale-dependent decimal separator) are ever needed here.
	return meters >= 1000 ? `${meters / 1000} km` : `${meters} m`;
}

/**
 * What `placeAxis` remembers between frames, so a drag can get away with translating
 * the strip: where the strip's own box is, what zoom the labels inside were laid out
 * for, and which of them are currently displaced from that layout.
 */
interface AxisCache {
	/** The strip's box along its own axis, in viewport coordinates. NaN = re-measure. */
	min: number;
	max: number;
	/** Screen pixels per canvas pixel the label offsets were written for. */
	scale: number;
	/** The track translation currently written, to skip a no-op frame. */
	offset: number;
	adjusted: HTMLElement[];
}

function freshAxis(): AxisCache {
	return { min: NaN, max: NaN, scale: NaN, offset: NaN, adjusted: [] };
}

/**
 * The element inside a strip that actually carries the labels — and the pan.
 *
 * The strip is what the screen sees: fixed to an edge and `overflow: hidden`, so a
 * label whose square has scrolled away is clipped instead of being hidden by hand. The
 * track is what moves. They have to be two elements: a clip travels with its own
 * element's transform, so translating the strip would drag its clipping rectangle off
 * the screen along with everything in it.
 */
function axisTrack(strip: HTMLElement): HTMLElement {
	const existing = strip.firstElementChild;
	if (existing instanceof HTMLElement && existing.classList.contains("grid-axis-track")) {
		return existing;
	}
	const track = document.createElement("div");
	track.className = "grid-axis-track";
	strip.replaceChildren(track);
	return track;
}

/**
 * Give an axis track exactly `count` label elements, reusing the ones already there.
 * They are written by hand rather than through Lit because they are repositioned on
 * every frame of a drag — see `updateGridAxis`.
 */
function fillAxisStrip(strip: HTMLElement, count: number, label: (index: number) => string) {
	const track = axisTrack(strip);
	while (track.childElementCount > count) track.lastElementChild?.remove();
	while (track.childElementCount < count) {
		const span = document.createElement("span");
		span.className = "grid-axis-label";
		track.appendChild(span);
	}
	for (let i = 0; i < count; i++) {
		const element = track.children[i] as HTMLElement;
		const text = label(i);
		if (element.textContent !== text) element.textContent = text;
	}
}

function loadStoredToggles(): Toggles {
	try {
		const raw = localStorage.getItem(TOGGLES_KEY);
		if (raw) return { ...DEFAULT_TOGGLES, ...(JSON.parse(raw) as Partial<Toggles>) };
	} catch {
		// Ignore malformed/unavailable storage — fall back to defaults.
	}
	return { ...DEFAULT_TOGGLES };
}

@customElement("map-view")
export class MapView extends LitElement {
	// Light DOM: Leaflet ships global CSS that shadow DOM would wall off.
	protected createRenderRoot() {
		return this;
	}

	private map!: L.Map;
	private transform!: Transform;
	private marker!: L.Marker;
	private accuracyCircle!: L.Circle;
	private imageOverlay: L.ImageOverlay | null = null;
	private vectorCache = new Map<string, OsmFeatureCollection>();
	/** Grid spacing in canvas pixels, 0 while no grid is drawn. Also sizes the axis labels. */
	private gridStepPx = 0;
	/** The scale bar's elements, resolved on first use — see `scaleParts`. */
	private scaleElements: { scale: HTMLElement; bar: HTMLElement; label: HTMLElement } | null = null;
	/** Sticky axis labels: per-strip layout state, and the frame they are placed on. */
	private axisX = freshAxis();
	private axisY = freshAxis();
	private axisSignature = "";
	private gridAxisFrame = 0;
	/** The map container's viewport origin, cached alongside the strips — see `containerOrigin`. */
	private containerBox: { left: number; top: number } | null = null;
	/** The tiled basemap: terrain, grid, mask, zones, border. Built on the first OSM map. */
	private basemap: BasemapLayer | null = null;
	/** The baked geometry behind it, kept so a toggle can rebuild the scene without re-baking. */
	private baked: {
		/** Null until the OSM data lands, and for good on a photo map. */
		osm: BakedGeometry | null;
		playArea: BakedShape | null;
		zones: BakedZone[];
		lines: BakedLine[];
	} | null = null;
	/** The zones' names. The zones themselves are painted into the basemap. */
	private zoneLabelsLayer: L.LayerGroup | null = null;
	private hqLayer: L.LayerGroup | null = null;
	private poiMarker: L.Marker | null = null;
	private poiDotsLayer: L.LayerGroup | null = null;
	private routeLine: L.Polyline | null = null;
	private lastPixel: { px: number; py: number } | null = null;
	private lastGps: { lat: number; lng: number; accuracy: number; heading: number | null } | null =
		null;
	/**
	 * The fix the position layers are currently placed for — not the last one reported.
	 *
	 * A heading-only update carries the same position again, and re-placing for it is
	 * pure cost (see `update_`). This is what says "already placed", so it is cleared by
	 * `loadMap`: a new map means a new calibration, and the same latitude and longitude
	 * land on a different pixel.
	 */
	private placedFix: { lat: number; lng: number; accuracy: number } | null = null;

	private stopWatchingInstall?: () => void;

	connectedCallback() {
		super.connectedCallback();
		this.stopWatchingInstall = onInstallChange(() => (this.install = installMethod()));
	}

	disconnectedCallback() {
		super.disconnectedCallback();
		this.stopWatchingInstall?.();
	}
	/**
	 * True between `zoomstart` and `zoomend` — a pinch, a wheel step, a `fitBounds`.
	 *
	 * Leaflet does not redraw a vector path while the zoom is changing. It leaves the
	 * geometry in the coordinate space of the zoom the renderer last settled at and
	 * CSS-scales the renderer's whole container to cover the difference. So a path that
	 * *is* reprojected mid-gesture gets written in the live zoom's coordinates and then
	 * scaled a second time on top of that: it grows at the square of the pinch and comes
	 * away from the marker it belongs to. See `deferPathsWhileZooming`.
	 */
	private zooming = false;
	/** A fix arrived while `zooming`, so the two paths still have to be redrawn. */
	private pathsDeferred = false;
	/** Where and when the last long-press was taken, so one press is not read twice. */
	private lastHold: { x: number; y: number; at: number } | null = null;
	private mapWidth = 0;
	private mapHeight = 0;
	private resizeObserver: ResizeObserver | null = null;
	/**
	 * Whether the field has ever been framed while the container actually had a size.
	 * `fitBounds` on a 0×0 container clamps to `minZoom` and stays there, so until this
	 * is true the framing is a placeholder that has to be redone.
	 */
	private framed = false;

	@state() private status = t.waitingForGps;
	@state() private following = true;
	@state() private offMap = false;
	@state() private selectedMapId = initialMapId();
	@state() private selectedPoiId = "";
	/**
	 * The spot the player long-pressed, standing in as a PoI so the rest of the
	 * navigation code needs to know nothing about it. Only ever the one — picking a
	 * new spot replaces it.
	 */
	@state() private customTarget: LabeledPointOfInterest | null = null;
	@state() private navDistanceM = 0;
	@state() private navHint = "";
	@state() private navArrowDeg = 0;
	@state() private togglesOpen = false;

	// --- The install nudge. The landing page's card is the real pitch; this is the
	// backstop for everyone who arrived on a shared ?map= link and so has never seen
	// that page. It covers part of a live map, which buys it two obligations: it
	// waits until the app has actually proved useful, and "Später" means it. ---
	@state() private install: InstallMethod = installMethod();
	/** True once a fix has been drawn: the app has just shown them where they are. */
	@state() private locatedOnce = false;
	@state() private installBarDismissed = installNudgeSnoozed();
	/** iOS has no prompt to fire, so its bar unfolds into the gesture instead. */
	@state() private installStepsOpen = false;
	@state() private toggles: Toggles = loadStoredToggles();
	/** Set when the OSM data failed to load, so the user (or `online`) can retry it. */
	@state() private vectorRetry: { definition: MapDefinition; dataUrl: string } | null = null;

	firstUpdated() {
		this.map = L.map(this.querySelector("#map") as HTMLElement, {
			crs: L.CRS.Simple,
			minZoom: -4,
			maxZoom: MAX_ZOOM,
			zoomControl: false,
			attributionControl: false,
			// Fractional zoom. With Leaflet's default snap of 1, `fitBounds` rounds *down*
			// to a whole power of two, so a field only slightly wider than the screen opens
			// at half scale and wastes half the display. The basemap's tiles absorb the
			// difference (see MAX_OVERSAMPLE in basemap-layer.ts), so there is still no
			// reason to quantise the zoom.
			zoomSnap: 0,
			// The basemap draws its own opaque surround, so a tile has nothing to fade in
			// from — and a fade is a compositing pass per tile on exactly the frames a drag
			// needs for itself.
			fadeAnimation: false,
			// Long-press picks a destination (`onMapHold`), and this is what makes the
			// gesture exist on iOS at all: WebKit fires no `contextmenu`, so Leaflet
			// synthesises one — but only for a browser it recognises as mobile Safari, and
			// an installed PWA's user agent has dropped the "Safari" token, which is
			// precisely the case this app is used in. Turning it on everywhere is safe:
			// the handler only binds `touchstart`, so a mouse never sees it, and Android's
			// own long-press `contextmenu` is deduplicated in `onMapHold`.
			tapHold: true,
		});

		// A photo base goes below the basemap's tiles (tilePane is 200), so the mask and
		// the zones the tiles paint land on top of the imagery. Nothing ships a photo base
		// today, but the option is documented and this is what keeps it whole.
		this.map.createPane("photo-base");
		this.map.getPane("photo-base")!.style.zIndex = "190";

		// Zone names: above the tiles, below the overlay pane (400) and its markers — the
		// stacking the zones had when they were a vector layer of their own.
		this.map.createPane("zone-labels");
		this.map.getPane("zone-labels")!.style.zIndex = "320";

		// Leaflet fires `zoom` on every frame of a pinch and once per animated zoom, so
		// the bar tracks the gesture rather than snapping to its result.
		this.map.on("zoom zoomend", () => this.updateScale());

		// The axis labels ride the map, so they follow every frame of a drag or a pinch
		// rather than catching up when it ends — a label that lagged the squares under it
		// would be worse than none. Coalesced into one frame's work; see `updateGridAxis`.
		this.map.on("move zoom moveend zoomend", () => this.scheduleGridAxis());

		// Hold a finger on any spot (or right-click it) and the map offers to take you
		// there — see `onMapHold`. Leaflet only reaches this handler for a press that
		// landed on nothing: the PoI markers answer `contextmenu` themselves, and marker
		// events do not bubble to the map.
		this.map.on("contextmenu", (event: L.LeafletMouseEvent) => this.onMapHold(event));

		this.deferPathsWhileZooming();

		// Dragging the map cancels auto-follow (so you can look around).
		this.map.on("dragstart", () => {
			this.following = false;
		});
		// So does a pinch. Leaflet's `Draggable` ignores anything that is not a single
		// touch, so a two-finger gesture never fires `dragstart` — without this, zooming
		// in on the building ahead of you gets undone by the next fix panning back. Watch
		// the second finger directly rather than `zoomstart`, which programmatic zooms
		// (`fitBounds`, `recenter`) also fire.
		this.map.getContainer().addEventListener(
			"touchstart",
			(event) => {
				if (event.touches.length > 1) this.following = false;
			},
			{ passive: true },
		);

		this.accuracyCircle = L.circle(this.px2ll(0, 0), {
			radius: 0,
			color: BRAND_BLUE,
			weight: 1,
			fillColor: BRAND_BLUE,
			fillOpacity: 0.15,
		});
		this.marker = L.marker(this.px2ll(0, 0), { icon: this.makeIcon(), interactive: false });

		this.loadMap(getMapById(this.selectedMapId));

		// The container starts at 0×0 whenever the overview is the entry screen (this
		// element is `hidden` until a map is routed to), and can also be 0×0 on a PWA
		// cold start or a not-yet-laid-out preview. fitBounds would then snap to min
		// zoom and stick there. Re-sync and re-fit whenever the container resizes, until
		// GPS or the user takes over.
		//
		// The observer must be held in a field: an unreferenced ResizeObserver is
		// collectable even while it has live observations, and losing it here leaves the
		// map stuck at min zoom with no way back.
		const mapEl = this.querySelector("#map");
		if (mapEl) {
			this.resizeObserver = new ResizeObserver(() => this.resyncSize());
			this.resizeObserver.observe(mapEl);
		}

		// If the map data failed to load, take a returning network as the cue to retry
		// without the user having to notice the pill.
		window.addEventListener("online", () => this.retryVectorMap());
	}

	private currentPointsOfInterest(): LabeledPointOfInterest[] {
		return getPointsOfInterestForMap(this.selectedMapId);
	}

	private getSelectedPoi(): LabeledPointOfInterest | null {
		if (this.selectedPoiId === CUSTOM_TARGET_ID) return this.customTarget;
		return this.currentPointsOfInterest().find((poi) => poi.id === this.selectedPoiId) ?? null;
	}

	private loadMap(definition: MapDefinition) {
		this.selectedMapId = definition.id;
		try {
			localStorage.setItem(STORAGE_KEY, definition.id);
		} catch {
			// Storage unavailable (private mode, quota, etc.) — session still works.
		}

		this.clearNavigation();
		// Any pending retry belonged to the map we are leaving. Keeping it would leave the
		// pill offering to reload a map that is no longer on screen.
		this.vectorRetry = null;
		this.mapWidth = definition.width;
		this.mapHeight = definition.height;
		this.transform = solveTransform(definition.controlPoints);
		// New calibration: whatever the position layers were placed for is in the old
		// map's pixels, so the next fix has to place them again even if it is the same one.
		this.placedFix = null;
		// Dev sanity check — never shown to the user.
		console.info(
			`[calibration:${definition.id}] RMS error: ${this.transform.rmsMeters.toFixed(2)} m across ${definition.controlPoints.length} points`,
		);

		if (this.imageOverlay) {
			this.map.removeLayer(this.imageOverlay);
			this.imageOverlay = null;
		}
		// The basemap survives a map switch — it is one layer holding one tile cache, and
		// `setScene` repaints it — but its geometry does not, and neither do the letters
		// naming the grid squares. Both are cleared here rather than when the new map's
		// data arrives: that load is async, and a stale set of letters over the map being
		// loaded would be pointing at nothing.
		this.baked = null;
		this.gridStepPx = 0;
		this.syncGridAxis();
		if (this.basemap) {
			this.map.removeLayer(this.basemap);
			this.basemap = null;
		}
		if (this.hqLayer) {
			this.map.removeLayer(this.hqLayer);
			this.hqLayer = null;
		}

		const bounds: L.LatLngBoundsExpression = [
			[0, 0],
			[this.mapHeight, this.mapWidth],
		];

		// Match the container to the theme's surround, so everything past the edge of the
		// field — where the basemap deliberately puts no tiles at all — is the border colour.
		const container = this.map.getContainer();
		container.style.background = definition.vectorData ? osmSurroundColor(definition.theme) : "";

		// The overlays traced off the printed map are bakeable straight away; the OSM base
		// has to be fetched first and arrives through `loadVectorMap`.
		this.baked = {
			osm: null,
			playArea: this.bakePlayArea(definition.playArea),
			...this.bakeZones(definition),
		};

		if (definition.vectorData) {
			void this.loadVectorMap(definition, definition.vectorData);
		} else if (definition.image) {
			// Below the basemap's tiles (see the `photo-base` pane), so the mask and the
			// zones still paint over a photo map the way they do over the vector one.
			this.imageOverlay = L.imageOverlay(definition.image, bounds, { pane: "photo-base" }).addTo(
				this.map,
			);
		}
		this.syncBasemap(definition);
		this.renderZoneLabels();
		this.renderHeadquarters(definition);
		this.fitInitial(definition);
		// New calibration, and usually a new zoom — both feed the scale bar.
		this.updateScale();
		this.following = true;

		if (this.lastGps) {
			this.update_(this.lastGps.lat, this.lastGps.lng, this.lastGps.accuracy, this.lastGps.heading);
		}

		this.syncPoiDots();
	}

	/**
	 * Fetch (once) and bake the bundled OSM GeoJSON, then hand it to the basemap. The
	 * file is precached by the service worker, so this resolves from cache offline.
	 */
	private async loadVectorMap(definition: MapDefinition, dataUrl: string) {
		try {
			let data = this.vectorCache.get(dataUrl);
			if (!data) {
				data = await this.fetchVectorData(dataUrl);
				this.vectorCache.set(dataUrl, data);
			}

			// Guard against a map switch while the fetch was in flight.
			if (this.selectedMapId !== definition.id || !this.transform || !this.baked) return;

			// Projected once, here, into canvas pixels. GeoJSON hands over (lng, lat).
			this.baked.osm = bakeOsm(data, (lng, lat) => this.transform.toPixel(lat, lng));

			// The coordinate grid (100 m, matching the scale bar) is painted with the
			// terrain now, but the letters and numbers naming its squares are chrome, and
			// this is the size they are counted off.
			this.gridStepPx = this.transform.metersToPixels(GRID_STEP_M);
			this.syncGridAxis();
			this.syncBasemap(definition);

			// Clear a previous failure. The GPS status normally owns this pill, so only
			// take it back when there is no fix yet to report.
			this.vectorRetry = null;
			if (!this.lastGps) this.status = t.waitingForGps;
		} catch (err) {
			console.error("[osm] failed to load vector map", err);
			this.status = t.mapLoadFailed;
			this.vectorRetry = { definition, dataUrl };
		}
	}

	/**
	 * Fetch the bundled GeoJSON, retrying a couple of times.
	 *
	 * Normally this resolves straight from the service worker cache, but it can still
	 * fail: a precache miss, a dev-server restart, or a flaky first load in the car
	 * park before anyone reaches the field. A single failure used to leave the map
	 * permanently blank with no way back, which is the worst way for this app to fail —
	 * you find out standing in a forest with no signal. Retry, then let the user tap
	 * the status pill to try again.
	 */
	private async fetchVectorData(dataUrl: string, attempts = 3): Promise<OsmFeatureCollection> {
		let lastError: unknown;
		for (let attempt = 0; attempt < attempts; attempt++) {
			if (attempt > 0) await new Promise((r) => setTimeout(r, 300 * attempt));
			try {
				const res = await fetch(dataUrl, { cache: "force-cache" });
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				return (await res.json()) as OsmFeatureCollection;
			} catch (err) {
				lastError = err;
			}
		}
		throw lastError;
	}

	/** Retry a failed vector load — from the status pill, or when the network returns. */
	private retryVectorMap() {
		const pending = this.vectorRetry;
		if (!pending) return;
		this.vectorRetry = null;
		this.status = t.mapLoading;
		void this.loadVectorMap(pending.definition, pending.dataUrl);
	}

	/**
	 * Bake the play-area boundary. Everything outside it is covered by the darken +
	 * diagonal-hatch texture `paintTile` draws, emulating the printed maps. No polygon
	 * (or fewer than 3 points) means "whole field" — nothing is masked.
	 */
	private bakePlayArea(playArea: [number, number][] | undefined): BakedShape | null {
		if (!playArea || playArea.length < 3 || !this.transform) return null;
		return bakeShape(playArea, (lat, lng) => this.transform.toPixel(lat, lng));
	}

	/**
	 * Hand the basemap everything it paints: the baked geometry plus the toggles that
	 * decide which of it is on. Called on a map load, when the OSM data lands, and on
	 * every layer toggle — a repaint of the live tiles, not a rebuild of the layer.
	 */
	private syncBasemap(definition = getMapById(this.selectedMapId)) {
		const baked = this.baked;
		const nothingToPaint =
			!baked ||
			(!baked.osm && !baked.playArea && baked.zones.length === 0 && baked.lines.length === 0);
		if (nothingToPaint) {
			if (this.basemap) {
				this.map.removeLayer(this.basemap);
				this.basemap = null;
			}
			return;
		}

		const scene: TileScene = {
			terrain: baked.osm,
			theme: definition.theme ?? "opt",
			width: this.mapWidth,
			height: this.mapHeight,
			gridStepPx: this.gridStepPx,
			playArea: baked.playArea,
			zones: baked.zones,
			lines: baked.lines,
			showGrid: this.toggles.grid,
			showMask: this.toggles.mask,
			showZones: this.toggles.zones,
		};

		if (this.basemap) this.basemap.setScene(scene, this.mapHeight);
		else this.basemap = new BasemapLayer(scene, this.mapHeight).addTo(this.map);
	}

	/**
	 * Frame the field, recording whether the container had a size while doing it.
	 * `Map.getBoundsZoom` divides by the container size, so fitting at 0×0 resolves to
	 * `-Infinity` and clamps to `minZoom` — a "framing" that has to be redone later.
	 */
	private fitInitial(definition: MapDefinition) {
		this.map.fitBounds(this.initialBounds(definition));
		const size = this.map.getSize();
		this.framed = size.x > 0 && size.y > 0;
	}

	/**
	 * Tell Leaflet the container changed size, and re-frame the field if the user has
	 * not taken over yet. Called by the ResizeObserver, and directly when a route
	 * change reveals this element — Leaflet caches its container size, so a map that
	 * was laid out at 0×0 stays at minimum zoom until something re-syncs it.
	 *
	 * The re-frame is gated on `framed`, not on "no fix yet". A fix normally arrives
	 * while the overview is still up (geolocation starts at load, whatever the route),
	 * and following it only ever calls `panTo` — which re-centres but never touches the
	 * zoom. Gating on the fix therefore left every map opened from the overview stuck
	 * at `minZoom`, showing the whole field as a speck.
	 */
	private resyncSize() {
		if (!this.map) return;
		this.map.invalidateSize({ animate: false });
		// The strips are as wide as the screen, so their measured boxes are stale — and on
		// the 0×0 cold start the ones on record are a zero-width placeholder. Place them
		// now rather than on the next frame: a pending animation frame does not run while
		// this element is still hidden.
		this.invalidateGridAxis();
		this.updateGridAxis();
		if (!this.following || (this.framed && this.lastGps)) return;

		this.fitInitial(getMapById(this.selectedMapId));
		// The 0×0 framing was at `minZoom`; this one is real, so the bar has to follow.
		this.updateScale();
		// A fix that landed while the container was still 0×0 was applied at the wrong
		// zoom; now that the framing is real, re-centre on it.
		if (this.lastGps && !this.offMap && this.lastPixel) {
			this.map.panTo(this.px2ll(this.lastPixel.px, this.lastPixel.py), { animate: false });
		}
	}

	/**
	 * What the map should frame when it opens.
	 *
	 * The shared OSM canvas spans far more ground than any single event uses, so
	 * fitting the whole canvas opens on a screenful of masked-out surround with the
	 * actual field small in the middle. Frame the scenario's play area instead when it
	 * has one; only fall back to the canvas for scenarios that play the whole field.
	 */
	private initialBounds(definition: MapDefinition): L.LatLngBoundsExpression {
		const canvas: L.LatLngBoundsExpression = [
			[0, 0],
			[this.mapHeight, this.mapWidth],
		];
		const playArea = definition.playArea;
		if (!playArea || playArea.length < 3 || !this.transform) return canvas;
		// A little slack so the boundary itself is not flush against the screen edge.
		return L.latLngBounds(this.ring(playArea) as L.LatLngTuple[]).pad(0.05);
	}

	/** GPS ring -> Leaflet CRS.Simple ring, through the current calibration. */
	private ring(points: [number, number][]): L.LatLngExpression[] {
		return points.map(([lat, lng]) => {
			const { px, py } = this.transform.toPixel(lat, lng);
			return this.px2ll(px, py);
		});
	}

	/**
	 * Bake the marked areas and frontlines traced off the event's printed map: the
	 * hatched safe zones, the "Zivile Zone" wash, the faction boundary lines. The
	 * shapes are painted by `paintTile`; only their names stay markers, because text
	 * has to stay upright and screen-sized whatever the map does under it.
	 */
	private bakeZones(definition: MapDefinition): { zones: BakedZone[]; lines: BakedLine[] } {
		if (!this.transform) return { zones: [], lines: [] };
		const project: (lat: number, lng: number) => { px: number; py: number } = (lat, lng) =>
			this.transform.toPixel(lat, lng);

		return {
			zones: (definition.zones ?? [])
				.filter((zone) => zone.points.length >= 3)
				.map((zone) => ({
					shape: bakeShape(zone.points, project),
					color: zone.color,
					style: zone.style ?? "hatch",
				})),
			lines: (definition.lines ?? [])
				.filter((line) => line.points.length >= 2)
				.map((line) => ({ shape: bakeShape(line.points, project), color: line.color })),
		};
	}

	/** The zones' names, at the centre of each zone. Toggled with the zones themselves. */
	private renderZoneLabels() {
		if (this.zoneLabelsLayer) {
			this.map.removeLayer(this.zoneLabelsLayer);
			this.zoneLabelsLayer = null;
		}
		const definition = getMapById(this.selectedMapId);
		const zones = (definition.zones ?? []).filter((zone) => zone.points.length >= 3);
		if (zones.length === 0 || !this.transform) return;

		this.zoneLabelsLayer = L.layerGroup();
		for (const zone of zones) {
			const center = polygonCenter(this.ring(zone.points));
			L.marker(center, {
				pane: "zone-labels",
				icon: L.divIcon({
					className: "zone-label-marker",
					html: `<span class="zone-label" style="color:${zone.color}">${zone.name}</span>`,
					iconSize: [0, 0],
				}),
				interactive: false,
			}).addTo(this.zoneLabelsLayer);
		}
		if (this.toggles.zones) this.zoneLabelsLayer.addTo(this.map);
	}

	/** Faction headquarters, drawn as their emblem in a coloured ring. */
	private renderHeadquarters(definition: MapDefinition) {
		if (this.hqLayer) {
			this.map.removeLayer(this.hqLayer);
			this.hqLayer = null;
		}
		const headquarters = definition.headquarters ?? [];
		if (headquarters.length === 0 || !this.transform) return;

		this.hqLayer = L.layerGroup();
		// Resolved once for the whole pass rather than per emblem — same list every time.
		const pointsOfInterest = this.currentPointsOfInterest();
		for (const hq of headquarters) {
			const { px, py } = this.transform.toPixel(hq.lat, hq.lng);
			const emblem = hq.logo ? `<img class="hq-logo" src="${hq.logo}" alt="" />` : "";
			const marker = L.marker(this.px2ll(px, py), {
				icon: L.divIcon({
					className: "hq-marker",
					html:
						`<div class="hq-ring" style="border-color:${hq.color}">${emblem}</div>` +
						`<span class="hq-name" style="color:${hq.color}">${hq.name}</span>`,
					iconSize: [52, 52],
					iconAnchor: [26, 26],
					// Float labels just clear of the ring rather than out of its middle.
					tooltipAnchor: [0, -18],
					popupAnchor: [0, -18],
				}),
				interactive: true,
			});
			// Most emblems are painted straight onto a numbered building. Where that is the
			// case the emblem *is* that PoI's marker — it carries the number and the route,
			// and `syncPoiDots` leaves the dot off so there is one target, not two.
			const poi = pointsOfInterest.find((candidate) => this.samePlace(hq, candidate));
			if (poi) {
				this.bindPoiInteractions(marker, poi);
			} else {
				marker.bindTooltip(hq.name, {
					className: "poi-tooltip",
					direction: "top",
					offset: [0, -10],
				});
			}
			marker.addTo(this.hqLayer);
		}
		if (this.toggles.hqs) this.hqLayer.addTo(this.map);
	}

	/** Whether two field features sit on the same spot — see `SAME_PLACE_M`. */
	private samePlace(a: { lat: number; lng: number }, b: { lat: number; lng: number }): boolean {
		return distanceMeters(a.lat, a.lng, b.lat, b.lng) <= SAME_PLACE_M;
	}

	/** Whether the current map can show the grid / mask toggles. */
	private get hasGrid(): boolean {
		return getMapById(this.selectedMapId).vectorData != null;
	}
	/**
	 * The axis labels name the squares of the grid, so they come and go with it: with
	 * the grid off there is nothing on screen for a letter to refer to.
	 */
	private get showGridAxis(): boolean {
		return this.hasGrid && this.toggles.grid;
	}
	private get hasMask(): boolean {
		return (getMapById(this.selectedMapId).playArea?.length ?? 0) >= 3;
	}
	private get hasZones(): boolean {
		const map = getMapById(this.selectedMapId);
		return (map.zones?.length ?? 0) + (map.lines?.length ?? 0) > 0;
	}
	private get hasHqs(): boolean {
		return (getMapById(this.selectedMapId).headquarters?.length ?? 0) > 0;
	}

	private toggle(key: keyof Toggles) {
		this.toggles = { ...this.toggles, [key]: !this.toggles[key] };
		try {
			localStorage.setItem(TOGGLES_KEY, JSON.stringify(this.toggles));
		} catch {
			// Non-fatal — the toggle still applies for this session.
		}
		this.applyToggles();
		// Two toggles reach into the PoI icons themselves: the id labels are baked into
		// them, and hiding the emblems has to give the dots they stand in for back. Every
		// other toggle is either a basemap repaint or one layer coming and going, so there
		// is no reason to tear down and rebuild ~80 marker elements for it.
		if (key === "poiIds" || key === "hqs") this.syncPoiDots();
	}

	/** Apply the current toggle states to the live layers. */
	private applyToggles() {
		// Grid, mask and zones are painted into the basemap, so switching one on is a
		// repaint of the tiles that are already on screen — not a layer being built.
		this.syncBasemap();
		if (this.zoneLabelsLayer) {
			if (this.toggles.zones) this.zoneLabelsLayer.addTo(this.map);
			else this.map.removeLayer(this.zoneLabelsLayer);
		}
		if (this.hqLayer) {
			if (this.toggles.hqs) this.hqLayer.addTo(this.map);
			else this.map.removeLayer(this.hqLayer);
		}
	}

	/** Show a map because the route changed. */
	showRoutedMap(id: string) {
		if (id !== this.selectedMapId) this.loadMap(getMapById(id));
		// This element was `hidden` until now, so its container may still be 0×0 as far
		// as Leaflet knows. The ResizeObserver catches that too, but only after layout —
		// resync on the next frame so the first paint is already framed correctly.
		requestAnimationFrame(() => this.resyncSize());
	}

	/**
	 * Whether a navigation is running. The one piece of map state a reload would
	 * destroy and the player would have to re-enter by hand — `main.ts` holds an
	 * app update back over it.
	 */
	get navigating(): boolean {
		return this.selectedPoiId !== "";
	}

	private onPoiSelect(event: Event) {
		this.startNavigation((event.target as HTMLSelectElement).value);
	}

	/**
	 * Start navigating to a PoI, whichever way the user asked for it: the select, the
	 * "Navigate here" button in a dot's popup, or a double-click on the dot. Empty id
	 * means the select's placeholder — that stops navigation.
	 */
	private startNavigation(poiId: string) {
		this.selectedPoiId = poiId;
		if (!poiId) {
			this.clearNavigation();
			this.updateStatus();
			return;
		}
		// The popup has done its job, and `fitUserAndPoi` is about to move the view out
		// from under it.
		this.map.closePopup();
		this.showPoiMarker();
		this.updateNavigation();
		this.fitUserAndPoi();
		this.updateStatus();
	}

	/**
	 * A long press (or a right-click) on a spot that is not a PoI: ask whether to
	 * navigate there.
	 *
	 * The numbered PoIs are the buildings the organiser thought to number, and a lot
	 * of what a player actually walks to is not one of them — a treeline, the corner
	 * a squad said it would hold, the spot a flank is meant to come out of. Someone
	 * can read a grid square off the map and be told to go there, so the map has to
	 * let them aim at it. The ask is the same popup a PoI dot gives, because it is
	 * the same decision.
	 */
	private onMapHold(event: L.LeafletMouseEvent) {
		if (!this.transform) return;

		// One press, possibly two events: Android Chrome fires `contextmenu` on its own
		// *and* Leaflet's tapHold timer synthesises one. Whichever arrives second is the
		// same finger in the same place, not a new pick.
		const at = event.originalEvent.timeStamp || Date.now();
		const { x, y } = event.containerPoint;
		if (
			this.lastHold &&
			at - this.lastHold.at < HOLD_DEDUPE_MS &&
			Math.hypot(x - this.lastHold.x, y - this.lastHold.y) < HOLD_DEDUPE_PX
		) {
			return;
		}
		this.lastHold = { x, y, at };

		const pixel = this.ll2px(event.latlng);
		// The tiles stop at the canvas edge, so a press past it is aimed at the surround
		// and there is nothing there to walk to. Just inside that, clamp instead of
		// refusing: the pin is drawn above the spot and a thumb covers a lot of field.
		if (
			pixel.px < -HOLD_SLACK_PX ||
			pixel.py < -HOLD_SLACK_PX ||
			pixel.px > this.mapWidth + HOLD_SLACK_PX ||
			pixel.py > this.mapHeight + HOLD_SLACK_PX
		) {
			return;
		}
		const px = Math.min(Math.max(pixel.px, 0), this.mapWidth);
		const py = Math.min(Math.max(pixel.py, 0), this.mapHeight);

		const { lat, lng } = this.transform.toLatLng(px, py);
		const target: LabeledPointOfInterest = {
			id: CUSTOM_TARGET_ID,
			name: this.namePickedPoint(px, py),
			lat,
			lng,
		};

		// Built here rather than bound to a marker: the spot only becomes a place on the
		// map if the answer is yes, and until then the popup's own tip is what points at
		// it. Dismissing is a tap anywhere else, the way every other popup here closes.
		const popup = L.popup({ className: "poi-popup", closeButton: false, offset: [0, -6] });
		this.applyPopupPadding(popup);
		popup
			.setLatLng(this.px2ll(px, py))
			.setContent(this.makeNavPopupBody(target.name, () => this.startCustomNavigation(target)))
			.openOn(this.map);
	}

	/**
	 * What to call a spot the player picked. With the grid on screen it has a name
	 * already — the square it falls in, which is also how the spot was described to
	 * them over the radio. With the grid off there is nothing on screen to read a
	 * square against, so naming one would be a coordinate they cannot check.
	 */
	private namePickedPoint(px: number, py: number): string {
		if (!this.showGridAxis || this.gridStepPx <= 0) return t.markedPosition;
		const column = gridColumnLabel(Math.floor(px / this.gridStepPx));
		const row = Math.floor(py / this.gridStepPx) + 1;
		return t.gridSquare(`${column}${row}`);
	}

	private startCustomNavigation(target: LabeledPointOfInterest) {
		this.customTarget = target;
		this.startNavigation(CUSTOM_TARGET_ID);
	}

	private clearNavigation() {
		this.selectedPoiId = "";
		// A picked spot exists only for the navigation it was picked for: leaving it
		// behind would keep a stale option in the select long after the route is gone.
		this.customTarget = null;
		this.navDistanceM = 0;
		this.navHint = "";
		this.navArrowDeg = 0;
		if (this.poiMarker) {
			this.map.removeLayer(this.poiMarker);
			this.poiMarker = null;
		}
		if (this.routeLine) {
			this.map.removeLayer(this.routeLine);
			this.routeLine = null;
		}
	}

	private showPoiMarker() {
		const poi = this.getSelectedPoi();
		if (!poi || !this.transform) return;

		const pixel = this.transform.toPixel(poi.lat, poi.lng);
		const latLng = this.px2ll(pixel.px, pixel.py);

		if (!this.poiMarker) {
			this.poiMarker = L.marker(latLng, { icon: this.makePoiIcon(), interactive: false });
			this.poiMarker.addTo(this.map);
		} else {
			this.poiMarker.setLatLng(latLng);
			if (!this.map.hasLayer(this.poiMarker)) this.poiMarker.addTo(this.map);
		}
	}

	/**
	 * Refresh the navigation readouts, and the route line with them.
	 *
	 * `positionUnchanged` is set when only the heading moved: the distance, the bearing
	 * and the turn hint still have to be recomputed (the hint is *about* the heading),
	 * but the line on the map has the same two endpoints it already has, and
	 * reprojecting a vector path is the expensive half of this method.
	 */
	private updateNavigation(positionUnchanged = false) {
		const poi = this.getSelectedPoi();
		if (!poi || !this.transform || !this.lastGps) {
			this.navDistanceM = 0;
			this.navHint = this.lastGps ? "" : t.waitingForGps;
			return;
		}

		const gpsPixel = this.transform.toPixel(this.lastGps.lat, this.lastGps.lng);
		const userPixel = this.displayPixel(gpsPixel);
		const poiPixel = this.transform.toPixel(poi.lat, poi.lng);

		// Distance and bearing come from the GPS fix, never from `userPixel` — that one
		// has already been swapped for the map centre when the fix falls off the canvas,
		// which used to make the readout a constant (the centre-to-PoI distance) no matter
		// how far away you actually were. Only where the route line is *drawn* falls back
		// to the centre; the numbers are true anywhere on earth.
		const distance = distanceMeters(this.lastGps.lat, this.lastGps.lng, poi.lat, poi.lng);
		const targetBearing = bearingDegrees(this.lastGps.lat, this.lastGps.lng, poi.lat, poi.lng);
		this.navDistanceM = distance;
		this.navArrowDeg = this.transform.bearingToScreenDeg(targetBearing);

		if (this.offMap) {
			// Worth saying, because the line on screen starts at the map centre rather than
			// under your feet — but the distance and the arrow above are real.
			this.navHint = t.navOffField;
		} else if (distance <= ARRIVED_DISTANCE_M) {
			this.navHint = t.navArrived;
		} else if (this.lastGps.heading != null) {
			const relative = relativeBearingDegrees(targetBearing, this.lastGps.heading);
			this.navHint = t.navHints[navigationHint(relative)];
		} else {
			this.navHint = t.navEnableCompass;
		}

		// Nothing moved, and the line is already drawn between these two points.
		if (positionUnchanged && this.routeLine && this.map.hasLayer(this.routeLine)) return;

		// The readouts above are DOM text and track the gesture; the line is a vector path
		// and must not be reprojected until the zoom lands (see `zooming`).
		if (this.zooming) {
			this.pathsDeferred = true;
			return;
		}

		const userLatLng = this.px2ll(userPixel.px, userPixel.py);
		const poiLatLng = this.px2ll(poiPixel.px, poiPixel.py);

		if (!this.routeLine) {
			this.routeLine = L.polyline([userLatLng, poiLatLng], {
				color: BRAND_ORANGE,
				weight: 3,
				dashArray: "8 8",
				opacity: 0.85,
				interactive: false,
			});
			this.routeLine.addTo(this.map);
		} else {
			this.routeLine.setLatLngs([userLatLng, poiLatLng]);
			if (!this.map.hasLayer(this.routeLine)) this.routeLine.addTo(this.map);
		}
	}

	private fitUserAndPoi() {
		const poi = this.getSelectedPoi();
		if (!poi || !this.transform || !this.lastGps) return;

		const userPixel = this.displayPixel(this.transform.toPixel(this.lastGps.lat, this.lastGps.lng));
		const poiPixel = this.transform.toPixel(poi.lat, poi.lng);
		const bounds = L.latLngBounds([
			this.px2ll(userPixel.px, userPixel.py),
			this.px2ll(poiPixel.px, poiPixel.py),
		]);
		this.map.fitBounds(bounds, { padding: [80, 80], maxZoom: 2 });
		this.following = false;
	}

	/** IMAGE pixel (y-down, from top) -> Leaflet CRS.Simple latLng (y-up). */
	private px2ll(px: number, py: number): L.LatLngExpression {
		return [this.mapHeight - py, px];
	}

	/** The inverse of `px2ll`: a point on the Leaflet map back to an image pixel. */
	private ll2px(latLng: L.LatLng): { px: number; py: number } {
		return { px: latLng.lng, py: this.mapHeight - latLng.lat };
	}

	private mapCenterPixel(): { px: number; py: number } {
		return { px: this.mapWidth / 2, py: this.mapHeight / 2 };
	}

	private isOffMapPixel(pixel: { px: number; py: number }): boolean {
		return pixel.px < 0 || pixel.px > this.mapWidth || pixel.py < 0 || pixel.py > this.mapHeight;
	}

	/** On-map GPS pixel, or map center when the fix falls outside the image. */
	private displayPixel(gpsPixel: { px: number; py: number }): { px: number; py: number } {
		return this.isOffMapPixel(gpsPixel) ? this.mapCenterPixel() : gpsPixel;
	}

	private makeIcon(rotationDeg = 0, showTriangle = false) {
		const inner = showTriangle
			? `<div class="pm-arrow" style="transform:rotate(${rotationDeg}deg)"></div>`
			: `<div class="pm-dot"></div>`;
		return L.divIcon({
			className: "pm-marker",
			html: `<div class="pm-wrap">${inner}</div>`,
			iconSize: [30, 30],
			iconAnchor: [15, 15],
		});
	}

	private makePoiIcon() {
		return L.divIcon({
			className: "poi-marker",
			html: `<div class="poi-pin"></div>`,
			iconSize: [24, 24],
			iconAnchor: [12, 22],
		});
	}

	private makePoiDotIcon(idLabel?: string) {
		const label = idLabel ? `<span class="poi-dot-label">${idLabel}</span>` : "";
		return L.divIcon({
			className: "poi-dot-marker",
			html: `<div class="poi-dot-hit"><div class="poi-dot"></div>${label}</div>`,
			iconSize: [24, 24],
			iconAnchor: [12, 12],
		});
	}

	/**
	 * The wind turbines, drawn as a glyph standing on their coordinate: the icon is
	 * anchored bottom-centre so the tower's base sits on the GPS position, the way
	 * the mast does in the field. Screen-sized (not map-scaled) and never rotated —
	 * it is a pictogram, not a footprint. This replaces the dot rather than covering
	 * it, so the glyph's box is also the tap target.
	 */
	private makeTurbineIcon(idLabel?: string) {
		const blade = (deg: number) =>
			`<path d="M20 16 C18.3 10 17.7 5 19 0.8 C21.7 4.4 22.5 10 21.7 16 Z" transform="rotate(${deg} 20 16)" />`;
		const label = idLabel ? `<span class="poi-dot-label">${idLabel}</span>` : "";
		return L.divIcon({
			className: "turbine-marker",
			html: `<div class="turbine-hit"><svg class="turbine-glyph" viewBox="0 0 40 56" width="30" height="42" aria-hidden="true">
					<polygon points="17.7,56 22.3,56 20.9,17 19.1,17" />
					${blade(0)}${blade(120)}${blade(240)}
					<circle cx="20" cy="16" r="2.6" />
				</svg>${label}</div>`,
			iconSize: [30, 42],
			iconAnchor: [15, 42],
			// Anchored at the base, so labels float above the whole mast.
			tooltipAnchor: [0, -42],
			popupAnchor: [0, -42],
		});
	}

	private poiLabel(poi: LabeledPointOfInterest) {
		return `${poi.id} · ${poi.name}`;
	}

	/**
	 * What a tapped PoI dot shows: the same label the tooltip carries, plus the one
	 * thing you actually want from a building on the ground — a route to it. Built as
	 * DOM rather than a Lit template because it lives in Leaflet's popup pane, outside
	 * this component's render.
	 */
	private makePoiPopup(marker: L.Marker, poi: LabeledPointOfInterest): HTMLElement {
		// Leaflet re-reads the auto-pan padding right after building the content, so this
		// is the moment to re-measure the chrome the popup has to stay clear of.
		const popup = marker.getPopup();
		if (popup) this.applyPopupPadding(popup);
		return this.makeNavPopupBody(this.poiLabel(poi), () => this.startNavigation(poi.id));
	}

	/**
	 * A name and the one thing you want from a place on the ground. Shared by the PoI
	 * dots and by a spot picked off the map, so both ask the question the same way.
	 */
	private makeNavPopupBody(label: string, navigateTo: () => void): HTMLElement {
		const body = document.createElement("div");
		body.className = "poi-popup-body";

		const title = document.createElement("span");
		title.className = "poi-popup-title";
		title.textContent = label;

		const navigate = document.createElement("button");
		navigate.type = "button";
		navigate.className = "poi-popup-nav";
		navigate.textContent = t.navigateHere;
		navigate.addEventListener("click", navigateTo);

		body.append(title, navigate);
		return body;
	}

	/** Keep a popup clear of the chrome it would otherwise auto-pan itself under. */
	private applyPopupPadding(popup: L.Popup) {
		const { top, bottom } = this.chromeInsets();
		popup.options.autoPanPaddingTopLeft = L.point(16, top);
		popup.options.autoPanPaddingBottomRight = L.point(16, bottom);
	}

	/**
	 * How far the chrome intrudes on the map, top and bottom, with a margin. The top
	 * rows come and go (compass prompt, a toast of any height) and the HUD grows with
	 * a wrapped status line, the nav card and the install bar, so measure them instead
	 * of restating the CSS row arithmetic here.
	 *
	 * Only elements that really sit at the top belong in `top`: the PoI panel moved
	 * into the HUD, and measuring its bottom edge from up here made the top inset
	 * nearly a full screen, which auto-panned every popup — and the PoI under it —
	 * down to the bottom edge.
	 */
	private chromeInsets(): { top: number; bottom: number } {
		const visibleBottom = (element: Element | null) =>
			element instanceof HTMLElement && !element.hidden
				? element.getBoundingClientRect().bottom
				: 0;
		const top = Math.max(
			visibleBottom(this.querySelector(".top-row")),
			visibleBottom(document.querySelector("#enable-compass")),
			visibleBottom(document.querySelector("#toast")),
		);
		const hud = this.querySelector(".hud")?.getBoundingClientRect();
		return {
			top: Math.ceil(top) + 12,
			bottom: Math.ceil(hud?.height ?? 0) + 12,
		};
	}

	private clearPoiDots() {
		if (this.poiDotsLayer) {
			this.map.removeLayer(this.poiDotsLayer);
			this.poiDotsLayer = null;
		}
	}

	private syncPoiDots() {
		this.clearPoiDots();
		if (!this.transform) return;

		const pointsOfInterest = this.currentPointsOfInterest().filter(
			(poi) => poi.lat !== 0 || poi.lng !== 0,
		);
		if (pointsOfInterest.length === 0) return;

		// An emblem drawn on a building already marks it, and `renderHeadquarters` has
		// given that marker the PoI's label and route — but only while the HQ layer is
		// actually shown, so with the emblems toggled off the dots come back.
		const headquarters = this.toggles.hqs
			? (getMapById(this.selectedMapId).headquarters ?? [])
			: [];

		this.poiDotsLayer = L.layerGroup();
		for (const poi of pointsOfInterest) {
			if (headquarters.some((hq) => this.samePlace(hq, poi))) continue;

			const idLabel = this.toggles.poiIds ? poi.id : undefined;
			const pixel = this.transform.toPixel(poi.lat, poi.lng);
			const marker = L.marker(this.px2ll(pixel.px, pixel.py), {
				// A turbine is recognisable on its own; a plain building is not, so it gets
				// the dot. Either way it is one marker, and the drawn shape is the target.
				icon: isWindTurbine(poi.id) ? this.makeTurbineIcon(idLabel) : this.makePoiDotIcon(idLabel),
				interactive: true,
			});
			this.bindPoiInteractions(marker, poi);
			marker.addTo(this.poiDotsLayer);
		}
		this.poiDotsLayer.addTo(this.map);
	}

	/**
	 * Make a marker stand for a PoI: hover to name it, tap for the number and a route,
	 * double-click to just go. Shared by the dots, the turbine glyphs and the faction
	 * emblems that sit on a numbered building, so a PoI behaves the same however it
	 * happens to be drawn. Icons place the labels through their own tooltip/popup
	 * anchors; the offsets here are only the gap above whatever that anchor is.
	 */
	private bindPoiInteractions(marker: L.Marker, poi: LabeledPointOfInterest) {
		marker.bindTooltip(this.poiLabel(poi), {
			className: "poi-tooltip",
			direction: "top",
			offset: [0, -10],
			opacity: 1,
		});
		// Content as a function so the popup is rebuilt — and its auto-pan padding
		// re-measured — every time it opens.
		marker.bindPopup(() => this.makePoiPopup(marker, poi), {
			className: "poi-popup",
			closeButton: false,
			offset: [0, -6],
		});
		// Tooltip and popup say the same thing and would stack on top of each other:
		// on a tap both open, on desktop a hover-while-open would put the tooltip over
		// the popup. The popup is the one you can act on, so the tooltip stands down.
		marker.on("popupopen", () => marker.closeTooltip());
		marker.on("mouseover", () => {
			if (marker.isPopupOpen()) marker.closeTooltip();
		});
		// Double-click skips the popup: two taps and you are navigating. Marker mouse
		// events don't bubble, so this never reaches the map's dblclick zoom.
		marker.on("dblclick", () => this.startNavigation(poi.id));
		// A long press that landed on a PoI means *that* PoI, not the patch of ground
		// under it. Answering the event here is also what keeps it away from the map:
		// Leaflet passes a mouse event to the map only when no layer under it listens.
		marker.on("contextmenu", () => marker.openPopup());
	}

	/**
	 * Keep the accuracy circle and the route line out of the renderer's way for as long
	 * as a zoom is running, and draw the position that arrived meanwhile once it stops.
	 *
	 * Everything else a fix moves is safe mid-zoom: the two markers live in a pane that
	 * is not transformed, so Leaflet repositions them in the live zoom's coordinates on
	 * every frame — which is exactly what breaks the paths (see `zooming`). Holding the
	 * paths costs nothing in fidelity: Leaflet reprojects every path on `zoomend` from
	 * the layer's own lat/lngs anyway, so the only thing that has to be replayed here is
	 * a lat/lng or radius that never reached the layer.
	 */
	private deferPathsWhileZooming() {
		this.map.on("zoomstart", () => {
			this.zooming = true;
		});
		this.map.on("zoomend", () => {
			this.zooming = false;
			if (!this.pathsDeferred) return;
			this.pathsDeferred = false;
			this.redrawPositionPaths();
		});
	}

	/** Place the accuracy circle, and the route line with it, at the last known fix. */
	private redrawPositionPaths() {
		if (!this.transform || !this.lastGps) return;
		const pixel = this.displayPixel(this.transform.toPixel(this.lastGps.lat, this.lastGps.lng));
		this.syncAccuracyCircle(this.px2ll(pixel.px, pixel.py), this.lastGps.accuracy);
		if (this.selectedPoiId) this.updateNavigation();
	}

	/** The accuracy circle at `latLng`, unless a zoom is in flight (see `zooming`). */
	private syncAccuracyCircle(latLng: L.LatLngExpression, accuracyM: number) {
		if (this.zooming) {
			this.pathsDeferred = true;
			return;
		}
		this.accuracyCircle.setLatLng(latLng);
		this.accuracyCircle.setRadius(this.transform.metersToPixels(accuracyM));
		if (!this.map.hasLayer(this.accuracyCircle)) this.accuracyCircle.addTo(this.map);
	}

	/** Called by the app whenever a new position/heading is available. */
	update_(lat: number, lng: number, accuracyM: number, headingDeg: number | null) {
		if (!this.transform) return;
		this.lastGps = { lat, lng, accuracy: accuracyM, heading: headingDeg };

		// A compass reading is not a new position. The heading changes on every frame
		// while you turn, GPS about once a second, and everything below except the arrow
		// is work only a *moved* fix can justify: two vector paths reprojected, a marker
		// repositioned, and a `panTo` that — even for a zero offset — fires `moveend` and
		// so sends the basemap through its whole tile set. Compare against the fix the
		// layers were actually placed for, which `loadMap` clears, so a map switch always
		// re-places them in the new map's coordinates.
		const placed = this.placedFix;
		const positionUnchanged =
			placed != null && placed.lat === lat && placed.lng === lng && placed.accuracy === accuracyM;

		if (!positionUnchanged) {
			this.placeFix(lat, lng, accuracyM);
		}

		// Rebuild the icon only when the triangle/dot state changes; otherwise just
		// rotate the existing arrow element (cheaper, and avoids marker flicker).
		// The current state is read off the DOM — whether an arrow is present — so the
		// no-heading case is covered too. Testing `showTriangle` alone re-ran `setIcon`
		// on every single fix whenever there was no compass (iOS before the permission
		// tap, Android without absolute orientation), tearing down and rebuilding the
		// marker element ~1 Hz for the whole match.
		const showTriangle = headingDeg != null;
		const screenDegrees = headingDeg != null ? this.transform.bearingToScreenDeg(headingDeg) : 0;
		const arrow = this.marker.getElement()?.querySelector<HTMLElement>(".pm-arrow") ?? null;
		if (showTriangle !== (arrow != null)) {
			this.marker.setIcon(this.makeIcon(screenDegrees, showTriangle));
		} else if (arrow) {
			arrow.style.transform = `rotate(${screenDegrees}deg)`;
		}

		// The turn hint reads off the heading, so it is refreshed either way; the route
		// line it shares a method with is held back when nothing has moved.
		if (this.selectedPoiId) this.updateNavigation(positionUnchanged);

		if (!positionUnchanged) this.updateStatus();
	}

	/**
	 * Move everything that follows the fix: the accuracy circle, the position marker,
	 * and the view itself while following. Only ever called for a position that has
	 * actually changed — see `update_`.
	 */
	private placeFix(lat: number, lng: number, accuracyM: number) {
		const gpsPixel = this.transform.toPixel(lat, lng);
		this.lastPixel = gpsPixel;
		this.offMap = this.isOffMapPixel(gpsPixel);
		const pixel = this.displayPixel(gpsPixel);
		const latLng = this.px2ll(pixel.px, pixel.py);

		this.syncAccuracyCircle(latLng, accuracyM);

		this.marker.setLatLng(latLng);
		if (!this.map.hasLayer(this.marker)) this.marker.addTo(this.map);

		this.placedFix = { lat, lng, accuracy: accuracyM };
		this.locatedOnce = true;

		// Keep the map in view when the fix falls outside the image; following it
		// would just pan into empty background.
		if (this.following && !this.offMap) this.map.panTo(latLng, { animate: true });
	}

	/**
	 * The status pill's line: where you are, or how far you still have to go.
	 *
	 * Driven by the fix *and* by the navigation target, so it is called from both — a
	 * stationary player who starts navigating still sees the pill switch to the distance
	 * without having to wait for their next GPS fix.
	 */
	private updateStatus() {
		if (!this.lastGps) return;
		if (this.offMap) {
			this.status = t.offMap;
		} else if (this.selectedPoiId) {
			this.status = `${this.getSelectedPoi()?.name ?? "POI"} · ${this.navDistanceM.toFixed(0)} m`;
		} else {
			this.status = `±${this.lastGps.accuracy.toFixed(0)} m`;
		}
	}

	/**
	 * Redraw the scale bar for the current zoom.
	 *
	 * There is no per-latitude distortion to correct for the way there is on a Web
	 * Mercator map: the whole canvas is one uniform-scale similarity fit, so how much
	 * ground a screen pixel covers depends on the zoom alone and the bar reads the
	 * same wherever you have panned to.
	 *
	 * Written straight into the DOM rather than through Lit state, because this runs
	 * on every frame of a pinch: a re-render would rebuild the PoI `<option>` list
	 * (~180 elements) at that rate, which is exactly the per-frame work the vector
	 * panes were moved to canvas to avoid.
	 */
	private updateScale() {
		if (!this.map || !this.transform) return;
		const parts = this.scaleParts();
		if (!parts) return;
		const { scale, bar, label } = parts;

		// Through the CRS rather than 2**zoom by hand, so this follows the projection.
		const screenPerCanvasPx = this.map.getZoomScale(this.map.getZoom(), 0);
		const metersPerScreenPx = this.transform.pixelsToMeters(1) / screenPerCanvasPx;
		if (!Number.isFinite(metersPerScreenPx) || metersPerScreenPx <= 0) return;

		const meters = niceDistance(metersPerScreenPx * SCALE_MAX_PX);
		const text = formatScaleDistance(meters);
		bar.style.width = `${Math.round(meters / metersPerScreenPx)}px`;
		if (label.textContent !== text) {
			label.textContent = text;
			scale.setAttribute("aria-label", `${t.scale}: ${text}`);
		}
	}

	/**
	 * The scale bar's three elements, looked up once and kept.
	 *
	 * `updateScale` runs on every frame of a pinch, and the markup it writes into is
	 * static — Lit never replaces it — so re-querying the DOM at that rate buys nothing.
	 * The lookup is retried while the element does not exist yet (the very first render).
	 */
	private scaleParts(): { scale: HTMLElement; bar: HTMLElement; label: HTMLElement } | null {
		if (this.scaleElements) return this.scaleElements;
		const scale = this.querySelector<HTMLElement>(".scale");
		const bar = scale?.querySelector<HTMLElement>(".scale-bar");
		const label = scale?.querySelector<HTMLElement>(".scale-label");
		if (!scale || !bar || !label) return null;
		this.scaleElements = { scale, bar, label };
		return this.scaleElements;
	}

	/**
	 * Build (or rebuild) the axis label elements for the current grid, then place them.
	 * How many there are depends on the canvas and the grid step alone, so this runs on
	 * a map load or a toggle — the per-frame work is `updateGridAxis`.
	 */
	private syncGridAxis() {
		const columns = this.querySelector<HTMLElement>(".grid-axis-x");
		const rows = this.querySelector<HTMLElement>(".grid-axis-y");
		if (!columns || !rows) return;

		const count = (extent: number) =>
			this.gridStepPx > 0 ? Math.ceil(extent / this.gridStepPx) : 0;
		fillAxisStrip(columns, count(this.mapWidth), gridColumnLabel);
		fillAxisStrip(rows, count(this.mapHeight), (index) => String(index + 1));
		// New labels, and possibly a new grid step: everything laid out per zoom is stale.
		this.axisX = freshAxis();
		this.axisY = freshAxis();
		this.updateGridAxis();
	}

	/**
	 * Ask for the axis labels to be placed on the next frame.
	 *
	 * Leaflet fires `move` from the pointer stream, which on a 120 Hz screen (or with
	 * coalesced events) outruns the display — and this is the one piece of chrome that
	 * has to keep up with a drag, so it must cost one frame's work per frame and not one
	 * per event.
	 */
	private scheduleGridAxis() {
		if (this.gridAxisFrame) return;
		this.gridAxisFrame = requestAnimationFrame(() => {
			this.gridAxisFrame = 0;
			this.updateGridAxis();
		});
	}

	/**
	 * Slide the grid's column letters and row numbers along the edges of the screen to
	 * wherever their squares currently are — the map's own sticky table header.
	 *
	 * At a fixed zoom the squares keep their distance from each other, so a pan moves
	 * every label by the same amount: the strip is translated once and the labels inside
	 * it are not touched at all. Only the one square running off each end is displaced
	 * from that, because its label has to stay in the middle of the part you can still
	 * see. So a frame of dragging costs a handful of style writes rather than one per
	 * label — and, since nothing here reads back a box, no layout.
	 */
	private updateGridAxis() {
		if (!this.map || this.gridStepPx <= 0) return;
		const columns = this.querySelector<HTMLElement>(".grid-axis-x");
		const rows = this.querySelector<HTMLElement>(".grid-axis-y");
		if (!columns || !rows) return;

		// Canvas pixels reach the screen through a scale and an offset — CRS.Simple, and
		// a similarity fit before it — so two projected points describe the whole mapping
		// and no per-line projection is needed on a frame that has to be cheap.
		//
		// Take the two *opposite corners* of the canvas as those points. Leaflet rounds
		// container points to whole pixels, so a short baseline measures the scale as the
		// ratio of two rounded numbers: one canvas pixel apart, a zoomed-out map reads
		// back as 1 screen pixel per canvas pixel and every label lands in the wrong
		// square. Across the whole field that same half-pixel is a rounding error of one
		// part in two thousand.
		const origin = this.map.latLngToContainerPoint(this.px2ll(0, 0));
		const far = this.map.latLngToContainerPoint(this.px2ll(this.mapWidth, this.mapHeight));

		this.measureAxis(columns, this.axisX, "x");
		this.measureAxis(rows, this.axisY, "y");

		const container = this.containerOrigin();
		this.placeAxis(
			columns,
			this.axisX,
			"x",
			this.mapWidth,
			(far.x - origin.x) / this.mapWidth,
			container.left + origin.x,
		);
		this.placeAxis(
			rows,
			this.axisY,
			"y",
			this.mapHeight,
			(far.y - origin.y) / this.mapHeight,
			container.top + origin.y,
		);
	}

	/**
	 * Where the strip sits, and how much of the axis it may show. The strips are
	 * `position: fixed`, so their own boxes answer both — which keeps the layout (safe
	 * areas, the row the letters sit in) in CSS, where it belongs.
	 *
	 * Measured once per layout change, never per frame: per frame it would be a forced
	 * synchronous layout right after the style writes that dirtied it. The pan
	 * translation has to come off first, or the box reads back as its own last pan and
	 * every measurement drifts by the one before it.
	 */
	/** Forget both strips' measured boxes; the next placement re-measures them. */
	private invalidateGridAxis() {
		this.axisX.min = NaN;
		this.axisY.min = NaN;
		this.containerBox = null;
	}

	/**
	 * Where the map container's top-left corner sits in the viewport.
	 *
	 * Cached with the strips' boxes and invalidated with them, for the same reason: this
	 * is read on every frame of a drag, and it is the one value in that path that comes
	 * back from layout rather than out of Leaflet's own bookkeeping. The container does
	 * not move while the map does — only a resize or a chrome change can shift it, and
	 * both go through `invalidateGridAxis`.
	 */
	private containerOrigin(): { left: number; top: number } {
		if (!this.containerBox) {
			const box = this.map.getContainer().getBoundingClientRect();
			this.containerBox = { left: box.left, top: box.top };
		}
		return this.containerBox;
	}

	private measureAxis(strip: HTMLElement, cache: AxisCache, axis: "x" | "y") {
		if (Number.isFinite(cache.min)) return;
		// The strip, never the track: the strip is the one element here that does not
		// move, so its box cannot read back as its own last pan.
		const box = strip.getBoundingClientRect();
		cache.min = axis === "x" ? box.left : box.top;
		cache.max = axis === "x" ? box.right : box.bottom;
	}

	/**
	 * Place one strip: translate it to follow the map, then fix up the label at each end.
	 *
	 * `originScreen` is where canvas pixel 0 of this axis currently sits in viewport
	 * coordinates, and `scale` is how many screen pixels a canvas pixel is worth.
	 */
	private placeAxis(
		strip: HTMLElement,
		cache: AxisCache,
		axis: "x" | "y",
		extentPx: number,
		scale: number,
		originScreen: number,
	) {
		const track = axisTrack(strip);
		const count = track.childElementCount;
		if (count === 0 || !Number.isFinite(scale) || scale <= 0) return;
		const step = this.gridStepPx * scale;

		// Lay the labels out at their unclamped centres. Only the zoom can change these,
		// so a drag skips this entirely.
		if (cache.scale !== scale) {
			cache.scale = scale;
			for (let i = 0; i < count; i++) {
				const label = track.children[i] as HTMLElement;
				const from = i * this.gridStepPx;
				const to = Math.min((i + 1) * this.gridStepPx, extentPx);
				const center = (((from + to) / 2) * scale).toFixed(1);
				if (axis === "x") label.style.left = `${center}px`;
				else label.style.top = `${center}px`;
				label.style.transform = axis === "x" ? "translate(-50%, 0)" : "translate(0, -50%)";
				label.style.display = "";
			}
			cache.adjusted.length = 0;
			cache.offset = NaN;
		}

		// One write moves every label at once.
		const offset = Math.round(originScreen - cache.min);
		if (offset !== cache.offset) {
			cache.offset = offset;
			track.style.transform =
				axis === "x" ? `translate(${offset}px, 0)` : `translate(0, ${offset}px)`;
		}

		// Give back whatever was displaced last frame, then displace the ends of this one.
		for (const label of cache.adjusted) {
			label.style.transform = axis === "x" ? "translate(-50%, 0)" : "translate(0, -50%)";
			label.style.display = "";
		}
		cache.adjusted.length = 0;

		const first = Math.max(0, Math.floor((cache.min - originScreen) / step));
		const last = Math.min(count - 1, Math.floor((cache.max - originScreen) / step));
		for (const i of first === last ? [first] : [first, last]) {
			if (i < 0 || i >= count) continue;
			const label = track.children[i] as HTMLElement;
			const from = originScreen + i * this.gridStepPx * scale;
			const to = originScreen + Math.min((i + 1) * this.gridStepPx, extentPx) * scale;
			const start = Math.max(from, cache.min);
			const end = Math.min(to, cache.max);
			// A square down to a sliver at the edge of the screen would put its letter on
			// top of the neighbour's, so it stands down instead.
			if (end - start < GRID_AXIS_MIN_PX) {
				label.style.display = "none";
				cache.adjusted.push(label);
				continue;
			}
			const shift = Math.round((start + end) / 2 - (from + to) / 2);
			if (shift === 0) continue;
			label.style.transform =
				axis === "x"
					? `translate(calc(${shift}px - 50%), 0)`
					: `translate(0, calc(${shift}px - 50%))`;
			cache.adjusted.push(label);
		}
	}

	/**
	 * A render can have just created the axis strips (the grid toggle, or a map switch),
	 * and Lit only ever gives them back empty — the labels inside are ours. It can also
	 * have moved them, by changing the chrome above them, which is what invalidates the
	 * measured boxes. Both are cheap; neither happens per frame.
	 */
	updated() {
		// Lit commits an element's own bindings before its children, so on the render
		// that first offers a picked spot the select is told to show an option that is
		// still one part away from existing — it lands on nothing and reads as the
		// placeholder for as long as that route runs. Nothing writes the value again
		// afterwards, because the binding itself has not changed. So set it here, where
		// the options are in.
		const select = this.querySelector<HTMLSelectElement>(".poi-select");
		if (select && select.value !== this.selectedPoiId) select.value = this.selectedPoiId;

		this.invalidateGridAxis();
		const signature = `${this.showGridAxis}|${this.gridStepPx}|${this.mapWidth}|${this.mapHeight}`;
		if (signature !== this.axisSignature) {
			this.axisSignature = signature;
			this.syncGridAxis();
		} else {
			this.scheduleGridAxis();
		}
	}

	private recenter() {
		this.following = true;
		// Off-map: re-following would pan into empty background, so snap back to the
		// whole field instead — the warning already tells the user where they are.
		if (this.offMap) {
			this.fitInitial(getMapById(this.selectedMapId));
		} else if (this.lastPixel) {
			this.map.panTo(this.px2ll(this.lastPixel.px, this.lastPixel.py));
		}
	}

	render() {
		const pointsOfInterest = this.currentPointsOfInterest();
		const selectedPoi = this.getSelectedPoi();

		return html`
			<div id="map"></div>
			${
				this.showGridAxis
					? html`
							<!-- The grid's column letters and row numbers, pinned to the top and left
							     edges. Filled and positioned by \`syncGridAxis\` / \`updateGridAxis\`,
							     so this markup stays empty and static. -->
							<div class="grid-axis grid-axis-x" aria-hidden="true"></div>
							<div class="grid-axis grid-axis-y" aria-hidden="true"></div>
						`
					: ""
			}
			<!-- Top row: out of the map on the left, the settings gear on the right. Both
			     are one tap and neither is aimed at while walking, which is why they get the
			     edge the thumb reaches for least. -->
			<div class="top-row">
				<button class="home-btn" aria-label=${t.backToOverview} @click=${() => goHome()}>‹</button>
				${this.renderToggles()}
			</div>
			<div class="hud">
				${this.renderInstallBar()}
				<!-- Status and errors get a row of their own above the controls, so a long
				     message (a failed map load, the off-map warning) can use the full width. -->
				<div class="hud-status">
					<span
						class="pill ${this.offMap ? "warn" : ""} ${this.vectorRetry ? "retry" : ""}"
						role=${this.vectorRetry ? "button" : "status"}
						@click=${() => this.retryVectorMap()}
						>${this.status}</span
					>
				</div>
				<!-- Scale bar, lower right above the controls. Its contents are written by
				     updateScale() on every zoom, so keep this markup static. -->
				<div class="scale" role="img" aria-label=${t.scale}>
					<span class="scale-label"></span>
					<span class="scale-bar"></span>
				</div>
				<div class="hud-controls">
					<div class="hud-left">
						${
							pointsOfInterest.length > 0 || selectedPoi
								? html`
										<div class="poi-panel">
											${
												selectedPoi
													? html`
															<div class="nav-card">
																<div
																	class="nav-arrow"
																	style="transform:rotate(${this.navArrowDeg}deg)"
																></div>
																<div class="nav-info">
																	<span class="nav-distance"
																		>${this.navDistanceM.toFixed(0)} m</span
																	>
																	<span class="nav-hint">${this.navHint}</span>
																</div>
																<button
																	type="button"
																	class="nav-stop"
																	title=${t.navStop}
																	aria-label=${t.navStop}
																	@click=${() => this.startNavigation("")}
																>
																	×
																</button>
															</div>
														`
													: ""
											}
											<select
												class="poi-select"
												.value=${this.selectedPoiId}
												@change=${this.onPoiSelect}
											>
												<option value="">${t.navigateTo}</option>
												<!-- A spot picked off the map is not in the list and never will be, so
												     it gets an entry of its own — outside the guard below, since it is
												     the one option that changes without the map changing. Without it the
												     select would sit on no option at all while that navigation runs. -->
												${
													this.customTarget
														? html`
																<option value=${CUSTOM_TARGET_ID}>${this.customTarget.name}</option>
															`
														: ""
												}
												<!-- Guarded on the map id: the list only changes when the map does, and
												     without this every render walked all ~80 options. That includes the
												     one \`dragstart\` triggers by clearing \`following\`, which put a
												     rebuild of this list on the first frame of every drag, and the one
												     each GPS fix triggers through \`status\`. -->
												${guard([this.selectedMapId], () =>
													[...pointsOfInterest]
														.sort(comparePointsOfInterest)
														.map(
															(poi) => html`
																<option value=${poi.id}>${poi.id} · ${poi.name}</option>
															`,
														),
												)}
											</select>
										</div>
									`
								: ""
						}
					</div>
					<div class="hud-right">
						<button class="recenter ${this.following ? "on" : ""}" @click=${this.recenter}>
							◎
						</button>
					</div>
				</div>
			</div>
		`;
	}

	/**
	 * The install bar, for players who never saw the landing page.
	 *
	 * Event links get passed around directly — `?map=de` in a group chat — so a good
	 * share of players land straight on a map and never read the page that explains
	 * any of this. This is the same offer, at the point it starts to matter, and it
	 * holds itself to three rules: it waits for the first GPS fix, so it is asking
	 * someone who has just watched the app work rather than someone still staring at
	 * a blank map; it never appears while a navigation is running, because it would
	 * be covering the one thing they are walking towards; and dismissing it is
	 * remembered for a fortnight, which covers a whole event weekend.
	 */
	private renderInstallBar() {
		if (this.installBarDismissed || !this.locatedOnce) return "";
		if (this.selectedPoiId) return "";
		// "manual" is a desktop browser's menu and "in-app-browser" needs a paragraph
		// to explain itself: both belong on the landing page, not over a live map.
		if (this.install.kind !== "prompt" && this.install.kind !== "ios") return "";

		const dismiss = () => {
			snoozeInstallNudge();
			this.installBarDismissed = true;
		};

		const act = async () => {
			if (this.install.kind === "prompt") {
				await promptInstall();
				return;
			}
			// iOS: nothing to fire, so the bar unfolds into the gesture instead of
			// sending them back to the overview and losing the map they are on.
			this.installStepsOpen = !this.installStepsOpen;
		};

		return html`
			<div class="install-bar">
				<span class="install-bar-text">
					${t.installBarText}
					${
						this.installStepsOpen
							? html`
									<span class="install-bar-steps">
										<span>1. ${t.installIosStep1}</span>
										<span>2. ${t.installIosStep2}</span>
									</span>
								`
							: ""
					}
				</span>
				<button type="button" class="install-bar-go" @click=${act}>
					${this.install.kind === "prompt" ? t.installBarAction : t.installBarShow}
				</button>
				<button
					type="button"
					class="install-bar-later"
					aria-label=${t.installBarLater}
					@click=${dismiss}
				>
					×
				</button>
			</div>
		`;
	}

	private renderToggles() {
		const row = (key: keyof Toggles, label: string) => html`
			<button
				class="toggle-row ${this.toggles[key] ? "on" : ""}"
				role="switch"
				aria-checked=${this.toggles[key]}
				@click=${() => this.toggle(key)}
			>
				<span class="toggle-label">${label}</span>
				<span class="toggle-switch"></span>
			</button>
		`;
		return html`
			<div class="toggles">
				${
					this.togglesOpen
						? html`
								<div class="toggles-panel">
									${row("poiIds", t.layerPoiIds)} ${this.hasGrid ? row("grid", t.layerGrid) : ""}
									${this.hasMask ? row("mask", t.layerMask) : ""}
									${this.hasZones ? row("zones", t.layerZones) : ""}
									${this.hasHqs ? row("hqs", t.layerHqs) : ""}
								</div>
							`
						: ""
				}
				<button
					class="toggle-btn ${this.togglesOpen ? "on" : ""}"
					aria-label=${t.layers}
					@click=${() => (this.togglesOpen = !this.togglesOpen)}
				>
					⚙
				</button>
			</div>
		`;
	}
}
