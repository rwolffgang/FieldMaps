// The published build of @fieldmaps/field-map: `npm run build` in this package.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		outDir: fileURLToPath(new URL("./dist/", import.meta.url)),
		emptyOutDir: true,
		sourcemap: true,
		lib: {
			entry: {
				"field-map": fileURLToPath(new URL("./src/index.ts", import.meta.url)),
				strings: fileURLToPath(new URL("./src/strings.ts", import.meta.url)),
			},
			formats: ["es"],
		},
		rolldownOptions: {
			// Peers and the sibling package stay imports, so a host bundles one copy of each.
			// Leaflet's stylesheet is the exception: it is inlined, so the bundle needs no
			// bundler on the host's side to load it.
			external: (id) =>
				/^lit($|\/)/.test(id) ||
				/^@fieldmaps\/core($|\/)/.test(id) ||
				(/^leaflet($|\/)/.test(id) && !id.includes(".css")),
		},
	},
});
