// -----------------------------------------------------------------------------
// scripts/make-screenshots.mjs
//
// Capture the manifest's screenshots into public/screenshots/.
//
// Chrome shows two different install dialogs. Without screenshots it is a thin bar
// at the bottom of the window that says the site's name; with them it is a card
// carrying a preview of the app, which reads like installing an app rather than
// bookmarking a page. That difference is most of why `screenshots` is in the
// manifest at all — see the `VitePWA` block in vite.config.ts.
//
// Run (the dev server has to be up, `npm run dev`):
//
//     npm run dev            # in another terminal
//     node scripts/make-screenshots.mjs
//
// Puppeteer is not a dependency of this project — it is fetched on demand, the way
// package.json already reaches for localtunnel — and it drives the copy of Chrome
// already on the machine rather than downloading its own.
//
// Re-run this when the map's look changes. A stale screenshot in the install
// dialog is worse than none: it is the first thing anyone sees of the app.
// -----------------------------------------------------------------------------

import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DEV_SERVER = process.env.DEV_URL ?? "http://localhost:5173";

/** Where Chrome lives on the platforms this has been run on. */
const CHROME_PATHS = [
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
	"/usr/bin/google-chrome",
	"/usr/bin/chromium",
];

/**
 * Somewhere in the middle of the field, so the position dot and its accuracy
 * circle are in frame. A screenshot of the app *not* knowing where you are would
 * be advertising the one thing it is for as broken.
 */
const ON_THE_FIELD = { latitude: 52.3808, longitude: 11.8243, accuracy: 12 };

/**
 * What to capture.
 *
 * `narrow` is the phone, and it is the one that matters — it is what Chrome for
 * Android puts in the install dialog, and a phone in a field is the whole point of
 * the app. `wide` is there so a desktop install dialog is not left with a portrait
 * image stretched across it.
 */
const SHOTS = [
	{ file: "map-narrow.png", url: "/?map=lso", width: 412, height: 892, mobile: true, zoom: 2 },
	{ file: "overview-narrow.png", url: "/", width: 412, height: 892, mobile: true, zoom: 0 },
	{ file: "map-wide.png", url: "/?map=lso", width: 1280, height: 800, mobile: false, zoom: 1 },
];

async function loadPuppeteer() {
	try {
		return (await import("puppeteer-core")).default;
	} catch {
		console.error("puppeteer-core is not installed. It is not a dependency of this");
		console.error("project — install it just for this run:\n");
		console.error("    npm install --no-save puppeteer-core\n");
		process.exit(1);
	}
}

const { existsSync } = await import("node:fs");
const executablePath = CHROME_PATHS.find((path) => existsSync(path));
if (!executablePath) {
	console.error(`No Chrome found. Looked in:\n${CHROME_PATHS.map((p) => `  ${p}`).join("\n")}`);
	process.exit(1);
}

const puppeteer = await loadPuppeteer();
const outDir = join(dirname(dirname(fileURLToPath(import.meta.url))), "public", "screenshots");
await mkdir(outDir, { recursive: true });

const browser = await puppeteer.launch({ executablePath, headless: "new" });
const context = browser.defaultBrowserContext();
// Granted up front: the app asks on load, and a dialog left hanging would be in
// every shot. This is also what puts the dot on the map.
await context.overridePermissions(DEV_SERVER, ["geolocation"]);

for (const shot of SHOTS) {
	const page = await browser.newPage();
	await page.setViewport({
		width: shot.width,
		height: shot.height,
		deviceScaleFactor: 2,
		isMobile: shot.mobile,
		hasTouch: shot.mobile,
	});
	await page.setGeolocation(ON_THE_FIELD);
	await page.goto(DEV_SERVER + shot.url, { waitUntil: "networkidle0" });
	// The basemap rasterises its tiles after the first fix lands, and the position
	// marker eases into place. Neither reports done, so this waits them out.
	await new Promise((resolve) => setTimeout(resolve, 4000));

	// A map screen opens fitted to the whole field, which on a phone's aspect ratio
	// means letterboxing above and below — true to the app, and a poor advert for
	// it. Zooming in is the first thing a player does anyway, so the screenshot is
	// taken where they actually read the map rather than at the initial fit.
	if (shot.zoom) {
		await page.evaluate((steps) => {
			const view = document.querySelector("map-view");
			const map = view?.map;
			if (map) map.setZoom(map.getZoom() + steps, { animate: false });
		}, shot.zoom);
		await new Promise((resolve) => setTimeout(resolve, 2500));
	}
	// The compass button is a permission prompt, and only iOS raises it. Headless
	// Chrome shows it because no sensor ever answers, so leaving it in would put a
	// prompt no Android user ever sees into the dialog Android shows them.
	await page.evaluate(() => {
		const button = document.querySelector("#enable-compass");
		if (button) button.hidden = true;
	});

	const path = join(outDir, shot.file);
	await page.screenshot({ path });
	console.log(`${shot.file}  ${shot.width * 2}x${shot.height * 2}`);
	await page.close();
}

await browser.close();
console.log(`\nwrote ${SHOTS.length} screenshots to ${outDir}`);
