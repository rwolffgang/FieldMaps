// -----------------------------------------------------------------------------
// install.ts
// Everything the app knows about getting itself onto a home screen.
//
// Test users did not work out that Field Maps installs, and the reason was in the
// old card: it printed the iPhone gesture and the Android gesture side by side, so
// every reader had to first decide which half was theirs, and Android readers were
// sent hunting through a browser menu when the browser had been offering a
// one-tap install the whole time. This module turns "how do I install this?" into
// one answer per device, and where the platform allows it, a button.
//
// It is the only place that sniffs the user agent. Sniffing is a last resort, but
// the three cases below have no feature test:
//
//   - iOS gives no install API at all, so the gesture has to be described, and it
//     is a *different* gesture from every other platform's.
//   - An in-app browser (the webview inside Instagram, Facebook, WhatsApp) cannot
//     install anything, and says nothing about it. Players reach the site from the
//     organiser's posts, so this is a common way to arrive — and the one where a
//     card explaining the Share menu is actively wrong, because that menu's "Add
//     to Home Screen" is not there.
//   - Which browser's menu to name on desktop.
//
// The one case that *is* a feature test is the good one: Chromium fires
// `beforeinstallprompt`, we keep the event, and the card becomes a real button.
// -----------------------------------------------------------------------------

/** What this device can do about installing, and therefore what the UI should say. */
export type InstallMethod =
	/** Running from the home screen already, or installed during this session. */
	| { kind: "installed" }
	/** Chromium handed us a prompt to fire. One tap, no instructions. */
	| { kind: "prompt" }
	/** iOS: no API, one gesture, and it is buried in the Share sheet. */
	| { kind: "ios" }
	/** A webview that cannot install. The only useful advice is to leave it. */
	| { kind: "in-app-browser"; app: string }
	/** Everything else: a desktop browser, or a Firefox that will not prompt. */
	| { kind: "manual" };

/**
 * The `beforeinstallprompt` event, which is Chromium-only and therefore not in
 * the DOM lib. Declared here rather than augmenting the global scope, so it stays
 * a fact about this module.
 */
interface BeforeInstallPromptEvent extends Event {
	prompt(): Promise<void>;
	readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const ua = navigator.userAgent;

/**
 * The in-app browsers players actually arrive in, and what to call them.
 *
 * Order matters: several of these embed another's token. Instagram's webview also
 * carries `FBAV`, so it has to be tested first or every Instagram visitor is told
 * to open Facebook.
 */
const IN_APP_BROWSERS: ReadonlyArray<readonly [RegExp, string]> = [
	[/Instagram/i, "Instagram"],
	[/FBAN|FBAV|FB_IAB/i, "Facebook"],
	[/\bLine\//i, "LINE"],
	[/WhatsApp/i, "WhatsApp"],
	[/LinkedInApp/i, "LinkedIn"],
	[/Snapchat/i, "Snapchat"],
	[/musical_ly|Bytedance|TikTok/i, "TikTok"],
	[/Twitter|\bX11.*TwitterAndroid/i, "X"],
	[/Threads/i, "Threads"],
	[/Telegram/i, "Telegram"],
	[/Pinterest/i, "Pinterest"],
];

/** The in-app browser we are inside, or null for a real browser. */
function inAppBrowser(): string | null {
	for (const [pattern, name] of IN_APP_BROWSERS) if (pattern.test(ua)) return name;
	return null;
}

/**
 * True on iPhone and iPad.
 *
 * The second half is iPadOS 13 and later, which introduced a desktop user agent
 * claiming to be a Mac. A Mac with a touchscreen does not exist, so touch points
 * are what separates them.
 */
export function isIos(): boolean {
	if (/iPad|iPhone|iPod/.test(ua)) return true;
	return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}

/** True when the app is running from the home screen rather than in a browser tab. */
export function isStandalone(): boolean {
	if (matchMedia("(display-mode: standalone)").matches) return true;
	// iOS Safari's own flag, which predates the media query and still backs it up.
	return (navigator as { standalone?: boolean }).standalone === true;
}

/** Set once Chromium offers us a prompt; cleared once it is spent. */
let deferredPrompt: BeforeInstallPromptEvent | null = null;

/** Set when `appinstalled` fires, so the UI can react without a reload. */
let installedThisSession = false;

const listeners = new Set<() => void>();

/** Subscribe to changes in what `installMethod()` would return. */
export function onInstallChange(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

function notify() {
	for (const listener of listeners) listener();
}

/**
 * Chromium decides on its own schedule whether a site is installable, and fires
 * this when it is — which can be well after first paint. Holding the event is what
 * lets us put the browser's own install flow behind our own button, at a moment we
 * choose, instead of leaving it in a menu nobody opens.
 */
addEventListener("beforeinstallprompt", (event) => {
	// Without this Chrome shows its own mini-infobar as well, and the user gets the
	// same offer twice in two different visual languages.
	event.preventDefault();
	deferredPrompt = event as BeforeInstallPromptEvent;
	notify();
});

addEventListener("appinstalled", () => {
	installedThisSession = true;
	deferredPrompt = null;
	notify();
});

/** What this device can do about installing, right now. */
export function installMethod(): InstallMethod {
	if (installedThisSession || isStandalone()) return { kind: "installed" };
	if (deferredPrompt) return { kind: "prompt" };

	const app = inAppBrowser();
	// iOS is checked second: inside Instagram on an iPhone the Share sheet has no
	// "Add to Home Screen", so naming the webview is the more useful answer.
	if (app) return { kind: "in-app-browser", app };
	if (isIos()) return { kind: "ios" };
	return { kind: "manual" };
}

/**
 * Fire the browser's install prompt. Resolves to whether the app got installed.
 *
 * The event is single-use: once shown it cannot be shown again, so it is dropped
 * either way. On a dismissal Chromium usually offers a fresh one later, which
 * arrives through `beforeinstallprompt` like the first.
 */
export async function promptInstall(): Promise<boolean> {
	const event = deferredPrompt;
	if (!event) return false;
	deferredPrompt = null;
	notify();
	await event.prompt();
	const { outcome } = await event.userChoice;
	return outcome === "accepted";
}

// --- Remembering a "not now" ---------------------------------------------------

const DISMISSED_KEY = "field-map-install-dismissed";

/**
 * When the player last dismissed an install nudge, as epoch milliseconds.
 *
 * The landing page's card is permanent — it is the page's call to action and it
 * sits in the flow of the document. This is for the *map* screen's bar, which
 * covers part of a map someone is trying to read, and so has to take no for an
 * answer.
 */
function dismissedAt(): number {
	try {
		return Number(localStorage.getItem(DISMISSED_KEY)) || 0;
	} catch {
		// Private mode, or storage denied. Not remembering is survivable.
		return 0;
	}
}

/** Roughly two weeks — long enough that a dismissal covers a whole event weekend. */
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

/** True when the map screen's install bar should stay hidden. */
export function installNudgeSnoozed(): boolean {
	return Date.now() - dismissedAt() < SNOOZE_MS;
}

/** Remember a "not now" from the map screen's bar. */
export function snoozeInstallNudge() {
	try {
		localStorage.setItem(DISMISSED_KEY, String(Date.now()));
	} catch {
		// See above: nothing here is worth failing over.
	}
	notify();
}
