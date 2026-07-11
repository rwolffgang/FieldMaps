import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { solveTransform, type Transform } from "./transform.js";
import {
	MAPS,
	DEFAULT_MAP_ID,
	getMapById,
	type MapDefinition,
	type PointOfInterest,
} from "./config.js";
import { bearingDegrees, distanceMeters, navigationHint, relativeBearingDegrees } from "./geo.js";

const STORAGE_KEY = "field-map-selected-id";
const ARRIVED_DISTANCE_M = 8;

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
	private poiMarker: L.Marker | null = null;
	private routeLine: L.Polyline | null = null;
	private arrowEl: HTMLElement | null = null;
	private lastPixel: { px: number; py: number } | null = null;
	private lastGps: { lat: number; lng: number; accuracy: number; heading: number | null } | null =
		null;
	private mapWidth = 0;
	private mapHeight = 0;

	@state() private status = "Waiting for GPS…";
	@state() private following = true;
	@state() private offMap = false;
	@state() private selectedMapId = localStorage.getItem(STORAGE_KEY) ?? DEFAULT_MAP_ID;
	@state() private selectedPoiId = "";
	@state() private navDistanceM = 0;
	@state() private navHint = "";
	@state() private navArrowDeg = 0;

	firstUpdated() {
		this.map = L.map(this.querySelector("#map") as HTMLElement, {
			crs: L.CRS.Simple,
			minZoom: -4,
			maxZoom: 4,
			zoomControl: false,
			attributionControl: false,
		});

		// Dragging the map cancels auto-follow (so you can look around).
		this.map.on("dragstart", () => {
			this.following = false;
		});

		this.accuracyCircle = L.circle(this.px2ll(0, 0), {
			radius: 0,
			color: "#38bdf8",
			weight: 1,
			fillColor: "#38bdf8",
			fillOpacity: 0.15,
		});
		this.marker = L.marker(this.px2ll(0, 0), { icon: this.makeIcon(), interactive: false });

		this.loadMap(getMapById(this.selectedMapId), false);
	}

	private currentPointsOfInterest(): PointOfInterest[] {
		return getMapById(this.selectedMapId).pointsOfInterest ?? [];
	}

	private getSelectedPoi(): PointOfInterest | null {
		return this.currentPointsOfInterest().find((poi) => poi.id === this.selectedPoiId) ?? null;
	}

	private loadMap(definition: MapDefinition, persist: boolean) {
		this.selectedMapId = definition.id;
		if (persist) localStorage.setItem(STORAGE_KEY, definition.id);

		this.clearNavigation();
		this.mapWidth = definition.width;
		this.mapHeight = definition.height;
		this.transform = solveTransform(definition.controlPoints);
		// Dev sanity check — never shown to the user.
		console.info(
			`[calibration:${definition.id}] RMS error: ${this.transform.rmsMeters.toFixed(2)} m across ${definition.controlPoints.length} points`,
		);

		if (this.imageOverlay) this.map.removeLayer(this.imageOverlay);

		const bounds: L.LatLngBoundsExpression = [
			[0, 0],
			[this.mapHeight, this.mapWidth],
		];
		this.imageOverlay = L.imageOverlay(definition.image, bounds).addTo(this.map);
		this.map.fitBounds(bounds);
		this.following = true;

		if (this.lastGps) {
			this.update_(this.lastGps.lat, this.lastGps.lng, this.lastGps.accuracy, this.lastGps.heading);
		}
	}

	private onMapSelect(event: Event) {
		const id = (event.target as HTMLSelectElement).value;
		if (id === this.selectedMapId) return;
		this.loadMap(getMapById(id), true);
	}

	private onPoiSelect(event: Event) {
		this.selectedPoiId = (event.target as HTMLSelectElement).value;
		if (!this.selectedPoiId) {
			this.clearNavigation();
			return;
		}
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
			this.navHint = this.lastGps ? "" : "Waiting for GPS…";
			return;
		}

		const distance = distanceMeters(this.lastGps.lat, this.lastGps.lng, poi.lat, poi.lng);
		const targetBearing = bearingDegrees(this.lastGps.lat, this.lastGps.lng, poi.lat, poi.lng);

		this.navDistanceM = distance;
		this.navArrowDeg = this.transform.bearingToScreenDeg(targetBearing);

		if (distance <= ARRIVED_DISTANCE_M) {
			this.navHint = "You have arrived";
		} else if (this.lastGps.heading != null) {
			const relative = relativeBearingDegrees(targetBearing, this.lastGps.heading);
			this.navHint = navigationHint(relative);
		} else {
			this.navHint = "Enable compass for turn hints";
		}

		const userPixel = this.transform.toPixel(this.lastGps.lat, this.lastGps.lng);
		const poiPixel = this.transform.toPixel(poi.lat, poi.lng);
		const userLatLng = this.px2ll(userPixel.px, userPixel.py);
		const poiLatLng = this.px2ll(poiPixel.px, poiPixel.py);

		if (!this.routeLine) {
			this.routeLine = L.polyline([userLatLng, poiLatLng], {
				color: "#f59e0b",
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

		const userPixel = this.transform.toPixel(this.lastGps.lat, this.lastGps.lng);
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

	/** Called by the app whenever a new position/heading is available. */
	update_(lat: number, lng: number, accuracyM: number, headingDeg: number | null) {
		if (!this.transform) return;
		this.lastGps = { lat, lng, accuracy: accuracyM, heading: headingDeg };

		const pixel = this.transform.toPixel(lat, lng);
		this.lastPixel = pixel;
		const latLng = this.px2ll(pixel.px, pixel.py);
		this.offMap =
			pixel.px < 0 || pixel.px > this.mapWidth || pixel.py < 0 || pixel.py > this.mapHeight;

		this.accuracyCircle.setLatLng(latLng);
		this.accuracyCircle.setRadius(this.transform.metersToPixels(accuracyM));
		if (!this.map.hasLayer(this.accuracyCircle)) this.accuracyCircle.addTo(this.map);

		this.marker.setLatLng(latLng);
		if (!this.map.hasLayer(this.marker)) this.marker.addTo(this.map);

		// Rebuild the icon only when the triangle/dot state changes; otherwise just
		// rotate the existing arrow element (cheaper, and avoids marker flicker).
		const showTriangle = headingDeg != null;
		const screenDegrees = headingDeg != null ? this.transform.bearingToScreenDeg(headingDeg) : 0;
		this.arrowEl = this.marker.getElement()?.querySelector(".pm-arrow") ?? null;
		if (showTriangle && this.arrowEl) {
			this.arrowEl.style.transform = `rotate(${screenDegrees}deg)`;
		} else {
			this.marker.setIcon(this.makeIcon(screenDegrees, showTriangle));
		}

		if (this.selectedPoiId) this.updateNavigation();

		if (this.offMap) {
			this.status = "⚠ Off map — you're outside this field";
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
			this.map.fitBounds([
				[0, 0],
				[this.mapHeight, this.mapWidth],
			]);
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
									<option value="">Navigate to…</option>
									${pointsOfInterest.map(
										(poi) => html` <option value=${poi.id}>${poi.name}</option> `,
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
				<div class="hud-left">
					${
						MAPS.length > 1
							? html`
									<select
										class="map-select"
										.value=${this.selectedMapId}
										@change=${this.onMapSelect}
									>
										${MAPS.map((map) => html` <option value=${map.id}>${map.name}</option> `)}
									</select>
								`
							: ""
					}
					<span class="pill ${this.offMap ? "warn" : ""}">${this.status}</span>
				</div>
				<button class="recenter ${this.following ? "on" : ""}" @click=${this.recenter}>◎</button>
			</div>
		`;
	}
}
