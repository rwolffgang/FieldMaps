// -----------------------------------------------------------------------------
// analytics.ts
// Cloudflare Web Analytics — the one number the project was missing: how many
// people actually use the app.
//
// Why a beacon rather than reading the server logs. Every screen here is
// precached, so an installed app answers its own navigations out of the service
// worker and never asks the origin for the HTML again. The logs therefore show
// first visits and update checks, not use. A script that runs when the app
// starts sees every launch that has signal, installed or not.
//
// Why *this* beacon. It sets no cookie and reads nothing back off the device,
// so it stays clear of the consent requirement in § 25 TDDDG and runs on
// legitimate interest (Art. 6 Abs. 1 lit. f DSGVO) without a banner. That
// property is the entire reason this provider was chosen over a self-hosted
// counter with a visitor id — so do not "improve" this by remembering who
// someone is between launches. The moment anything is stored on the device,
// this needs a consent dialog and the privacy notice stops being true.
//
// Offline needs no special case: the script is cross-origin, no runtime caching
// rule touches it (`vite.config.ts` precaches by glob and nothing else), and a
// failed load is silent. A launch with no signal is simply not counted.
// -----------------------------------------------------------------------------

/**
 * The site token, from the Cloudflare dashboard: Web Analytics → the site →
 * **Manage site**, then the `token` field of the JS snippet it shows.
 *
 * Public by design — it ships in the HTML of every site that uses it — so it
 * belongs in the repo rather than in a build secret or an env var that has to
 * survive every deploy. **Empty means the beacon never loads**, which is how
 * this arrives in the tree, and is a deliberate off switch rather than a
 * placeholder to work around: fill it in to start counting, blank it to stop.
 */
const BEACON_TOKEN = "";

/** Cloudflare's beacon. Fixed URL; the token rides along in a data attribute. */
const BEACON_SRC = "https://static.cloudflareinsights.com/beacon.min.js";

/**
 * Load the beacon, once, for a real deployment.
 *
 * Development is excluded on purpose. `npm run dev` is the author reloading the
 * app a hundred times an afternoon, and counting that would drown the handful of
 * players the number exists to find. `npm run preview` builds in production
 * mode, so that is where to check that this actually fires.
 */
export function startAnalytics(): void {
	if (!BEACON_TOKEN || !import.meta.env.PROD) return;
	// The service worker can re-run this module in a restored session; one tag is
	// one page view, and two would be two.
	if (document.querySelector(`script[src="${BEACON_SRC}"]`)) return;

	const script = document.createElement("script");
	script.src = BEACON_SRC;
	script.defer = true;
	script.dataset.cfBeacon = JSON.stringify({ token: BEACON_TOKEN });
	document.head.append(script);
}
