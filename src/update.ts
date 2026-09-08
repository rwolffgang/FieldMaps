// -----------------------------------------------------------------------------
// update.ts
// Getting a redeploy onto phones that are already running the app.
//
// Field Maps is installed to the home screen and then, as far as the browser is
// concerned, never loaded again: it is resumed from the app switcher for weeks. A
// service worker looks for a new build when a page is *navigated* to, and beyond
// that at most once a day — so left alone, a player can walk onto the field running
// a build that was replaced a fortnight ago, and nothing in the app would ever tell
// either of you. This module asks instead, on the three occasions that can matter:
// on a timer while the app is on screen, when it comes back from the background,
// and when the device gets a signal again.
//
// Applying the update is the other half, and it is why the worker is registered in
// "prompt" mode rather than "autoUpdate" (see `vite.config.ts`). A new build
// installs in the background and then waits: the running page keeps the exact
// assets it started with, instead of a new precache being swapped in under code
// that is already executing. Releasing the waiting build reloads the page — so we
// release it silently whenever that reload costs nothing, and put a banner up when
// it would take a live map away from someone standing in a field.
//
// Nothing here is needed for the app to *work*: without a service worker Field Maps
// is a normal web page, always current and never offline. This is what buys the
// offline half without the staleness that usually comes with it.
// -----------------------------------------------------------------------------

import { registerSW } from "virtual:pwa-register";

/** Replaced at build time — see `buildId()` in `vite.config.ts`. */
declare const __BUILD_ID__: string;

/** What this build calls itself, e.g. `v0.1.0+1a2b3c4`. Shown in the footer. */
export const BUILD_ID = __BUILD_ID__;

/**
 * How often a foregrounded app asks whether a new build exists.
 *
 * One conditional GET of `sw.js`, which is served `no-cache` so the answer is
 * never a stale one — a few hundred bytes on the wire next to a GPS receiver that
 * is running continuously. What it buys is that a fix deployed during an event
 * reaches the players still at the event.
 */
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

/** Floor between two checks, so a timer tick, a resume and a reconnect don't stack. */
const MIN_CHECK_GAP_MS = 60 * 1000;

/**
 * How long to give a reload before assuming it was dropped. Reloading a page that
 * is in the background is at the browser's discretion; if the app comes back and we
 * are somehow still here, we reload again in the open.
 */
const RELOAD_TIMEOUT_MS = 10 * 1000;

export interface UpdatePolicy {
	/** True while reloading would cost the player nothing they would miss. */
	canReloadNow: () => boolean;
	/** A build is ready but `canReloadNow()` said no. Calling `apply` takes it. */
	onWaiting: (apply: () => void) => void;
	/** The update is going in and the page is about to reload. */
	onApplying: () => void;
}

export interface UpdateChecker {
	/**
	 * Re-run the policy: take a waiting build if a reload has become free since it
	 * arrived. Call this whenever `canReloadNow()` might have flipped — leaving a
	 * map for the overview, say.
	 */
	applyWhenSafe: () => void;
}

/**
 * Register the service worker, keep checking for new builds, and apply them under
 * `policy`. Call once, at startup.
 */
export function startUpdates(policy: UpdatePolicy): UpdateChecker {
	const worker = navigator.serviceWorker;
	let registration: ServiceWorkerRegistration | undefined;
	/** A new build is installed and waiting for us to let it take over. */
	let waiting = false;
	/** When we released it, so a reload that never lands can be retried. */
	let applyingSince = 0;
	/** Registering runs an update check of its own, so the clock starts here. */
	let lastCheck = Date.now();
	/** Whether some build is already driving this page — see the claim handler below. */
	let controlled = !!worker?.controller;
	let reloading = false;

	const releaseWaitingBuild = registerSW({
		immediate: true,
		onRegisteredSW(_swUrl, r) {
			registration = r;
		},
		// The reload is ours (see the claim handler below), not vite-plugin-pwa's.
		// Its own only fires when the page was already controlled at the moment the
		// worker was registered — which is false for the session that *installed* the
		// app, exactly the session an eager first-day fix has to reach. Handing it a
		// no-op leaves the decision in one place.
		onNeedReload() {},
		onNeedRefresh() {
			waiting = true;
			applyWhenSafe();
		},
		onRegisterError(err) {
			// Not fatal, and not something the player can act on: the app keeps
			// working, it just loses the offline cache and updates the ordinary way.
			console.error("Service worker registration failed", err);
		},
	});

	function apply() {
		if (!waiting || applyingSince) return;
		applyingSince = Date.now();
		policy.onApplying();
		// Hands the waiting build the page. It claims us, and the claim reloads.
		void releaseWaitingBuild();
	}

	function reload() {
		if (reloading) return;
		reloading = true;
		location.reload();
	}

	// A build took over the page. Usually because `apply()` just handed it over; if
	// it was some other client of the same app, this page is now running old code
	// against a new cache, and a reload is the repair rather than a courtesy — so
	// this one does not go through the policy.
	worker?.addEventListener("controllerchange", () => {
		// Except the first claim, which is the app installing itself: the page already
		// *is* the build that just took control, so there is nothing to reload for.
		if (!controlled) {
			controlled = true;
			return;
		}
		reload();
	});

	function applyWhenSafe() {
		if (!waiting) return;
		if (applyingSince) {
			// We already asked. If the reload has not happened by now, it was dropped
			// while the app sat in the background — do it ourselves, now that someone
			// is looking at the screen.
			if (!document.hidden && Date.now() - applyingSince > RELOAD_TIMEOUT_MS) {
				reload();
			}
			return;
		}
		if (policy.canReloadNow()) apply();
		else policy.onWaiting(apply);
	}

	async function check() {
		// A build already in hand is the answer to the question.
		if (waiting) {
			applyWhenSafe();
			return;
		}
		// `registration.installing` means a check is already in flight.
		if (!registration || registration.installing || !navigator.onLine) return;
		const now = Date.now();
		if (now - lastCheck < MIN_CHECK_GAP_MS) return;
		lastCheck = now;
		try {
			await registration.update();
		} catch {
			// No signal, a captive portal, a server hiccup — all of it normal on a
			// field. The next check covers it.
		}
	}

	// The timer catches a redeploy while the app is open; the visibility change
	// catches the far more common case of an app that has been in the switcher for
	// days; `online` catches driving back into coverage.
	setInterval(() => void check(), CHECK_INTERVAL_MS);
	document.addEventListener("visibilitychange", () => {
		// Going away is itself an opportunity: a reload nobody is watching is free.
		if (document.hidden) applyWhenSafe();
		else void check();
	});
	window.addEventListener("online", () => void check());

	return { applyWhenSafe };
}
