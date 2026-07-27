import { POSITION_SMOOTHING, SNAP_DISTANCE_M } from "./config.js";

export interface Fix {
	lat: number;
	lng: number;
	accuracy: number; // meters
	heading: number | null; // GPS course, degrees from north (only when moving)
	speed: number | null; // m/s
}

type Cb = (fix: Fix) => void;

const DEG = Math.PI / 180;

/** Ground distance in meters between two GPS coordinates. */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
	const R = 6371000;
	const dLat = (lat2 - lat1) * DEG;
	const dLng = (lng2 - lng1) * DEG;
	const sine =
		Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLng / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(sine));
}

/** Compass bearing from one point to another, degrees clockwise from north. */
export function bearingDegrees(
	fromLat: number,
	fromLng: number,
	toLat: number,
	toLng: number,
): number {
	const lat1 = fromLat * DEG;
	const lat2 = toLat * DEG;
	const deltaLng = (toLng - fromLng) * DEG;
	const y = Math.sin(deltaLng) * Math.cos(lat2);
	const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
	return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Bearing to target relative to where you are facing; 0 = ahead, 90 = right. */
export function relativeBearingDegrees(targetBearing: number, heading: number): number {
	return (((targetBearing - heading) % 360) + 360) % 360;
}

/**
 * The turn hints the HUD can show. Keys, not sentences: this module stays free of
 * display text so the same hint can be rendered in either language (see `i18n.ts`).
 */
export type NavigationHint =
	"ahead" | "bearRight" | "turnRight" | "behind" | "turnLeft" | "bearLeft";

/** Short turn hint from a relative bearing. */
export function navigationHint(relativeDegrees: number): NavigationHint {
	if (relativeDegrees <= 25 || relativeDegrees >= 335) return "ahead";
	if (relativeDegrees <= 60) return "bearRight";
	if (relativeDegrees <= 120) return "turnRight";
	if (relativeDegrees <= 200) return "behind";
	if (relativeDegrees <= 280) return "turnLeft";
	return "bearLeft";
}

/**
 * Watch position. Applies a light exponential smoother to lat/lng so the dot
 * doesn't jitter, but SNAPS on large jumps so it never lags real movement.
 * Returns a stop() function.
 */
export function watch(onFix: Cb, onError: (e: GeolocationPositionError) => void): () => void {
	if (!("geolocation" in navigator)) {
		onError({
			code: 2,
			message: "No geolocation",
			PERMISSION_DENIED: 1,
			POSITION_UNAVAILABLE: 2,
			TIMEOUT: 3,
		} as GeolocationPositionError);
		return () => {};
	}

	let smoothed: Fix | null = null;
	const k = POSITION_SMOOTHING;

	const id = navigator.geolocation.watchPosition(
		(pos) => {
			const c = pos.coords;
			const raw: Fix = {
				lat: c.latitude,
				lng: c.longitude,
				accuracy: c.accuracy,
				heading: Number.isFinite(c.heading as number) ? (c.heading as number) : null,
				speed: Number.isFinite(c.speed as number) ? (c.speed as number) : null,
			};

			if (
				!smoothed ||
				distanceMeters(smoothed.lat, smoothed.lng, raw.lat, raw.lng) > SNAP_DISTANCE_M
			) {
				smoothed = raw; // first fix or teleport: snap
			} else {
				smoothed = {
					...raw,
					lat: smoothed.lat + k * (raw.lat - smoothed.lat),
					lng: smoothed.lng + k * (raw.lng - smoothed.lng),
				};
			}
			onFix(smoothed);
		},
		onError,
		{ enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
	);

	return () => navigator.geolocation.clearWatch(id);
}
