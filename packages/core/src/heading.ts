// Cross-device compass is genuinely fiddly and airsoft fields make it worse
// (metal replicas + batteries deflect the magnetometer). This is a pragmatic
// best-effort; the orchestrator prefers GPS course when the user is moving.

type Cb = (headingDeg: number) => void;

/**
 * Whether the browser has the API that gates device orientation behind a tap. iOS 13+
 * does, and so does recent Chromium — including on laptops with no compass at all — so
 * this alone does not mean a tap is needed: see `watchHeading`'s `onNoReading`.
 */
export function needsPermission(): boolean {
	return (
		typeof DeviceOrientationEvent !== "undefined" &&
		typeof (DeviceOrientationEvent as any).requestPermission === "function"
	);
}

/**
 * Ask for the compass. Must be called inside a user gesture. Only "denied" is a
 * refusal: Chromium answers "prompt" when there is nothing to grant (no sensor, or no
 * decision taken), which is not the player saying no.
 */
export async function requestPermission(): Promise<"granted" | "denied" | "prompt"> {
	try {
		const result = await (DeviceOrientationEvent as any).requestPermission();
		return result === "granted" || result === "denied" ? result : "prompt";
	} catch {
		return "prompt";
	}
}

// Low-pass filter on an angle via unit vectors (handles the 359->0 wrap).
class AngleSmoother {
	private sx = 0;
	private sy = 0;
	private has = false;
	constructor(private k: number) {}
	push(deg: number): number {
		const r = (deg * Math.PI) / 180;
		const vx = Math.sin(r),
			vy = Math.cos(r);
		if (!this.has) {
			this.sx = vx;
			this.sy = vy;
			this.has = true;
		} else {
			this.sx += this.k * (vx - this.sx);
			this.sy += this.k * (vy - this.sy);
		}
		let a = (Math.atan2(this.sx, this.sy) * 180) / Math.PI;
		return (a + 360) % 360;
	}
}

/**
 * Heading smoothing for the compass (low-pass on the angle): 1 = raw magnetometer,
 * 0 = frozen — the same scale as `POSITION_SMOOTHING` in geo.ts.
 */
export const HEADING_SMOOTHING = 0.25;

/**
 * Start listening to the compass. Returns a stop() function.
 *
 * `onNoReading` is called (once) when the browser delivers an orientation event that
 * carries no heading at all — what Chromium does as soon as a listener is added on a
 * device without the sensor. iOS without permission delivers nothing instead.
 */
export function watchHeading(
	onHeading: Cb,
	smoothing = HEADING_SMOOTHING,
	onNoReading?: () => void,
): () => void {
	const smoother = new AngleSmoother(smoothing);
	let reportedEmpty = false;

	const handler = (e: DeviceOrientationEvent) => {
		let heading: number | null = null;

		// iOS: webkitCompassHeading is already 0=N, clockwise, and true-north-ish.
		const webkit = (e as any).webkitCompassHeading;
		if (Number.isFinite(webkit)) {
			heading = webkit;
		} else if (e.absolute && Number.isFinite(e.alpha as number)) {
			// Android absolute orientation: alpha is CCW from north -> flip it.
			heading = 360 - (e.alpha as number);
		}
		if (heading == null) {
			if (e.alpha == null && !reportedEmpty) {
				reportedEmpty = true;
				onNoReading?.();
			}
			return;
		}

		// Compensate for the device's screen rotation (portrait/landscape).
		const scr = (screen.orientation && screen.orientation.angle) || 0;
		heading = (heading + scr + 360) % 360;

		onHeading(smoother.push(heading));
	};

	// Prefer the explicitly-absolute event when the browser offers it.
	const evName =
		"ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
	window.addEventListener(evName, handler as EventListener, true);
	return () => window.removeEventListener(evName, handler as EventListener, true);
}
