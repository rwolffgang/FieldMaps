// -----------------------------------------------------------------------------
// compass-decision.ts
// Whether to ask the player for the compass. Pure, so it is tested on its own
// (compass-decision.test.ts); sensors.ts feeds it what the browser actually did.
//
// The permission API alone used to mean "iOS: needs a tap". Chromium has it too
// now, on laptops with no compass and on phones whose compass may or may not be
// gated, so the answer comes from what the orientation events do instead:
//
// - a real heading arrives: the compass works, whatever the API says;
// - an event arrives with no reading (Chromium, no sensor or not allowed yet):
//   worth a tap only on a touch-first device with the API — a phone; a laptop has
//   nothing to enable;
// - nothing arrives within the probe window (iOS before permission): a tap if the
//   API exists, otherwise there is no compass.
// -----------------------------------------------------------------------------

/** How long the compass listener runs before silence counts as an answer. */
export const COMPASS_PROBE_MS = 1000;

export type CompassDecision = "on" | "needs-permission" | "unavailable" | "wait";

export interface CompassEvidence {
	/** A usable heading has arrived. */
	sawHeading: boolean;
	/** An orientation event arrived that carried no heading. */
	sawEmptyReading: boolean;
	/** The probe window has passed. */
	timedOut: boolean;
	/** `DeviceOrientationEvent.requestPermission` exists. */
	hasPermissionApi: boolean;
	/** The primary pointer is coarse — a touch device, i.e. a phone or tablet. */
	coarsePointer: boolean;
	/** The player has tapped "Enable compass" and the browser said yes. */
	granted: boolean;
}

export function decideCompass(evidence: CompassEvidence): CompassDecision {
	if (evidence.sawHeading) return "on";
	// Allowed, and still no reading: there is no compass to be had. Asking again would
	// just put the same button back up.
	if (evidence.granted) {
		return evidence.sawEmptyReading || evidence.timedOut ? "unavailable" : "wait";
	}
	if (evidence.sawEmptyReading) {
		return evidence.hasPermissionApi && evidence.coarsePointer ? "needs-permission" : "unavailable";
	}
	if (!evidence.timedOut) return "wait";
	return evidence.hasPermissionApi ? "needs-permission" : "unavailable";
}
