// -----------------------------------------------------------------------------
// basemap-layer.ts
// The map itself, as a pyramid of pre-rasterized canvas tiles.
//
// WHY TILES. Everything on this map that does not move — terrain, grid, mask, zones,
// border — used to be Leaflet vector layers. Leaflet re-clips and re-rasterizes those
// on every `moveend`, and it reallocates each renderer's canvas while doing it, so
// keeping the map painted during a drag meant firing `moveend` several times per
// gesture and paying that price several times per gesture. That is the whole reason
// dragging was heavy: not the JavaScript, the rasterization it triggered.
//
// A tile is rasterized once and afterwards only translated, which is what every map
// service does and why they feel weightless. Leaflet's `GridLayer` already owns the
// hard parts — positioning tiles, keeping them across a pan, scaling them through a
// pinch, pruning the ones that have gone away — so this class only has to answer one
// question: what does the tile at (x, y, z) look like?
//
// The cost is bounded by the viewport, not by the field or the zoom: about forty
// tiles are ever live. A single pre-rendered bitmap of the whole field would be
// simpler and is what the retired photo maps effectively were, but at this canvas
// size and zoom range it is well over a hundred megabytes — which is exactly why
// map services tile instead.
// -----------------------------------------------------------------------------

import * as L from "leaflet";
import { paintTile, type TileScene } from "./osm-map.js";

/**
 * Cap on how far above device resolution a tile is rasterized.
 *
 * `zoomSnap: 0` means the map usually sits between two integer tile zooms, and
 * Leaflet covers the difference by CSS-scaling the tiles — at worst by √2, which is
 * visibly soft on line work this thin. Rasterizing at the scale the tile is actually
 * being shown at fixes that; the cap keeps a zoomed-in tile from quietly costing four
 * times the memory.
 */
const MAX_OVERSAMPLE = 1.5;

/**
 * Cap on a tile's backing store, in device pixels per CSS pixel.
 *
 * `MAX_OVERSAMPLE` bounds the oversample *factor*, not the result — on a 3x phone it
 * still asks for 4.5 device pixels per CSS pixel, which is a 1152x1152 backing store
 * for a 256 px tile: 5.3 MB each, and forty-odd tiles are live at any time. That is a
 * couple of hundred megabytes of canvas on the device least able to spare it, and a
 * backgrounded PWA is exactly what a phone discards first when memory runs short.
 *
 * Three is already past the point where more helps: the line work here is hairlines
 * and dashes, and at 3x a tile stretched the full sqrt(2) between zoom levels still
 * has better than two device pixels per screen pixel. Below 3x nothing changes — a 2x
 * phone lands on 2 x 1.5 = 3 either way — so this only ever trims the extreme.
 */
const MAX_PIXEL_RATIO = 3;

/** Tile edge in CSS pixels. Small tiles mean small, evenly spread bursts of work. */
const TILE_SIZE = 256;

/**
 * The basemap. Hand it a scene with `setScene`; it repaints when that changes and is
 * otherwise inert — which is the point.
 */
export class BasemapLayer extends L.GridLayer {
	private scene: TileScene | null = null;
	private mapHeight: number;

	constructor(scene: TileScene, mapHeight: number, options?: L.GridLayerOptions) {
		super({
			tileSize: TILE_SIZE,
			// Only over the field: past its edge there is nothing to draw but the
			// surround, and the map container's background is already that colour.
			bounds: L.latLngBounds([0, 0], [mapHeight, scene.width]),
			noWrap: true,
			// GridLayer's own zoom range, not the map's — and its default floor of 0 would
			// reject every tile on this map, because a field that fits on a screen sits at a
			// NEGATIVE CRS.Simple zoom. Opened out so the map's range is the only one that
			// decides anything.
			minZoom: -20,
			maxZoom: 20,
			// Leaflet defaults this to TRUE on mobile, which would load tiles only once
			// the pan has stopped — a blank leading edge on every phone drag, the exact
			// problem this layer exists to solve.
			updateWhenIdle: false,
			// Nothing new mid-pinch: Leaflet scales what is already there, and the tiles
			// for the zoom you land on are built when you land on it.
			updateWhenZooming: false,
			updateInterval: 50,
			// A ring of tiles beyond the viewport, so an ordinary drag creates nothing.
			keepBuffer: 3,
			...options,
		});
		this.scene = scene;
		this.mapHeight = mapHeight;
	}

	/** Swap the scene (map switch, theme, layer toggle) and repaint every live tile. */
	setScene(scene: TileScene, mapHeight = this.mapHeight) {
		this.scene = scene;
		this.mapHeight = mapHeight;
		(this.options as L.GridLayerOptions).bounds = L.latLngBounds([0, 0], [mapHeight, scene.width]);
		if (this._map) this.redraw();
	}

	/**
	 * Build tiles one ring beyond the viewport, rather than exactly up to its edge.
	 *
	 * `keepBuffer` only decides what is *kept*; what is *loaded* is the viewport itself,
	 * so without this a tile is built at the moment it becomes visible — and the throttle
	 * on `move` means "the moment it becomes visible" is up to `updateInterval` late. On a
	 * fling that is a blank strip at the leading edge. One tile of headroom is 256 px
	 * against roughly 150 px of travel per interval at fling speed, and a tile costs a
	 * quarter of a millisecond, so it is the cheap side of the trade.
	 */
	protected _getTiledPixelBounds(center: L.LatLng): L.Bounds {
		const bounds = (
			L.GridLayer.prototype as unknown as {
				_getTiledPixelBounds(this: BasemapLayer, center: L.LatLng): L.Bounds;
			}
		)._getTiledPixelBounds.call(this, center);
		const pad = this.getTileSize();
		return L.bounds(bounds.min!.subtract(pad), bounds.max!.add(pad));
	}

	/**
	 * Rasterize one tile.
	 *
	 * Declared with one parameter on purpose: Leaflet reads `createTile.length` to tell
	 * a synchronous tile from an asynchronous one, and marks this one ready itself on
	 * the next frame. Calling the `done` callback inline would run it before Leaflet has
	 * finished registering the tile.
	 */
	protected createTile(coords: L.Coords): HTMLElement {
		const tile = document.createElement("canvas");
		const size = this.getTileSize();
		const scene = this.scene;

		// Canvas pixels per CSS pixel at this tile's zoom. CRS.Simple projects
		// (lat, lng) -> (lng·s, −lat·s) with s = 2^zoom, and `px2ll(px, py)` in map-view
		// hands it [mapHeight − py, px] — so a projected point is (px·s, (py − mapHeight)·s)
		// and the inverse below is the ONLY place that flip is undone. (See the
		// "two separate y-flips" invariant in AGENTS.md; this is the Leaflet-boundary one.)
		const scale = 2 ** coords.z;
		const minX = (coords.x * size.x) / scale;
		const minY = (coords.y * size.y) / scale + this.mapHeight;
		const view = {
			minX,
			minY,
			maxX: minX + size.x / scale,
			maxY: minY + size.y / scale,
			scale,
			pixelRatio: 1,
		};

		// Rasterize at the resolution the tile will actually be shown at, capped.
		const device = window.devicePixelRatio || 1;
		const stretch = this._map ? this._map.getZoomScale(this._map.getZoom(), coords.z) : 1;
		const oversample = Math.min(MAX_OVERSAMPLE, Math.max(1, stretch));
		view.pixelRatio = Math.min(MAX_PIXEL_RATIO, device * oversample);

		tile.width = Math.round(size.x * view.pixelRatio);
		tile.height = Math.round(size.y * view.pixelRatio);
		tile.style.width = `${size.x}px`;
		tile.style.height = `${size.y}px`;

		// An OSM tile paints the surround edge to edge before anything else, so there is
		// never anything to see through and the compositor gets to skip blending. A photo
		// map has its imagery in a pane below, so those tiles must keep their alpha.
		const ctx = tile.getContext("2d", { alpha: scene?.terrain == null });
		if (!ctx || !scene) return tile;

		// From here on the context speaks canvas pixels — the app's own convention,
		// origin top-left and y down — so nothing downstream has to think about tiles.
		const unit = scale * view.pixelRatio;
		ctx.setTransform(unit, 0, 0, unit, -minX * unit, -minY * unit);
		paintTile(ctx, scene, view);

		return tile;
	}
}
