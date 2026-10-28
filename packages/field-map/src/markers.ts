// -----------------------------------------------------------------------------
// markers.ts
// Live markers: the things a host app draws on the map that are not part of the
// scenario — other players' positions from its server, objectives, a supply drop.
//
// They move, so they are Leaflet markers (invariant 7: only what moves may be a
// layer). And a host may send dozens of them once a second, so an update never
// rebuilds what it can move: the new array is compared with the last one by `id`,
// and a marker whose position changed is moved, one whose heading changed has its
// arrow turned, and only a changed look (icon, colour, label) rebuilds its element.
//
// The accuracy ring is part of the marker's own element, sized in screen pixels on
// every zoom frame, rather than an `L.Circle`: a vector path per player would be
// re-clipped and re-rasterized on every `moveend` — the cost the tiled basemap
// exists to avoid — and would each need the zoom guard of invariant 8.
// -----------------------------------------------------------------------------

import * as L from "leaflet";
import type { MapMarker } from "./types.js";
import { diffMarkers, escapeHtml, isStale, minutesSince, type MarkerDiff } from "./marker-diff.js";

/** A CSS colour, or nothing — a value that is not one never reaches a style attribute. */
function cssColor(color: string | undefined): string | null {
	if (!color) return null;
	return typeof CSS !== "undefined" && CSS.supports("color", color) ? color : null;
}

interface Placed {
	data: MapMarker;
	marker: L.Marker;
}

export interface LiveMarkerOptions {
	map: L.Map;
	pane: string;
	/** A GPS coordinate to the map's CRS.Simple latLng (through the scenario's calibration). */
	place(lat: number, lng: number): L.LatLngExpression;
	/** Metres on the ground to screen pixels at the current zoom. */
	metersToScreen(meters: number): number;
	/** A compass bearing to the rotation on screen (the map may not be north-up). */
	bearingToScreen(bearing: number): number;
	onClick(id: string): void;
	lastSeen(minutes: number): string;
}

/** The live markers on one map. */
export class LiveMarkerLayer {
	private placed = new Map<string, Placed>();
	private hidden: ReadonlySet<string> = new Set();
	private staleAfterMs = 0;

	constructor(private readonly options: LiveMarkerOptions) {}

	/** The marker by id, as last set. */
	get(id: string): MapMarker | undefined {
		return this.placed.get(id)?.data;
	}

	/** Apply a new `markers` array; returns what changed. */
	set(markers: readonly MapMarker[], staleAfterMs: number): MarkerDiff {
		this.staleAfterMs = staleAfterMs;
		const previous = new Map<string, MapMarker>();
		for (const [id, entry] of this.placed) previous.set(id, entry.data);
		const diff = diffMarkers(previous, markers);

		for (const id of diff.removed) {
			this.placed.get(id)?.marker.remove();
			this.placed.delete(id);
		}
		for (const data of diff.restyled) {
			this.placed.get(data.id)?.marker.remove();
			this.placed.delete(data.id);
			this.add(data);
		}
		for (const data of diff.added) this.add(data);
		for (const data of diff.updated) {
			const entry = this.placed.get(data.id);
			if (!entry) continue;
			const layerChanged = entry.data.layer !== data.layer;
			entry.data = data;
			entry.marker.setLatLng(this.options.place(data.lat, data.lng));
			if (layerChanged) this.applyVisibility(entry);
			this.applyDynamics(entry);
		}
		return diff;
	}

	/** Hide every marker whose `layer` is in `hidden`. */
	setHiddenLayers(hidden: ReadonlySet<string>) {
		this.hidden = hidden;
		for (const entry of this.placed.values()) this.applyVisibility(entry);
	}

	/** Place everything again — after a new calibration, which moves every pixel. */
	replaceAll() {
		for (const entry of this.placed.values()) {
			entry.marker.setLatLng(this.options.place(entry.data.lat, entry.data.lng));
			this.applyDynamics(entry);
		}
	}

	/** Resize the accuracy rings to the current zoom. Cheap; called on every zoom frame. */
	resizeRings() {
		for (const entry of this.placed.values()) this.applyRing(entry);
	}

	/** Re-evaluate staleness; called on a timer, since nothing else changes when a player goes quiet. */
	tick() {
		for (const entry of this.placed.values()) this.applyFreshness(entry);
	}

	clear() {
		for (const entry of this.placed.values()) entry.marker.remove();
		this.placed.clear();
	}

	get size(): number {
		return this.placed.size;
	}

	private add(data: MapMarker) {
		const color = cssColor(data.color);
		const label = data.label
			? `<span class="fm-live-label"><span class="fm-live-name">${escapeHtml(data.label)}</span><span class="fm-live-age"></span></span>`
			: `<span class="fm-live-label"><span class="fm-live-age"></span></span>`;
		const marker = L.marker(this.options.place(data.lat, data.lng), {
			pane: this.options.pane,
			icon: L.divIcon({
				className: "fm-live-marker",
				html:
					`<div class="fm-live"${color ? ` style="--fm-live-color:${color}"` : ""}>` +
					`<div class="fm-live-ring"></div>` +
					`<div class="fm-live-arrow"></div>` +
					`<div class="fm-live-icon">${data.icon ?? `<div class="fm-live-dot"></div>`}</div>` +
					label +
					`</div>`,
				iconSize: [24, 24],
				iconAnchor: [12, 12],
			}),
			interactive: true,
			keyboard: false,
		});
		marker.on("click", () => this.options.onClick(data.id));
		// A long press on a marker means that marker, not the ground under it — answering
		// the event here is what keeps it from reaching the map's own long-press handler.
		marker.on("contextmenu", () => this.options.onClick(data.id));
		const entry: Placed = { data, marker };
		// The element exists only while the marker is on the map, so the dynamic parts
		// are written every time it gets there.
		marker.on("add", () => this.applyDynamics(entry));
		this.placed.set(data.id, entry);
		this.applyVisibility(entry);
	}

	private applyVisibility(entry: Placed) {
		const show = entry.data.layer == null || !this.hidden.has(entry.data.layer);
		const shown = this.options.map.hasLayer(entry.marker);
		if (show && !shown) entry.marker.addTo(this.options.map);
		else if (!show && shown) entry.marker.remove();
	}

	private applyDynamics(entry: Placed) {
		const root = entry.marker.getElement();
		if (!root) return;
		const arrow = root.querySelector<HTMLElement>(".fm-live-arrow");
		if (arrow) {
			const heading = entry.data.heading;
			if (heading == null || !Number.isFinite(heading)) arrow.style.display = "none";
			else {
				arrow.style.display = "";
				arrow.style.transform = `rotate(${this.options.bearingToScreen(heading)}deg)`;
			}
		}
		this.applyRing(entry);
		this.applyFreshness(entry);
	}

	private applyRing(entry: Placed) {
		const ring = entry.marker.getElement()?.querySelector<HTMLElement>(".fm-live-ring");
		if (!ring) return;
		const meters = entry.data.accuracyM;
		if (meters == null || !(meters > 0)) {
			ring.style.display = "none";
			return;
		}
		const diameter = Math.max(0, 2 * this.options.metersToScreen(meters));
		ring.style.display = diameter < 4 ? "none" : "";
		ring.style.width = ring.style.height = `${diameter.toFixed(1)}px`;
	}

	private applyFreshness(entry: Placed) {
		const root = entry.marker.getElement();
		if (!root) return;
		const now = Date.now();
		const stale = isStale(entry.data, now, this.staleAfterMs);
		root.classList.toggle("stale", stale);
		const age = root.querySelector<HTMLElement>(".fm-live-age");
		if (age) {
			const text = stale ? this.options.lastSeen(minutesSince(entry.data, now)) : "";
			if (age.textContent !== text) age.textContent = text;
		}
	}
}
