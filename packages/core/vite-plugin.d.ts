import type { Plugin } from "vite";

/** The folder of assets `<field-map>` loads: `map_osm.geojson` and `logos/`. */
export declare const ASSETS_DIR: string;

/**
 * Serve the Field Maps assets from the dev server and write them into the build
 * output, under `dir` (default: the root, where `<field-map>` looks by default).
 */
export declare function fieldMapsAssets(options?: { dir?: string }): Plugin;
