// Fails when a package (or the test page) imports Field Maps' app code. The packages
// are what another app installs; anything they reach in src/ would not be there.
// Run by `npm test`.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const packages = resolve(here, "../..");
const roots = [
	{ dir: join(packages, "core/src"), allowed: ["@fieldmaps/core"] },
	{ dir: join(packages, "field-map/src"), allowed: ["@fieldmaps/core", "lit", "leaflet"] },
	{
		dir: join(packages, "field-map/test-page"),
		allowed: ["@fieldmaps/core", "@fieldmaps/field-map"],
	},
];

function files(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return files(path);
		return /\.ts$/.test(name) ? [path] : [];
	});
}

let failures = 0;
for (const { dir, allowed } of roots) {
	for (const file of files(dir)) {
		const source = readFileSync(file, "utf8");
		for (const match of source.matchAll(/(?:from|import)\s*["']([^"']+)["']/g)) {
			const spec = match[1];
			const ok = spec.startsWith(".")
				? resolve(dirname(file), spec).startsWith(dir) || spec.startsWith("node:")
				: spec.startsWith("node:") ||
					allowed.some((name) => spec === name || spec.startsWith(`${name}/`));
			if (!ok) {
				console.log(`  FAIL ${relative(packages, file)} imports "${spec}"`);
				failures++;
			}
		}
	}
	console.log(`  ok   ${relative(packages, dir)}`);
}
console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
if (failures) process.exit(1);
