import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { solveTransform, type Transform } from "./transform.js";
import {
	MAPS,
	mapsByDate,
	DEFAULT_MAP_ID,
	getMapById,
	getPointsOfInterestForMap,
	type MapDefinition,
	type LabeledPointOfInterest,
} from "./config.js";
import { isWindTurbine } from "./points-of-interest.js";
import { bearingDegrees, distanceMeters, navigationHint, relativeBearingDegrees } from "./geo.js";
import {
	buildOsmLayer,
	buildOsmGrid,
	buildOsmFrame,
	osmSurroundColor,
	type OsmFeatureCollection,
} from "./osm-map.js";
import { goHome, goToMap, routedMapId } from "./router.js";
import { BRAND_BLUE, BRAND_ORANGE } from "./brand.js";
import { strings } from "./i18n.js";

// There is no in-app language switcher — the browser's choice is fixed for the
// session — so resolving the strings once at module load is enough.
const t = strings();

const STORAGE_KEY = "field-map-selected-id";
const TOGGLES_KEY = "field-map-toggles";
const ARRIVED_DISTANCE_M = 8;

/**
 * How close a headquarters has to be to a PoI to count as *the same place* — the
 * emblem is then drawn on that building and the PoI needs no dot of its own. The
 * scenarios make this an easy call: every intentional pairing is 0.0 m (both were
 * read off the same spot on the printed map), and the closest unintentional one is
 * ~10 m, so anything in between separates the two cases.
 */
const SAME_PLACE_M = 5;

// --- Keeping the vector map painted while you drag -------------------------------
//
// Leaflet re-clips vector layers on `moveend` only: mid-drag it just slides the SVG
// panes, so once the pan leaves the drawn area the map is blank until you let go.
// Two knobs fix that together — a buffer around the viewport, plus a redraw during
// the drag once that buffer is nearly used up.
//
// RENDER_BUFFER is Leaflet's renderer `padding`: how far past the viewport, as a
// fraction of it per side, stays drawn (its default is 0.1). It has to stay small.
// The panes are *painted* at that size, at device pixel ratio, so a buffer wide
// enough to cover a whole gesture on its own (padding 1 = nine viewports per pane)
// stalls the first frame of a drag for a few hundred milliseconds.
//
// RECLIP_FRACTION is how much of the buffer a pan may eat before we redraw instead of
// waiting for the drop. Leaflet already does this for tile layers — GridLayer re-runs
// its `moveend` work on `move`, throttled — the vector renderers just never got the
// equivalent. Each redraw costs exactly one drop-redraw, a handful of times per drag.
//
// Tune them against each other: if a drag ever feels heavy, shrink RENDER_BUFFER
// (less to paint per redraw) and raise RECLIP_FRACTION (fewer redraws); if the leading
// edge flashes blank on a fast flick, do the opposite.
const RENDER_BUFFER = 0.2;
const RECLIP_FRACTION = 0.5;

// Set on `Renderer` itself rather than passed as the map's `renderer` option: every
// layer here draws into a custom pane, and Leaflet builds those pane renderers itself
// (`Map._createRenderer`), passing only the pane name — map-level renderer options
// never reach them.
L.Renderer.mergeOptions({ padding: RENDER_BUFFER });

// --- Why the terrain draws to <canvas> and the masks stay SVG --------------------
//
// The OSM base is ~380 separate paths. As SVG that is 380 DOM elements the browser
// has to style, lay out and rasterize on every redraw, in a full-viewport layer at
// device pixel ratio — and a redraw happens several times per drag, not just on drop.
// Measured on a 1280×720 desktop at DPR 2 that was ~36 Mpx of vector rasterization
// per redraw across five stacked layers, which is what made dragging crawl. The JS
// was never the problem (~2.7 ms); the rasterization it triggers was.
//
// Canvas collapses each of those panes into one bitmap and one draw call per shape,
// with no DOM behind it. The mask and zone panes stay SVG on purpose: their hatching
// is an injected SVG `<pattern>` referenced from CSS, which canvas cannot express —
// and they are only a handful of paths each, so they were never the expensive part.
const CANVAS_PANES = ["osm-basemap", "osm-grid", "osm-frame"] as const;

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
	private vectorLayer: L.LayerGroup | null = null;
	private vectorCache = new Map<string, OsmFeatureCollection>();
	private gridLayer: L.LayerGroup | null = null;
	private frameLayer: L.LayerGroup | null = null;
	private maskLayer: L.LayerGroup | null = null;
	private zonesLayer: L.LayerGroup | null = null;
	private hqLayer: L.LayerGroup | null = null;
	private poiMarker: L.Marker | null = null;
	private poiDotsLayer: L.LayerGroup | null = null;
	private routeLine: L.Polyline | null = null;
	private lastPixel: { px: number; py: number } | null = null;
	private lastGps: { lat: number; lng: number; accuracy: number; heading: number | null } | null =
		null;
	private mapWidth = 0;
	private mapHeight = 0;
	private resizeObserver: ResizeObserver | null = null;
	/** View the vector panes were last clipped around, for the mid-drag redraw. */
	private clipCenter: L.LatLng | null = null;
	private clipZoom = NaN;
	/**
	 * Whether the field has ever been framed while the container actually had a size.
	 * `fitBounds` on a 0×0 container clamps to `minZoom` and stays there, so until this
	 * is true the framing is a placeholder that has to be redone.
	 */
	private framed = false;
	/** Canvas renderers for the terrain panes, keyed by pane name (see CANVAS_PANES). */
	private canvasRenderers: Partial<Record<(typeof CANVAS_PANES)[number], L.Canvas>> = {};

	@state() private status = t.waitingForGps;
	@state() private following = true;
	@state() private offMap = false;
	@state() private selectedMapId = initialMapId();
	@state() private selectedPoiId = "";
	@state() private navDistanceM = 0;
	@state() private navHint = "";
	@state() private navArrowDeg = 0;
	@state() private togglesOpen = false;
	@state() private toggles: Toggles = loadStoredToggles();
	/** Set when the OSM data failed to load, so the user (or `online`) can retry it. */
	@state() private vectorRetry: { definition: MapDefinition; dataUrl: string } | null = null;

	firstUpdated() {
		this.map = L.map(this.querySelector("#map") as HTMLElement, {
			crs: L.CRS.Simple,
			minZoom: -4,
			maxZoom: 4,
			zoomControl: false,
			attributionControl: false,
			// Fractional zoom. With Leaflet's default snap of 1, `fitBounds` rounds *down*
			// to a whole power of two, so a field only slightly wider than the screen opens
			// at half scale and wastes half the display. The field is a fixed-size canvas,
			// not a tile pyramid, so there is no reason to quantise its zoom at all.
			zoomSnap: 0,
		});

		// Basemap pane for the OSM vector map: below overlayPane (400) so the accuracy
		// circle, nav route, and markers all draw on top of it.
		this.map.createPane("osm-basemap");
		this.map.getPane("osm-basemap")!.style.zIndex = "250";

		// Coordinate grid sits just above the terrain (like the printed map's grid),
		// below the mask so out-of-bounds grid is dimmed too.
		this.map.createPane("osm-grid");
		this.map.getPane("osm-grid")!.style.zIndex = "260";

		// Frame: opaque surround that clips the map to the grid rectangle. It sits above
		// the mask and the zones too — a play area or a safe zone can legitimately run
		// past the canvas edge (Dark Emergency's does), and nothing may render there.
		this.map.createPane("osm-frame");
		this.map.getPane("osm-frame")!.style.zIndex = "340";

		// Out-of-bounds mask sits above the basemap (300) but below the overlay pane
		// (400), so it dims the terrain while the GPS dot, route, and PoIs stay clear.
		this.map.createPane("playarea-mask");
		this.map.getPane("playarea-mask")!.style.zIndex = "300";

		// Marked areas + frontlines from the printed map: above the mask (so a safe
		// zone stays legible) but still below the overlay pane and its markers.
		this.map.createPane("zones");
		this.map.getPane("zones")!.style.zIndex = "320";

		// One canvas renderer per terrain pane (see CANVAS_PANES). Built once and reused
		// across map switches: the renderer owns the pane's <canvas>, so recreating it per
		// load would leak a canvas each time.
		for (const pane of CANVAS_PANES) {
			this.canvasRenderers[pane] = L.canvas({ pane, padding: RENDER_BUFFER });
		}

		// Leaflet builds the mask pane's SVG lazily during a render; (re)inject the
		// hatch pattern whenever the map renders. Idempotent, so it's safe to repeat.
		this.map.on("load zoomend moveend", () => this.injectHatchPattern());

		// Redraw while the view is still moving, before the pan runs off the drawn
		// buffer (see RENDER_BUFFER). Covers drags, inertia flings and animated pans.
		this.map.on("move", () => this.reclipIfPannedOut());
		// Whatever ended the move (a real moveend, or our own) leaves the panes freshly
		// clipped around this view: that is the point the next pan is measured from.
		this.map.on("moveend zoomend", () => {
			this.clipCenter = this.map.getCenter();
			this.clipZoom = this.map.getZoom();
		});

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

	/**
	 * Re-clip the vector panes while the view is still moving, once the pan has eaten
	 * RECLIP_FRACTION of the drawn buffer — otherwise the leading edge would stay blank
	 * until the move ends. `moveend` is the event the renderers redraw on, so firing it
	 * is the redraw; everything else listening to it here is idempotent. Zoom is the
	 * exception: Leaflet scales the panes during a pinch and redraws them at the end,
	 * so any pan measured across a zoom change is left to that redraw. Bail out on it
	 * rather than redrawing — a pinch fires `move` every frame, and repainting every
	 * vector pane per frame stalls the gesture so badly that the base map looks frozen
	 * until the fingers lift while the markers, which are cheap, keep up.
	 *
	 * The budget is per axis. Leaflet's padding is a fraction of each dimension, so a
	 * 1280×720 viewport keeps 256 px of buffer either side but only 144 px above and
	 * below; measuring one diagonal distance against the *smaller* of the two spent the
	 * generous horizontal buffer at the vertical rate, and horizontal is the direction
	 * people actually drag. That alone roughly halves the redraws on a sideways pan
	 * (128 px of travel instead of 72) while leaving each axis exactly as much margin
	 * against a blank leading edge as it had before — which is why RECLIP_FRACTION
	 * itself stays at 0.5. Now that a redraw is cheap there is little to win by raising
	 * it, and a flick that outruns the buffer is a visible regression.
	 */
	private reclipIfPannedOut() {
		const zoom = this.map.getZoom();
		if (!this.clipCenter || this.clipZoom !== zoom) return;
		const size = this.map.getSize();
		const from = this.map.project(this.clipCenter, zoom);
		const to = this.map.project(this.map.getCenter(), zoom);
		const spent = RECLIP_FRACTION * RENDER_BUFFER;
		if (Math.abs(to.x - from.x) < spent * size.x && Math.abs(to.y - from.y) < spent * size.y) {
			return;
		}
		this.map.fire("moveend");
	}

	private currentPointsOfInterest(): LabeledPointOfInterest[] {
		return getPointsOfInterestForMap(this.selectedMapId);
	}

	private getSelectedPoi(): LabeledPointOfInterest | null {
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
		// Dev sanity check — never shown to the user.
		console.info(
			`[calibration:${definition.id}] RMS error: ${this.transform.rmsMeters.toFixed(2)} m across ${definition.controlPoints.length} points`,
		);

		if (this.imageOverlay) {
			this.map.removeLayer(this.imageOverlay);
			this.imageOverlay = null;
		}
		if (this.vectorLayer) {
			this.map.removeLayer(this.vectorLayer);
			this.vectorLayer = null;
		}
		if (this.gridLayer) {
			this.map.removeLayer(this.gridLayer);
			this.gridLayer = null;
		}
		if (this.frameLayer) {
			this.map.removeLayer(this.frameLayer);
			this.frameLayer = null;
		}
		if (this.maskLayer) {
			this.map.removeLayer(this.maskLayer);
			this.maskLayer = null;
		}
		if (this.zonesLayer) {
			this.map.removeLayer(this.zonesLayer);
			this.zonesLayer = null;
		}
		if (this.hqLayer) {
			this.map.removeLayer(this.hqLayer);
			this.hqLayer = null;
		}

		const bounds: L.LatLngBoundsExpression = [
			[0, 0],
			[this.mapHeight, this.mapWidth],
		];

		// Match the container to the theme's surround, so whatever is not painted yet
		// (outside the field, or a fling past the clip area) blends into the border.
		const container = this.map.getContainer();
		container.style.background = definition.vectorData ? osmSurroundColor(definition.theme) : "";

		if (definition.vectorData) {
			void this.loadVectorMap(definition, definition.vectorData);
		} else if (definition.image) {
			this.imageOverlay = L.imageOverlay(definition.image, bounds).addTo(this.map);
		}
		this.renderPlayAreaMask(definition.playArea);
		this.renderZones(definition);
		this.renderHeadquarters(definition);
		this.fitInitial(definition);
		this.following = true;

		if (this.lastGps) {
			this.update_(this.lastGps.lat, this.lastGps.lng, this.lastGps.accuracy, this.lastGps.heading);
		}

		this.syncPoiDots();
	}

	/**
	 * Fetch (once) and draw the bundled OSM GeoJSON as styled vector layers. The
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
			if (this.selectedMapId !== definition.id || !this.transform) return;

			const theme = definition.theme ?? "opt";
			const pixelProject = (px: number, py: number) => this.px2ll(px, py);

			if (this.vectorLayer) this.map.removeLayer(this.vectorLayer);
			this.vectorLayer = buildOsmLayer(data, {
				project: (lng, lat) => {
					const { px, py } = this.transform.toPixel(lat, lng);
					return this.px2ll(px, py);
				},
				pixelProject,
				width: this.mapWidth,
				height: this.mapHeight,
				theme,
				pane: "osm-basemap",
				renderer: this.canvasRenderers["osm-basemap"],
			});
			this.vectorLayer.addTo(this.map);

			// Coordinate grid as its own toggleable layer (100 m, matching the scale bar).
			if (this.gridLayer) this.map.removeLayer(this.gridLayer);
			this.gridLayer = buildOsmGrid({
				pixelProject,
				width: this.mapWidth,
				height: this.mapHeight,
				stepPx: this.transform.metersToPixels(100),
				theme,
				pane: "osm-grid",
				renderer: this.canvasRenderers["osm-grid"],
			});
			if (this.toggles.grid) this.gridLayer.addTo(this.map);

			// Clean border: opaque surround that clips the map to the grid rectangle.
			if (this.frameLayer) this.map.removeLayer(this.frameLayer);
			this.frameLayer = buildOsmFrame({
				pixelProject,
				width: this.mapWidth,
				height: this.mapHeight,
				theme,
				pane: "osm-frame",
				renderer: this.canvasRenderers["osm-frame"],
			});
			this.frameLayer.addTo(this.map);

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
	 * Cover everything OUTSIDE the play-area polygon with a darken + diagonal-hatch
	 * texture, and outline the boundary. Emulates the printed maps, where the area
	 * beyond the active field is masked out. No polygon (or fewer than 3 points)
	 * means "whole field" — nothing is drawn.
	 */
	private renderPlayAreaMask(playArea: [number, number][] | undefined) {
		if (this.maskLayer) {
			this.map.removeLayer(this.maskLayer);
			this.maskLayer = null;
		}
		if (!playArea || playArea.length < 3 || !this.transform) return;

		// Play-area ring in Leaflet coords (GPS -> pixel -> CRS.Simple latLng).
		const hole = playArea.map(([lat, lng]) => {
			const { px, py } = this.transform.toPixel(lat, lng);
			return this.px2ll(px, py);
		});

		// The mask covers the play-area's complement WITHIN the map rectangle; beyond
		// the rectangle the frame provides the border. The play-area ring is a hole.
		const outer: L.LatLngExpression[] = [
			this.px2ll(0, 0),
			this.px2ll(this.mapWidth, 0),
			this.px2ll(this.mapWidth, this.mapHeight),
			this.px2ll(0, this.mapHeight),
		];

		this.maskLayer = L.layerGroup();

		// 1) Darken (reliable flat fill, also the fallback if the pattern is missing).
		L.polygon([outer, hole], {
			pane: "playarea-mask",
			stroke: false,
			fill: true,
			fillColor: "#05070a",
			fillOpacity: 0.55,
			interactive: false,
		}).addTo(this.maskLayer);

		// 2) Diagonal hatch on top (transparent-background SVG pattern, via CSS class).
		L.polygon([outer, hole], {
			pane: "playarea-mask",
			className: "playarea-hatch",
			stroke: false,
			fill: true,
			fillOpacity: 1,
			interactive: false,
		}).addTo(this.maskLayer);

		// 3) Boundary outline so the play-area edge is legible.
		L.polygon(hole, {
			pane: "playarea-mask",
			color: "#e8c24d",
			weight: 2,
			dashArray: "10 6",
			opacity: 0.9,
			fill: false,
			interactive: false,
		}).addTo(this.maskLayer);

		if (this.toggles.mask) {
			this.maskLayer.addTo(this.map);
			this.injectHatchPattern();
		}
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
		if (!this.following || (this.framed && this.lastGps)) return;

		this.fitInitial(getMapById(this.selectedMapId));
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
	 * Draw the marked areas and frontlines traced off the event's printed map: the
	 * hatched safe zones, the "Zivile Zone" wash, the faction boundary lines. Each
	 * zone gets its own SVG hatch pattern, keyed by zone id, so the stripes take the
	 * zone's colour.
	 */
	private renderZones(definition: MapDefinition) {
		if (this.zonesLayer) {
			this.map.removeLayer(this.zonesLayer);
			this.zonesLayer = null;
		}
		const zones = definition.zones ?? [];
		const lines = definition.lines ?? [];
		if ((zones.length === 0 && lines.length === 0) || !this.transform) return;

		this.zonesLayer = L.layerGroup();

		for (const zone of zones) {
			if (zone.points.length < 3) continue;
			const ring = this.ring(zone.points);
			const style = zone.style ?? "hatch";

			if (style !== "outline") {
				L.polygon(ring, {
					pane: "zones",
					stroke: false,
					fill: true,
					fillColor: zone.color,
					fillOpacity: style === "fill" ? 0.22 : 0.1,
					interactive: false,
				}).addTo(this.zonesLayer);
			}
			if (style === "hatch") {
				L.polygon(ring, {
					pane: "zones",
					className: `zone-hatch zone-hatch-${zone.id}`,
					stroke: false,
					fill: true,
					fillOpacity: 1,
					interactive: false,
				}).addTo(this.zonesLayer);
			}
			L.polygon(ring, {
				pane: "zones",
				color: zone.color,
				weight: 2,
				dashArray: "8 5",
				opacity: 0.95,
				fill: false,
				interactive: false,
			}).addTo(this.zonesLayer);

			L.marker(polygonCenter(ring), {
				pane: "zones",
				icon: L.divIcon({
					className: "zone-label-marker",
					html: `<span class="zone-label" style="color:${zone.color}">${zone.name}</span>`,
					iconSize: [0, 0],
				}),
				interactive: false,
			}).addTo(this.zonesLayer);
		}

		for (const line of lines) {
			if (line.points.length < 2) continue;
			L.polyline(this.ring(line.points), {
				pane: "zones",
				color: line.color,
				weight: 4,
				dashArray: "14 9",
				opacity: 0.95,
				interactive: false,
			}).addTo(this.zonesLayer);
		}

		if (this.toggles.zones) {
			this.zonesLayer.addTo(this.map);
			this.injectZonePatterns(zones);
		}
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
			const poi = this.currentPointsOfInterest().find((candidate) => this.samePlace(hq, candidate));
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

	/**
	 * Give every zone a diagonal-stripe <pattern> in its own colour, injected into
	 * the zones pane's SVG. Same lazy-SVG dance as the play-area hatch.
	 */
	private injectZonePatterns(zones: MapDefinition["zones"], attempt = 0) {
		// Same `hasLayer` guard as the play-area hatch: no layer on the map, no pane SVG,
		// so retrying for it would never terminate.
		if (!zones || zones.length === 0 || !this.zonesLayer) return;
		if (!this.map.hasLayer(this.zonesLayer)) return;
		const svg = this.map.getPane("zones")?.querySelector("svg");
		if (!svg) {
			if (attempt < 40) requestAnimationFrame(() => this.injectZonePatterns(zones, attempt + 1));
			return;
		}
		const NS = "http://www.w3.org/2000/svg";
		let defs = svg.querySelector("defs");
		if (!defs) {
			defs = document.createElementNS(NS, "defs");
			svg.insertBefore(defs, svg.firstChild);
		}
		for (const zone of zones) {
			const id = `zone-hatch-${zone.id}`;
			if (svg.querySelector(`#${CSS.escape(id)}`)) continue;
			const pattern = document.createElementNS(NS, "pattern");
			pattern.setAttribute("id", id);
			pattern.setAttribute("patternUnits", "userSpaceOnUse");
			pattern.setAttribute("width", "10");
			pattern.setAttribute("height", "10");
			pattern.setAttribute("patternTransform", "rotate(45)");
			const stripe = document.createElementNS(NS, "rect");
			stripe.setAttribute("width", "3.5");
			stripe.setAttribute("height", "10");
			stripe.setAttribute("fill", zone.color);
			stripe.setAttribute("fill-opacity", "0.55");
			pattern.appendChild(stripe);
			defs.appendChild(pattern);
		}
		// Point each zone polygon at its own pattern (CSS can't hold a per-zone url()).
		for (const zone of zones) {
			for (const el of this.querySelectorAll_(`.zone-hatch-${zone.id}`)) {
				el.setAttribute("fill", `url(#zone-hatch-${zone.id})`);
			}
		}
	}

	private querySelectorAll_(selector: string): SVGElement[] {
		const pane = this.map.getPane("zones");
		return pane ? Array.from(pane.querySelectorAll<SVGElement>(selector)) : [];
	}

	/** Whether the current map can show the grid / mask toggles. */
	private get hasGrid(): boolean {
		return getMapById(this.selectedMapId).vectorData != null;
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
		// other toggle just adds or removes a layer, so there is no reason to tear down
		// and rebuild ~180 marker elements for it.
		if (key === "poiIds" || key === "hqs") this.syncPoiDots();
	}

	/** Apply the current toggle states to the live layers. */
	private applyToggles() {
		if (this.gridLayer) {
			if (this.toggles.grid) this.gridLayer.addTo(this.map);
			else this.map.removeLayer(this.gridLayer);
		}
		if (this.maskLayer) {
			if (this.toggles.mask) {
				this.maskLayer.addTo(this.map);
				this.injectHatchPattern();
			} else {
				this.map.removeLayer(this.maskLayer);
			}
		}
		if (this.zonesLayer) {
			if (this.toggles.zones) {
				this.zonesLayer.addTo(this.map);
				this.injectZonePatterns(getMapById(this.selectedMapId).zones);
			} else {
				this.map.removeLayer(this.zonesLayer);
			}
		}
		if (this.hqLayer) {
			if (this.toggles.hqs) this.hqLayer.addTo(this.map);
			else this.map.removeLayer(this.hqLayer);
		}
	}

	/**
	 * Inject the diagonal-hatch <pattern> into the mask pane's SVG. Leaflet creates
	 * that SVG lazily, so retry across a few frames until it exists.
	 */
	private injectHatchPattern(attempt = 0) {
		// `hasLayer`, not just "the layer object exists": with the mask toggled off the
		// layer is built but never added, so its pane never gets an <svg> and the retry
		// below could never succeed. This handler runs on every `moveend` — including the
		// synthetic ones `reclipIfPannedOut` fires several times per drag — so without
		// this check panning piles up dead 40-frame retry chains for the whole session.
		if (!this.maskLayer || !this.map.hasLayer(this.maskLayer)) return;
		const svg = this.map.getPane("playarea-mask")?.querySelector("svg");
		if (!svg) {
			if (attempt < 40) requestAnimationFrame(() => this.injectHatchPattern(attempt + 1));
			return;
		}
		if (svg.querySelector("#playarea-hatch")) return;
		const NS = "http://www.w3.org/2000/svg";
		const defs = document.createElementNS(NS, "defs");
		const pattern = document.createElementNS(NS, "pattern");
		pattern.setAttribute("id", "playarea-hatch");
		pattern.setAttribute("patternUnits", "userSpaceOnUse");
		pattern.setAttribute("width", "9");
		pattern.setAttribute("height", "9");
		pattern.setAttribute("patternTransform", "rotate(45)");
		const stripe = document.createElementNS(NS, "rect");
		stripe.setAttribute("width", "2.5");
		stripe.setAttribute("height", "9");
		stripe.setAttribute("fill", "#000000");
		stripe.setAttribute("fill-opacity", "0.3");
		pattern.appendChild(stripe);
		defs.appendChild(pattern);
		svg.insertBefore(defs, svg.firstChild);
	}

	private onMapSelect(event: Event) {
		const id = (event.target as HTMLSelectElement).value;
		if (id === this.selectedMapId) return;
		// Route rather than load directly, so switching maps from the HUD produces the
		// same shareable URL as arriving from the landing page.
		goToMap(id);
	}

	/** Show a map because the route changed. */
	showRoutedMap(id: string) {
		if (id !== this.selectedMapId) this.loadMap(getMapById(id));
		// This element was `hidden` until now, so its container may still be 0×0 as far
		// as Leaflet knows. The ResizeObserver catches that too, but only after layout —
		// resync on the next frame so the first paint is already framed correctly.
		requestAnimationFrame(() => this.resyncSize());
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
			return;
		}
		// The popup has done its job, and `fitUserAndPoi` is about to move the view out
		// from under it.
		this.map.closePopup();
		this.showPoiMarker();
		this.updateNavigation();
		this.fitUserAndPoi();
	}

	private clearNavigation() {
		this.selectedPoiId = "";
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

	private updateNavigation() {
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
		if (popup) {
			const { top, bottom } = this.chromeInsets();
			popup.options.autoPanPaddingTopLeft = L.point(16, top);
			popup.options.autoPanPaddingBottomRight = L.point(16, bottom);
		}

		const body = document.createElement("div");
		body.className = "poi-popup-body";

		const title = document.createElement("span");
		title.className = "poi-popup-title";
		title.textContent = this.poiLabel(poi);

		const navigate = document.createElement("button");
		navigate.type = "button";
		navigate.className = "poi-popup-nav";
		navigate.textContent = t.navigateHere;
		navigate.addEventListener("click", () => this.startNavigation(poi.id));

		body.append(title, navigate);
		return body;
	}

	/**
	 * How far the chrome intrudes on the map, top and bottom, with a margin. The top
	 * rows come and go (compass prompt, nav card, a toast of any height) and the HUD
	 * grows with a wrapped status line, so measure them instead of restating the CSS
	 * row arithmetic here.
	 */
	private chromeInsets(): { top: number; bottom: number } {
		const visibleBottom = (element: Element | null) =>
			element instanceof HTMLElement && !element.hidden
				? element.getBoundingClientRect().bottom
				: 0;
		const top = Math.max(
			visibleBottom(this.querySelector(".poi-panel")),
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
	}

	/** Called by the app whenever a new position/heading is available. */
	update_(lat: number, lng: number, accuracyM: number, headingDeg: number | null) {
		if (!this.transform) return;
		this.lastGps = { lat, lng, accuracy: accuracyM, heading: headingDeg };

		const gpsPixel = this.transform.toPixel(lat, lng);
		this.lastPixel = gpsPixel;
		this.offMap = this.isOffMapPixel(gpsPixel);
		const pixel = this.displayPixel(gpsPixel);
		const latLng = this.px2ll(pixel.px, pixel.py);

		this.accuracyCircle.setLatLng(latLng);
		this.accuracyCircle.setRadius(this.transform.metersToPixels(accuracyM));
		if (!this.map.hasLayer(this.accuracyCircle)) this.accuracyCircle.addTo(this.map);

		this.marker.setLatLng(latLng);
		if (!this.map.hasLayer(this.marker)) this.marker.addTo(this.map);

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

		if (this.selectedPoiId) this.updateNavigation();

		if (this.offMap) {
			this.status = t.offMap;
		} else if (this.selectedPoiId) {
			this.status = `${this.getSelectedPoi()?.name ?? "POI"} · ${this.navDistanceM.toFixed(0)} m`;
		} else {
			this.status = `±${accuracyM.toFixed(0)} m`;
		}

		// Keep the map in view when the fix falls outside the image; following it
		// would just pan into empty background.
		if (this.following && !this.offMap) this.map.panTo(latLng, { animate: true });
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
				pointsOfInterest.length > 0
					? html`
							<div class="poi-panel">
								<select class="poi-select" .value=${this.selectedPoiId} @change=${this.onPoiSelect}>
									<option value="">${t.navigateTo}</option>
									${pointsOfInterest.map(
										(poi) => html` <option value=${poi.id}>${poi.id} · ${poi.name}</option> `,
									)}
								</select>
								${
									selectedPoi
										? html`
												<div class="nav-card">
													<div
														class="nav-arrow"
														style="transform:rotate(${this.navArrowDeg}deg)"
													></div>
													<div class="nav-info">
														<span class="nav-distance">${this.navDistanceM.toFixed(0)} m</span>
														<span class="nav-hint">${this.navHint}</span>
													</div>
												</div>
											`
										: ""
								}
							</div>
						`
					: ""
			}
			<div class="hud">
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
				<div class="hud-controls">
					<div class="hud-left">
						<button class="home-btn" aria-label=${t.backToOverview} @click=${() => goHome()}>
							‹
						</button>
						${
							MAPS.length > 1
								? html`
										<select class="map-select" @change=${this.onMapSelect}>
											${mapsByDate().map(
												(map) => html`
													<option value=${map.id} ?selected=${this.selectedMapId === map.id}>
														${map.name}
													</option>
												`,
											)}
										</select>
									`
								: ""
						}
					</div>
					<div class="hud-right">
						${this.renderToggles()}
						<button class="recenter ${this.following ? "on" : ""}" @click=${this.recenter}>
							◎
						</button>
					</div>
				</div>
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
					▤
				</button>
			</div>
		`;
	}
}
