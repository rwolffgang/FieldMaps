// -----------------------------------------------------------------------------
// @fieldmaps/core/vite
// The map's assets — the OpenStreetMap GeoJSON and the faction emblems — have to be
// served next to the page, because `<field-map>` loads them by URL (relative to its
// `assetBase`, which defaults to the page's own directory). This plugin does that
// for a Vite app: it serves them from the dev server, and writes them into the build
// output at the same paths, where a service worker's precache can pick them up.
//
//   import { fieldMapsAssets } from "@fieldmaps/core/vite";
//   export default defineConfig({ plugins: [fieldMapsAssets()] });
//
// Not using Vite? Copy `node_modules/@fieldmaps/core/assets/` to wherever
// `assetBase` points. That folder is the whole contract.
// -----------------------------------------------------------------------------

import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, posix, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** The folder this plugin serves, for anyone who wants to copy it by hand. */
export const ASSETS_DIR = fileURLToPath(new URL("./assets/", import.meta.url));

const TYPES = {
	".geojson": "application/geo+json",
	".json": "application/json",
	".png": "image/png",
	".svg": "image/svg+xml",
	".webp": "image/webp",
};

function listFiles(dir) {
	const out = [];
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) out.push(...listFiles(path));
		else out.push(relative(ASSETS_DIR, path).split(sep).join(posix.sep));
	}
	return out;
}

/**
 * @param {{ dir?: string }} [options] `dir`: a folder under the build's output (and
 *   the dev server's base) to put the assets in. Default: the root, which is where
 *   `<field-map>` looks for them when `assetBase` is not set.
 */
export function fieldMapsAssets({ dir = "" } = {}) {
	const files = new Set(listFiles(ASSETS_DIR));
	const prefix = dir.replace(/^\/+|\/+$/g, "");
	const published = (file) => (prefix ? `${prefix}/${file}` : file);

	return {
		name: "fieldmaps-assets",
		configureServer(server) {
			const base = server.config.base || "/";
			server.middlewares.use((req, res, next) => {
				const path = decodeURIComponent((req.url ?? "").split("?")[0]);
				if (!path.startsWith(base)) return next();
				let file = path.slice(base.length);
				if (prefix) {
					if (!file.startsWith(`${prefix}/`)) return next();
					file = file.slice(prefix.length + 1);
				}
				if (!files.has(file)) return next();
				res.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream");
				res.end(readFileSync(join(ASSETS_DIR, file)));
			});
		},
		generateBundle() {
			for (const file of files) {
				this.emitFile({
					type: "asset",
					fileName: published(file),
					source: readFileSync(join(ASSETS_DIR, file)),
				});
			}
		},
	};
}
