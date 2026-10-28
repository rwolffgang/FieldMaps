// -----------------------------------------------------------------------------
// field-map.ts
// `<field-map>`: the Field Maps map as a custom element. It draws one scenario of
// the Mahlwinkel airfield (picked by `scenario`), shows the player's position on it
// from the device's GPS and compass, and navigates them to a point of interest, a
// mark of their own, a live marker the host app set, or any spot on the map.
//
// The host app owns everything around it: what screen it sits on, the buttons it
// puts in the top row, a server feeding it other players. It talks to the element
// through properties, methods and `fieldmap-*` events — see `types.ts` and the
// package's AGENTS.md.
// -----------------------------------------------------------------------------

import { LitElement, html, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { guard } from "lit/directives/guard.js";
import * as L from "leaflet";
import leafletCss from "leaflet/dist/leaflet.css?inline";
import fieldMapCss from "./field-map.css?inline";
import {
	solveTransform,
	comparePointsOfInterest,
	bearingDegrees,
	distanceMeters,
	navigationHint,
	relativeBearingDegrees,
	bakeOsm,
	bakeShape,
	gridColumnLabel,
	osmSurroundColor,
	resolveTheme,
	GRID_STEP_M,
	CHECKPOINT_GLYPH,
	BRAND_BLUE,
	BRAND_ORANGE,
	markStore,
	markIdFromTarget,
	markTargetId,
	type Transform,
	type LabeledPointOfInterest,
	type MapDefinition,
	type Fix,
	type BakedGeometry,
	type BakedLine,
	type BakedShape,
	type BakedZone,
	type OsmFeatureCollection,
	type OsmTheme,
	type OsmThemeName,
	type TileScene,
	type Mark,
	type MarkStore,
} from "@fieldmaps/core";
import { getMap, labelPointsOfInterest } from "@fieldmaps/core/mahlwinkel";
import { BasemapLayer } from "./basemap-layer.js";
import { DeviceSensors, type CompassState, type GpsProblem } from "./sensors.js";
import { LiveMarkerLayer } from "./markers.js";
import { escapeHtml } from "./marker-diff.js";
import { fieldMapStrings, type FieldMapLang, type FieldMapStrings } from "./strings.js";
import type {
	ExternalFix,
	FieldMapElement,
	FieldMapEventMap,
	FieldMapInsets,
	GuidanceDetail,
	MapMarker,
	MarkerLayer,
	NavigateOptions,
	NavigationChangeReason,
	NavigationSource,
	NavigationState,
	NavigationTarget,
	PermissionDetail,
	PositionFix,
} from "./types.js";

const ARRIVED_DISTANCE_M = 8;
/**
 * How far past the arrival radius the player has to walk away again before a second
 * arrival is reported — so a fix wobbling on the 8 m line does not report one per
 * second.
 */
const ARRIVED_RESET_M = 20;

/** Above this ground speed (m/s) prefer GPS course over the (metal-noisy) compass. */
const GPS_HEADING_SPEED = 0.7;

/**
 * The `selectedPoiId` prefix a live marker carries as a navigation target — the
 * same trick as a mark's `__mark__:` and a picked spot's `__here__`. Internal: the
 * public methods take the marker's own id.
 */
const MARKER_TARGET_PREFIX = "__marker__:";

/**
 * Leaflet's stylesheet and ours, as one `<style>` at the very *start* of `<head>`,
 * added the first time any `<field-map>` connects. First, so that a host's own
 * stylesheets come later and win a tie: every rule here is scoped as
 * `field-map .something`, and a host that writes the same selector overrides it
 * without `!important`.
 */
function injectStyles() {
	if (document.querySelector("style[data-field-map]")) return;
	const style = document.createElement("style");
	style.dataset.fieldMap = "";
	style.textContent = `${leafletCss}\n${fieldMapCss}`;
	document.head.prepend(style);
}

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
	/** Show the player's own marks (see `src/marks.ts`). */
	marks: boolean;
}

const DEFAULT_TOGGLES: Toggles = {
	poiIds: false,
	grid: true,
	mask: true,
	zones: true,
	hqs: true,
	marks: true,
};

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

function loadStoredToggles(key: string): Toggles {
	try {
		const raw = localStorage.getItem(key);
		if (raw) return { ...DEFAULT_TOGGLES, ...(JSON.parse(raw) as Partial<Toggles>) };
	} catch {
		// Ignore malformed/unavailable storage — fall back to defaults.
	}
	return { ...DEFAULT_TOGGLES };
}

/** Marker layers the player hid, by layer id — a set, persisted as an array. */
function loadHiddenLayers(key: string): Set<string> {
	try {
		const raw = localStorage.getItem(key);
		const parsed = raw ? (JSON.parse(raw) as unknown) : [];
		if (Array.isArray(parsed)) return new Set(parsed.filter((id) => typeof id === "string"));
	} catch {
		// Ignore malformed/unavailable storage.
	}
	return new Set();
}

/** The hooks a host fills with its own chrome; see the `top-start` & co. properties. */
const SLOTS = {
	"top-start": "topStart",
	"top-end": "topEnd",
	"top-notice": "topNotice",
	"bottom-notice": "bottomNotice",
} as const;

@customElement("field-map")
export class FieldMap extends LitElement implements FieldMapElement {
	// Light DOM: Leaflet ships global CSS that shadow DOM would wall off.
	protected createRenderRoot() {
		return this;
	}

	// --- Public properties ------------------------------------------------------------

	/**
	 * The scenario to draw, by id ("opt", "de", …): one event on the Mahlwinkel airfield,
	 * from `SCENARIOS` in `@fieldmaps/core/mahlwinkel`. Everything on the map — terrain,
	 * points of interest, play area, zones, headquarters — comes from it. Changing it
	 * ends a running navigation.
	 */
	@property({ reflect: true }) scenario = "";

	/**
	 * How the basemap looks: a built-in theme name ("opt", "m24", "de", "asd", "lso",
	 * "laf") or an `OsmTheme` object (see `extendTheme`). Default: the scenario's own.
	 */
	@property({ attribute: false }) theme: OsmThemeName | OsmTheme | undefined = undefined;

	/**
	 * Where the package's assets (`map_osm.geojson`, `logos/`) are served, as a URL or
	 * a path relative to the page. Default: the page's own directory.
	 */
	@property({ attribute: "asset-base" }) assetBase = "";

	/** "de" or "en". Default: the browser's language (German if it prefers German). */
	@property() locale: FieldMapLang | undefined = undefined;

	/** Replacements for any of the texts the element shows; see `FieldMapStrings`. */
	@property({ attribute: false }) strings: Partial<FieldMapStrings> = {};

	/**
	 * Prefix of the `localStorage` keys the element keeps the player's marks and layer
	 * switches under (`<prefix>-marks`, `<prefix>-toggles`, `<prefix>-marker-layers`).
	 */
	@property({ attribute: "storage-prefix" }) storagePrefix = "field-map";

	/** Space the host's own chrome covers at the top and bottom of the screen, in px. */
	@property({ attribute: false }) insets: FieldMapInsets = {};

	/**
	 * "device" (default): the element watches the device's GPS and compass itself,
	 * asking for permission once it is first on screen. "external": it uses only what
	 * the host passes to `setPosition()`.
	 */
	@property({ attribute: "position-source" }) positionSource: "device" | "external" = "device";

	/** Keep the screen on while the map is visible. Set the attribute to "false" to stop it. */
	@property({
		attribute: "wake-lock",
		converter: { fromAttribute: (value) => value !== "false" },
	})
	wakeLock = true;

	/**
	 * Show the "© OpenStreetMap" credit the map data's licence (ODbL) asks for. Turn it
	 * off only if your app credits OpenStreetMap somewhere players will see it.
	 */
	@property({
		attribute: "attribution",
		converter: { fromAttribute: (value) => value !== "false" },
	})
	attribution = true;

	/** Live markers: other players, objectives — see `MapMarker`. Replace the array to update. */
	@property({ attribute: false }) markers: readonly MapMarker[] = [];

	/** Rows of the ⚙ menu that show or hide the markers of one `layer`. */
	@property({ attribute: false }) markerLayers: readonly MarkerLayer[] = [];

	/** After how many milliseconds without an update a marker with `seenAt` fades. 0: never. */
	@property({ type: Number, attribute: "stale-after-ms" }) staleAfterMs = 30_000;

	/** Host elements placed in the top row, left. Or a child with `slot="top-start"`. */
	@property({ attribute: false }) topStart: Element | null = null;
	/** Host elements placed in the top row, right, before the ⚙ button. `slot="top-end"`. */
	@property({ attribute: false }) topEnd: Element | null = null;
	/** Host element placed under the top row (a notice, a banner). `slot="top-notice"`. */
	@property({ attribute: false }) topNotice: Element | null = null;
	/** Host element placed above the status pill at the bottom. `slot="bottom-notice"`. */
	@property({ attribute: false }) bottomNotice: Element | null = null;

	// --- Internals ----------------------------------------------------------------------

	private t: FieldMapStrings = fieldMapStrings();
	/** The scenario resolved; null while `scenario` is unset or names nothing. */
	@state() private mapDef: MapDefinition | null = null;
	private marksStore: MarkStore = markStore("field-map-marks");

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
	/** The player's own marks, one marker each — see `syncMarks`. */
	private marksLayer: L.LayerGroup | null = null;
	private routeLine: L.Polyline | null = null;
	private lastPixel: { px: number; py: number } | null = null;
	private lastGps: { lat: number; lng: number; accuracy: number; heading: number | null } | null =
		null;
	/**
	 * The fix the position layers are currently placed for — not the last one reported.
	 *
	 * A heading-only update carries the same position again, and re-placing for it is
	 * pure cost (see `applyPosition`). This is what says "already placed", so it is cleared by
	 * `loadMap`: a new map means a new calibration, and the same latitude and longitude
	 * land on a different pixel.
	 */
	private placedFix: { lat: number; lng: number; accuracy: number } | null = null;

	/** The device's GPS and compass, in `position-source="device"` mode. */
	private sensors = new DeviceSensors({
		onFix: (fix) => {
			if (this.positionSource !== "device") return;
			this.pendingFix = fix;
			if (!this.geolocationGranted) {
				this.geolocationGranted = true;
				this.emitPermission({ kind: "geolocation", state: "granted" });
			}
			this.schedulePush();
		},
		onHeading: (heading) => {
			if (this.positionSource !== "device") return;
			this.compassHeading = heading;
			this.schedulePush();
		},
		onGpsProblem: (problem) => this.onGpsProblem(problem),
		onCompassState: (state) => this.onCompassState(state),
	});
	private geolocationGranted = false;
	/** The newest fix and compass reading, applied together once per frame (`schedulePush`). */
	private pendingFix: Fix | null = null;
	private compassHeading: number | null = null;
	private pushFrame = 0;
	/** Whether the container had a size at the last resize — i.e. the map is on screen. */
	private visible = false;
	/** The live markers on the map. Null until the Leaflet map exists. */
	private live: LiveMarkerLayer | null = null;
	private staleTimer = 0;
	/** A `navigateTo*` call made before its map was loaded, applied once it is — on that map only. */
	private pendingNavigation: { definition: MapDefinition; start: () => void } | null = null;
	/** Who started the running navigation, and when — see `navigation`. */
	private navSource: NavigationSource = "user";
	private navStartedAt = 0;
	/** The state last reported in `fieldmap-navigation`, so the next one can say what it replaced. */
	private reportedNavigation: NavigationState = null;
	/** Whether this approach to the target has been reported in `fieldmap-arrived`. */
	private arrivedReported = false;
	/** The guidance last reported, so a reading that changed nothing does not fire again. */
	private reportedGuidance: GuidanceDetail | null = null;

	private onOnline = () => this.retryVectorMap();
	private onVisibilityChange = () => this.sensors.onVisibilityChange();

	connectedCallback() {
		super.connectedCallback();
		injectStyles();
		// A host that writes its chrome as children (`<button slot="top-start">`) gets it
		// placed where the property would put it.
		for (const child of Array.from(this.children)) {
			const slot = child.getAttribute("slot") as keyof typeof SLOTS | null;
			const key = slot ? SLOTS[slot] : undefined;
			if (key && this[key] == null) this[key] = child;
		}
		// If the map data failed to load, take a returning network as the cue to retry
		// without the player having to notice the pill.
		window.addEventListener("online", this.onOnline);
		document.addEventListener("visibilitychange", this.onVisibilityChange);
		this.staleTimer = window.setInterval(() => this.live?.tick(), 5000);
	}

	disconnectedCallback() {
		super.disconnectedCallback();
		window.removeEventListener("online", this.onOnline);
		document.removeEventListener("visibilitychange", this.onVisibilityChange);
		clearInterval(this.staleTimer);
		cancelAnimationFrame(this.pushFrame);
		this.pushFrame = 0;
		this.sensors.stop();
	}

	/**
	 * Resolve the public properties into internal state before a render reads them:
	 * the scenario into its map definition, the language and overrides into strings,
	 * the storage prefix into the stores.
	 */
	protected willUpdate(changed: PropertyValues) {
		if (changed.has("locale") || changed.has("strings")) {
			this.t = fieldMapStrings(this.locale || undefined, this.strings);
			if (!this.lastGps && !this.vectorRetry && this.mapDef) this.status = this.t.waitingForGps;
		}
		if (changed.has("storagePrefix")) {
			this.marksStore = markStore(`${this.storagePrefix}-marks`);
			this.toggles = loadStoredToggles(`${this.storagePrefix}-toggles`);
			this.hiddenLayers = loadHiddenLayers(`${this.storagePrefix}-marker-layers`);
		}
		if (changed.has("scenario")) {
			const definition = this.scenario ? (getMap(this.scenario) ?? null) : null;
			if (this.scenario && !definition) {
				console.error(`[field-map] unknown scenario "${this.scenario}"`);
				this.status = this.t.unknownScenario(this.scenario);
			}
			this.mapDef = definition;
		}
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

	@state() private status = this.t.waitingForGps;
	@state() private following = true;
	@state() private offMap = false;
	@state() private selectedPoiId = "";
	/**
	 * The spot the player long-pressed, standing in as a PoI so the rest of the
	 * navigation code needs to know nothing about it. Only ever the one — picking a
	 * new spot replaces it.
	 */
	@state() private customTarget: LabeledPointOfInterest | null = null;
	/** The player's own marks on the current map. Replaced, never mutated (see `marks.ts`). */
	@state() private marks: readonly Mark[] = [];
	@state() private navDistanceM = 0;
	@state() private navHint = "";
	@state() private navArrowDeg = 0;
	@state() private togglesOpen = false;
	/** True once a fix has been drawn — the "mark my position" button waits for it. */
	@state() private locatedOnce = false;
	@state() private toggles: Toggles = loadStoredToggles("field-map-toggles");
	/** Marker layers the player switched off in the ⚙ menu. */
	@state() private hiddenLayers: Set<string> = new Set();
	/** The navigable live markers, for the target list; rebuilt when `markers` changes. */
	@state() private navigableMarkers: MapMarker[] = [];
	/** The compass, for the iOS "Enable compass" button. */
	@state() private compassState: CompassState = "off";
	/** One line of trouble from the sensors, shown under the top row; the last writer wins. */
	@state() private toast: { text: string; owner: "gps" | "compass" } | null = null;
	/** Set when the OSM data failed to load, so the user (or `online`) can retry it. */
	@state() private vectorRetry: { definition: MapDefinition; dataUrl: string } | null = null;

	firstUpdated() {
		this.map = L.map(this.querySelector(".fm-leaflet") as HTMLElement, {
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

		// Live markers: above the PoIs and the player's marks (the marker pane, 600), below
		// the player's own position — which stays the one thing nothing can cover.
		this.map.createPane("live-markers");
		this.map.getPane("live-markers")!.style.zIndex = "610";
		this.map.createPane("own-position");
		this.map.getPane("own-position")!.style.zIndex = "620";
		this.live = new LiveMarkerLayer({
			map: this.map,
			pane: "live-markers",
			place: (lat, lng) => {
				const { px, py } = this.transform.toPixel(lat, lng);
				return this.px2ll(px, py);
			},
			metersToScreen: (meters) =>
				this.transform.metersToPixels(meters) * this.map.getZoomScale(this.map.getZoom(), 0),
			bearingToScreen: (bearing) => this.transform.bearingToScreenDeg(bearing),
			onClick: (id) => this.emit("fieldmap-marker-click", { id }),
			lastSeen: (seconds) => this.t.lastSeen(seconds),
		});
		this.map.on("zoom zoomend", () => this.live?.resizeRings());

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
		this.marker = L.marker(this.px2ll(0, 0), {
			icon: this.makeIcon(),
			interactive: false,
			pane: "own-position",
		});
		this.refreshStyle();

		if (this.mapDef) this.loadMap(this.mapDef);

		// The container starts at 0×0 whenever the overview is the entry screen (this
		// element is `hidden` until a map is routed to), and can also be 0×0 on a PWA
		// cold start or a not-yet-laid-out preview. fitBounds would then snap to min
		// zoom and stick there. Re-sync and re-fit whenever the container resizes, until
		// GPS or the user takes over.
		//
		// The observer must be held in a field: an unreferenced ResizeObserver is
		// collectable even while it has live observations, and losing it here leaves the
		// map stuck at min zoom with no way back.
		const mapEl = this.querySelector(".fm-leaflet");
		if (mapEl) {
			this.resizeObserver = new ResizeObserver(() => this.resyncSize());
			this.resizeObserver.observe(mapEl);
		}
	}

	/** Leaflet side of a property change: the map, the theme, the live markers. */
	protected updated(changed: PropertyValues) {
		this.afterRender();
		if (!this.map) return;
		if (changed.has("mapDef") && this.mapDef && this.mapDef !== this.loadedDef) {
			this.loadMap(this.mapDef);
			// The element may have been on screen, waiting for a scenario before asking for GPS.
			this.startSensorsIfShown();
		}
		if (changed.has("theme") && this.loadedDef) {
			this.map.getContainer().style.background = this.loadedDef.vectorData
				? osmSurroundColor(this.currentTheme())
				: "";
			this.syncBasemap();
		}
		if (changed.has("markers") || changed.has("staleAfterMs")) this.syncLiveMarkers();
		if (changed.has("hiddenLayers")) this.live?.setHiddenLayers(this.hiddenLayers);
		if (changed.has("positionSource")) {
			if (this.positionSource === "device") this.startSensorsIfShown();
			else {
				this.sensors.stop();
				// What the device's sensors had to complain about no longer applies.
				this.toast = null;
			}
		}
		if (changed.has("wakeLock")) this.sensors.keepAwake(this.wakeLock && this.visible);
		if (changed.has("insets")) {
			// On the element, so every fixed row inside (the grid letters too) can read them.
			this.style.setProperty("--fm-host-top", `${this.insets.top ?? 0}px`);
			this.style.setProperty("--fm-host-bottom", `${this.insets.bottom ?? 0}px`);
			this.invalidateGridAxis();
		}
	}

	/** The map definition the Leaflet side last loaded. */
	private loadedDef: MapDefinition | null = null;

	private currentTheme(): OsmTheme {
		return resolveTheme(this.theme ?? this.loadedDef?.theme ?? "opt");
	}

	/** A path from the scenario data (`map_osm.geojson`, `logos/…`), resolved against `assetBase`. */
	private assetUrl(path: string): string {
		let base = new URL(document.baseURI);
		if (this.assetBase) {
			const dir = this.assetBase.endsWith("/") ? this.assetBase : `${this.assetBase}/`;
			base = new URL(dir, document.baseURI);
		}
		return new URL(path, base).href;
	}

	private currentPointsOfInterest(): LabeledPointOfInterest[] {
		return this.loadedDef ? labelPointsOfInterest(this.loadedDef.poiNames) : [];
	}

	private getSelectedPoi(): LabeledPointOfInterest | null {
		if (this.selectedPoiId === CUSTOM_TARGET_ID) return this.customTarget;
		const markId = markIdFromTarget(this.selectedPoiId);
		if (markId != null) {
			const mark = this.marks.find((candidate) => candidate.id === markId);
			return mark ? this.markAsPoi(mark) : null;
		}
		if (this.selectedPoiId.startsWith(MARKER_TARGET_PREFIX)) {
			const marker = this.live?.get(this.selectedPoiId.slice(MARKER_TARGET_PREFIX.length));
			return marker ? this.markerAsPoi(marker) : null;
		}
		return this.currentPointsOfInterest().find((poi) => poi.id === this.selectedPoiId) ?? null;
	}

	private loadMap(definition: MapDefinition) {
		const previousDef = this.loadedDef;
		this.loadedDef = definition;
		// A navigation belongs to the map it was started on.
		this.clearNavigation();
		if (previousDef) this.reportNavigation("scenario-changed", "host");
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
		container.style.background = definition.vectorData ? osmSurroundColor(this.currentTheme()) : "";

		// The overlays traced off the printed map are bakeable straight away; the OSM base
		// has to be fetched first and arrives through `loadVectorMap`.
		this.baked = {
			osm: null,
			playArea: this.bakePlayArea(definition.playArea),
			...this.bakeZones(definition),
		};

		if (definition.vectorData) {
			void this.loadVectorMap(definition, this.assetUrl(definition.vectorData));
		} else if (definition.image) {
			// Below the basemap's tiles (see the `photo-base` pane), so the mask and the
			// zones still paint over a photo map the way they do over the vector one.
			this.imageOverlay = L.imageOverlay(this.assetUrl(definition.image), bounds, {
				pane: "photo-base",
			}).addTo(this.map);
			this.emit("fieldmap-ready", { scenario: definition.id });
		}
		this.syncBasemap();
		this.renderZoneLabels();
		this.renderHeadquarters(definition);
		this.fitInitial(definition);
		// New calibration, and usually a new zoom — both feed the scale bar.
		this.updateScale();
		this.following = true;

		if (this.lastGps) {
			this.applyPosition(
				this.lastGps.lat,
				this.lastGps.lng,
				this.lastGps.accuracy,
				this.lastGps.heading,
			);
		}

		this.syncPoiDots();
		this.marks = this.marksStore.load(definition.id);
		this.syncMarks();
		// The live markers keep their coordinates; the new calibration puts them elsewhere.
		this.live?.replaceAll();
		this.syncLiveMarkers();

		const pending = this.pendingNavigation;
		this.pendingNavigation = null;
		if (pending?.definition === definition) pending.start();
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
			if (this.loadedDef !== definition || !this.transform || !this.baked) return;

			// Projected once, here, into canvas pixels. GeoJSON hands over (lng, lat).
			this.baked.osm = bakeOsm(data, (lng, lat) => this.transform.toPixel(lat, lng));

			// The coordinate grid (100 m, matching the scale bar) is painted with the
			// terrain now, but the letters and numbers naming its squares are chrome, and
			// this is the size they are counted off.
			this.gridStepPx = this.transform.metersToPixels(GRID_STEP_M);
			this.syncGridAxis();
			this.syncBasemap();

			// Clear a previous failure. The GPS status normally owns this pill, so only
			// take it back when there is no fix yet to report.
			this.vectorRetry = null;
			if (!this.lastGps) this.status = this.t.waitingForGps;
			this.emit("fieldmap-ready", { scenario: definition.id });
		} catch (err) {
			console.error("[field-map] failed to load the map data", err);
			this.status = this.t.mapLoadFailed;
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
		this.status = this.t.mapLoading;
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
	private syncBasemap() {
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
			theme: this.currentTheme(),
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

		// On screen for the first time (or again): this is when the device sensors may
		// start and the screen should stay on — never while the element sits hidden
		// behind a host's other screens.
		const size = this.map.getSize();
		const visible = size.x > 0 && size.y > 0;
		if (visible !== this.visible) {
			this.visible = visible;
			this.sensors.keepAwake(this.wakeLock && visible);
			if (visible) this.startSensorsIfShown();
		}

		if (!this.loadedDef || !this.following || (this.framed && this.lastGps)) return;

		this.fitInitial(this.loadedDef);
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
		const zones = (this.loadedDef?.zones ?? []).filter((zone) => zone.points.length >= 3);
		if (zones.length === 0 || !this.transform) return;

		this.zoneLabelsLayer = L.layerGroup();
		for (const zone of zones) {
			const center = polygonCenter(this.ring(zone.points));
			L.marker(center, {
				pane: "zone-labels",
				icon: L.divIcon({
					className: "zone-label-marker",
					// The name is scenario markup, not text: "Militärisches<br>Sperrgebiet" breaks
					// where the printed map does. Scenario data ships with the package, so it is
					// trusted; only the colour is escaped, as it lands in an attribute.
					html: `<span class="zone-label" style="color:${escapeHtml(zone.color)}">${zone.name}</span>`,
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
			const emblem = hq.logo
				? `<img class="hq-logo" src="${escapeHtml(this.assetUrl(hq.logo))}" alt="" />`
				: "";
			const marker = L.marker(this.px2ll(px, py), {
				icon: L.divIcon({
					className: "hq-marker",
					html:
						`<div class="hq-ring" style="border-color:${escapeHtml(hq.color)}">${emblem}</div>` +
						`<span class="hq-name" style="color:${escapeHtml(hq.color)}">${hq.name}</span>`,
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
		return this.loadedDef?.vectorData != null;
	}
	/**
	 * The axis labels name the squares of the grid, so they come and go with it: with
	 * the grid off there is nothing on screen for a letter to refer to.
	 */
	private get showGridAxis(): boolean {
		return this.hasGrid && this.toggles.grid;
	}
	private get hasMask(): boolean {
		return (this.loadedDef?.playArea?.length ?? 0) >= 3;
	}
	private get hasZones(): boolean {
		const map = this.loadedDef;
		return (map?.zones?.length ?? 0) + (map?.lines?.length ?? 0) > 0;
	}
	private get hasHqs(): boolean {
		return (this.loadedDef?.headquarters?.length ?? 0) > 0;
	}

	private toggle(key: keyof Toggles) {
		this.toggles = { ...this.toggles, [key]: !this.toggles[key] };
		try {
			localStorage.setItem(`${this.storagePrefix}-toggles`, JSON.stringify(this.toggles));
		} catch {
			// Non-fatal — the toggle still applies for this session.
		}
		this.applyToggles();
		// Two toggles reach into the PoI icons themselves: the id labels are baked into
		// them, and hiding the emblems has to give the dots they stand in for back. Every
		// other toggle is either a basemap repaint or one layer coming and going, so there
		// is no reason to tear down and rebuild ~80 marker elements for it.
		if (key === "poiIds" || key === "hqs") this.syncPoiDots();
		if (key === "marks") this.syncMarks();
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

	// --- Public API -----------------------------------------------------------------

	/**
	 * Tell Leaflet the element may have changed size. A host that shows the element
	 * after it was hidden can call this in the next animation frame; the element also
	 * notices by itself once layout has run.
	 */
	resize() {
		this.resyncSize();
	}

	/**
	 * Re-read the `--field-map-accent` / `--field-map-accent-warm` custom properties
	 * into the parts of the map that are drawn in JavaScript (the accuracy circle, the
	 * route line). CSS reaches everything else by itself.
	 */
	refreshStyle() {
		const style = getComputedStyle(this);
		const read = (name: string, fallback: string) =>
			style.getPropertyValue(name).trim() || fallback;
		this.accentColor = read("--field-map-accent", BRAND_BLUE);
		this.routeColor = read("--field-map-accent-warm", BRAND_ORANGE);
		this.accuracyCircle?.setStyle({ color: this.accentColor, fillColor: this.accentColor });
		this.routeLine?.setStyle({ color: this.routeColor });
	}
	private accentColor = BRAND_BLUE;
	private routeColor = BRAND_ORANGE;

	/**
	 * The position the element is placing the player at — smoothed, as drawn. Null
	 * before the first fix.
	 */
	get fix(): PositionFix | null {
		const fix = this.pushedFix;
		return fix ? { ...fix } : null;
	}
	private pushedFix: PositionFix | null = null;

	/**
	 * Feed a position in `position-source="external"` mode (the host owns GPS, e.g. a
	 * native layer). `heading` is where the phone points, in degrees from north; pass
	 * null without a compass. Applied on the next animation frame.
	 *
	 * (Not `update()`: that name is Lit's render lifecycle.)
	 */
	setPosition(fix: ExternalFix, heading: number | null = null) {
		if (![fix.lat, fix.lng, fix.accuracy].every(Number.isFinite)) {
			throw new TypeError("setPosition(): lat, lng and accuracy must be finite numbers");
		}
		this.pendingFix = {
			lat: fix.lat,
			lng: fix.lng,
			accuracy: fix.accuracy,
			heading: fix.heading ?? null,
			speed: fix.speed ?? null,
		};
		this.compassHeading = heading;
		this.schedulePush();
	}

	/** The running navigation, or null. JSON-safe — send it to a server as it is. */
	get navigation(): NavigationState {
		const target = this.currentTarget();
		return target ? { target, startedAt: this.navStartedAt, source: this.navSource } : null;
	}

	/** Whether a navigation is running. */
	get navigating(): boolean {
		return this.selectedPoiId !== "";
	}

	/**
	 * Navigate to a point of interest of the current scenario, by its physical id
	 * ("630", "Lima", "Schranke"). Replaces a running navigation. Throws a RangeError
	 * if the scenario does not show that PoI — `scenarioPoiIds(id)` in
	 * `@fieldmaps/core/mahlwinkel` lists the ones it does.
	 */
	navigateToPoi(poiId: string, options: NavigateOptions = {}): NavigationState {
		const definition = this.requireScenario("navigateToPoi");
		const poi = labelPointsOfInterest(definition.poiNames).find((p) => p.id === poiId);
		if (!poi) {
			throw new RangeError(`navigateToPoi(): scenario "${definition.id}" has no PoI "${poiId}"`);
		}
		const source = options.source ?? "host";
		return this.whenLoaded(definition, () => this.startNavigation(poi.id, source), {
			target: { kind: "poi", id: poi.id, name: poi.name, lat: poi.lat, lng: poi.lng },
			startedAt: Date.now(),
			source,
		});
	}

	/**
	 * Navigate to any coordinate — a waypoint from a server, a spot a squad lead picked.
	 * `name` is what the player sees; by default the grid square, as for a long press.
	 * A point off the field is allowed: the player is told they are off it.
	 */
	navigateToCoordinates(
		lat: number,
		lng: number,
		options: NavigateOptions & { name?: string } = {},
	): NavigationState {
		if (
			!Number.isFinite(lat) ||
			!Number.isFinite(lng) ||
			Math.abs(lat) > 90 ||
			Math.abs(lng) > 180
		) {
			throw new RangeError(`navigateToCoordinates(): not a coordinate: ${lat}, ${lng}`);
		}
		const definition = this.requireScenario("navigateToCoordinates");
		const source = options.source ?? "host";
		const start = () => {
			const name = options.name ?? this.nameCoordinate(lat, lng);
			this.startCustomNavigation({ id: CUSTOM_TARGET_ID, name, lat, lng }, source);
		};
		return this.whenLoaded(definition, start, {
			target: {
				kind: "spot",
				id: spotId(lat, lng),
				name: options.name ?? this.t.markedPosition,
				lat,
				lng,
			},
			startedAt: Date.now(),
			source,
		});
	}

	/**
	 * Navigate to a live marker (see `markers`) by its id, following it as it moves.
	 * Throws a RangeError if no marker has that id. The navigation ends by itself
	 * (`reason: "target-removed"`) when the marker leaves `markers`.
	 */
	navigateToMarker(markerId: string, options: NavigateOptions = {}): NavigationState {
		const marker = this.markers.find((candidate) => candidate.id === markerId);
		if (!marker) throw new RangeError(`navigateToMarker(): no marker "${markerId}"`);
		const definition = this.requireScenario("navigateToMarker");
		const source = options.source ?? "host";
		return this.whenLoaded(
			definition,
			() => this.startNavigation(MARKER_TARGET_PREFIX + markerId, source),
			{
				target: {
					kind: "marker",
					id: marker.id,
					name: marker.label ?? marker.id,
					lat: marker.lat,
					lng: marker.lng,
				},
				startedAt: Date.now(),
				source,
			},
		);
	}

	/** End the running navigation, if there is one. */
	stopNavigation(options: NavigateOptions = {}) {
		this.pendingNavigation = null;
		if (this.selectedPoiId) this.startNavigation("", options.source ?? "host");
	}

	addEventListener<K extends keyof FieldMapEventMap>(
		type: K,
		listener: (this: FieldMap, event: FieldMapEventMap[K]) => unknown,
		options?: boolean | AddEventListenerOptions,
	): void;
	addEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: boolean | AddEventListenerOptions,
	): void;
	addEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: boolean | AddEventListenerOptions,
	) {
		super.addEventListener(type, listener, options);
	}

	removeEventListener<K extends keyof FieldMapEventMap>(
		type: K,
		listener: (this: FieldMap, event: FieldMapEventMap[K]) => unknown,
		options?: boolean | EventListenerOptions,
	): void;
	removeEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: boolean | EventListenerOptions,
	): void;
	removeEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: boolean | EventListenerOptions,
	) {
		super.removeEventListener(type, listener, options);
	}

	// --- Navigation internals ---------------------------------------------------------

	private requireScenario(method: string): MapDefinition {
		// From `scenario` itself, not `mapDef`: a host that sets `scenario` and navigates in
		// the same breath means the new map, which `willUpdate` has not resolved yet.
		const definition = this.scenario ? getMap(this.scenario) : undefined;
		if (!definition) {
			throw new Error(`${method}(): set \`scenario\` to a known scenario id first`);
		}
		return definition;
	}

	/**
	 * Run `start` now if `definition` is the map on screen; otherwise hold it until that
	 * map has loaded (a call made right after setting `scenario`, before the first
	 * render). Answers with the state the navigation has — or will have.
	 */
	private whenLoaded(
		definition: MapDefinition,
		start: () => void,
		expected: Exclude<NavigationState, null>,
	): NavigationState {
		if (this.map && this.loadedDef === definition && this.transform) {
			start();
			return this.navigation;
		}
		this.pendingNavigation = { definition, start };
		return expected;
	}

	/** The running navigation's target, as the public API describes it. */
	private currentTarget(): NavigationTarget | null {
		const poi = this.getSelectedPoi();
		if (!poi || !this.selectedPoiId) return null;
		const { lat, lng, name } = poi;
		if (this.selectedPoiId === CUSTOM_TARGET_ID) {
			return { kind: "spot", id: spotId(lat, lng), name, lat, lng };
		}
		const markId = markIdFromTarget(this.selectedPoiId);
		if (markId != null) return { kind: "mark", id: markId, name, lat, lng };
		if (this.selectedPoiId.startsWith(MARKER_TARGET_PREFIX)) {
			return {
				kind: "marker",
				id: this.selectedPoiId.slice(MARKER_TARGET_PREFIX.length),
				name,
				lat,
				lng,
			};
		}
		return { kind: "poi", id: poi.id, name, lat, lng };
	}

	/** Tell the host what the navigation is now, and what it was. */
	private reportNavigation(reason: NavigationChangeReason, source: NavigationSource) {
		const state = this.navigation;
		const previous = this.reportedNavigation;
		if (state == null && previous == null) return;
		this.reportedNavigation = state;
		this.emit("fieldmap-navigation", { state, previous, reason, source });
	}

	private onPoiSelect(event: Event) {
		this.startNavigation((event.target as HTMLSelectElement).value, "user");
	}

	/**
	 * Start navigating to a PoI, whichever way it was asked for: the select, the
	 * "Navigate here" button in a dot's popup, a double-click on the dot, or one of the
	 * public `navigateTo*` methods. Empty id means the select's placeholder — that
	 * stops navigation.
	 */
	private startNavigation(
		poiId: string,
		source: NavigationSource,
		reason: NavigationChangeReason = poiId ? "started" : "stopped",
	) {
		this.selectedPoiId = poiId;
		if (!poiId) {
			this.clearNavigation();
			this.updateStatus();
			this.reportNavigation(reason, source);
			return;
		}
		this.navSource = source;
		this.navStartedAt = Date.now();
		this.arrivedReported = false;
		// The popup has done its job, and `fitUserAndPoi` is about to move the view out
		// from under it.
		this.map.closePopup();
		this.showPoiMarker();
		this.updateNavigation();
		this.fitUserAndPoi();
		this.updateStatus();
		this.reportNavigation(reason, source);
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
			.setContent(
				this.makeNavPopupBody(target.name, () => this.startCustomNavigation(target, "user"), [
					{ label: this.t.markHere, run: () => this.createMark(lat, lng) },
				]),
			)
			.openOn(this.map);
	}

	/**
	 * What to call a spot the player picked. With the grid on screen it has a name
	 * already — the square it falls in, which is also how the spot was described to
	 * them over the radio. With the grid off there is nothing on screen to read a
	 * square against, so naming one would be a coordinate they cannot check.
	 */
	private namePickedPoint(px: number, py: number): string {
		if (!this.showGridAxis || this.gridStepPx <= 0) return this.t.markedPosition;
		const column = gridColumnLabel(Math.floor(px / this.gridStepPx));
		const row = Math.floor(py / this.gridStepPx) + 1;
		return this.t.gridSquare(`${column}${row}`);
	}

	/** `namePickedPoint` for a coordinate: the grid square while it is on the canvas. */
	private nameCoordinate(lat: number, lng: number): string {
		if (!this.transform) return this.t.markedPosition;
		const pixel = this.transform.toPixel(lat, lng);
		if (this.isOffMapPixel(pixel)) return this.t.markedPosition;
		return this.namePickedPoint(pixel.px, pixel.py);
	}

	private startCustomNavigation(target: LabeledPointOfInterest, source: NavigationSource) {
		this.customTarget = target;
		this.startNavigation(CUSTOM_TARGET_ID, source);
	}

	private clearNavigation() {
		this.selectedPoiId = "";
		// A picked spot exists only for the navigation it was picked for: leaving it
		// behind would keep a stale option in the select long after the route is gone.
		this.customTarget = null;
		this.navDistanceM = 0;
		this.navHint = "";
		this.navArrowDeg = 0;
		this.setGuidance(null);
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
			this.setGuidance(null);
			this.navDistanceM = 0;
			this.navHint = this.lastGps ? "" : this.t.waitingForGps;
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
			this.navHint = this.t.navOffField;
		} else if (distance <= ARRIVED_DISTANCE_M) {
			this.navHint = this.t.navArrived;
		} else if (this.lastGps.heading != null) {
			const relative = relativeBearingDegrees(targetBearing, this.lastGps.heading);
			this.navHint = this.t.navHints[navigationHint(relative)];
		} else {
			this.navHint = this.t.navEnableCompass;
		}

		// Arrival, once per approach: the nav card says so for as long as the player
		// stands there, but the host hears about it once, and again only after they have
		// walked well clear and come back.
		if (distance <= ARRIVED_DISTANCE_M && !this.arrivedReported) {
			this.arrivedReported = true;
			const target = this.currentTarget();
			if (target) this.emit("fieldmap-arrived", { target });
		} else if (distance > ARRIVED_RESET_M) {
			this.arrivedReported = false;
		}

		// The direction finder (Field Maps' dosimeter listens): it needs the compass to
		// know where the phone points, and has nothing left to find once the player has
		// arrived.
		const heading = this.lastGps.heading;
		this.setGuidance(
			heading != null && distance > ARRIVED_DISTANCE_M
				? { relativeDeg: relativeBearingDegrees(targetBearing, heading), distanceM: distance }
				: null,
		);

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
				color: this.routeColor,
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

	/**
	 * A barrier, drawn as a boom gate: a striped arm on a post, the sign every
	 * player reads as "you get stopped here". Centred on its coordinate — the arm
	 * spans the road, so the point is the barrier as a whole, not the post's foot.
	 */
	private makeCheckpointIcon(idLabel?: string) {
		const label = idLabel ? `<span class="poi-dot-label">${idLabel}</span>` : "";
		return L.divIcon({
			className: "checkpoint-marker",
			html: `<div class="checkpoint-hit">${CHECKPOINT_GLYPH}${label}</div>`,
			iconSize: [38, 22],
			iconAnchor: [19, 11],
			// Centred, so labels float above the arm rather than across it.
			tooltipAnchor: [0, -11],
			popupAnchor: [0, -11],
		});
	}

	/** "630 · Tower"; a place whose id already is its name is not named twice. */
	private poiLabel(poi: LabeledPointOfInterest) {
		return poi.id === poi.name ? poi.name : `${poi.id} · ${poi.name}`;
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
		return this.makeNavPopupBody(this.poiLabel(poi), () => this.startNavigation(poi.id, "user"));
	}

	/**
	 * A name and the one thing you want from a place on the ground. Shared by the PoI
	 * dots and by a spot picked off the map, so both ask the question the same way.
	 */
	private makeNavPopupBody(
		label: string,
		navigateTo: () => void,
		extra: { label: string; run: (button: HTMLButtonElement) => void }[] = [],
	): HTMLElement {
		const body = document.createElement("div");
		body.className = "poi-popup-body";

		const title = document.createElement("span");
		title.className = "poi-popup-title";
		title.textContent = label;

		const navigate = document.createElement("button");
		navigate.type = "button";
		navigate.className = "poi-popup-nav";
		navigate.textContent = this.t.navigateHere;
		navigate.addEventListener("click", navigateTo);

		body.append(title, navigate);

		// The lesser actions (mark, rename, delete) sit in a row under the one that
		// matters, quieter, so the orange button stays the obvious thing to tap.
		if (extra.length > 0) {
			const row = document.createElement("div");
			row.className = "poi-popup-actions";
			for (const action of extra) {
				const button = document.createElement("button");
				button.type = "button";
				button.className = "poi-popup-action";
				button.textContent = action.label;
				button.addEventListener("click", () => action.run(button));
				row.append(button);
			}
			body.append(row);
		}
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
	 * a wrapped status line, the nav card and a host notice, so measure them instead
	 * of restating the CSS row arithmetic here.
	 *
	 * Only elements that really sit at the top belong in `top`: the PoI panel moved
	 * into the HUD, and measuring its bottom edge from up here made the top inset
	 * nearly a full screen, which auto-panned every popup — and the PoI under it —
	 * down to the bottom edge.
	 */
	private chromeInsets(): { top: number; bottom: number } {
		// The top stack holds everything up there — the buttons, the compass prompt, the
		// toast, and whatever the host put in it — so its bottom edge is the whole answer.
		const top = this.querySelector(".fm-top")?.getBoundingClientRect().bottom ?? 0;
		const hud = this.querySelector(".hud")?.getBoundingClientRect();
		return {
			top: Math.ceil(Math.max(top, this.insets.top ?? 0)) + 12,
			bottom: Math.ceil((hud?.height ?? 0) + (this.insets.bottom ?? 0)) + 12,
		};
	}

	// --- The player's own marks ------------------------------------------------------
	//
	// Set down from a long press (the same popup that offers a route there) or at the
	// player's own position from the HUD button, kept per map in `src/marks.ts`. A mark
	// navigates like a PoI — it joins that machinery under a reserved id, the way a
	// picked spot does — but it is the player's, so its popup can also rename and
	// delete it. Markers, not basemap paint: they come and go at a tap, and their names
	// have to stay upright and screen-sized like every other label here.

	/** A mark as the navigation code sees it: a PoI with a reserved id. */
	private markAsPoi(mark: Mark): LabeledPointOfInterest {
		return { id: markTargetId(mark), name: mark.name, lat: mark.lat, lng: mark.lng };
	}

	/** A live marker as the navigation code sees it, the same way. */
	private markerAsPoi(marker: MapMarker): LabeledPointOfInterest {
		return {
			id: MARKER_TARGET_PREFIX + marker.id,
			name: marker.label ?? marker.id,
			lat: marker.lat,
			lng: marker.lng,
		};
	}

	/** The marks changed: reload them, and tell the host. */
	private marksChanged() {
		const definition = this.loadedDef;
		if (!definition) return;
		this.marks = this.marksStore.load(definition.id);
		this.emit("fieldmap-marks-change", { scenario: definition.id, marks: this.marks });
	}

	private createMark(lat: number, lng: number) {
		if (!this.loadedDef) return;
		this.map.closePopup();
		const mark = this.marksStore.add(this.loadedDef.id, { name: this.nextMarkName(), lat, lng });
		this.marksChanged();
		// A mark nobody can see is a mark that was not set, so a hidden layer comes back.
		if (!this.toggles.marks) this.toggle("marks");
		else this.syncMarks();
		// Open it straight away: the new name is the one thing they will want to change.
		this.markMarkers.get(mark.id)?.openPopup();
	}

	/** Drop a mark where the player is standing. */
	private markMyPosition() {
		if (!this.lastGps || this.offMap) return;
		this.createMark(this.lastGps.lat, this.lastGps.lng);
	}

	/** "Mark N", with the lowest N no mark on this map is already called. */
	private nextMarkName(): string {
		const taken = new Set(this.marks.map((mark) => mark.name));
		let n = this.marks.length + 1;
		while (taken.has(this.t.markName(n))) n++;
		return this.t.markName(n);
	}

	private renameMark(mark: Mark) {
		if (!this.loadedDef) return;
		this.map.closePopup();
		const name = window.prompt(this.t.markRenamePrompt, mark.name)?.trim();
		if (!name || name === mark.name) return;
		this.marksStore.rename(this.loadedDef.id, mark.id, name);
		this.marksChanged();
		this.syncMarks();
		// The status pill names the target, so a renamed destination shows up at once.
		if (this.selectedPoiId === markTargetId(mark)) this.updateStatus();
	}

	private deleteMark(mark: Mark) {
		if (!this.loadedDef) return;
		this.map.closePopup();
		if (this.selectedPoiId === markTargetId(mark)) {
			this.startNavigation("", "user", "target-removed");
		}
		this.marksStore.remove(this.loadedDef.id, mark.id);
		this.marksChanged();
		this.syncMarks();
	}

	/** The live mark markers by mark id, so a new one can open its popup. */
	private markMarkers = new Map<string, L.Marker>();

	private syncMarks() {
		if (this.marksLayer) {
			this.map.removeLayer(this.marksLayer);
			this.marksLayer = null;
		}
		this.markMarkers.clear();
		if (!this.transform || !this.toggles.marks || this.marks.length === 0) return;

		this.marksLayer = L.layerGroup();
		for (const mark of this.marks) {
			const { px, py } = this.transform.toPixel(mark.lat, mark.lng);
			const label = document.createElement("span");
			label.className = "mark-label";
			label.textContent = mark.name;
			const marker = L.marker(this.px2ll(px, py), {
				icon: L.divIcon({
					className: "mark-marker",
					html: `<div class="mark-hit"><div class="mark-flag"></div>${label.outerHTML}</div>`,
					iconSize: [24, 24],
					iconAnchor: [12, 12],
				}),
				interactive: true,
			});
			marker.bindPopup(
				() => {
					const popup = marker.getPopup();
					if (popup) this.applyPopupPadding(popup);
					return this.makeNavPopupBody(
						mark.name,
						() => this.startNavigation(markTargetId(mark), "user"),
						[
							{ label: this.t.markRename, run: () => this.renameMark(mark) },
							{
								label: this.t.markDelete,
								// Twice: a mark is the player's own work, and the button sits right
								// where a thumb lands reaching for "Rename".
								run: (button) => {
									if (button.dataset.armed) this.deleteMark(mark);
									else {
										button.dataset.armed = "1";
										button.textContent = this.t.markDeleteConfirm;
										button.classList.add("danger");
										// The longer label does not fit beside "Rename", so the
										// confirm takes the row while it is asked. The popup keeps
										// its laid-out width, which the one button now fills.
										for (const sibling of button.parentElement?.children ?? []) {
											if (sibling !== button) (sibling as HTMLElement).hidden = true;
										}
									}
								},
							},
						],
					);
				},
				{ className: "poi-popup", closeButton: false, offset: [0, -6] },
			);
			marker.on("dblclick", () => this.startNavigation(markTargetId(mark), "user"));
			// A long press on a mark means that mark, not a new spot under it.
			marker.on("contextmenu", () => marker.openPopup());
			marker.addTo(this.marksLayer);
			this.markMarkers.set(mark.id, marker);
		}
		this.marksLayer.addTo(this.map);
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
		const headquarters = this.toggles.hqs ? (this.loadedDef?.headquarters ?? []) : [];

		this.poiDotsLayer = L.layerGroup();
		for (const poi of pointsOfInterest) {
			if (headquarters.some((hq) => this.samePlace(hq, poi))) continue;

			const idLabel = this.toggles.poiIds ? poi.id : undefined;
			const pixel = this.transform.toPixel(poi.lat, poi.lng);
			const marker = L.marker(this.px2ll(pixel.px, pixel.py), {
				// A turbine or a barrier is recognisable on its own; a plain building is
				// not, so it gets the dot. Either way it is one marker, and the drawn shape
				// is the target.
				icon:
					poi.kind === "turbine"
						? this.makeTurbineIcon(idLabel)
						: poi.kind === "checkpoint"
							? this.makeCheckpointIcon(idLabel)
							: this.makePoiDotIcon(idLabel),
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
		marker.on("dblclick", () => this.startNavigation(poi.id, "user"));
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

	// --- Position -----------------------------------------------------------------------

	/**
	 * Apply the newest position and heading at most once per displayed frame.
	 *
	 * GPS arrives about once a second, but `deviceorientation` fires at the sensor's own
	 * rate — 60 Hz on most phones, more on some — and every one of those events used to
	 * run a full position update: a marker move, two vector paths reprojected, and a
	 * `panTo` that fires `moveend` and so walks the basemap's whole tile set. None of
	 * that can show up more often than the display refreshes, so coalesce into one
	 * frame's work. The frame reads the newest values rather than a queued snapshot, so
	 * a backgrounded tab (where no frame runs) resumes with the current position instead
	 * of replaying a backlog.
	 */
	private schedulePush() {
		if (this.pushFrame) return;
		this.pushFrame = requestAnimationFrame(() => {
			this.pushFrame = 0;
			this.push();
		});
	}

	private push() {
		const fix = this.pendingFix;
		if (!fix) return;
		// Prefer GPS course while moving (the compass is noisy near metal replicas); fall
		// back to the magnetometer when standing still.
		const moving = (fix.speed ?? 0) > GPS_HEADING_SPEED && fix.heading != null;
		const heading = moving ? fix.heading : this.compassHeading;
		this.pushedFix = {
			lat: fix.lat,
			lng: fix.lng,
			accuracy: fix.accuracy,
			heading,
			speed: fix.speed,
			at: Date.now(),
		};
		this.applyPosition(fix.lat, fix.lng, fix.accuracy, heading);
		this.emit("fieldmap-fix", { ...this.pushedFix });
	}

	/** Start the device's GPS and compass, if this is the mode and the map is on screen. */
	private startSensorsIfShown() {
		if (this.positionSource !== "device" || !this.visible || !this.mapDef) return;
		this.sensors.start();
	}

	private onGpsProblem(problem: GpsProblem) {
		if (problem === "denied") {
			this.setToast(this.t.gpsDenied, "gps");
			this.emitPermission({ kind: "geolocation", state: "denied" });
		} else if (problem === "no-fix") {
			this.setToast(this.t.gpsNoFix, "gps");
		} else {
			this.clearToast("gps");
		}
	}

	private onCompassState(state: CompassState) {
		this.compassState = state;
		if (state === "denied") {
			this.setToast(this.t.compassDenied, "compass");
			this.emitPermission({ kind: "compass", state: "denied" });
		} else if (state === "needs-permission") {
			this.emitPermission({ kind: "compass", state: "prompt" });
		} else if (state === "on") {
			this.clearToast("compass");
			this.emitPermission({ kind: "compass", state: "granted" });
		}
	}

	private async enableCompass() {
		await this.sensors.requestCompass();
	}

	// The toast is one shared line and the last writer wins. `owner` records who that
	// was, so whoever put a message up can take it down again once it stops being true
	// without wiping something else's.
	private setToast(text: string, owner: "gps" | "compass") {
		this.toast = { text, owner };
	}

	private clearToast(owner: "gps" | "compass") {
		if (this.toast?.owner === owner) this.toast = null;
	}

	private emitPermission(detail: PermissionDetail) {
		this.emit("fieldmap-permission", detail);
	}

	private emit<K extends keyof FieldMapEventMap>(
		type: K,
		detail: FieldMapEventMap[K] extends CustomEvent<infer D> ? D : never,
	) {
		this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
	}

	/** Report the direction finder's reading, when it changed. */
	private setGuidance(guidance: GuidanceDetail | null) {
		const last = this.reportedGuidance;
		if (
			guidance === last ||
			(guidance &&
				last &&
				guidance.relativeDeg === last.relativeDeg &&
				guidance.distanceM === last.distanceM)
		) {
			return;
		}
		this.reportedGuidance = guidance;
		this.emit("fieldmap-guidance", guidance ? { ...guidance } : null);
	}

	// --- Live markers -------------------------------------------------------------------

	private syncLiveMarkers() {
		if (!this.live || !this.transform) return;
		const diff = this.live.set(this.markers, this.staleAfterMs);
		this.syncNavigableMarkers();

		// A navigation to a marker follows it — and ends when it is gone.
		if (!this.selectedPoiId.startsWith(MARKER_TARGET_PREFIX)) return;
		const targetId = this.selectedPoiId.slice(MARKER_TARGET_PREFIX.length);
		if (diff.removed.includes(targetId)) {
			this.startNavigation("", "host", "target-removed");
		} else if (
			diff.updated.some((marker) => marker.id === targetId) ||
			diff.restyled.some((marker) => marker.id === targetId)
		) {
			this.showPoiMarker();
			this.updateNavigation();
			this.updateStatus();
		}
	}

	private syncNavigableMarkers() {
		const navigable = this.markers.filter((marker) => marker.navigable);
		const same =
			navigable.length === this.navigableMarkers.length &&
			navigable.every(
				(marker, i) =>
					marker.id === this.navigableMarkers[i].id &&
					marker.label === this.navigableMarkers[i].label,
			);
		if (!same) this.navigableMarkers = navigable;
	}

	private toggleMarkerLayer(id: string) {
		const hidden = new Set(this.hiddenLayers);
		if (hidden.has(id)) hidden.delete(id);
		else hidden.add(id);
		this.hiddenLayers = hidden;
		try {
			localStorage.setItem(`${this.storagePrefix}-marker-layers`, JSON.stringify([...hidden]));
		} catch {
			// Non-fatal — the switch still applies for this session.
		}
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

	/** Place the player: the dot, its arrow, the circle, the route, the status line. */
	private applyPosition(lat: number, lng: number, accuracyM: number, headingDeg: number | null) {
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

		if (!positionUnchanged) this.placeFix(lat, lng, accuracyM);

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
	 * actually changed — see `applyPosition`.
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
			this.status = this.t.offMap;
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
			scale.setAttribute("aria-label", `${this.t.scale}: ${text}`);
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
	private afterRender() {
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
			if (this.loadedDef) this.fitInitial(this.loadedDef);
		} else if (this.lastPixel) {
			this.map.panTo(this.px2ll(this.lastPixel.px, this.lastPixel.py));
		}
	}

	render() {
		const pointsOfInterest = this.currentPointsOfInterest();
		const selectedPoi = this.getSelectedPoi();
		const t = this.t;

		return html`
			<div class="fm-leaflet"></div>
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
			<!-- Everything at the top, as one column: the row of buttons (the host's on the
			     left and right, the settings gear outermost), the host's notice, the iOS
			     compass prompt, and a line of trouble from the sensors. One container, so
			     each row simply takes the space the ones above it leave. -->
			<div class="fm-top">
				<div class="top-row">
					<div class="top-row-start">${this.topStart ?? ""}</div>
					<div class="top-row-end">${this.topEnd ?? ""} ${this.renderToggles()}</div>
				</div>
				${this.topNotice ?? ""}
				${
					this.compassState === "needs-permission" && this.positionSource === "device"
						? html`<button type="button" class="fm-compass" @click=${this.enableCompass}>
								${t.enableCompass}
							</button>`
						: ""
				}
				${this.toast ? html`<div class="fm-toast" role="alert">${this.toast.text}</div>` : ""}
			</div>
			<div class="hud">
				${this.bottomNotice ?? ""}
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
							pointsOfInterest.length > 0 || selectedPoi || this.marks.length > 0
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
																	@click=${() => this.startNavigation("", "user")}
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
												<!-- The live markers the host made navigable — other players, objectives. -->
												${
													this.navigableMarkers.length > 0
														? html`
																<optgroup label=${t.liveGroup}>
																	${this.navigableMarkers.map(
																		(marker) => html`
																			<option value=${MARKER_TARGET_PREFIX + marker.id}>
																				${marker.label ?? marker.id}
																			</option>
																		`,
																	)}
																</optgroup>
															`
														: ""
												}
												<!-- The player's own marks, also outside the guard: they change at a tap. -->
												${
													this.marks.length > 0
														? html`
																<optgroup label=${t.marksGroup}>
																	${this.marks.map(
																		(mark) => html`
																			<option value=${markTargetId(mark)}>${mark.name}</option>
																		`,
																	)}
																</optgroup>
															`
														: ""
												}
												<!-- Guarded on the map: the list only changes when the map does, and
												     without this every render walked all ~80 options. That includes the
												     one \`dragstart\` triggers by clearing \`following\`, which put a
												     rebuild of this list on the first frame of every drag, and the one
												     each GPS fix triggers through \`status\`. -->
												${guard([this.loadedDef, this.t], () =>
													[...pointsOfInterest]
														.sort(comparePointsOfInterest)
														.map(
															(poi) => html`
																<option value=${poi.id}>${this.poiLabel(poi)}</option>
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
						${
							this.locatedOnce && !this.offMap
								? html`
										<button
											type="button"
											class="mark-me"
											title=${t.markMyPosition}
											aria-label=${t.markMyPosition}
											@click=${this.markMyPosition}
										>
											<span class="mark-flag" aria-hidden="true"></span>
										</button>
									`
								: ""
						}
						<button class="recenter ${this.following ? "on" : ""}" @click=${this.recenter}>
							◎
						</button>
					</div>
				</div>
				${
					this.attribution
						? html`<a
								class="fm-attribution"
								href="https://www.openstreetmap.org/copyright"
								target="_blank"
								rel="noopener"
								>© OpenStreetMap</a
							>`
						: ""
				}
			</div>
		`;
	}

	private renderToggles() {
		const t = this.t;
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
		// A marker layer gets a row once a marker on it exists, so the menu never offers
		// to hide something that is not there.
		const layers = this.markerLayers.filter((layer) =>
			this.markers.some((marker) => marker.layer === layer.id),
		);
		const layerRow = (layer: MarkerLayer) => {
			const on = !this.hiddenLayers.has(layer.id);
			return html`
				<button
					class="toggle-row ${on ? "on" : ""}"
					role="switch"
					aria-checked=${on}
					@click=${() => this.toggleMarkerLayer(layer.id)}
				>
					<span class="toggle-label">${layer.label}</span>
					<span class="toggle-switch"></span>
				</button>
			`;
		};
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
									${this.marks.length > 0 ? row("marks", t.layerMarks) : ""} ${layers.map(layerRow)}
								</div>
							`
						: ""
				}
				<button
					class="fm-round-button toggle-btn ${this.togglesOpen ? "on" : ""}"
					aria-label=${t.layers}
					@click=${() => (this.togglesOpen = !this.togglesOpen)}
				>
					⚙
				</button>
			</div>
		`;
	}
}

/** The id a spot target carries in the public API: its coordinate, which is all it is. */
function spotId(lat: number, lng: number): string {
	return `${lat.toFixed(6)},${lng.toFixed(6)}`;
}

declare global {
	interface HTMLElementTagNameMap {
		"field-map": FieldMapElement;
	}
	interface HTMLElementEventMap extends FieldMapEventMap {}
}
