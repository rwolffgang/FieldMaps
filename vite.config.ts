import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

import { cloudflare } from "@cloudflare/vite-plugin";

const { version } = JSON.parse(
	readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

/**
 * What this build calls itself, baked in as `__BUILD_ID__`.
 *
 * Shown in the landing page footer, so "did that phone take the update?" is a
 * question anyone can answer by looking, instead of by trusting that the service
 * worker did its job. The commit is the useful half — two builds of the same
 * commit are the same app — with the build time standing in wherever the deploy
 * happens without a git checkout.
 */
function buildId(): string {
	try {
		const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
			stdio: ["ignore", "pipe", "ignore"],
		})
			.toString()
			.trim();
		if (sha) return `v${version}+${sha}`;
	} catch {
		// No git here — a source tarball, or a build container without the history.
	}
	return `v${version}+${new Date().toISOString().slice(0, 16).replace(/[-:]/g, "")}`;
}

export default defineConfig({
	// For GitHub Pages project sites set this to "/<repo-name>/".
	base: "./",
	define: {
		__BUILD_ID__: JSON.stringify(buildId()),
	},
	preview: {
		host: true,
		port: 5100,
		// Localtunnel uses random *.loca.lt subdomains; allow the whole domain.
		allowedHosts: [".loca.lt"],
	},
	plugins: [
		VitePWA({
			// "prompt", not "autoUpdate": a new build installs in the background and
			// then *waits*, so a running session keeps the assets it started with
			// instead of having them swapped underneath it. `src/update.ts` decides
			// when the waiting build takes over — usually within seconds, and without
			// asking, but never out from under a player reading a live map.
			registerType: "prompt",
			includeAssets: ["icons/*.png"],
			workbox: {
				// Both of these are load-bearing for that. `skipWaiting: true` would
				// hand the new build the running page's fetches the moment it
				// installed, which is exactly what "prompt" exists to prevent;
				// `clientsClaim` is how the released build takes over without a second
				// reload. See the header of `src/update.ts`.
				skipWaiting: false,
				clientsClaim: true,
				// Drop the precache of builds we have moved past.
				cleanupOutdatedCaches: true,
				// Precache everything the app needs so it runs fully offline after the
				// first load. Raise this limit if your map image is large.
				maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
				globPatterns: ["**/*.{js,css,html,png,svg,webp,jpg,geojson}"],
			},
			manifest: {
				name: "Field Maps",
				short_name: "Field Maps",
				description:
					"Deine GPS-Position auf der Taktikkarte der Airsoft-Events auf dem Flugplatz " +
					"Mahlwinkel — offline.",
				start_url: ".",
				theme_color: "#0b0f14",
				background_color: "#0b0f14",
				display: "standalone",
				orientation: "any",
				icons: [
					{ src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
					{ src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
					// Separate file: the artwork's own rounded corners would show through
					// Android's adaptive-icon mask, so this one is full-bleed and inset.
					{
						src: "icons/icon-512-maskable.png",
						sizes: "512x512",
						type: "image/png",
						purpose: "maskable",
					},
				],
			},
		}),
		cloudflare(),
	],
});
