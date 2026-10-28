// The published build of @fieldmaps/core: `npm run build` in this package.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		outDir: fileURLToPath(new URL("./dist/", import.meta.url)),
		emptyOutDir: true,
		sourcemap: true,
		lib: {
			entry: {
				index: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
				mahlwinkel: fileURLToPath(new URL("./src/mahlwinkel/index.ts", import.meta.url)),
			},
			formats: ["es"],
		},
	},
});
