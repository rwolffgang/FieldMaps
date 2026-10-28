// -----------------------------------------------------------------------------
// sensors.ts
// The device's own position and heading, for `<field-map>` in its default
// `position-source="device"` mode: the GPS watch, the compass, the iOS compass
// permission, and the screen wake lock. The element decides *when* these start
// (once it is actually on screen); this decides how they behave once they have.
// -----------------------------------------------------------------------------

import { needsPermission, requestPermission, watch, watchHeading, type Fix } from "@fieldmaps/core";
import { COMPASS_PROBE_MS, decideCompass } from "./compass-decision.js";

/**
 * Core Location hands Safari a plain "kCLErrorDomain error 0" the moment a watch
 * starts without a usable fix — indoors, in a hangar, in the seconds before the
 * first satellites are found — and then delivers a position a few seconds later as
 * if nothing had happened. Repeating that verbatim put an alarming, permanent line
 * on the map for something that fixes itself, so everything but a denied
 * permission is held back until it has lasted a while, and taken down on the first fix.
 */
const GPS_GRACE_MS = 12000;

/**
 * Where the compass stands, as far as the player is concerned.
 * - `probing`: listening, no answer yet (shows nothing)
 * - `needs-permission`: a tap on "Enable compass" may switch it on
 * - `unavailable`: no compass to be had (a laptop) — nothing to show, nothing to ask
 */
export type CompassState = "off" | "probing" | "needs-permission" | "on" | "unavailable" | "denied";

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
	/** What the compass listener has seen so far — see `compass-decision.ts`. */
	private evidence = { sawHeading: false, sawEmptyReading: false, timedOut: false, granted: false };
	private probeTimer = 0;
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

		// Listen first and ask only if that turns out to be needed: the permission API
		// alone no longer says much (Chromium has it on laptops without a compass).
		this.listenToCompass();
	}

	/**
	 * Ask for the compass, from the "Enable compass" button. Must be called inside a user
	 * gesture. Only an explicit "denied" counts as a refusal; anything else leaves the
	 * button where it was.
	 */
	async requestCompass(): Promise<"granted" | "denied" | "prompt"> {
		const result = await requestPermission();
		if (result === "granted") {
			this.evidence.granted = true;
			// Listen again from scratch: a browser that was holding readings back starts
			// sending them now, and one without a sensor answers with an empty one.
			this.stopCompass?.();
			this.stopCompass = null;
			this.evidence.sawEmptyReading = false;
			this.listenToCompass();
		} else if (result === "denied") {
			this.setCompass("denied");
		}
		return result;
	}

	stop() {
		this.stopGps?.();
		this.stopGps = null;
		this.stopCompass?.();
		this.stopCompass = null;
		clearTimeout(this.probeTimer);
		this.probeTimer = 0;
		this.evidence = { sawHeading: false, sawEmptyReading: false, timedOut: false, granted: false };
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

	private listenToCompass() {
		if (!this.stopCompass) {
			this.stopCompass = watchHeading(
				(heading) => {
					if (!this.evidence.sawHeading) {
						this.evidence.sawHeading = true;
						this.decideCompass();
					}
					this.callbacks.onHeading(heading);
				},
				undefined,
				() => {
					this.evidence.sawEmptyReading = true;
					this.decideCompass();
				},
			);
		}
		// Silence is an answer too, after a while (iOS before permission sends nothing).
		this.evidence.timedOut = false;
		clearTimeout(this.probeTimer);
		this.probeTimer = window.setTimeout(() => {
			this.evidence.timedOut = true;
			this.decideCompass();
		}, COMPASS_PROBE_MS);
		this.decideCompass();
	}

	private decideCompass() {
		const decision = decideCompass({
			...this.evidence,
			hasPermissionApi: needsPermission(),
			coarsePointer: typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches,
		});
		// A refusal stands until a reading proves otherwise.
		if (this.compass === "denied" && decision !== "on") return;
		this.setCompass(decision === "wait" ? "probing" : decision);
		if (decision !== "wait") {
			clearTimeout(this.probeTimer);
			this.probeTimer = 0;
		}
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
