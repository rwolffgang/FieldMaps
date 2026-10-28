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
// Buildings give off a little too, in two strengths. Every building on the map lifts
// the needle as you walk up to it — enough to swing it across the lowest range and
// light the ОБЪЕКТ lamp, so the counter answers wherever the player goes. The few the
// story makes hot (headquarters, `radiatingPois`) go further, into yellow ("ERHÖHT").
// Neither reaches the alarm, which stays the zone's:
//
//                      any building    a hot one
//   on it              32              45    yellow
//   ~20 m away         ~17             ~22
//   ~50 m away         background      ~12
//
// While a navigation runs the device also works as a direction finder: point the
// phone at the destination and the needle lifts and the clicks quicken, turn away
// and it falls back. Not realistic, a game tool: it only says which way, the same at
// 20 m as at 2 km. The lobe is narrow (half strength at ~33° off) and peaks at
// ~0.3 мР/ч — below the alarm and well inside the ×0,1 range, so the needle has room
// to show the sweep and ТРЕВОГА keeps meaning the zone.
//
// Distances come from a local flat projection around the player. Over a zone a few
// hundred metres across that is accurate to well under a metre — far below what GPS
// under trees delivers (5–15 m) and the hand-traced zone edges (tens of metres).
// -----------------------------------------------------------------------------

import type { LatLng } from "@fieldmaps/core";

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
/** Standing on a hot object (HQ, `radiatingPois`): yellow, below the alarm threshold (60). */
export const POI_LEVEL = 45;
/**
 * Standing on any other building: a clear lift over background — the needle near the
 * top of the lowest range — without reaching yellow, so the hot ones still stand out.
 */
export const BUILDING_LEVEL = 32;
/** Metres over which a PoI's reading falls back toward background (1/e). */
const FALLOFF_POI_M = 18;

/** Direction finding: the reading when facing the target dead ahead, at any distance. */
export const GUIDE_LEVEL = 50;
/** Sharpness of the lobe around the target's bearing: cos(off-angle) to this power. */
const GUIDE_LOBE_POWER = 4;

/** A point that lifts the reading as the player approaches it. */
export interface RadiationPoint {
	lat: number;
	lng: number;
	/** The reading standing on it; `POI_LEVEL` when left out. */
	level?: number;
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

/** The dosimeter level (0–100) at a given distance from a point peaking at `peak`. */
export function levelForPoiDistance(distanceM: number, peak = POI_LEVEL): number {
	return BACKGROUND_LEVEL + (peak - BACKGROUND_LEVEL) * Math.exp(-distanceM / FALLOFF_POI_M);
}

/**
 * The direction-finding level (0–100) while navigating: `relativeDeg` is the
 * target's bearing relative to where the phone points (0 = dead ahead, 0–360).
 * Distance plays no part. Background when facing more than 90° away.
 */
export function levelForBearing(relativeDeg: number): number {
	const wrapped = ((relativeDeg % 360) + 360) % 360;
	const offDeg = Math.min(wrapped, 360 - wrapped);
	if (offDeg >= 90) return BACKGROUND_LEVEL;
	const lobe = Math.cos(offDeg * DEG) ** GUIDE_LOBE_POWER;
	return BACKGROUND_LEVEL + (GUIDE_LEVEL - BACKGROUND_LEVEL) * lobe;
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
		level = Math.max(level, levelForPoiDistance(Math.hypot(east, north), point.level));
	}
	return level;
}
