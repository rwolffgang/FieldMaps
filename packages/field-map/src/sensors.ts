// -----------------------------------------------------------------------------
// sensors.ts
// The device's own position and heading, for `<field-map>` in its default
// `position-source="device"` mode: the GPS watch, the compass, the iOS compass
// permission, and the screen wake lock. The element decides *when* these start
// (once it is actually on screen); this decides how they behave once they have.
// -----------------------------------------------------------------------------

import { needsPermission, requestPermission, watch, watchHeading, type Fix } from "@fieldmaps/core";

/**
 * Core Location hands Safari a plain "kCLErrorDomain error 0" the moment a watch
 * starts without a usable fix — indoors, in a hangar, in the seconds before the
 * first satellites are found — and then delivers a position a few seconds later as
 * if nothing had happened. Repeating that verbatim put an alarming, permanent line
 * on the map for something that fixes itself, so everything but a denied
 * permission is held back until it has lasted a while, and taken down on the first fix.
 */
const GPS_GRACE_MS = 12000;

/** Where the compass stands, as far as the player is concerned. */
export type CompassState = "off" | "needs-permission" | "on" | "denied";

/** What the GPS has to say that is worth putting on screen. */
export type GpsProblem = "denied" | "no-fix" | null;

export interface SensorCallbacks {
	onFix(fix: Fix): void;
	onHeading(headingDeg: number): void;
	onGpsProblem(problem: GpsProblem): void;
	onCompassState(state: CompassState): void;
}

export class DeviceSensors {
	private stopGps: (() => void) | null = null;
	private stopCompass: (() => void) | null = null;
	private gpsErrorTimer = 0;
	private wakeLock: { release(): Promise<void> } | null = null;
	private wantAwake = false;
	compass: CompassState = "off";

	constructor(private readonly callbacks: SensorCallbacks) {}

	/**
	 * Start the position watch — which is also what raises the browser's permission
	 * prompt, so the element only calls this once a map is on screen: a prompt over a
	 * page that has given no reason for one collects a "no" that is only undone in
	 * the site settings. Idempotent; once started the watch stays on, because a
	 * restart pays for itself with a cold fix — 10 s and more under tree cover.
	 */
	start() {
		if (this.stopGps) return;
		this.stopGps = watch(
			(fix) => {
				this.disarmGpsError();
				this.callbacks.onGpsProblem(null);
				this.callbacks.onFix(fix);
			},
			(err) => {
				// A refused permission is the player's to undo and will never resolve on its
				// own, so it is the one GPS failure worth saying immediately.
				if (err.code === 1 /* PERMISSION_DENIED */) {
					this.disarmGpsError();
					this.callbacks.onGpsProblem("denied");
					return;
				}
				// Already counting down from an earlier failure — a watch reports the same
				// dead spot over and over, and the wait should run from the first one.
				if (this.gpsErrorTimer) return;
				this.gpsErrorTimer = window.setTimeout(
					() => this.callbacks.onGpsProblem("no-fix"),
					GPS_GRACE_MS,
				);
			},
		);

		if (needsPermission()) {
			// iOS: the compass can only be switched on from inside a tap.
			this.setCompass("needs-permission");
		} else {
			this.startCompass();
		}
	}

	/** Ask iOS for the compass. Must be called from inside a user gesture. */
	async requestCompass(): Promise<boolean> {
		const granted = await requestPermission();
		if (granted) this.startCompass();
		else this.setCompass("denied");
		return granted;
	}

	stop() {
		this.stopGps?.();
		this.stopGps = null;
		this.stopCompass?.();
		this.stopCompass = null;
		this.disarmGpsError();
		this.keepAwake(false);
		this.setCompass("off");
	}

	get started(): boolean {
		return this.stopGps != null;
	}

	/**
	 * Keep the screen on while the map is up. Browsers release the lock whenever the
	 * page is hidden, so it is taken again on every return to the foreground.
	 */
	keepAwake(on: boolean) {
		this.wantAwake = on;
		if (!on) {
			void this.wakeLock?.release().catch(() => {});
			this.wakeLock = null;
			return;
		}
		if (this.wakeLock || document.visibilityState !== "visible") return;
		const api = (navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<any> } })
			.wakeLock;
		api
			?.request("screen")
			.then((lock) => {
				if (!this.wantAwake) {
					void lock.release().catch(() => {});
					return;
				}
				this.wakeLock = lock;
				lock.addEventListener?.("release", () => {
					if (this.wakeLock === lock) this.wakeLock = null;
				});
			})
			.catch(() => {});
	}

	/** Call on `visibilitychange`: the lock is gone after the page was hidden. */
	onVisibilityChange() {
		if (document.visibilityState === "visible" && this.wantAwake) this.keepAwake(true);
	}

	private startCompass() {
		if (this.stopCompass) return;
		this.stopCompass = watchHeading((heading) => this.callbacks.onHeading(heading));
		this.setCompass("on");
	}

	private setCompass(state: CompassState) {
		if (this.compass === state) return;
		this.compass = state;
		this.callbacks.onCompassState(state);
	}

	private disarmGpsError() {
		clearTimeout(this.gpsErrorTimer);
		this.gpsErrorTimer = 0;
	}
}
