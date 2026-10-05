// -----------------------------------------------------------------------------
// radiation.ts
// The prop dosimeter's GPS reading: how "hot" a position is, given the scenario's
// irradiated zones (the `biohazard`-style zones — OP Tschernobyl's "Verstrahlt").
//
// Pure functions, no DOM, so the shape of the curve can be tested without a phone.
// The result is on the dosimeter's own 0–100 scale (one decade of µSv/h per 20
// steps, see `dosimeter-view.ts`), so a GPS reading and the manual slider mean the
// same thing:
//
//   far away                10   0.03 µSv/h   background, green
//   ~50 m outside the edge  ~25  ~0.2 µSv/h   the needle starts to lift
//   on the edge             50   3 µSv/h      yellow — you are at the fence
//   ~25 m inside            ~70  ~30 µSv/h    orange, the alarm starts
//   deep inside             →90  ~300 µSv/h   red
//
// Points of interest give off a little too: walking up to one lifts the reading
// into yellow ("ERHÖHT") but never into the alarm, so a building is something you
// notice on the counter rather than something that sets it screaming:
//
//   on a PoI                45   ~1.8 µSv/h   yellow
//   ~20 m away              ~30  ~0.3 µSv/h
//   ~50 m away              ~16  background again
//
// Distances come from a local flat projection around the player. Over a zone a few
// hundred metres across that is accurate to well under a metre — far below what GPS
// under trees delivers (5–15 m) and the hand-traced zone edges (tens of metres).
// -----------------------------------------------------------------------------

import type { LatLng } from "./scenarios/scenario.js";

const EARTH_RADIUS_M = 6378137;
const DEG = Math.PI / 180;

/** Far from every zone: the background reading the device opens on. */
export const BACKGROUND_LEVEL = 10;
/** Standing exactly on a zone's edge. */
export const EDGE_LEVEL = 50;
/** What the reading approaches in the middle of a large zone. */
export const PEAK_LEVEL = 90;
/** Outside: metres over which the reading falls back toward background (1/e). */
const FALLOFF_OUTSIDE_M = 35;
/** Inside: metres of depth over which the reading climbs toward the peak (1/e). */
const RISE_INSIDE_M = 25;
/** Standing on a point of interest: yellow, below the alarm threshold (60). */
export const POI_LEVEL = 45;
/** Metres over which a PoI's reading falls back toward background (1/e). */
const FALLOFF_POI_M = 18;

/** A point that lifts the reading as the player approaches it. */
export interface RadiationPoint {
	lat: number;
	lng: number;
}

/**
 * Signed distance from a point to a polygon's edge, metres: negative inside,
 * positive outside. The ring may be open or closed.
 */
export function signedDistanceToZoneM(lat: number, lng: number, ring: LatLng[]): number {
	if (ring.length < 3) return Infinity;
	// Project the ring into metres east/north of the point, so the point is (0, 0).
	const cosLat = Math.cos(lat * DEG);
	const pts = ring.map(([pLat, pLng]) => [
		(pLng - lng) * DEG * EARTH_RADIUS_M * cosLat,
		(pLat - lat) * DEG * EARTH_RADIUS_M,
	]);

	let inside = false;
	let nearest = Infinity;
	for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
		const [xi, yi] = pts[i];
		const [xj, yj] = pts[j];
		// Even-odd ray cast along +x from the origin.
		if (yi > 0 !== yj > 0 && 0 < xj + ((0 - yj) * (xi - xj)) / (yi - yj)) inside = !inside;
		// Distance from the origin to the segment j→i.
		const dx = xi - xj;
		const dy = yi - yj;
		const lengthSq = dx * dx + dy * dy;
		const t = lengthSq > 0 ? Math.max(0, Math.min(1, -(xj * dx + yj * dy) / lengthSq)) : 0;
		nearest = Math.min(nearest, Math.hypot(xj + t * dx, yj + t * dy));
	}
	return inside ? -nearest : nearest;
}

/** The dosimeter level (0–100) for a signed distance to the nearest zone edge. */
export function levelForSignedDistance(signedM: number): number {
	if (signedM >= 0) {
		return (
			BACKGROUND_LEVEL + (EDGE_LEVEL - BACKGROUND_LEVEL) * Math.exp(-signedM / FALLOFF_OUTSIDE_M)
		);
	}
	return EDGE_LEVEL + (PEAK_LEVEL - EDGE_LEVEL) * (1 - Math.exp(signedM / RISE_INSIDE_M));
}

/** The dosimeter level (0–100) at a given distance from a point of interest. */
export function levelForPoiDistance(distanceM: number): number {
	return BACKGROUND_LEVEL + (POI_LEVEL - BACKGROUND_LEVEL) * Math.exp(-distanceM / FALLOFF_POI_M);
}

/** The sensitivity at which a reading is exactly what the model gives. */
export const NOMINAL_SENSITIVITY = 50;

/**
 * Scale a reading by the device's sensitivity knob (0–100, nominal 50): it gains
 * or loses only what is *above* background, so 0 reads background everywhere and
 * 100 doubles every source — a PoI then reaches orange, a zone pins the needle.
 */
export function applySensitivity(level: number, sensitivity: number): number {
	const gain = Math.max(0, sensitivity) / NOMINAL_SENSITIVITY;
	return Math.min(100, BACKGROUND_LEVEL + (level - BACKGROUND_LEVEL) * gain);
}

/**
 * The dosimeter level (0–100) at a position: the hottest of the irradiated zones
 * and the points of interest. Neither means background everywhere.
 */
export function radiationLevelAt(
	lat: number,
	lng: number,
	zones: LatLng[][],
	points: readonly RadiationPoint[] = [],
): number {
	let level = BACKGROUND_LEVEL;
	for (const ring of zones) {
		level = Math.max(level, levelForSignedDistance(signedDistanceToZoneM(lat, lng, ring)));
	}
	const cosLat = Math.cos(lat * DEG);
	for (const point of points) {
		const east = (point.lng - lng) * DEG * EARTH_RADIUS_M * cosLat;
		const north = (point.lat - lat) * DEG * EARTH_RADIUS_M;
		level = Math.max(level, levelForPoiDistance(Math.hypot(east, north)));
	}
	return level;
}
