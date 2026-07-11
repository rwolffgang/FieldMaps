import { HEADING_SMOOTHING } from "./config.js";

// Cross-device compass is genuinely fiddly and airsoft fields make it worse
// (metal replicas + batteries deflect the magnetometer). This is a pragmatic
// best-effort; the orchestrator prefers GPS course when the user is moving.

type Cb = (headingDeg: number) => void;

/** iOS 13+ gates device orientation behind an explicit permission call. */
export function needsPermission(): boolean {
	return typeof (DeviceOrientationEvent as any)?.requestPermission === "function";
}

export async function requestPermission(): Promise<boolean> {
	try {
		const res = await (DeviceOrientationEvent as any).requestPermission();
		return res === "granted";
	} catch {
		return false;
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

/** Start listening to the compass. Returns a stop() function. */
export function watchHeading(onHeading: Cb): () => void {
	const smoother = new AngleSmoother(HEADING_SMOOTHING);

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
		if (heading == null) return;

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
