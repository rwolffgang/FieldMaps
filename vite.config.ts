import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
	// For GitHub Pages project sites set this to "/<repo-name>/".
	base: "./",
	preview: {
		host: true,
		port: 4173,
		// Localtunnel uses random *.loca.lt subdomains; allow the whole domain.
		allowedHosts: [".loca.lt"],
	},
	plugins: [
		VitePWA({
			registerType: "autoUpdate",
			includeAssets: ["icons/*.png"],
			workbox: {
				// Apply new builds immediately on reload instead of waiting for all tabs to close.
				skipWaiting: true,
				clientsClaim: true,
				// Precache everything the app needs so it runs fully offline after the
				// first load. Raise this limit if your map image is large.
				maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
				globPatterns: ["**/*.{js,css,html,png,svg,webp,jpg}"],
			},
			manifest: {
				name: "Airsoft Field Map",
				short_name: "Field Map",
				description: "Offline GPS map of the playfield",
				theme_color: "#0b0f14",
				background_color: "#0b0f14",
				display: "standalone",
				orientation: "any",
				icons: [
					{ src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
					{ src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
					{ src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
				],
			},
		}),
	],
});
