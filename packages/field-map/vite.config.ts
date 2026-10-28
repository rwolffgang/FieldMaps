// The test page (test-page/): `npm run dev:component` from the repository root.
import { fileURLToPath } from "node:url";
import { defaultClientConditions, defineConfig } from "vite";
import { fieldMapsAssets } from "@fieldmaps/core/vite";

export default defineConfig({
	root: fileURLToPath(new URL("./test-page/", import.meta.url)),
	base: "./",
	resolve: {
		// Build the workspace packages from their TypeScript source.
		conditions: ["source", ...defaultClientConditions],
	},
	server: {
		port: Number(process.env.PORT) || 5180,
		host: true,
	},
	build: {
		outDir: fileURLToPath(new URL("./dist-test-page/", import.meta.url)),
		emptyOutDir: true,
	},
	plugins: [fieldMapsAssets()],
});
